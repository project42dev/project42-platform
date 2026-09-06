import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  canonicalizeSvgSource,
  sourceSha256,
} from "../scripts/brand-source-integrity.mjs";
import portalConfig from "../project42.config.json" with { type: "json" };

// Read from config, never hardcoded: the point of these gates is to protect
// the "change one field and the visual system changes" contract, so they must
// pass for whichever theme is selected.
const selectedTheme = portalConfig.theme;

const lfSource = [
  '<svg viewBox="0 0 64 64">',
  '  <path fill="#c9f25f" d="M8 8h20v48H8z"/>',
  "</svg>",
  "",
].join("\n");

test("canonical SVG bytes and hashes are identical for LF and CRLF checkouts", () => {
  const crlfSource = lfSource.replaceAll("\n", "\r\n");
  const bomCrlfSource = `\uFEFF${crlfSource}`;
  assert.deepEqual(
    canonicalizeSvgSource(crlfSource),
    canonicalizeSvgSource(lfSource),
  );
  assert.deepEqual(
    canonicalizeSvgSource(bomCrlfSource),
    canonicalizeSvgSource(lfSource),
  );
  assert.equal(sourceSha256(crlfSource), sourceSha256(lfSource));
  assert.equal(sourceSha256(bomCrlfSource), sourceSha256(lfSource));
});

test("canonical SVG hashing still detects substantive source changes", () => {
  const changedSource = lfSource.replace("#c9f25f", "#ffffff");
  assert.notEqual(sourceSha256(changedSource), sourceSha256(lfSource));
});

test("public React surfaces do not embed legacy theme colors", () => {
  const appRoot = path.resolve("app");
  const legacyColors = /#(?:f6f3eb|fffdf7|0b1225|455066|c9f25f|63d7e4|38bdf8|080d2a|39d8ff|754cff)\b/i;
  const violations = [];

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(appRoot, absolutePath);
      if (entry.isDirectory()) {
        if (relativePath === "admin") continue;
        visit(absolutePath);
      } else if (entry.name.endsWith(".tsx")) {
        if (legacyColors.test(fs.readFileSync(absolutePath, "utf8"))) {
          violations.push(relativePath);
        }
      }
    }
  }

  visit(appRoot);
  assert.deepEqual(violations, []);
});

test("the configured theme cannot be overridden by stale browser state", () => {
  const publicSources = [
    fs.readFileSync(path.resolve("app/layout.tsx"), "utf8"),
    fs.readFileSync(path.resolve("app/components/ProfilePreferencesProvider.tsx"), "utf8"),
  ].join("\n");

  assert.doesNotMatch(publicSources, /getItem\(["']project42\.theme\.v1["']\)/);
  assert.match(publicSources, /removeItem\(["']project42\.theme\.v1["']\)/);
});

test("favicon provenance follows the declaratively selected theme", () => {
  const config = JSON.parse(fs.readFileSync(path.resolve("project42.config.json"), "utf8"));
  assert.equal(config.organization.faviconUrl, undefined);
  assert.equal(config.organization.logoUrl, undefined);
  const faviconUrl = `/themes/${config.theme}/mark.svg`;
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve("public/brand/asset-manifest.json"), "utf8"),
  );
  const themeMark = fs.readFileSync(
    path.resolve("public", faviconUrl.slice(1)),
  );
  assert.equal(manifest.sources.selectedTheme, config.theme);
  assert.equal(manifest.sources.faviconUrl, faviconUrl);
  assert.equal(manifest.sources.faviconSha256, sourceSha256(themeMark));
});

// Portable invariant: whatever theme is selected, its component bundle may
// only scope rules to its OWN id. A bundle that styles another theme's id
// would leak across selections. This replaces a hardcoded 06-galactic-guide
// assertion that made changing the theme field fail a required CI gate.
test("the selected theme bundle scopes its rules to its own id", () => {
  const styles = fs.readFileSync(
    path.resolve(`public/themes/${selectedTheme}/portal.css`),
    "utf8",
  );
  const foreignScopes = (styles.match(/html\[data-theme="([^"]+)"\]/g) ?? [])
    .filter((scope) => !scope.includes(`"${selectedTheme}"`));
  assert.deepEqual(
    foreignScopes,
    [],
    `${selectedTheme}/portal.css scopes rules to another theme: ${[...new Set(foreignScopes)].join(", ")}`,
  );
});

// Galactic is currently the only bundle with real component CSS -- the other
// five ship a ~70-byte placeholder portal.css (tokens and hero art only). Its
// specific ornament/hero rules are therefore asserted only when Galactic is
// the selected theme, rather than unconditionally, which previously pinned the
// whole portal to that one theme.
test("Galactic bundle removes default landing ornaments and uses its hero token", { skip: selectedTheme !== "06-galactic-guide" }, () => {
  const styles = fs.readFileSync(
    path.resolve(`public/themes/${selectedTheme}/portal.css`),
    "utf8",
  );
  assert.match(
    styles,
    /html\[data-theme="06-galactic-guide"\] \.path-card::after\s*\{\s*content:\s*none;/,
  );
  assert.match(
    styles,
    /html\[data-theme="06-galactic-guide"\] \.hero-map\s*\{[^}]*var\(--p42-hero-image\)/s,
  );
  assert.match(
    styles,
    /html\[data-theme="06-galactic-guide"\] \.footer-grid a\s*\{[^}]*min-height:\s*0;[^}]*padding-block:\s*0\.2rem;/s,
  );
});

test("core contains no named customer theme or layout implementation", () => {
  const core = [
    fs.readFileSync(path.resolve("app/globals.css"), "utf8"),
    fs.readFileSync(path.resolve("app/layout.tsx"), "utf8"),
    fs.readFileSync(path.resolve("app/page.tsx"), "utf8"),
    fs.readFileSync(path.resolve("lib/theme.ts"), "utf8"),
  ].join("\n");
  // Every INSTALLED theme id, not a fixed list of six. A deployment that
  // installs a seventh bundle must have its id policed too, and a scaffold
  // that installs one must not be asserted against five it does not have.
  for (const id of portalConfig.availableThemes) {
    assert.ok(
      !core.includes(id),
      `core names the theme bundle ${id}; presentation belongs to the bundle`,
    );
  }
  assert.doesNotMatch(core, /galactic-/);
  assert.doesNotMatch(core, /html\[data-layout="(?:standard|wide|compact)"\]/);
  assert.match(core, /data-project42-theme-tokens/);
  assert.match(core, /data-project42-theme-components/);
  assert.match(core, /data-project42-layout/);
});

test("every configured theme can be selected without changing core source", () => {
  const config = JSON.parse(fs.readFileSync(path.resolve("project42.config.json"), "utf8"));
  const coreBefore = sourceSha256([
    fs.readFileSync(path.resolve("app/globals.css"), "utf8"),
    fs.readFileSync(path.resolve("app/layout.tsx"), "utf8"),
    fs.readFileSync(path.resolve("app/page.tsx"), "utf8"),
  ].join("\n"));
  for (const themeId of config.availableThemes) {
    for (const relative of ["theme.json", "tokens.css", "portal.css", "mark.svg", "hero.png"]) {
      assert.equal(fs.existsSync(path.resolve("public/themes", themeId, relative)), true);
    }
  }
  const coreAfter = sourceSha256([
    fs.readFileSync(path.resolve("app/globals.css"), "utf8"),
    fs.readFileSync(path.resolve("app/layout.tsx"), "utf8"),
    fs.readFileSync(path.resolve("app/page.tsx"), "utf8"),
  ].join("\n"));
  assert.equal(coreAfter, coreBefore);
});
