import {
  defaultLearnerDataPolicy,
  validateLearnerDataPolicy,
} from "@project42/platform";

const validation = validateLearnerDataPolicy(defaultLearnerDataPolicy);

if (!validation.valid) {
  throw new Error(
    `The configured learner-data policy is invalid: ${validation.errors.join("; ")}`,
  );
}

export const learnerDataPolicy = defaultLearnerDataPolicy;

/**
 * Whether this distribution has an account service configured. The learner-data
 * policy states what the software supports; this states whether this deployment
 * can actually store account-backed records (AB#6425). Same signal AuthProvider
 * uses to decide the account experience is real.
 */
export const accountServiceConfigured = Boolean(
  process.env.NEXT_PUBLIC_PROJECT42_API_ORIGIN,
);
