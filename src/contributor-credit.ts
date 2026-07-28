import type { ValidationResult } from "./schema.js";

export const CONTRIBUTOR_CREDIT_SCHEMA_VERSION = "1.0" as const;

export const CONTRIBUTION_ROLES = [
  "author",
  "reviewer",
  "subject-matter-expert",
  "accessibility-reviewer",
] as const;

export const CONTRIBUTOR_CONTENT_KINDS = [
  "learn-module",
  "field-guide-resource",
  "training-package",
] as const;

export type ContributionRole = (typeof CONTRIBUTION_ROLES)[number];
export type AttributionConsentStatus =
  | "granted"
  | "not-granted"
  | "revoked";
export type ContributorAccountState = "active" | "deleted";
export type ContributorCreditSurface = "learn" | "field-guide";

export interface ContributorContentReference {
  contentId: string;
  contentKind: (typeof CONTRIBUTOR_CONTENT_KINDS)[number];
  acceptedVersion: string;
}

export interface ContributorRepositoryEvidence {
  provider: string;
  repositoryId: string;
  repositoryUrl: string;
}

export interface AcceptedChangeEvidence {
  pullRequestId: string;
  pullRequestUrl: string;
  mergedAt: string;
  mergeCommitSha: string;
  acceptedCommitSha: string;
}

export interface ContributorIdentityEvidence {
  contributorRef: string;
  provider: string;
  providerAccountRef: string | null;
  identityProofDigest: string;
  accountState: ContributorAccountState;
}

export interface AttributionConsent {
  status: AttributionConsentStatus;
  recordedAt: string;
  revokedAt: string | null;
}

export interface PublicContributorProfile {
  displayName: string;
  profileUrl: string | null;
}

export interface AiAssistanceDisclosure {
  used: boolean;
  disclosure: string | null;
  humanAccountabilityAccepted: true;
}

export interface ContributionCredit {
  id: string;
  role: ContributionRole;
  contributor: ContributorIdentityEvidence;
  consent: AttributionConsent;
  publicProfile: PublicContributorProfile | null;
  contributionSummary: string;
  aiAssistance: AiAssistanceDisclosure;
}

export interface ContributorCreditPackage {
  schemaVersion: typeof CONTRIBUTOR_CREDIT_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  content: ContributorContentReference;
  repository: ContributorRepositoryEvidence;
  acceptedChange: AcceptedChangeEvidence;
  credits: ContributionCredit[];
}

export interface PublicContributorCredit {
  role: ContributionRole;
  roleLabel: string;
  displayName: string;
  profileUrl: string | null;
  contributionSummary: string;
  aiAssistanceDisclosure: string | null;
}

export interface PublicContributorCreditExport {
  schemaVersion: typeof CONTRIBUTOR_CREDIT_SCHEMA_VERSION;
  packageId: string;
  content: ContributorContentReference;
  acceptedChange: {
    repositoryUrl: string;
    pullRequestId: string;
    pullRequestUrl: string;
    mergedAt: string;
    mergeCommitSha: string;
    acceptedCommitSha: string;
  };
  contributors: PublicContributorCredit[];
}

export interface ContributorCreditViewEntry extends PublicContributorCredit {
  evidenceUrl: string;
  evidenceLabel: string;
  accessibleSummary: string;
}

export interface ContributorCreditView {
  surface: ContributorCreditSurface;
  heading: "Contributors";
  semantics: {
    containerElement: "section";
    containerAriaLabel: "Content contributors";
    listElement: "ul";
    itemElement: "li";
  };
  contentVersionLabel: string;
  entries: ContributorCreditViewEntry[];
}

const stableIdPattern = /^[a-z0-9][a-z0-9._:-]{2,255}$/i;
const repositoryIdPattern = /^[a-z0-9][a-z0-9._:/-]{2,255}$/i;
const digestPattern = /^[a-f0-9]{64}$/;
const commitPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/;
const emailAddressPattern =
  /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+/i;
const roleLabels: Record<ContributionRole, string> = {
  author: "Author",
  reviewer: "Reviewer",
  "subject-matter-expert": "Subject-matter expert",
  "accessibility-reviewer": "Accessibility reviewer",
};

