import type { RegistrationStatus } from "@project42/platform";

export type RegistrationAccountState = Extract<
  RegistrationStatus["state"],
  "pending" | "approved" | "rejected" | "suspended" | "revoked"
>;

export type RegistrationNextAction = RegistrationStatus["nextAction"];

export type RegistrationStatusReceipt = RegistrationStatus & {
  state: RegistrationAccountState;
};

export type BrowserAuthOutcome =
  | "success"
  | "pending"
  | "rejected"
  | "unavailable"
  | "error"
  | "invalid"
  | null;

const expectedRegistrationState = {
  pending: {
    canSignIn: false,
    nextAction: "await-review",
  },
  approved: {
    canSignIn: true,
    nextAction: "sign-in",
  },
  rejected: {
    canSignIn: false,
    nextAction: "contact-owner",
  },
  // The server reports every account state on this receipt. Dropping suspended
  // and revoked here made an accurate, actionable status collapse into a
  // generic "unavailable" error for exactly the people who most need to know
  // what happened to their access (AB#5780).
  suspended: {
    canSignIn: false,
    nextAction: "contact-owner",
  },
  revoked: {
    canSignIn: false,
    nextAction: "contact-owner",
  },
} as const satisfies Record<
  RegistrationAccountState,
  Pick<RegistrationStatusReceipt, "canSignIn" | "nextAction">
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    Number.isFinite(Date.parse(value))
  );
}

/**
 * Reduces the account API response to the five PII-free registration fields
 * published by the platform contract. Unknown response fields are never
 * returned to rendering code.
 */
export function parseRegistrationStatus(
  value: unknown,
): RegistrationStatusReceipt {
  if (!isRecord(value) || !isRecord(value.registration)) {
    throw new Error("invalid_registration_status");
  }
  const candidate = value.registration;
  const state = candidate.state;
  if (
    state !== "pending" &&
    state !== "approved" &&
    state !== "rejected" &&
    state !== "suspended" &&
    state !== "revoked"
  ) {
    throw new Error("invalid_registration_status");
  }
  const expected = expectedRegistrationState[state];
  if (
    !isIsoTimestamp(candidate.requestedAt) ||
    !isIsoTimestamp(candidate.updatedAt) ||
    Date.parse(candidate.updatedAt) < Date.parse(candidate.requestedAt) ||
    candidate.canSignIn !== expected.canSignIn ||
    candidate.nextAction !== expected.nextAction
  ) {
    throw new Error("invalid_registration_status");
  }
  return {
    state,
    requestedAt: candidate.requestedAt,
    updatedAt: candidate.updatedAt,
    canSignIn: expected.canSignIn,
    nextAction: expected.nextAction,
  };
}

export function readBrowserAuthOutcome(search: string): BrowserAuthOutcome {
  const values = new URLSearchParams(search).getAll("auth");
  if (values.length === 0) return null;
  if (values.length !== 1) return "invalid";
  const [value] = values;
  if (
    value === "success" ||
    value === "pending" ||
    value === "rejected" ||
    value === "unavailable" ||
    value === "error"
  ) {
    return value;
  }
  return "invalid";
}

/**
 * Converts Retry-After into a bounded client-side retry delay. The API remains
 * the enforcement boundary; this only prevents an inaccessible rapid-retry UX.
 */
export function registrationRetryDelaySeconds(
  retryAfter: string | null,
  now = Date.now(),
): number {
  const numeric = retryAfter?.trim();
  let seconds = numeric && /^\d+$/.test(numeric) ? Number(numeric) : Number.NaN;
  if (!Number.isFinite(seconds) && numeric) {
    const retryAt = Date.parse(numeric);
    if (Number.isFinite(retryAt)) {
      seconds = Math.ceil((retryAt - now) / 1_000);
    }
  }
  if (!Number.isFinite(seconds)) seconds = 30;
  return Math.min(300, Math.max(10, Math.ceil(seconds)));
}
