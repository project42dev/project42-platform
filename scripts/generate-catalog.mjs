import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "./load-catalog.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(root, "src/generated/catalog.ts");
const parsed = await loadCatalog(root);

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
