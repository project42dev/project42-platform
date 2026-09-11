#!/usr/bin/env node
// Theme correctness gate for the bundles THIS PACKAGE SHIPS.
//
// Why this exists (2026-09-11)
// ----------------------------
// project42-gallery has enforced the theme contract -- token vocabulary,
// colour-literal boundary, polarity, 4.5:1 text contrast (WCAG 2.2 SC 1.4.3)
// and, since 2026-09-11, 3:1 non-text contrast (SC 1.4.11) -- for a long time.
// Its validator scans `project42-gallery/themes/` and nothing else.
//
// The theme production actually serves is `portal-default`, and portal-default
// does not live in the Gallery. It lives HERE, in web/themes/, because the
// product's own stock theme cannot be owned by the catalogue of alternatives
// (docs/decisions/three-layer-theming.md). So the one bundle every fresh
// install renders with was the one bundle no gate measured. When the Gallery's
// seven themes were raised to 3:1 on 2026-09-11 (gallery fc7024a),
// portal-default was missed -- not by oversight in that change, but because
// nothing in this repository or that one was looking at it. It shipped eight
// border pairs below 3:1, the worst at 1.23:1.
//
// A second gate written from scratch here would be a second definition of
// "correct", free to drift from the Gallery's. So the Gallery's checkBundle()
// is VENDORED verbatim under vendor/project42-gallery/ and called unchanged.
// Same code, same thresholds, same failure messages -- this file only supplies
// the bundles.
//
// The vendor lock
// ---------------
// vendor/project42-gallery/vendor.lock.json records the Gallery commit the
// copy came from and a SHA-256 of each vendored file, normalised the way
// sync-gallery-themes.mjs normalises text (BOM stripped, CRLF folded), so a
// Windows checkout locks the same digest as a Linux one. The gate verifies
// those digests before it imports anything: a hand-edit to the vendored copy
// fails the build rather than silently forking the contract.
//
// Nothing here reaches the network, and CI never checks the Gallery out.
// Re-vendoring is a deliberate, local step:
//
//   node web/scripts/theme-correctness-check.mjs --vendor ../project42-gallery
//
// Run by `npm run web:check`, which `npm run check` depends on.

import { createHash } from "node:crypto";
import { copyFile, readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");
const themesRoot = path.join(root, "themes");
const vendorDir = path.join(import.meta.dirname, "vendor", "project42-gallery");
const lockPath = path.join(vendorDir, "vendor.lock.json");

// The Gallery files this gate runs. theme-contract.mjs imports ./contrast.mjs
// relatively, so both must sit in the vendor directory together.
const VENDORED = [
  { file: "theme-contract.mjs", source: "scripts/lib/theme-contract.mjs" },
  { file: "contrast.mjs", source: "scripts/lib/contrast.mjs" },
];

/** Same normalisation sync-gallery-themes.mjs applies to text assets. */
async function digest(file) {
  const text = (await readFile(file, "utf8")).replace(/^﻿/, "").replaceAll("\r\n", "\n");
  return createHash("sha256").update(text).digest("hex");
}

// ---- --vendor: refresh the copy and rewrite the lock ------------------------

const vendorArg = process.argv.indexOf("--vendor");
if (vendorArg !== -1) {
  const galleryRoot = path.resolve(process.argv[vendorArg + 1] ?? path.join(root, "..", "..", "project42-gallery"));
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: galleryRoot, encoding: "utf8" }).trim();

  const files = {};
  for (const { file, source } of VENDORED) {
    const target = path.join(vendorDir, file);
    await copyFile(path.join(galleryRoot, source), target);
    files[file] = { source, sha256: await digest(target) };
  }

  await writeFile(
    lockPath,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        $comment:
          "Verbatim copies of project42-gallery's theme-correctness implementation, so this " +
          "package measures its own bundles with the same code and the same thresholds rather " +
          "than a second definition of correct. Do not hand-edit the vendored files: the gate " +
          "verifies these digests before importing them. Re-vendor with " +
          "`node web/scripts/theme-correctness-check.mjs --vendor ../project42-gallery`.",
        owner: "project42-gallery",
        repository: "https://github.com/project42dev/project42-gallery",
        commit,
        normalisation: "utf8, BOM stripped, CRLF folded to LF, then sha256",
        files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`Vendored ${VENDORED.length} file(s) from project42-gallery@${commit.slice(0, 7)}.`);
  process.exit(0);
}

