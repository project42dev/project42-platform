/**
 * Account notification delivery adapter (Resend).
 *
 * The platform is provider-neutral: it renders a message, claims it from the
 * outbox, and hands it to whatever service is bound as
 * ACCOUNT_NOTIFICATION_DELIVERY. This Worker is the hosted binding for Project
 * 42 and is the only component that knows an email vendor exists.
 *
 * Contract (see docs/account-notifications.md):
 *   POST /v1/deliver with the rendered AccountNotificationMessage as JSON.
 *   200 or 202  -> accepted
 *   5xx or 429  -> retryable; the outbox reschedules with backoff
 *   other 4xx   -> rejected; the outbox stops retrying
 *
 * Two requirements the platform relies on:
 *   1. The caller's AbortSignal must reach the provider call. The runtime
 *      enforces a five-second deadline and records delivery-outcome-unknown if
 *      the adapter is still running, deliberately leaving the item under its
 *      lease rather than retrying immediately.
 *   2. notificationId must be the provider idempotency key, because lease
 *      recovery retries the SAME id. Without it, a delivery accepted just
 *      before a timeout is sent twice.
 */

interface DeliveryEnvironment {
  RESEND_API_KEY: string;
  NOTIFICATION_FROM: string;
  NOTIFICATION_REPLY_TO?: string;
  ACCOUNT_NOTIFICATION_CONTRACT_VERSION: string;
}

interface AccountNotificationMessage {
  contractVersion: string;
  notificationId: string;
  kind: string;
  recipient: string;
  subject: string;
  text: string;
  html: string;
}

const MAX_BODY_BYTES = 256 * 1024;

function problem(status: number, code: string): Response {
  // The body is intentionally free of the recipient, the subject, and the
  // message: a delivery failure must not become a place where learner contact
  // details are logged.
  return new Response(JSON.stringify({ error: { code } }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isMessage(value: unknown): value is AccountNotificationMessage {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.contractVersion === "string" &&
    typeof record.notificationId === "string" &&
    record.notificationId.length > 0 &&
    record.notificationId.length <= 200 &&
    typeof record.kind === "string" &&
    typeof record.recipient === "string" &&
    record.recipient.includes("@") &&
    typeof record.subject === "string" &&
    typeof record.text === "string" &&
    typeof record.html === "string"
  );
}

export default {
  async fetch(
    request: Request,
    env: DeliveryEnvironment,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/v1/deliver") {
      return problem(404, "not_found");
    }
    if (!env.RESEND_API_KEY || !env.NOTIFICATION_FROM) {
      // Fail closed and retryably: a missing binding is an operator error, not
      // a permanently undeliverable message.
      return problem(503, "delivery_not_configured");
    }

    const declared = request.headers.get("x-project42-notification-contract");
    if (declared && declared !== env.ACCOUNT_NOTIFICATION_CONTRACT_VERSION) {
      return problem(400, "unsupported_contract_version");
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return problem(413, "message_too_large");

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return problem(400, "invalid_message");
    }
    if (!isMessage(parsed)) return problem(400, "invalid_message");
    const message = parsed;
    if (message.contractVersion !== env.ACCOUNT_NOTIFICATION_CONTRACT_VERSION) {
      return problem(400, "unsupported_contract_version");
    }

    let response: Response;
    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          "content-type": "application/json",
          // Resend suppresses a duplicate with the same key, so a lease-recovery
          // retry of the same notificationId cannot double-send.
          "Idempotency-Key": message.notificationId,
        },
        body: JSON.stringify({
          from: env.NOTIFICATION_FROM,
          to: [message.recipient],
          subject: message.subject,
          text: message.text,
          html: message.html,
          ...(env.NOTIFICATION_REPLY_TO
            ? { reply_to: env.NOTIFICATION_REPLY_TO }
            : {}),
        }),
        // Propagate the platform deadline into the provider call.
        signal: request.signal,
      });
    } catch {
      // Aborts and transport failures are both retryable. The outbox decides
      // whether the deadline already passed.
      return problem(503, "delivery_unavailable");
    }

    if (response.ok) {
      return new Response(null, {
        status: 202,
        headers: { "x-project42-accepted-at": new Date().toISOString() },
      });
    }
    if (response.status === 429 || response.status >= 500) {
      return problem(503, "delivery_unavailable");
    }
    // A 4xx from the provider is a real rejection - an unroutable address or a
    // configuration fault. Retrying cannot fix it, so let the outbox stop and
    // surface it rather than burning the retry budget.
    return problem(422, "delivery_rejected");
  },
};
