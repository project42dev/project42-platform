import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

// The contract is that changing the theme field changes the whole visual
// system. That only holds if every token core reads is supplied by every
// theme -- a token core uses but a bundle omits resolves to nothing, and that
// surface silently renders unstyled or invisible on that theme.
//
// Five of the six bundles once shipped a ~70-byte portal.css and looked
// "empty". They were not the problem: core hardcoded the values those bundles
// should have supplied, so nothing exercised them. With core fully tokenised,
// this test is what proves each bundle is genuinely complete.

const core = fs.readFileSync(path.resolve("app/globals.css"), "utf8");

function tokensDeclaredIn(file) {
  const declared = new Set();
  for (const match of fs.readFileSync(file, "utf8").matchAll(/^\s*(--p42-[a-z0-9-]+)\s*:/gm)) {
    declared.add(match[1]);
  }
  return declared;
}

// Tokens core actually reads.
const referenced = new Set(
  [...core.matchAll(/var\((--p42-[a-z0-9-]+)/g)].map((m) => m[1]),
);

// Composition tokens are the layout bundle's responsibility, not the theme's.
const layoutsRoot = path.resolve("public/layouts");
const layoutTokens = new Set();
for (const id of fs.readdirSync(layoutsRoot)) {
  const file = path.join(layoutsRoot, id, "layout.css");
  if (fs.existsSync(file)) {
    for (const token of tokensDeclaredIn(file)) layoutTokens.add(token);
  }
}

const themesRoot = path.resolve("public/themes");
const themeIds = fs
  .readdirSync(themesRoot)
  .filter((id) => fs.existsSync(path.join(themesRoot, id, "tokens.css")));

test("core reads at least one theme token", () => {
  assert.ok(referenced.size > 0, "no --p42-* tokens referenced by core");
});

for (const id of themeIds) {
  test(`${id} defines every theme token core reads`, () => {
    const declared = tokensDeclaredIn(path.join(themesRoot, id, "tokens.css"));
    const missing = [...referenced].filter(
      (token) => !declared.has(token) && !layoutTokens.has(token),
    );
    assert.deepEqual(
      missing,
      [],
      `${id} omits ${missing.join(", ")}. Selecting it would leave those surfaces unstyled.`,
    );
  });
}

test("every theme declares the same token set as the others", () => {
  // A token present in one bundle and absent from another is how a theme ends
  // up looking broken only on certain pages.
  const sets = themeIds.map((id) => ({
    id,
    tokens: [...tokensDeclaredIn(path.join(themesRoot, id, "tokens.css"))].sort(),
  }));
  const reference = sets[0];
  for (const candidate of sets.slice(1)) {
    const missing = reference.tokens.filter((t) => !candidate.tokens.includes(t));
    const extra = candidate.tokens.filter((t) => !reference.tokens.includes(t));
    assert.deepEqual(
      { missing, extra },
      { missing: [], extra: [] },
      `${candidate.id} differs from ${reference.id}`,
    );
  }
});

test("every layout declares the same composition set as the others", () => {
  const ids = fs
    .readdirSync(layoutsRoot)
    .filter((id) => fs.existsSync(path.join(layoutsRoot, id, "layout.css")));
  const sets = ids.map((id) => ({
    id,
    tokens: [...tokensDeclaredIn(path.join(layoutsRoot, id, "layout.css"))].sort(),
  }));
  const reference = sets[0];
  for (const candidate of sets.slice(1)) {
    assert.deepEqual(
      candidate.tokens,
      reference.tokens,
      `${candidate.id} does not declare the same composition tokens as ${reference.id}`,
    );
  }
});
