import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../layouts");
const check = process.argv.includes("--check");
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const manifest = JSON.parse(await readFile(path.join(root, entry.name, "layout.json"), "utf8"));
  const composition = manifest.composition ?? "";
  // A layout may position existing elements, but cannot supply identity or copy.
  if (/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|font-family|(?:^|[;{])\s*(?:color|background|fill|stroke|content)\s*:/i.test(JSON.stringify(manifest.tokens) + composition)) {
    throw new Error(`${entry.name}: layout contains theme identity or content`);
  }
  for (const [, id] of composition.matchAll(/\[data-layout="([^"]+)"\]/g)) {
    if (id !== manifest.id) throw new Error(`${entry.name}: foreign layout scope`);
  }
  const body = Object.entries(manifest.tokens).map(([key, value]) => `  ${key}: ${value};`).join("\n");
  const css = `/* Project 42 ${manifest.name} layout bundle.
 *
 * GENERATED from layout.json -- do not edit by hand.
 *
 * ${manifest.description}
 *
 * Composition only: width, spacing rhythm, density, radii, type ramp.
 * Colour and typeface belong to the theme bundle.
 */
:root[data-layout="${manifest.id}"] {
${body}
}
${composition ? `\n${composition}\n` : ""}`;
  const destination = path.join(root, entry.name, "layout.css");
  if (check) {
    const existing = (await readFile(destination, "utf8")).replaceAll("\r\n", "\n");
    if (existing !== css) throw new Error(`${entry.name}: regenerate with node web/scripts/build-layouts.mjs`);
  } else {
    await writeFile(destination, css);
  }
}
console.log(check ? "Layout manifests and stylesheets match." : "Generated layout stylesheets.");

