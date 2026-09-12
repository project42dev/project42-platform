// What the header is allowed to claim about the reader's sign-in.
//
// The account fetch has three outcomes, not two. It can say "you are signed
// in", it can say "you are not", and -- while it is in flight, or when the
// account service could not be reached -- it can say nothing at all. The
// header used to collapse the third case into the second: any status that was
// not exactly "signed-in" rendered a "Sign in" button. A signed-in reader on a
// cold load, or behind a flaky network, was therefore told they were signed
// out, and signed in again to fix a problem that did not exist.
//
// This is a pure function so the rule can be tested directly rather than
// inferred from a rendered tree, and so there is exactly one place where the
// header decides what it knows.

/**
 * The auth statuses AuthProvider can be in. Kept structurally compatible with
 * AuthProvider's own AuthStatus rather than imported from it: this module is
 * loaded by node:test with type stripping, and importing the provider would
 * drag React in for no reason.
 */
export type HeaderAuthStatus =
  | "unavailable"
  | "loading"
  | "signed-out"
  | "signing-in"
  | "signed-in"
  | "error";

/**
 * - `signed-in`  the account is loaded and may be named.
 * - `signed-out` the service answered and there is no session.
 * - `unknown`    the answer has not arrived, or did not arrive at all.
 */
export type HeaderAccountPresentation = "signed-in" | "signed-out" | "unknown";

/** Only the identity fields the header renders. */
export interface HeaderAccountIdentity {
  displayName?: string | null;
  primaryEmail?: string | null;
}

export function headerAccountPresentation(
  status: HeaderAuthStatus,
  account: HeaderAccountIdentity | null | undefined,
): HeaderAccountPresentation {
  switch (status) {
    case "signed-in":
      // A "signed-in" status with no account body is a contradiction the
      // header must not resolve in either direction: claiming signed out
      // would be the original bug, and there is no name to claim signed in
      // with.
      return account ? "signed-in" : "unknown";
    case "signed-out":
    case "unavailable":
      // "unavailable" is a self-host with no account service configured. There
      // is no session to have, so this is a settled answer, not an unknown.
      return "signed-out";
    case "loading":
    case "signing-in":
    case "error":
      // "error" is the important one: /v1/auth/session failed, so the browser
      // may well still hold a valid HttpOnly session cookie. A failed read
      // never means signed out.
      return "unknown";
    default:
      return "unknown";
  }
}

/**
 * The name to render beside "Signed in as", or null when the header has no
 * business naming anybody.
 */
export function headerAccountName(
  status: HeaderAuthStatus,
  account: HeaderAccountIdentity | null | undefined,
): string | null {
  if (headerAccountPresentation(status, account) !== "signed-in") return null;
  const name = account?.displayName ?? account?.primaryEmail ?? null;
  return name && name.trim().length > 0 ? name : null;
}

/**
 * Whether the header should offer a "Sign in" control. Offering one in the
 * unknown state is what made a signed-in reader sign in again.
 */
export function headerOffersSignIn(
  status: HeaderAuthStatus,
  account: HeaderAccountIdentity | null | undefined,
): boolean {
  return headerAccountPresentation(status, account) === "signed-out";
}

/**
 * Whether the header should offer a retry. Only when the read actually failed
 * -- an in-flight read will resolve on its own and a retry button beside it
 * would just be noise.
 */
export function headerOffersRetry(
  status: HeaderAuthStatus,
  account: HeaderAccountIdentity | null | undefined,
): boolean {
  return headerAccountPresentation(status, account) === "unknown" && status === "error";
}
