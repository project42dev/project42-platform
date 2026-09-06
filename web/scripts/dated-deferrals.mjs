#!/usr/bin/env node
// Fails as soon as a dated exception has passed its expiry date.
//
// scripts/link-integrity.mjs already refuses an expired exception, but only
// once the whole site has been rendered and every external link fetched, and
// only when somebody pushes. This check needs no build and no network, so it
// can run first in the gate and on a schedule - which is what makes an expiry
// enforceable rather than a note in a file: the date alone turns the
// repository red, without waiting for the next change.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const exceptionsPath = fileURLToPath(
  new URL("../config/link-check-exceptions.json", import.meta.url),
);

const isIsoDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value));

const today = process.env.PROJECT42_DEFERRAL_TODAY ?? new Date().toISOString().slice(0, 10);
if (!isIsoDate(today)) {
  throw new Error("PROJECT42_DEFERRAL_TODAY must be an ISO yyyy-mm-dd date.");
}

const document = JSON.parse(await readFile(exceptionsPath, "utf8"));
if (document.$schemaVersion !== 1 || !Array.isArray(document.exceptions)) {
  throw new Error(
    "config/link-check-exceptions.json must use $schemaVersion 1 and contain an exceptions array.",
  );
}

const failures = [];
for (const [index, exception] of document.exceptions.entries()) {
  const label = exception.targetPattern ?? `exception ${index + 1}`;
  if (!isIsoDate(exception.expires)) {
    failures.push(
      `${label} has no ISO expiry date. An exception without one is permanent.`,
    );
    continue;
  }
  if (!isIsoDate(exception.verifiedOn)) {
    failures.push(
      `${label} does not record when it was last verified, so its expiry cannot be renewed honestly.`,
    );
  }
  if (exception.expires < today) {
    failures.push(
      `${label} expired on ${exception.expires} (last verified ${exception.verifiedOn}). ` +
        "Remove it if the target is stable now, or renew it with a fresh dated " +
        "verification and an explicit reason. Do not move the date to make CI green.",
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    `\n${failures.length} dated deferral(s) need a decision as of ${today}.`,
  );
  process.exitCode = 1;
} else {
  const soonest = document.exceptions
    .map((exception) => exception.expires)
    .sort()[0];
  console.log(
    `Dated deferrals are current as of ${today}: ${document.exceptions.length} link-check ` +
      `exception(s), the earliest expiring ${soonest}.`,
  );
}
