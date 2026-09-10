// Review currency of the curriculum this repository serves.
//
// Four states, not three. A citation with no recorded review used to produce
// `new Date("undefinedT00:00:00.000Z")` -> NaN, and `NaN > cadence` is false,
// so it passed this gate looking exactly as fresh as a source read yesterday.
// Absence of evidence read as evidence of freshness.
//
//   current     a review date exists and is inside the source's cadence
//   review-due  a review date exists and the cadence is nearly spent
//   stale       a review date exists and the cadence is spent  -> FAILS
//   unverified  no review date exists at all                   -> NAMED, never hidden
//
// unverified does not fail, deliberately. Stale means a dated claim has aged
// out and the fix is to go and re-read the source. Unverified means no one ever
// recorded a check -- an honest gap, not an expired claim. Failing on it would
// push an author to invent a date, which is the defect project42-content commit
// 3d4b093 exists to undo. It is named and counted on every run instead, so it
// can never pass silently. A malformed date is neither: it is a broken record
// and it fails.
//
// Mirrors the four-state model in project42-content/scripts/check-freshness.mjs.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./load-catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = await loadCatalog(root);
const registry = JSON.parse(
  await readFile(resolve(root, "content/source-registry.json"), "utf8"),
);
const asOf = parseAsOf(process.env.PROJECT42_AS_OF);
const registered = [...registry.sources].sort(
  (left, right) => right.urlPrefix.length - left.urlPrefix.length,
);
const references = [
  ...catalog.modules.flatMap((module) =>
    module.sources.map((source) => ({ contentId: module.id, ...source })),
  ),
  ...catalog.resources.flatMap((resource) =>
    resource.sources.map((source) => ({ contentId: resource.id, ...source })),
  ),
];
const failures = [];
const warnings = [];
const unverified = [];
const counts = { current: 0, "review-due": 0, stale: 0, unverified: 0 };

for (const reference of references) {
  const registration = registered.find((source) =>
    reference.url.startsWith(source.urlPrefix),
  );
  if (!registration) {
    failures.push(`${reference.contentId}: unregistered source ${reference.url}`);
    continue;
  }
  if (registration.publisher !== reference.publisher) {
    failures.push(
      `${reference.contentId}: publisher ${reference.publisher} does not match registry ${registration.publisher}`,
    );
  }

  // Absent is the only legal way to say "nobody has reviewed this". Anything
  // else that is not a date -- null, "", a placeholder -- is a broken record.
  if (reference.lastVerified === undefined || reference.lastVerified === null) {
    counts.unverified += 1;
    unverified.push(`${reference.contentId}: ${registration.id} has no recorded review`);
    continue;
  }
  if (
    typeof reference.lastVerified !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(reference.lastVerified)
  ) {
    failures.push(
      `${reference.contentId}: ${registration.id} has a malformed lastVerified: ${JSON.stringify(reference.lastVerified)}. Absent is how an unreviewed citation says so.`,
    );
    continue;
  }

  const verified = new Date(`${reference.lastVerified}T00:00:00.000Z`);
  if (Number.isNaN(verified.valueOf())) {
    failures.push(
      `${reference.contentId}: ${registration.id} lastVerified is not a real calendar date: ${reference.lastVerified}`,
    );
    continue;
  }
  const ageDays = Math.floor((asOf.valueOf() - verified.valueOf()) / 86_400_000);
  if (ageDays > registration.reviewCadenceDays) {
    counts.stale += 1;
    failures.push(
      `${reference.contentId}: ${registration.id} is ${ageDays} days old (limit ${registration.reviewCadenceDays})`,
    );
  } else if (ageDays >= Math.floor(registration.reviewCadenceDays * 0.8)) {
    counts["review-due"] += 1;
    warnings.push(
      `${reference.contentId}: ${registration.id} review is due in ${registration.reviewCadenceDays - ageDays} days`,
    );
  } else {
    counts.current += 1;
  }
}

for (const warning of warnings) console.warn(`WARN ${warning}`);
for (const item of unverified) console.warn(`UNVERIFIED ${item}`);
for (const failure of failures) console.error(`ERROR ${failure}`);
console.log(
  `Checked ${references.length} references against ${registered.length} registered primary sources as of ${asOf.toISOString().slice(0, 10)}: ${counts.current} current, ${counts["review-due"]} review-due, ${counts.stale} stale, ${counts.unverified} unverified.`,
);
if (counts.unverified > 0) {
  console.log(
    `${counts.unverified} citation(s) have no recorded review. Unverified is not stale: nothing has expired, nothing was ever checked. Named above, not failed.`,
  );
}

if (failures.length > 0) process.exitCode = 1;

function parseAsOf(value) {
  if (!value) return new Date();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("PROJECT42_AS_OF must use YYYY-MM-DD");
  }
  const result = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(result.valueOf())) throw new Error("PROJECT42_AS_OF is invalid");
  return result;
}
