import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import {
  defaultLearnerDataPolicy,
  validateLearnerDataPolicy,
} from "@project42/platform";
import siteCatalog from "../lib/siteCatalog.generated.json" with { type: "json" };
import { assertReleaseFactsMatch } from "./release-facts-validation.mjs";

const root = new URL("../", import.meta.url);
const packagePath = new URL("package.json", root);
const installedPlatformPath = new URL(
  "node_modules/@project42/platform/package.json",
  root,
);
const metadataPath = new URL("config/project-metadata.json", root);
const siteLicensePath = new URL("LICENSE", root);
const platformLicensePath = new URL(
  "node_modules/@project42/platform/LICENSE-CONTENT.md",
  root,
);
const readmePath = new URL("README.md", root);
const outputPath = new URL("public/release-facts.json", root);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const [packageMetadata, installedPlatform, projectMetadata, siteLicense, contentLicense] =
  await Promise.all([
    readJson(packagePath),
    readJson(installedPlatformPath),
    readJson(metadataPath),
    readFile(siteLicensePath, "utf8"),
    readFile(platformLicensePath, "utf8"),
  ]);

assert.match(packageMetadata.version, /^\d+\.\d+\.\d+$/);
assert.equal(packageMetadata.license, projectMetadata.licenses.software.spdx);
assert.equal(
  packageMetadata.repository?.url,
  `${projectMetadata.repositories.site}.git`,
);
assert.equal(packageMetadata.bugs?.url, projectMetadata.repositories.issues);
assert.equal(packageMetadata.homepage, projectMetadata.homepage);
assert.match(siteLicense, /Apache License\s+Version 2\.0/);
assert.match(contentLicense, /Creative Commons Attribution 4\.0 International/);

const platformSpec = packageMetadata.dependencies?.["@project42/platform"];
assert.equal(typeof platformSpec, "string");
const platformMatch = platformSpec.match(
  /^github:project42dev\/project42-platform#v(\d+\.\d+\.\d+)$/,
);
assert.ok(platformMatch, "The platform dependency must use a reviewed v-prefixed tag.");
assert.equal(
  platformMatch[1],
  installedPlatform.version,
  "The platform dependency tag and installed package version must match.",
);

const providers = siteCatalog.providers.map((provider) => ({
  id: provider.id,
  name: provider.name,
  description: provider.description,
}));
assert.deepEqual(
  providers.map((provider) => provider.id),
  projectMetadata.providerIds,
  "Provider coverage changed; review and update project metadata intentionally.",
);
assert.equal(new Set(providers.map((provider) => provider.id)).size, providers.length);
assert.deepEqual(validateLearnerDataPolicy(defaultLearnerDataPolicy), {
  valid: true,
  errors: [],
});

const facts = {
  $schemaVersion: 1,
  siteVersion: packageMetadata.version,
  platformVersion: installedPlatform.version,
  contentVersion: siteCatalog.contentVersion,
  counts: {
    learningPaths: siteCatalog.paths.length,
    assessedModules: siteCatalog.modules.length,
    evidenceActivities: siteCatalog.modules.filter((module) => module.activity)
      .length,
    reviewedQuestions: siteCatalog.modules.reduce(
      (total, module) => total + (module.knowledgeCheck?.questions.length ?? 0),
      0,
    ),
    resources: siteCatalog.resources.length,
    providerScopes: providers.length,
    providerImplementations: providers.filter(
      (provider) => provider.id !== "provider-neutral",
    ).length,
  },
  providers,
  learnerDataPolicy: {
    schemaVersion: defaultLearnerDataPolicy.schemaVersion,
    policyId: defaultLearnerDataPolicy.policyId,
    policyVersion: defaultLearnerDataPolicy.policyVersion,
    accountBackedRecords: defaultLearnerDataPolicy.accountBackedRecords,
    hostedRecordStore: defaultLearnerDataPolicy.adapters.hostedRecordStore,
    referenceRecordStore: defaultLearnerDataPolicy.adapters.referenceRecordStore,
  },
  homepage: projectMetadata.homepage,
  repositories: projectMetadata.repositories,
  licenses: projectMetadata.licenses,
};

// The README must not carry stale numbers, so every generated fact has to
// appear in it. That gate is right for a running deployment and impossible
// for a freshly scaffolded one: the catalogue counts are not knowable until
// the platform is installed, and this script refuses to run until the README
// already states them.
//
// So a README may delegate the block. Between the two markers below, this
// script OWNS the text and rewrites it -- but only when generating. --check
// still asserts and never writes, so CI catches a README that drifted from
// what a build produces, which is the case the gate exists for.
const FACTS_START = "<!-- release-facts:start -->";
const FACTS_END = "<!-- release-facts:end -->";

const requiredFacts = [
  `Site release \`${facts.siteVersion}\``,
  `Platform package \`${facts.platformVersion}\``,
  `Content release \`${facts.contentVersion}\``,
  `${facts.counts.learningPaths} learning paths`,
  `${facts.counts.assessedModules} assessed modules`,
  `${facts.counts.evidenceActivities} evidence activities`,
  `${facts.counts.reviewedQuestions} reviewed questions`,
  `${facts.counts.resources} practical resources`,
  `${facts.counts.providerScopes} provider scopes`,
];

let readme = await readFile(readmePath, "utf8");
const factsStart = readme.indexOf(FACTS_START);
const factsEnd = readme.indexOf(FACTS_END);
if (factsStart >= 0 && factsEnd > factsStart && !process.argv.includes("--check")) {
  const eol = readme.includes("\r\n") ? "\r\n" : "\n";
  const block = [
    FACTS_START,
    `- Site release \`${facts.siteVersion}\``,
    `- Platform package \`${facts.platformVersion}\``,
    `- Content release \`${facts.contentVersion}\``,
    `- ${facts.counts.learningPaths} learning paths, ${facts.counts.assessedModules} assessed modules, ` +
      `${facts.counts.evidenceActivities} evidence activities, and ` +
      `${facts.counts.reviewedQuestions} reviewed questions`,
    `- ${facts.counts.resources} practical resources and ${facts.counts.providerScopes} provider scopes`,
    "",
  ].join(eol);
  readme = readme.slice(0, factsStart) + block + readme.slice(factsEnd);
  await writeFile(readmePath, readme);
}

for (const requiredFact of requiredFacts) {
  assert.ok(
    readme.includes(requiredFact),
    `README is missing the current release fact: ${requiredFact}`,
  );
}

const serialized = `${JSON.stringify(facts, null, 2)}\n`;
if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8");
  assertReleaseFactsMatch(existing, facts);
  console.log(
    `Release facts verified: site ${facts.siteVersion}, platform ${facts.platformVersion}, content ${facts.contentVersion}, ${facts.counts.learningPaths} paths, ${facts.counts.assessedModules} modules, ${facts.counts.resources} resources, ${facts.counts.providerScopes} provider scopes.`,
  );
} else {
  await writeFile(outputPath, serialized);
  console.log(`Generated ${outputPath.pathname}`);
}
