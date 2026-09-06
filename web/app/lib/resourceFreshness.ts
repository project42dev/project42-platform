import {
  getResourceFreshness,
  type Resource,
  type ResourceFreshnessStatus,
} from "@project42/platform";

const labels: Record<ResourceFreshnessStatus, string> = {
  current: "Current",
  "review-due": "Review due",
  stale: "Stale",
};

export function getResourceFreshnessView(
  resource: Pick<Resource, "lastVerified" | "reviewCadenceDays">,
  asOf: string,
) {
  const freshness = getResourceFreshness(resource, asOf);
  return {
    ...freshness,
    label: labels[freshness.status],
    className: `freshness-${freshness.status}`,
  };
}

export function displayEditorialValue(value: string) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
