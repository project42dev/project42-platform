export const ACCOUNT_NOTIFICATION_CONTRACT_VERSION = "1.0" as const;
export const ACCOUNT_NOTIFICATION_TEMPLATE_VERSION = "1.0" as const;
export const ACCOUNT_NOTIFICATION_DELIVERY_DEADLINE_MS = 5_000 as const;
export const ACCOUNT_NOTIFICATION_DELIVERY_MIN_DEADLINE_MS = 100 as const;
export const ACCOUNT_NOTIFICATION_DISPATCH_MAX_ITEMS = 10 as const;

export const ACCOUNT_NOTIFICATION_KINDS = [
  "registration-receipt",
  "owner-registration-alert",
  "learner-approved",
  "learner-rejected",
  "learner-suspended",
  "learner-revoked",
] as const;

export const ACCOUNT_NOTIFICATION_STATES = [
  "pending",
  "delivering",
  "delivered",
  "retryable",
  "dead-letter",
] as const;

export type AccountNotificationKind =
  (typeof ACCOUNT_NOTIFICATION_KINDS)[number];
export type AccountNotificationState =
  (typeof ACCOUNT_NOTIFICATION_STATES)[number];

export interface AccountNotificationMessage {
  contractVersion: typeof ACCOUNT_NOTIFICATION_CONTRACT_VERSION;
  notificationId: string;
  kind: AccountNotificationKind;
  recipient: string;
  subject: string;
  text: string;
  html: string;
}

export interface AccountNotificationDeliveryResult {
  acceptedAt: string;
}

export interface AccountNotificationDeliveryContext {
  /**
   * Aborts when the runtime delivery deadline is reached. Adapters must pass
   * this signal to every cancellable provider operation.
   */
  signal: AbortSignal;
  /**
   * Absolute deadline for adapters that need to bound work that does not
   * directly accept an AbortSignal.
   */
  deadlineAt: string;
}

export type AccountNotificationAuditActor =
  | {
      kind: "system";
    }
  | {
      kind: "owner";
      userId: string;
      issuer: string;
      subject: string;
    };

export interface AccountNotificationAdapter {
  readonly kind: string;
  deliver(
    message: AccountNotificationMessage,
    context: AccountNotificationDeliveryContext,
  ): Promise<AccountNotificationDeliveryResult>;
}

export interface AccountNotificationDeliveryService {
  fetch(request: Request): Promise<Response>;
}

export interface RenderedAccountNotification {
  subject: string;
  text: string;
  html: string;
}

export class AccountNotificationDeliveryError extends Error {
  constructor(
    readonly code:
      | "delivery-not-configured"
      | "recipient-unavailable"
      | "delivery-rejected"
      | "delivery-temporary-failure",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export class DisabledAccountNotificationAdapter
  implements AccountNotificationAdapter
{
  readonly kind = "disabled";

  async deliver(
    _message: AccountNotificationMessage,
    _context: AccountNotificationDeliveryContext,
  ): Promise<AccountNotificationDeliveryResult> {
    throw new AccountNotificationDeliveryError(
      "delivery-not-configured",
      "Account notification delivery is not configured.",
      true,
    );
  }
}

export class DeterministicAccountNotificationAdapter
  implements AccountNotificationAdapter
{
  readonly kind = "deterministic-test";
  readonly deliveries: AccountNotificationMessage[] = [];

  constructor(
    private readonly acceptedAt = "2000-01-01T00:00:00.000Z",
    private readonly failure?: AccountNotificationDeliveryError,
  ) {}

  async deliver(
    message: AccountNotificationMessage,
    context: AccountNotificationDeliveryContext,
  ): Promise<AccountNotificationDeliveryResult> {
    if (context.signal.aborted) {
      throw new AccountNotificationDeliveryError(
        "delivery-temporary-failure",
        "The account notification delivery deadline expired.",
        true,
      );
    }
    if (this.failure) throw this.failure;
    this.deliveries.push(structuredClone(message));
    return { acceptedAt: this.acceptedAt };
  }
}

export class ServiceBindingAccountNotificationAdapter
  implements AccountNotificationAdapter
{
  readonly kind = "service-binding";

  constructor(
    private readonly service: AccountNotificationDeliveryService,
  ) {}

  async deliver(
    message: AccountNotificationMessage,
    context: AccountNotificationDeliveryContext,
  ): Promise<AccountNotificationDeliveryResult> {
    let response: Response;
    try {
      response = await this.service.fetch(
        new Request(
          "https://account-notification-adapter.invalid/v1/deliver",
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-project42-notification-contract":
                ACCOUNT_NOTIFICATION_CONTRACT_VERSION,
              "x-project42-notification-id": message.notificationId,
            },
            body: JSON.stringify(message),
            signal: context.signal,
          },
        ),
      );
    } catch {
      throw new AccountNotificationDeliveryError(
        "delivery-temporary-failure",
        "The account notification delivery service is unavailable.",
        true,
      );
    }
    if (response.status !== 200 && response.status !== 202) {
      throw new AccountNotificationDeliveryError(
        response.status >= 500 || response.status === 429
          ? "delivery-temporary-failure"
          : "delivery-rejected",
        "The account notification delivery service rejected the message.",
        response.status >= 500 || response.status === 429,
      );
    }
    return {
      acceptedAt:
        response.headers.get("x-project42-accepted-at") ??
        new Date().toISOString(),
    };
  }
}

