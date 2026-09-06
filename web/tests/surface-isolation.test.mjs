import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// Admin is never themed, by design: it stays a plain, legible, functional
// console no matter which Gallery bundle the public portal has selected.
//
// This is easy to get wrong in a way nothing notices. The admin override block
// originally redefined only the legacy aliases (--ink, --paper, --navy...).
// That was sufficient while core CSS read those aliases, and silently stopped
// being sufficient once core moved onto the --p42-* tokens directly: the
// selected theme's palette then leaked straight into the console. This test
// exists so that regression cannot happen again quietly.

const css = fs.readFileSync(path.resolve("app/globals.css"), "utf8");

function adminOverrideBlock() {
  const start = css.indexOf("html:has(.admin-portal-root)");
  assert.notEqual(start, -1, "admin override block not found");
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  return css.slice(open, close);
}

// Every --p42-* token any theme publishes must be overridden for admin.
function publishedThemeTokens() {
  const themesRoot = path.resolve("public/themes");
  const tokens = new Set();
  for (const id of fs.readdirSync(themesRoot)) {
    const file = path.join(themesRoot, id, "tokens.css");
    if (!fs.existsSync(file)) continue;
    for (const match of fs.readFileSync(file, "utf8").matchAll(/^\s*(--p42-[a-z0-9-]+)\s*:/gm)) {
      tokens.add(match[1]);
    }
  }
  return [...tokens].sort();
}

test("admin overrides every theme token, so no theme can leak into the console", () => {
  const block = adminOverrideBlock();
  const missing = publishedThemeTokens().filter(
    (token) => !new RegExp(`${token}\\s*:`).test(block),
  );
  assert.deepEqual(
    missing,
    [],
    `admin does not override: ${missing.join(", ")}. A theme could change the admin console.`,
  );
});

test("admin declares its own layout-independent shell", () => {
  // Admin must not inherit the selected layout's composition either.
  const layoutsRoot = path.resolve("public/layouts");
  assert.ok(fs.existsSync(layoutsRoot), "layout bundles are installed");
  const adminLayout = fs.readFileSync(path.resolve("app/admin/layout.tsx"), "utf8");
  assert.match(
    adminLayout,
    /data-layout="admin-dashboard"/,
    "admin must pin its own data-layout so a selected layout cannot restyle the console",
  );
  assert.match(
    adminLayout,
    /data-theme="admin-control"/,
    "admin must pin its own data-theme",
  );
});

test("the Gallery site is not themed by the portal's selection", () => {
  // gallery.project-42.dev has its own fixed design: it displays themes, it
  // does not wear them. Nothing in the portal may emit a theme attribute or
  // bundle link for it.
  const exportScript = fs.readFileSync(
    path.resolve("scripts/export-github-pages.mjs"),
    "utf8",
  );
  assert.doesNotMatch(
    exportScript,
    /gallery[^\n]*data-theme/i,
    "the export must not apply a portal theme to the Gallery site",
  );
});
