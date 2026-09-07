#!/usr/bin/env node
// Theme boundary gate.
//
// The product ships a complete appearance, and that appearance lives in a
// theme bundle -- a folder a deployer can replace wholesale. Core CSS owns
// STRUCTURE: layout, positioning, sizing driven by content, and accessibility
// affordances. It owns no brand.
//
// The failure mode this exists to stop is core quietly painting something the
// bundle is supposed to own. That renders the same no matter which theme is
// selected, so a theme becomes a skin fighting core for control rather than
// the source of the look -- and on a theme of the opposite polarity it can be
// outright invisible. Thirty-nine hardcoded `color: white` declarations
// survived that way, unreadable on both light themes; near-black text landed
// on a near-black panel at 1.04:1 the same way.
//
// Five rules, each failing the build:
//
//   1  a raw colour literal in a themeable declaration
//   2  an accent or brand token used as TEXT
//   3  a typeface named inline
//   4  a --p42-* token given a literal value outside the fallback layer
//   5  a hardcoded radius or letter-spacing beyond the recorded baseline
//
// Rule 5 is a ratchet, not an amnesty. scripts/appearance-debt.json records
// every hardcoded radius and tracking value core still carries, with counts.
// The gate fails on a new value or a higher count, so the debt can only be
// paid down. Each of those values is drift that has no matching step in any
// published layout ramp; collapsing them to the ramp would change the rendered
// page, which is a design decision for whoever owns the appearance, not a
// mechanical one for this script.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const FILE = "app/globals.css";
const DEBT_FILE = "scripts/appearance-debt.json";

const COLOUR_PROPERTIES =
  "color|background|background-color|background-image|border|border-color|border-[a-z]+-color|fill|stroke|outline|box-shadow|text-shadow|-webkit-text-fill-color";
const LITERAL =
  /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\b(?:white|black|silver|gray|grey|red|blue|green|yellow|orange|purple|navy|teal|lime|aqua|fuchsia|maroon|olive)\b/;

// `var(--token, #fallback)` is the correct idiom: the token wins and the
// literal only applies if no bundle defines it. Not a violation.
const outsideVars = (value) => value.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, "");

// A fill colour read as text. --lime/--cyan/--orange/--violet are the legacy
// aliases; --p42-accent/--p42-primary are the fills themselves.
const BRAND_AS_TEXT = /var\(\s*--(?:lime|cyan|orange|violet|p42-accent|p42-primary)\s*[),]/;

// Selectors whose appearance is deliberately NOT theme-owned.
const EXEMPT_SELECTORS = [
  // Third-party brand identity. These name a vendor; a theme must not repaint
  // Anthropic's or Google's brand colour.
  /^\.provider-pill-/,
  // Admin is never themed by design: it stays a plain, legible, functional
  // interface regardless of the selected bundle.
  /admin-portal-root/,
  /^\.admin-/,
  /data-theme="admin-control"/,
  // Accessibility overrides. A high-contrast or forced-colours mode exists
  // precisely to replace the palette, so it must name absolute values.
  /data-project42-high-contrast/,
  // The diagram viewer draws artwork on a fixed light canvas inside a fixed
  // dark scrim, so the drawing surface stays legible in every theme.
  /^\.diagram-svg/,
  /^\.diagram-fullscreen-overlay/,
  /^\.diagram-category-badge/,
  /^\.diagram-step-link-kind-/,
  /^\.diagram-step-list-number/,
  /^\.diagram-viewer-controls/,
  /^\.diagram-viewer-toolbar/,
  /^\.orchard-lifecycle-diagram/,
  /^\.orchard-category-badge/,
  /^\.orchard-step-link-kind/,
  /^\.orchard-step-list-number/,
  /^\.orchard-step-list-item/,
];

const source = readFileSync(path.join(root, FILE), "utf8");
const lines = source.split(/\r?\n/);

// The single block where a token's last-resort value is allowed to be a
// literal. Everything a bundle can define is named there once and consumed by
// reference everywhere else, so there is exactly one place to look.
const fallbackStart = lines.findIndex((line) => line.includes("@layer p42-fallback"));
let fallbackEnd = -1;
if (fallbackStart !== -1) {
  let depth = 0;
  for (let i = fallbackStart; i < lines.length; i += 1) {
    for (const ch of lines[i]) {
      if (ch === "{") depth += 1;
      else if (ch === "}") depth -= 1;
    }
    if (depth === 0 && i > fallbackStart) {
      fallbackEnd = i;
      break;
    }
  }
}
const inFallbackLayer = (index) =>
  fallbackStart !== -1 && index >= fallbackStart && index <= fallbackEnd;

