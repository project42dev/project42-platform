#!/usr/bin/env node
// Theme boundary gate.
//
// Appearance belongs to the Gallery bundle, not to application code. A raw
// colour literal in core is how a theme stops being able to change the site:
// it renders the same no matter which bundle is selected, and on a theme of
// the opposite polarity it can be outright invisible -- that is exactly how
// 39 hardcoded `color: white` declarations survived here, unreadable on both
// light themes.
//
// This fails the build on a NEW raw colour in themeable core. Without it the
// cleanup regresses; it already did once.
//
// Legitimate exceptions are enumerated below rather than pattern-guessed, so
// adding one is a deliberate, reviewable act.

import { readFileSync } from "node:fs";

const FILE = "app/globals.css";

// A colour literal in a themeable declaration.
const DECLARATION =
  /^\s*(color|background|background-color|border|border-color|border-[a-z]+-color|fill|stroke|outline|box-shadow)\s*:/;
const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;

// `var(--token, #fallback)` is the correct idiom: the token wins and the
// literal only applies if no bundle defines it. Not a violation.
const VAR_FALLBACK_ONLY = (value) => {
  const withoutVars = value.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, "");
  return !LITERAL.test(withoutVars);
};

// Selectors whose colours are deliberately NOT theme-owned.
const EXEMPT_SELECTORS = [
  // Third-party brand identity. These name a vendor; a theme must not repaint
  // Anthropic's or Google's brand colour.
  /^\.provider-pill-/,
  // Admin is never themed by design: it stays a plain, legible, functional
  // interface regardless of the selected bundle.
  /admin-portal-root/,
  /^\.admin-/,
  // The diagram viewer draws artwork on a fixed light canvas inside a fixed
  // dark scrim, so the drawing surface stays legible in every theme.
  /^\.diagram-svg/,
  /^\.diagram-fullscreen-overlay/,
  /^\.diagram-category-badge/,
  /^\.diagram-step-link-kind-/,
  /^\.diagram-step-list-number/,
  /^\.orchard-category-badge/,
  /^\.orchard-step-link-kind/,
  /^\.orchard-step-list-number/,
  /^\.orchard-step-list-item/,
];

const source = readFileSync(FILE, "utf8");
const lines = source.split("\n");

// Declarations are matched per-declaration, not per-line: a rule written on a
// single line (`.x { color: #fff; }`) is just as much a violation as one
// spread over several, and an earlier version of this check missed exactly
// that case.
function enclosingSelector(index) {
  for (let i = index; i >= 0 && i > index - 40; i--) {
    const openIndex = lines[i].lastIndexOf("{");
    if (openIndex !== -1) {
      const before = lines[i].slice(0, openIndex).trim();
      if (before) return before;
      // Selector sits on preceding lines (comma-separated list).
      for (let k = i - 1; k >= 0 && k > i - 8; k--) {
        const prev = lines[k].trim();
        if (prev && !prev.endsWith(";") && !prev.endsWith("}")) return prev;
      }
      return "";
    }
  }
  return "";
}

const violations = [];

lines.forEach((line, i) => {
  // Strip comments so a documented hex in prose is not a violation.
  const code = line.replace(/\/\*.*?\*\//g, "");
  for (const declaration of code.split(";")) {
    if (!/(^|\{|\s)(color|background|background-color|border|border-color|border-[a-z]+-color|fill|stroke|outline|box-shadow)\s*:/.test(declaration)) {
      continue;
    }
    const value = declaration.slice(declaration.indexOf(":") + 1);
    if (!LITERAL.test(value)) continue;
    if (VAR_FALLBACK_ONLY(value)) continue;

    const selector = enclosingSelector(i);
    if (EXEMPT_SELECTORS.some((re) => re.test(selector))) continue;

    violations.push({ line: i + 1, selector, text: line.trim() });
    break;
  }
});

if (violations.length > 0) {
  console.error(
    `\nTheme boundary violated: ${violations.length} raw colour literal(s) in ${FILE}.\n\n` +
      "Appearance belongs to the Gallery bundle. Use a semantic token\n" +
      "(--p42-text-*, --p42-surface-*, --p42-border-*, --p42-primary*,\n" +
      "--p42-accent*, --p42-success/warning/danger/info-*, --p42-shadow-*,\n" +
      "--p42-overlay-*). If the value genuinely must not follow the theme,\n" +
      `add the selector to EXEMPT_SELECTORS in ${import.meta.url.split("/").pop()} with a reason.\n`,
  );
  for (const v of violations) {
    console.error(`  ${FILE}:${v.line}  ${v.selector}\n      ${v.text}`);
  }
  console.error("");
  process.exit(1);
}

console.log(
  `Theme boundary holds: no raw colour literals in themeable ${FILE}.`,
);
