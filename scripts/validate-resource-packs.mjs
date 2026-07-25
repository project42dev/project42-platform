import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadCatalog } from "./load-catalog.mjs";
import {
  findUnsafeArtifactCommands,
  hasRecoveryGuidance,
  hasVerificationGuidance,
} from "./resource-pack-rules.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalog = await loadCatalog(root);
const registry = JSON.parse(
  await readFile(resolve(root, "content/source-registry.json"), "utf8"),
);
const manifestPaths = await findJsonFiles(resolve(root, "content/resource-packs"));
const manifests = await Promise.all(
  manifestPaths.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
);
const resourcesById = new Map(
  catalog.resources.map((resource) => [resource.id, resource]),
);
const registeredPrefixes = registry.sources.map((source) => source.urlPrefix);
const errors = [];
const credentialPatterns = [
  ["an OpenAI-style API key", /\bsk-[a-zA-Z0-9_-]{16,}\b/],
  ["an AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["a GitHub token", /\bgh[pousr]_[a-zA-Z0-9]{20,}\b/],
  ["a private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
];

if (manifests.length === 0) errors.push("No resource-pack manifests found");

for (const manifest of manifests) await validateManifest(manifest);

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exitCode = 1;
} else {
  const resourceCount = manifests.reduce(
    (total, manifest) => total + manifest.resourceIds.length,
    0,
  );
  console.log(
    `Validated ${manifests.length} resource pack(s) containing ${resourceCount} resources.`,
  );
}

async function validateManifest(manifest) {
  const location = `Resource pack ${manifest.id ?? "(missing id)"}`;
  if (manifest.schemaVersion !== "1.0") {
    errors.push(`${location} has an unsupported schema version`);
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id ?? "")) {
    errors.push(`${location} has an invalid id`);
  }
  if (!manifest.title?.trim()) errors.push(`${location} needs a title`);
  if (!Array.isArray(manifest.resourceIds) || manifest.resourceIds.length === 0) {
    errors.push(`${location} has no resource IDs`);
    return;
  }
  if (new Set(manifest.resourceIds).size !== manifest.resourceIds.length) {
    errors.push(`${location} contains duplicate resource IDs`);
  }
  if (
    manifest.exactResourceCount !== undefined &&
    manifest.resourceIds.length !== manifest.exactResourceCount
  ) {
    errors.push(
      `${location} declares ${manifest.resourceIds.length} resources; expected exactly ${manifest.exactResourceCount}`,
    );
  }
  if (
    !Array.isArray(manifest.resourceRoots) ||
    manifest.resourceRoots.length === 0
  ) {
    errors.push(`${location} has no resource roots`);
  } else if (
    new Set(manifest.resourceRoots).size !== manifest.resourceRoots.length
  ) {
    errors.push(`${location} contains duplicate resource roots`);
  }

  const packResources = manifest.resourceIds
    .map((id) => resourcesById.get(id))
    .filter(Boolean);
  for (const id of manifest.resourceIds) {
    if (!resourcesById.has(id)) errors.push(`${location} references missing resource ${id}`);
  }

  const fileIdGroups = [];
  for (const resourceRoot of manifest.resourceRoots ?? []) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(resourceRoot)) {
      errors.push(`${location} has an invalid resource root: ${resourceRoot}`);
      continue;
    }
    const directory = resolve(root, "content/resources", resourceRoot);
    if (!directory.startsWith(resolve(root, "content/resources"))) {
      errors.push(`${location} has an unsafe resource root: ${resourceRoot}`);
      continue;
    }
    fileIdGroups.push(readResourceIds(directory, location));
  }
  const actual = (await Promise.all(fileIdGroups)).flat().sort();
  const declared = [...manifest.resourceIds].sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared)) {
    errors.push(
      `${location} file membership does not match its declared resource IDs`,
    );
  }

  for (const provider of manifest.requiredProviders ?? []) {
    if (!packResources.some((resource) => resource.providers.includes(provider))) {
      errors.push(`${location} has no resource covering provider ${provider}`);
    }
  }

  for (const resource of packResources) {
    if (resource.slug !== resource.id) {
      errors.push(`${location} resource ${resource.id} must use its stable ID as slug`);
    }
    if (resource.sources.length < (manifest.minimumSourcesPerResource ?? 1)) {
      errors.push(`${location} resource ${resource.id} has too few sources`);
    }
    if (
      !resource.sections.some((section) =>
        /^Expected (result|evidence) and verification$/i.test(section.title),
      )
    ) {
      errors.push(`${location} resource ${resource.id} lacks an acceptance section`);
    }
    if (!resource.sections.some((section) => section.code?.code.trim())) {
      errors.push(`${location} resource ${resource.id} lacks a reusable artifact`);
    }
    if (
      manifest.requiredGuidance?.verification &&
      !hasVerificationGuidance(resource)
    ) {
      errors.push(
        `${location} resource ${resource.id} lacks verification guidance`,
      );
    }
    if (
      manifest.requiredGuidance?.recovery &&
      !hasRecoveryGuidance(resource)
    ) {
      errors.push(`${location} resource ${resource.id} lacks recovery guidance`);
    }
    if (manifest.requiredGuidance?.safeArtifacts) {
      for (const unsafeCommand of findUnsafeArtifactCommands(resource)) {
        errors.push(
          `${location} resource ${resource.id} artifact contains ${unsafeCommand}`,
        );
      }
    }
    if (resource.providers.includes("provider-neutral") === false) {
      errors.push(`${location} resource ${resource.id} lacks provider-neutral scope`);
    }
    validateReviewDates(resource, location);
    for (const source of resource.sources) {
      if (!registeredPrefixes.some((prefix) => source.url.startsWith(prefix))) {
        errors.push(
          `${location} resource ${resource.id} uses unregistered source ${source.url}`,
        );
      }
    }
    const serialized = JSON.stringify(resource);
    for (const [name, pattern] of credentialPatterns) {
      if (pattern.test(serialized)) {
        errors.push(`${location} resource ${resource.id} contains ${name}`);
      }
    }
  }
}

function validateReviewDates(resource, location) {
  const reviewed = parseDateOnly(resource.lastVerified);
  if (!reviewed) {
    errors.push(`${location} resource ${resource.id} has an invalid review date`);
    return;
  }
  const today = utcDateOnly(new Date());
  if (reviewed > today) {
    errors.push(`${location} resource ${resource.id} has a future review date`);
  }
  const ageDays = Math.floor((today - reviewed) / 86_400_000);
  if (ageDays > resource.reviewCadenceDays) {
    errors.push(`${location} resource ${resource.id} is stale`);
  }
  for (const source of resource.sources) {
    const sourceDate = parseDateOnly(source.lastVerified);
    if (!sourceDate || sourceDate > today) {
      errors.push(
        `${location} resource ${resource.id} has an invalid source review date: ${source.title}`,
      );
    }
  }
}

async function readResourceIds(directory, location) {
  const files = await findJsonFiles(directory);
  const ids = [];
  for (const path of files) {
    try {
      const resource = JSON.parse(await readFile(path, "utf8"));
      ids.push(resource.id);
    } catch (error) {
      errors.push(`${location} cannot read ${path}: ${error.message}`);
    }
  }
  return ids;
}

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || !parsed.toISOString().startsWith(value)) {
    return undefined;
  }
  return parsed;
}

function utcDateOnly(value) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

async function findJsonFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const paths = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await findJsonFiles(path)));
    if (entry.isFile() && extname(entry.name) === ".json") paths.push(path);
  }
  return paths.sort();
}