export function validateContributorCreditPackage(
  value: ContributorCreditPackage,
): ValidationResult {
  const errors: string[] = [];
  rejectUnknownKeys(
    value,
    [
      "schemaVersion",
      "id",
      "createdAt",
      "content",
      "repository",
      "acceptedChange",
      "credits",
    ],
    "package",
    errors,
  );
  if (value.schemaVersion !== CONTRIBUTOR_CREDIT_SCHEMA_VERSION) {
    errors.push("unsupported contributor-credit schema version");
  }
  validateStableId(value.id, "package ID", errors);
  validateTimestamp(value.createdAt, "package createdAt", errors);
  rejectUnknownKeys(
    value.content,
    ["contentId", "contentKind", "acceptedVersion"],
    "content reference",
    errors,
  );
  validateStableId(value.content.contentId, "content ID", errors);
  if (!CONTRIBUTOR_CONTENT_KINDS.includes(value.content.contentKind)) {
    errors.push("content kind is unsupported");
  }
  if (!versionPattern.test(value.content.acceptedVersion)) {
    errors.push("accepted content version is invalid");
  }
  rejectUnknownKeys(
    value.repository,
    ["provider", "repositoryId", "repositoryUrl"],
    "repository evidence",
    errors,
  );
  validateStableId(value.repository.provider, "repository provider", errors);
  if (!repositoryIdPattern.test(value.repository.repositoryId)) {
    errors.push("repository ID is invalid");
  }
  validateHttpsUrl(value.repository.repositoryUrl, "repository URL", errors);
  rejectUnknownKeys(
    value.acceptedChange,
    [
      "pullRequestId",
      "pullRequestUrl",
      "mergedAt",
      "mergeCommitSha",
      "acceptedCommitSha",
    ],
    "accepted-change evidence",
    errors,
  );
  if (!value.acceptedChange.pullRequestId.trim()) {
    errors.push("merged pull-request ID is required");
  }
  validateHttpsUrl(
    value.acceptedChange.pullRequestUrl,
    "merged pull-request URL",
    errors,
  );
  validateTimestamp(
    value.acceptedChange.mergedAt,
    "pull-request mergedAt",
    errors,
  );
  if (
    validTimestamp(value.createdAt) &&
    validTimestamp(value.acceptedChange.mergedAt) &&
    Date.parse(value.createdAt) < Date.parse(value.acceptedChange.mergedAt)
  ) {
    errors.push("package cannot be created before the accepted change was merged");
  }
  if (
    !urlIsWithinRepository(
      value.acceptedChange.pullRequestUrl,
      value.repository.repositoryUrl,
    )
  ) {
    errors.push("merged pull-request URL must belong to the evidence repository");
  }
  if (!commitPattern.test(value.acceptedChange.mergeCommitSha)) {
    errors.push("merge commit must be a lowercase 40- or 64-character hash");
  }
  if (!commitPattern.test(value.acceptedChange.acceptedCommitSha)) {
    errors.push("accepted commit must be a lowercase 40- or 64-character hash");
  }
  if (value.credits.length === 0) {
    errors.push("at least one contribution credit is required");
  }
  if (!value.credits.some((credit) => credit.role === "author")) {
    errors.push("at least one author credit is required");
  }

  const creditIds = new Set<string>();
  const contributorRoles = new Set<string>();
  for (const credit of value.credits) {
    rejectUnknownKeys(
      credit,
      [
        "id",
        "role",
        "contributor",
        "consent",
        "publicProfile",
        "contributionSummary",
        "aiAssistance",
      ],
      "credit",
      errors,
    );
    validateStableId(credit.id, "credit ID", errors);
    if (creditIds.has(credit.id)) {
      errors.push(`duplicate credit ID: ${credit.id}`);
    }
    creditIds.add(credit.id);
    if (!CONTRIBUTION_ROLES.includes(credit.role)) {
      errors.push(`${credit.id} has an unsupported contribution role`);
    }
    const roleKey = `${credit.contributor.contributorRef}:${credit.role}`;
    if (contributorRoles.has(roleKey)) {
      errors.push(`${credit.id} duplicates a contributor role`);
    }
    contributorRoles.add(roleKey);

    rejectUnknownKeys(
      credit.contributor,
      [
        "contributorRef",
        "provider",
        "providerAccountRef",
        "identityProofDigest",
        "accountState",
      ],
      `${credit.id} contributor`,
      errors,
    );
    validateStableId(
      credit.contributor.contributorRef,
      `${credit.id} contributor reference`,
      errors,
    );
    validateStableId(
      credit.contributor.provider,
      `${credit.id} identity provider`,
      errors,
    );
    if (!digestPattern.test(credit.contributor.identityProofDigest)) {
      errors.push(`${credit.id} identity proof must be a lowercase SHA-256 digest`);
    }
    if (
      credit.contributor.accountState !== "active" &&
      credit.contributor.accountState !== "deleted"
    ) {
      errors.push(`${credit.id} has an unsupported account state`);
    } else if (credit.contributor.accountState === "active") {
      if (!credit.contributor.providerAccountRef?.trim()) {
        errors.push(`${credit.id} active accounts require a stable provider account reference`);
      }
    } else if (credit.contributor.providerAccountRef !== null) {
      errors.push(`${credit.id} deleted accounts must tombstone the provider account reference`);
    }

    rejectUnknownKeys(
      credit.consent,
      ["status", "recordedAt", "revokedAt"],
      `${credit.id} consent`,
      errors,
    );
    validateTimestamp(
      credit.consent.recordedAt,
      `${credit.id} consent recordedAt`,
      errors,
    );
    if (
      credit.consent.status !== "granted" &&
      credit.consent.status !== "not-granted" &&
      credit.consent.status !== "revoked"
    ) {
      errors.push(`${credit.id} has an unsupported consent status`);
    } else if (credit.consent.status === "revoked") {
      if (!credit.consent.revokedAt) {
        errors.push(`${credit.id} revoked consent requires revokedAt`);
      } else {
        validateTimestamp(
          credit.consent.revokedAt,
          `${credit.id} consent revokedAt`,
          errors,
        );
        if (
          Date.parse(credit.consent.revokedAt) <
          Date.parse(credit.consent.recordedAt)
        ) {
          errors.push(`${credit.id} consent cannot be revoked before it was recorded`);
        }
      }
    } else if (credit.consent.revokedAt !== null) {
      errors.push(`${credit.id} non-revoked consent cannot include revokedAt`);
    }

    const publiclyAttributable =
      credit.contributor.accountState === "active" &&
      credit.consent.status === "granted";
    if (publiclyAttributable && !credit.publicProfile) {
      errors.push(`${credit.id} granted public attribution requires a public profile`);
    }
    if (!publiclyAttributable && credit.publicProfile !== null) {
      errors.push(`${credit.id} cannot retain a public profile without active consent`);
    }
    if (credit.publicProfile) {
      rejectUnknownKeys(
        credit.publicProfile,
        ["displayName", "profileUrl"],
        `${credit.id} public profile`,
        errors,
      );
      if (!credit.publicProfile.displayName.trim()) {
        errors.push(`${credit.id} public display name is required`);
      }
      if (credit.publicProfile.displayName.length > 120) {
        errors.push(`${credit.id} public display name is too long`);
      }
      rejectEmailAddress(
        credit.publicProfile.displayName,
        `${credit.id} public display name`,
        errors,
      );
      if (credit.publicProfile.profileUrl !== null) {
        validateHttpsUrl(
          credit.publicProfile.profileUrl,
          `${credit.id} public profile URL`,
          errors,
        );
        rejectEmailAddress(
          credit.publicProfile.profileUrl,
          `${credit.id} public profile URL`,
          errors,
        );
      }
    }
    if (!credit.contributionSummary.trim() || credit.contributionSummary.length > 500) {
      errors.push(`${credit.id} contribution summary must contain 1–500 characters`);
    }
    rejectEmailAddress(
      credit.contributionSummary,
      `${credit.id} contribution summary`,
      errors,
    );
    rejectUnknownKeys(
      credit.aiAssistance,
      ["used", "disclosure", "humanAccountabilityAccepted"],
      `${credit.id} AI assistance`,
      errors,
    );
    if (typeof credit.aiAssistance.used !== "boolean") {
      errors.push(`${credit.id} AI assistance used must be boolean`);
    }
    if (credit.aiAssistance.used && !credit.aiAssistance.disclosure?.trim()) {
      errors.push(`${credit.id} AI-assisted work requires a disclosure`);
    }
    if (!credit.aiAssistance.used && credit.aiAssistance.disclosure !== null) {
      errors.push(`${credit.id} non-AI-assisted work cannot include an AI disclosure`);
    }
    if (credit.aiAssistance.humanAccountabilityAccepted !== true) {
      errors.push(`${credit.id} requires a human accountability decision`);
    }
    if (credit.aiAssistance.disclosure) {
      rejectEmailAddress(
        credit.aiAssistance.disclosure,
        `${credit.id} AI assistance disclosure`,
        errors,
      );
    }
  }

  if (containsPrivateEmailField(value)) {
    errors.push("contributor-credit packages cannot contain email fields");
  }
  return { valid: errors.length === 0, errors };
}

