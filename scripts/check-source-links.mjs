import { readFile, readdir } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { loadCatalog } from "./load-catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requestedPack = process.argv[2];
const catalog = await loadCatalog(root);
const manifests = await loadManifests();
const selected = requestedPack
  ? manifests.filter((manifest) => manifest.id === requestedPack)
  : manifests;

if (requestedPack && selected.length === 0) {
  throw new Error(`Unknown resource pack: ${requestedPack}`);
}
if (selected.length === 0) throw new Error("No resource-pack manifests found");

const resourceIds = new Set(selected.flatMap((manifest) => manifest.resourceIds));
const urls = [
  ...new Set(
    catalog.resources
      .filter((resource) => resourceIds.has(resource.id))
      .flatMap((resource) => resource.sources.map((source) => source.url)),
  ),
].sort();
const failures = [];
const results = await mapWithConcurrency(urls, 4, checkUrl);

for (const result of results) {
  if (result.ok) {
    console.log(`OK ${result.status} ${result.url}`);
  } else {
    failures.push(result);
    console.error(`ERROR ${result.status ?? "network"} ${result.url}: ${result.error}`);
  }
}
console.log(
  `Checked ${urls.length} unique source links for ${selected.length} resource pack(s).`,
);
if (failures.length > 0) process.exitCode = 1;

async function checkUrl(url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let retryable = true;
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: {
          "User-Agent": "Project42-LinkChecker/1.0 (+https://project-42.dev)",
          Accept: "text/html,application/xhtml+xml,application/pdf;q=0.8,*/*;q=0.5",
          Range: "bytes=0-2047",
        },
        signal: AbortSignal.timeout(20_000),
      });
      await response.body?.cancel();
      if (response.status >= 200 && response.status < 400) {
        return { ok: true, status: response.status, url };
      }
      lastError = `HTTP ${response.status}`;
      retryable = response.status === 429 || response.status >= 500;
    } catch (error) {
      lastError = error.message;
    }
    if (!retryable || attempt === 3) break;
    await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
  }
  return { ok: false, url, error: lastError };
}

async function loadManifests() {
  const paths = await findJsonFiles(resolve(root, "content/resource-packs"));
  return Promise.all(
    paths.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
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