// Declarations are matched per-declaration, not per-line: a rule written on a
// single line (`.x { color: #fff; }`) is just as much a violation as one
// spread over several, and an earlier version of this check missed exactly
// that case.
//
// The enclosing selector is tracked by walking the file once and keeping a
// stack, rather than by looking a fixed distance backwards. A previous version
// looked back forty lines and so lost the selector inside long blocks -- which
// is precisely where a token block that must stay exempt lives.
const selectorFor = new Array(lines.length).fill("");
{
  const stack = [];
  let head = [];
  lines.forEach((raw, index) => {
    const line = raw.replace(/\/\*.*?\*\//g, "");
    selectorFor[index] = stack[stack.length - 1] ?? "";
    let buffer = "";
    let openedHere = null;
    for (const ch of line) {
      if (ch === "{") {
        const text = [...head, buffer].join(" ").replace(/\s+/g, " ").trim();
        stack.push(text || stack[stack.length - 1] || "");
        openedHere = stack[stack.length - 1];
        head = [];
        buffer = "";
      } else if (ch === "}") {
        stack.pop();
        head = [];
        buffer = "";
      } else buffer += ch;
    }
    if (buffer.trim() && !buffer.includes(";")) head.push(buffer.trim());
    // A rule written entirely on one line (`.admin-x { color: #fff; }`) has its
    // own selector, not the one that happened to be open before it.
    if (openedHere !== null) selectorFor[index] = openedHere;
    else if (selectorFor[index] === "") selectorFor[index] = stack[stack.length - 1] ?? "";
  });
}
const enclosingSelector = (index) => selectorFor[index];

const violations = [];
const debt = {};

const report = (rule, index, selector, text) =>
  violations.push({ rule, line: index + 1, selector, text: text.trim() });

lines.forEach((line, i) => {
  // Strip comments so a documented hex in prose is not a violation.
  const code = line.replace(/\/\*.*?\*\//g, "");
  const selector = enclosingSelector(i);
  const exempt = EXEMPT_SELECTORS.some((re) => re.test(selector));

  for (const declaration of code.split(";")) {
    const match = declaration.match(/(?:^|\{|\s)(--[a-zA-Z0-9-]+|-?[a-z-]+)\s*:([^:]*)$/);
    if (!match) continue;
    const property = match[1];
    const value = match[2];
    const bare = outsideVars(value);

    // 1 -- a raw colour literal in a themeable declaration.
    if (new RegExp(`^(?:${COLOUR_PROPERTIES})$`).test(property) && LITERAL.test(bare) && !exempt) {
      report("colour literal", i, selector, line);
    }

    // 4 -- a --p42-* token pinned to a literal outside the fallback layer.
    if (property.startsWith("--p42-") && LITERAL.test(bare) && !exempt && !inFallbackLayer(i)) {
      report("token pinned to a literal", i, selector, line);
    }

    if (exempt || inFallbackLayer(i)) continue;

    // 2 -- a fill colour read as text.
    if (
      (property === "color" || property === "-webkit-text-fill-color") &&
      BRAND_AS_TEXT.test(value)
    ) {
      report("brand colour used as text", i, selector, line);
    }

    // 3 -- a typeface named inline.
    if (property === "font-family" && /[A-Za-z]/.test(bare) && !/^\s*inherit\s*$/.test(bare)) {
      report("typeface named in core", i, selector, line);
    }

    // 5 -- hardcoded radius and tracking, ratcheted against the baseline.
    if (/^border(?:-[a-z]+)*-radius$/.test(property) && /\d/.test(bare)) {
      // A circle is geometry, not a brand decision.
      if (!/^\s*(?:0|50%)\s*$/.test(bare.trim())) {
        const key = `${property}: ${value.trim()}`;
        debt[key] = (debt[key] ?? 0) + 1;
      }
    }
    if (property === "letter-spacing" && /\d/.test(bare)) {
      const key = `${property}: ${value.trim()}`;
      debt[key] = (debt[key] ?? 0) + 1;
    }
  }
});

if (process.argv.includes("--record")) {
  const sorted = Object.fromEntries(Object.entries(debt).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(
    path.join(root, DEBT_FILE),
    `${JSON.stringify(
      {
        $comment:
          "Hardcoded radius and letter-spacing values core still carries. Each matches no step in any published layout ramp, so collapsing it would change the rendered page. The gate fails on a new value or a higher count: this list may only shrink.",
        values: sorted,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`Recorded ${Object.keys(sorted).length} hardcoded value(s) in ${DEBT_FILE}.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(path.join(root, DEBT_FILE), "utf8")).values;
const regressions = [];
for (const [key, count] of Object.entries(debt)) {
  const allowed = baseline[key] ?? 0;
  if (count > allowed) {
    regressions.push(`${key}  (${count} occurrence(s), baseline ${allowed})`);
  }
}

if (violations.length > 0 || regressions.length > 0) {
  console.error(`\nTheme boundary violated in ${FILE}.\n`);
  if (violations.length > 0) {
    console.error(
      "Appearance belongs to the theme bundle. Use a semantic token\n" +
        "(--p42-text-*, --p42-surface-*, --p42-border-*, --p42-primary*,\n" +
        "--p42-accent*, --p42-font-*, --p42-radius-*, --p42-track-*,\n" +
        "--p42-success/warning/danger/info-*, --p42-shadow-*, --p42-overlay-*).\n" +
        "Give it its last-resort value once, in the p42-fallback layer.\n" +
        "If the value genuinely must not follow the theme, add the selector to\n" +
        "EXEMPT_SELECTORS in theme-boundary-check.mjs with a reason.\n",
    );
    for (const v of violations) {
      console.error(`  ${FILE}:${v.line}  [${v.rule}]  ${v.selector}\n      ${v.text}`);
    }
    console.error("");
  }
  if (regressions.length > 0) {
    console.error(
      "New hardcoded radius or letter-spacing. These may only be paid down,\n" +
        "never added: use a --p42-radius-* or --p42-track-* token, or if the\n" +
        `debt was genuinely reduced elsewhere, re-record ${DEBT_FILE} with\n` +
        "`node scripts/theme-boundary-check.mjs --record`.\n",
    );
    for (const r of regressions) console.error(`  ${r}`);
    console.error("");
  }
  process.exit(1);
}

const debtTotal = Object.values(debt).reduce((sum, n) => sum + n, 0);
console.log(
  `Theme boundary holds in ${FILE}: no colour literal, no brand colour as text, ` +
    `no typeface named in core, no token pinned outside the fallback layer. ` +
    `${debtTotal} hardcoded radius/tracking value(s) remain, at or below baseline.`,
);
