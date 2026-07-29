import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./load-catalog.mjs";
import {
  buildTrainingCoverage,
  loadCanonicalClassScripts,
} from "./training-package-catalog-lib.mjs";
import { buildTrainingFixtureArtifacts } from "./training-fixture-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const entries = await loadCanonicalClassScripts(root);
const catalog = await loadCatalog(root);
const coverage = buildTrainingCoverage(catalog, entries);

async function persistOrCheck(outputPath, content) {
  if (checkOnly) {
    let committed;
    try {
      committed = await readFile(outputPath, "utf8");
    } catch {
      throw new Error(
        `Generated training artifact is missing: ${outputPath.slice(root.length + 1)}`,
      );
    }
    if (committed !== content) {
      throw new Error(
        `Generated training artifact is stale: ${outputPath.slice(root.length + 1)}`,
      );
    }
    return;
  }
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
}

for (const entry of entries) {
  const outputRoot = dirname(entry.absolutePath);
  const artifacts = buildTrainingFixtureArtifacts(entry.script);
  for (const [relativePath, content] of Object.entries(artifacts)) {
    const outputPath = resolve(outputRoot, relativePath);
    await persistOrCheck(outputPath, content);
  }
}

await persistOrCheck(
  resolve(root, "content/training/coverage.json"),
  `${JSON.stringify(coverage, null, 2)}\n`,
);

if (!checkOnly) {
  const generatedSource = [
    "// Generated from content/training. Do not edit.",
    'import type { ClassScriptPackage, TrainingPackageCoverage } from "../training-package.js";',
    `export const generatedClassScriptPackages = ${JSON.stringify(entries.map((entry) => entry.script), null, 2)} satisfies ClassScriptPackage[];`,
    `export const generatedTrainingPackageCoverage = ${JSON.stringify(coverage, null, 2)} satisfies TrainingPackageCoverage;`,
    "",
  ].join("\n");
  const generatedPath = resolve(root, "src/generated/training-packages.ts");
  await mkdir(dirname(generatedPath), { recursive: true });
  await writeFile(generatedPath, generatedSource, "utf8");
}

console.log(
  `${checkOnly ? "Verified" : "Generated"} ${entries.length} class-ready package(s); ${coverage.outlineOnlyModuleCount} outline-only module(s) remain.`,
);