export function buildPublicContributorCreditExport(
  value: ContributorCreditPackage,
): PublicContributorCreditExport {
  assertValid(value);
  return {
    schemaVersion: CONTRIBUTOR_CREDIT_SCHEMA_VERSION,
    packageId: value.id,
    content: structuredClone(value.content),
    acceptedChange: {
      repositoryUrl: value.repository.repositoryUrl,
      pullRequestId: value.acceptedChange.pullRequestId,
      pullRequestUrl: value.acceptedChange.pullRequestUrl,
      mergedAt: value.acceptedChange.mergedAt,
      mergeCommitSha: value.acceptedChange.mergeCommitSha,
      acceptedCommitSha: value.acceptedChange.acceptedCommitSha,
    },
    contributors: value.credits.map(toPublicCredit),
  };
}

export function buildContributorCreditView(
  value: ContributorCreditPackage,
  surface: ContributorCreditSurface,
): ContributorCreditView {
  const exported = buildPublicContributorCreditExport(value);
  return {
    surface,
    heading: "Contributors",
    semantics: {
      containerElement: "section",
      containerAriaLabel: "Content contributors",
      listElement: "ul",
      itemElement: "li",
    },
    contentVersionLabel: `Accepted content version ${exported.content.acceptedVersion}`,
    entries: exported.contributors.map((credit) => ({
      ...credit,
      evidenceUrl: exported.acceptedChange.pullRequestUrl,
      evidenceLabel: `View accepted change ${exported.acceptedChange.pullRequestId}`,
      accessibleSummary: `${credit.roleLabel}: ${credit.displayName}. ${credit.contributionSummary}`,
    })),
  };
}

