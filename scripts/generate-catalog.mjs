import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = resolve(root, "content/catalog.json");
const outputPath = resolve(root, "src/generated/catalog.ts");
const raw = await readFile(sourcePath, "utf8");
const parsed = JSON.parse(raw);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  [
    "// Generated from content/catalog.json. Do not edit.",
    'import type { Catalog } from "../schema.js";',
    `export const generatedCatalog = ${JSON.stringify(parsed, null, 2)} as const satisfies Catalog;`,
    "",
  ].join("\n"),
);