export function renderAccountNotification(
  kind: AccountNotificationKind,
): RenderedAccountNotification {
  const content: Record<
    AccountNotificationKind,
    { subject: string; heading: string; paragraphs: string[] }
  > = {
    "registration-receipt": {
      subject: "Your Project 42 account request was received",
      heading: "Account request received",
      paragraphs: [
        "Your verified sign-in was received and your account is awaiting review.",
        "You can return to Project 42 and sign in again to check the current status.",
      ],
    },
    "owner-registration-alert": {
      subject: "A Project 42 account request needs review",
      heading: "Account request needs review",
      paragraphs: [
        "A verified learner account request is waiting for an owner decision.",
        "Open the Project 42 administration console to review the request.",
      ],
    },
    "learner-approved": {
      subject: "Your Project 42 account was approved",
      heading: "Account approved",
      paragraphs: [
        "Your Project 42 learner account is approved.",
        "Sign in to continue learning and access your saved progress.",
      ],
    },
    "learner-rejected": {
      subject: "Your Project 42 account request was not approved",
      heading: "Account request not approved",
      paragraphs: [
        "Your Project 42 learner account request was not approved.",
        "Contact the site owner if you believe this decision needs review.",
      ],
    },
    "learner-suspended": {
      subject: "Your Project 42 account was suspended",
      heading: "Account suspended",
      paragraphs: [
        "Access to your Project 42 learner account is temporarily suspended.",
        "Contact the site owner if you need help or believe this decision needs review.",
      ],
    },
    "learner-revoked": {
      subject: "Your Project 42 account access was revoked",
      heading: "Account access revoked",
      paragraphs: [
        "Access to your Project 42 learner account was revoked.",
        "Contact the site owner if you need help or believe this decision needs review.",
      ],
    },
  };
  const selected = content[kind];
  const text = [
    selected.heading,
    "",
    ...selected.paragraphs.flatMap((paragraph) => [paragraph, ""]),
    "This message contains no sign-in link. Open Project 42 using your usual trusted address.",
  ].join("\n");
  const paragraphs = [
    ...selected.paragraphs,
    "This message contains no sign-in link. Open Project 42 using your usual trusted address.",
  ]
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");
  return {
    subject: selected.subject,
    text,
    html:
      '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
      `<title>${escapeHtml(selected.subject)}</title></head><body>` +
      `<main><h1>${escapeHtml(selected.heading)}</h1>${paragraphs}</main>` +
      "</body></html>",
  };
}

export function accountNotificationRetryDelaySeconds(
  attemptCount: number,
): number {
  if (!Number.isInteger(attemptCount) || attemptCount < 1) {
    throw new TypeError("attemptCount must be a positive integer.");
  }
  return Math.min(60 * 2 ** (attemptCount - 1), 60 * 60);
}

export function normalizeAccountNotificationDeliveryDeadlineMs(
  requested: number | undefined,
): number {
  const numeric =
    requested === undefined || !Number.isFinite(requested)
      ? ACCOUNT_NOTIFICATION_DELIVERY_DEADLINE_MS
      : Math.trunc(requested);
  return Math.max(
    ACCOUNT_NOTIFICATION_DELIVERY_MIN_DEADLINE_MS,
    Math.min(ACCOUNT_NOTIFICATION_DELIVERY_DEADLINE_MS, numeric),
  );
}

export function normalizeAccountNotificationDeliveryError(
  error: unknown,
): AccountNotificationDeliveryError {
  if (error instanceof AccountNotificationDeliveryError) return error;
  return new AccountNotificationDeliveryError(
    "delivery-temporary-failure",
    "The notification adapter reported a temporary delivery failure.",
    true,
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
