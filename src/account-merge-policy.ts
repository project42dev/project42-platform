import { defaultLearnerDataPolicy } from "./learner-data-policy.js";

export interface AccountMergeConsentRequirement {
  purpose: string;
  policyVersion: string;
}

const safePolicyValue = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const DEFAULT_ACCOUNT_MERGE_CONSENT_REQUIREMENTS =
  defaultLearnerDataPolicy.consent.purposes
    .filter((purpose) => purpose.required)
    .map((purpose) => ({
      purpose: purpose.id,
      policyVersion: defaultLearnerDataPolicy.policyVersion,
    }));

export function readAccountMergeConsentRequirements(
  configuration?: string,
): AccountMergeConsentRequirement[] {
  if (!configuration?.trim()) {
    return DEFAULT_ACCOUNT_MERGE_CONSENT_REQUIREMENTS.map((requirement) => ({
      ...requirement,
    }));
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(configuration);
  } catch {
    throw new Error(
      "ACCOUNT_MERGE_REQUIRED_CONSENTS must be a JSON array.",
    );
  }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 20) {
    throw new Error(
      "ACCOUNT_MERGE_REQUIRED_CONSENTS must contain 1 through 20 requirements.",
    );
  }
  const requirements = parsed.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(
        "Each account-merge consent requirement must be an object.",
      );
    }
    const record = value as Record<string, unknown>;
    if (
      Object.keys(record).some(
        (key) => !["purpose", "policyVersion"].includes(key),
      ) ||
      typeof record.purpose !== "string" ||
      !safePolicyValue.test(record.purpose) ||
      typeof record.policyVersion !== "string" ||
      !safePolicyValue.test(record.policyVersion)
    ) {
      throw new Error(
        "Each account-merge consent requirement needs safe purpose and policyVersion values.",
      );
    }
    return {
      purpose: record.purpose,
      policyVersion: record.policyVersion,
    };
  });
  const keys = requirements.map(
    (requirement) =>
      `${requirement.purpose}\u0000${requirement.policyVersion}`,
  );
  if (new Set(keys).size !== keys.length) {
    throw new Error(
      "ACCOUNT_MERGE_REQUIRED_CONSENTS cannot contain duplicates.",
    );
  }
  return requirements.sort((left, right) =>
    `${left.purpose}\u0000${left.policyVersion}`.localeCompare(
      `${right.purpose}\u0000${right.policyVersion}`,
    ),
  );
}