// ---- Verify the vendored copy is the copy the lock names --------------------

const lock = JSON.parse(await readFile(lockPath, "utf8"));
const drift = [];
for (const { file } of VENDORED) {
  const expected = lock.files?.[file]?.sha256;
  if (!expected) {
    drift.push(`${file} is vendored but absent from vendor.lock.json`);
    continue;
  }
  const actual = await digest(path.join(vendorDir, file));
  if (actual !== expected) {
    drift.push(`${file} is ${actual.slice(0, 12)} but the lock names ${expected.slice(0, 12)}`);
  }
}
for (const file of Object.keys(lock.files ?? {})) {
  if (!VENDORED.some((entry) => entry.file === file)) {
    drift.push(`${file} is in vendor.lock.json but this gate does not load it`);
  }
}
if (drift.length > 0) {
  console.error(
    `\nThe vendored copy of project42-gallery's theme contract has been edited in place.\n` +
      `It is not authored here -- the whole point is that this package measures its\n` +
      `bundles with the Gallery's code. Re-vendor instead:\n` +
      `  node web/scripts/theme-correctness-check.mjs --vendor ../project42-gallery\n`,
  );
  for (const line of drift) console.error(`  ${line}`);
  process.exit(1);
}

const { checkBundle, TOKEN_CONTRACT, TEXT_CONTRAST_MINIMUM, NON_TEXT_CONTRAST_MINIMUM } = await import(
  pathToFileURL(path.join(vendorDir, "theme-contract.mjs")).href
);

// ---- Run the Gallery's check over every bundle this package ships -----------

const themeIds = (await readdir(themesRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((a, b) => a.localeCompare(b));

const failures = [];
const measurements = [];
const tokenSets = new Map();

if (themeIds.length === 0) failures.push("no theme bundles found under web/themes");

for (const id of themeIds) {
  const bundleRoot = path.join(themesRoot, id);
  const result = checkBundle({
    id,
    manifest: JSON.parse(await readFile(path.join(bundleRoot, "theme.json"), "utf8")),
    tokensCss: await readFile(path.join(bundleRoot, "tokens.css"), "utf8"),
    portalCss: await readFile(path.join(bundleRoot, "portal.css"), "utf8"),
  });
  failures.push(...result.failures);
  measurements.push(...result.measurements);
  tokenSets.set(id, result.tokenSet);
}

// The Gallery's rule T6 -- every bundle declares an identical token set. It is
// cross-bundle, so it lives in the driver there and in the driver here.
const [reference, ...others] = [...tokenSets.entries()];
if (reference) {
  for (const [id, set] of others) {
    if (JSON.stringify(set) !== JSON.stringify(reference[1])) {
      failures.push(
        `${id}: token set differs from ${reference[0]}; every bundle must declare an identical set`,
      );
    }
  }
}

// ---- Report -----------------------------------------------------------------

if (process.argv.includes("--report")) {
  for (const m of measurements) {
    const minimum = m.kind === "non-text" ? NON_TEXT_CONTRAST_MINIMUM : TEXT_CONTRAST_MINIMUM;
    console.log(
      `${m.ratio >= minimum ? "pass" : "FAIL"}  ${m.id}  ${m.fgToken} on ${m.bgToken}  ${m.ratio.toFixed(2)}:1`,
    );
  }
}

if (failures.length > 0) {
  console.error(`\nTheme correctness violated in the bundles this package ships.\n`);
  for (const failure of failures) console.error(`FAIL  ${failure}`);
  console.error(
    `\n${failures.length} violation(s) across ${themeIds.length} bundle(s). The rules are ` +
      `project42-gallery's docs/THEME_CORRECTNESS_SPEC.md, enforced here by its own ` +
      `checkBundle() vendored at ${lock.commit.slice(0, 7)}.`,
  );
  process.exit(1);
}

const textCount = measurements.filter((m) => m.kind !== "non-text").length;
const borderCount = measurements.filter((m) => m.kind === "non-text").length;
console.log(
  `Theme correctness verified in web/themes: ${themeIds.length} bundles (${themeIds.join(", ")}), ` +
    `${TOKEN_CONTRACT.length} contract tokens each, ${textCount} text contrast pairs at or above ` +
    `${TEXT_CONTRAST_MINIMUM}:1, ${borderCount} border pairs at or above ${NON_TEXT_CONTRAST_MINIMUM}:1 ` +
    `(project42-gallery checkBundle @ ${lock.commit.slice(0, 7)}).`,
);
