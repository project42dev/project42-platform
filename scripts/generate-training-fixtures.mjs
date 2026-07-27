import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTrainingFixtureArtifacts } from "./training-fixture-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(
  root,
  "examples/training/language-models-and-generation/class-script.json",
);
const outputRoot = resolve(
  root,
  "examples/training/language-models-and-generation",
);
const script = JSON.parse(await readFile(source, "utf8"));
const artifacts = buildTrainingFixtureArtifacts(script);

for (const [relativePath, content] of Object.entries(artifacts)) {
  const outputPath = resolve(outputRoot, relativePath);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
}

console.log(
  `Generated ${Object.keys(artifacts).length} deterministic training fixture artifacts.`,
);
