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

/**
 * The one thing this browser remembers about having asked for an account.
 *
 * It holds no identity, no state and no secret -- only the fact that a request
 * was started here, which the person who started it already knows. The receipt
 * itself is an HttpOnly cookie no script can read, so without this marker the
 * front end has no way to tell "asked, and the answer has landed" apart from
 * "never asked".
 */
export const REGISTRATION_REQUESTED_STORAGE_KEY =
  "project42.registration-requested.v1";

/**
 * Remember that a request was started in this browser. Called at the moment
 * the person presses "Request an account", before the redirect.
 */
export function rememberRegistrationRequest(): void {
  try {
    localStorage.setItem(REGISTRATION_REQUESTED_STORAGE_KEY, "1");
  } catch {
    // Private browsing, blocked storage, or no DOM at all. The marker is a
    // convenience; losing it only restores the previous behaviour.
  }
}

/** Whether this browser remembers starting a request. */
export function registrationWasRequestedHere(): boolean {
  try {
    return localStorage.getItem(REGISTRATION_REQUESTED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Forget it. Called once the account is actually signed in: the request is
 * spent, and leaving the marker would tell a learner who later signs out that
 * they have a request outstanding.
 */
export function forgetRegistrationRequest(): void {
  try {
    localStorage.removeItem(REGISTRATION_REQUESTED_STORAGE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}

/**
 * Which card /account shows when the registration receipt comes back 401.
 *
 * The subtle case, and the one this function exists to get right: an owner
 * decision REVOKES the open request's receipt (changeAccountState clears
 * active_registration_request_id and revokes every registration_requests row).
 * So the moment a request is approved or declined, the waiting browser's next
 * status read is a 401 -- the same 401 a browser that never asked for anything
 * gets.
 *
 * Treating those two as one thing is what made the approved learner's page
 * quietly revert to "Request a Project 42 account", as though the request they
 * made had never happened. The answer had arrived; the page just could not
 * tell. `requestedHere` separates them: a browser that remembers starting a
 * request is told its receipt is finished and to sign in to find out, which is
 * true and is the only way to find out.
 */
export function registrationPhaseForInvalidReceipt(
  outcome: BrowserAuthOutcome,
  requestedHere: boolean,
): "provider-error" | "account-unavailable" | "expired" | "none" {
  if (outcome === "error" || outcome === "invalid") return "provider-error";
  if (outcome === "unavailable") return "account-unavailable";
  // A callback that just said "pending" and a receipt that immediately reads
  // invalid is a contradiction, not a decided request. Offering the request
  // again is the only honest thing left.
  if (outcome === "pending") return "none";
  if (outcome === "rejected" || outcome === "success") return "expired";
  return requestedHere ? "expired" : "none";
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
