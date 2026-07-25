import type { Resource } from "./schema.js";

const DAY_IN_MILLISECONDS = 86_400_000;

export type ResourceFreshnessStatus = "current" | "review-due" | "stale";

export interface ResourceFreshness {
  status: ResourceFreshnessStatus;
  reviewedOn: string;
  dueOn: string;
  daysSinceReview: number;
  daysUntilDue: number;
}

/**
 * Derives freshness from review evidence and policy. The status is intentionally
 * calculated at read time so published catalog data cannot contain a stale status.
 */
export function getResourceFreshness(
  resource: Pick<Resource, "lastVerified" | "reviewCadenceDays">,
  asOf: string | Date = new Date(),
): ResourceFreshness {
  if (
    !Number.isInteger(resource.reviewCadenceDays) ||
    resource.reviewCadenceDays < 1 ||
    resource.reviewCadenceDays > 365
  ) {
    throw new RangeError("reviewCadenceDays must be an integer from 1 through 365");
  }
  const reviewedAt = parseDateOnly(resource.lastVerified, "lastVerified");
  const asOfDate = parseAsOf(asOf);
  const dueAt = new Date(
    reviewedAt.valueOf() + resource.reviewCadenceDays * DAY_IN_MILLISECONDS,
  );
  const daysSinceReview = Math.floor(
    (asOfDate.valueOf() - reviewedAt.valueOf()) / DAY_IN_MILLISECONDS,
  );
  const daysUntilDue = Math.ceil(
    (dueAt.valueOf() - asOfDate.valueOf()) / DAY_IN_MILLISECONDS,
  );
  const warningWindowDays = Math.min(
    30,
    Math.max(7, Math.ceil(resource.reviewCadenceDays * 0.2)),
  );

  let status: ResourceFreshnessStatus = "current";
  if (daysUntilDue < 0) {
    status = "stale";
  } else if (daysUntilDue <= warningWindowDays) {
    status = "review-due";
  }

  return {
    status,
    reviewedOn: resource.lastVerified,
    dueOn: dueAt.toISOString().slice(0, 10),
    daysSinceReview,
    daysUntilDue,
  };
}

function parseDateOnly(value: string, name: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new TypeError(`${name} must be a YYYY-MM-DD date`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || !date.toISOString().startsWith(value)) {
    throw new TypeError(`${name} must be a valid YYYY-MM-DD date`);
  }
  return date;
}

function parseAsOf(value: string | Date): Date {
  if (typeof value === "string") return parseDateOnly(value, "asOf");
  if (Number.isNaN(value.valueOf())) throw new TypeError("asOf must be a valid date");
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}