function toPublicCredit(credit: ContributionCredit): PublicContributorCredit {
  const publicProfile = credit.publicProfile;
  const publiclyAttributable =
    credit.contributor.accountState === "active" &&
    credit.consent.status === "granted" &&
    publicProfile !== null;
  return {
    role: credit.role,
    roleLabel: roleLabels[credit.role],
    displayName: publiclyAttributable && publicProfile
      ? publicProfile.displayName
      : "Anonymous contributor",
    profileUrl:
      publiclyAttributable && publicProfile ? publicProfile.profileUrl : null,
    contributionSummary: credit.contributionSummary,
    aiAssistanceDisclosure: credit.aiAssistance.used
      ? credit.aiAssistance.disclosure
      : null,
  };
}

function assertValid(value: ContributorCreditPackage): void {
  const result = validateContributorCreditPackage(value);
  if (!result.valid) {
    throw new Error(`Invalid contributor-credit package: ${result.errors.join("; ")}`);
  }
}

function validateStableId(
  value: string,
  label: string,
  errors: string[],
): void {
  if (!stableIdPattern.test(value)) errors.push(`${label} is invalid`);
}

function validateHttpsUrl(
  value: string,
  label: string,
  errors: string[],
): void {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:") {
      errors.push(`${label} must use HTTPS`);
    }
    if (parsed.username || parsed.password) {
      errors.push(`${label} cannot contain URL credentials`);
    }
  } catch {
    errors.push(`${label} must be a valid URL`);
  }
}

function rejectEmailAddress(
  value: string,
  label: string,
  errors: string[],
): void {
  if (emailAddressPattern.test(value)) {
    errors.push(`${label} cannot contain an email address`);
  }
}

function validateTimestamp(
  value: string,
  label: string,
  errors: string[],
): void {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    errors.push(`${label} must be an ISO 8601 UTC timestamp`);
  }
}

function validTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function urlIsWithinRepository(
  pullRequestUrl: string,
  repositoryUrl: string,
): boolean {
  try {
    const pullRequest = new URL(pullRequestUrl);
    const repository = new URL(repositoryUrl);
    const repositoryPath = repository.pathname.replace(/\/+$/, "");
    return (
      pullRequest.protocol === "https:" &&
      repository.protocol === "https:" &&
      pullRequest.origin === repository.origin &&
      pullRequest.pathname.startsWith(`${repositoryPath}/`)
    );
  } catch {
    return false;
  }
}

function rejectUnknownKeys(
  value: object,
  allowedKeys: readonly string[],
  label: string,
  errors: string[],
): void {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${label} contains unsupported field: ${key}`);
  }
}

function containsPrivateEmailField(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsPrivateEmailField);
  return Object.entries(value).some(
    ([key, child]) =>
      key.toLowerCase().includes("email") || containsPrivateEmailField(child),
  );
}
