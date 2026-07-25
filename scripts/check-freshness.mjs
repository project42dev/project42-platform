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

  const verified = new Date(`${reference.lastVerified}T00:00:00.000Z`);
  const ageDays = Math.floor((asOf.valueOf() - verified.valueOf()) / 86_400_000);
  if (ageDays > registration.reviewCadenceDays) {
    failures.push(
      `${reference.contentId}: ${registration.id} is ${ageDays} days old (limit ${registration.reviewCadenceDays})`,
    );
  } else if (ageDays >= Math.floor(registration.reviewCadenceDays * 0.8)) {
    warnings.push(
      `${reference.contentId}: ${registration.id} review is due in ${registration.reviewCadenceDays - ageDays} days`,
    );
  }
}

for (const warning of warnings) console.warn(`WARN ${warning}`);
for (const failure of failures) console.error(`ERROR ${failure}`);
console.log(
  `Checked ${references.length} references against ${registered.length} registered primary sources as of ${asOf.toISOString().slice(0, 10)}.`,
);

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
