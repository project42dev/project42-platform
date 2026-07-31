export const ACCOUNT_STATES = [
  "pending",
  "approved",
  "rejected",
  "suspended",
  "revoked",
] as const;

export type AccountState = (typeof ACCOUNT_STATES)[number];

export interface VerifiedIdentity {
  provider?: string;
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  issuedAt?: number;
  authenticatedAt?: number;
}

export interface IdentityVerifier {
  verify(request: Request): Promise<VerifiedIdentity>;
}

const allowedTransitions: Readonly<Record<AccountState, readonly AccountState[]>> = {
  pending: ["approved", "rejected", "revoked"],
  approved: ["suspended", "revoked"],
  rejected: ["approved", "revoked"],
  suspended: ["approved", "revoked"],
  revoked: [],
};

export function canTransitionAccount(
  from: AccountState,
  to: AccountState,
): boolean {
  return allowedTransitions[from].includes(to);
}

export function normalizeExactDomain(value: string): string {
  const candidate = value.trim().toLowerCase().replace(/\.$/, "");
  if (
    !candidate ||
    candidate.includes("@") ||
    candidate.includes("*") ||
    candidate.includes("/") ||
    candidate.includes(":")
  ) {
    throw new Error("Domain must be an exact DNS name without an email, wildcard, path, or port.");
  }

  let hostname: string;
  try {
    hostname = new URL(`https://${candidate}`).hostname.toLowerCase();
  } catch {
    throw new Error("Domain is not a valid DNS name.");
  }

  if (
    hostname !== candidate ||
    hostname.length > 253 ||
    hostname.split(".").some((label) => !label || label.length > 63)
  ) {
    throw new Error("Domain is not a valid normalized DNS name.");
  }
  return hostname;
}

export function getVerifiedEmailDomain(
  identity: Pick<VerifiedIdentity, "email" | "emailVerified">,
): string | null {
  // Strict boolean, not truthiness: verification decides automatic approval, so
  // a claim that merely looks affirmative - the string "true", 1, a non-empty
  // object decoded from a token or a restored record - must not count as a
  // signed verification (AB#5782).
  if (identity.emailVerified !== true) return null;
  if (typeof identity.email !== "string" || !identity.email) return null;
  const at = identity.email.indexOf("@");
  // Exactly one separator. Taking the last "@" would resolve a malformed
  // address such as "learner@@example.com" - or "learner@corp@attacker.test" -
  // to a domain the address does not legitimately belong to.
  if (at <= 0 || at !== identity.email.lastIndexOf("@")) return null;
  if (at === identity.email.length - 1) return null;
  try {
    return normalizeExactDomain(identity.email.slice(at + 1));
  } catch {
    return null;
  }
}

export function exactDomainMatches(emailDomain: string, ruleDomain: string): boolean {
  return normalizeExactDomain(emailDomain) === normalizeExactDomain(ruleDomain);
}
