// On 2026-08-19 an automated publisher committed seven Markdown files to
// content/modules/discovery/*.json. Every .json under content/ is discovered
// and parsed automatically, so one bad file broke the catalog for all three
// sites, and the only clue was:
//
//   SyntaxError: Unexpected token '#', "# Microsof"... is not valid JSON
//
// with no file name anywhere in it. These tests pin the diagnostics: a bad
// content file has to say which file it is.

import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadCatalog } from "../scripts/load-catalog.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

async function fixture(files) {
  const root = await mkdtemp(join(tmpdir(), "p42-catalog-"));
  await mkdir(join(root, "content"), { recursive: true });
  await writeFile(
    join(root, "content/catalog.json"),
    JSON.stringify({ modules: [], resources: [], paths: [] }),
  );
  for (const [path, body] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), body);
  }
  return root;
}

test("a Markdown file committed at a .json path names itself in the failure", async () => {
  const root = await fixture({
    "content/modules/discovery/rag.json": "# Retrieval-augmented generation\n\n**Level: Intermediate**\n",
  });
  try {
    await assert.rejects(
      () => loadCatalog(root),
      (error) => {
        assert.match(error.message, /content\/modules\/discovery\/rag\.json/, "the offending file is named");
        assert.match(error.message, /is not valid JSON/);
        assert.ok(error.cause instanceof SyntaxError, "the original parse error is preserved as the cause");
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("valid JSON that is not a record is refused rather than merged into the catalog", async () => {
  // JSON.parse accepts these, so without the object check they would be spread
  // into catalog.modules and corrupt every consumer silently.
  for (const [body, expected] of [
    ["[]", /an array/],
    ["null", /null/],
    ['"a module, honest"', /a string/],
    ["42", /a number/],
  ]) {
    const root = await fixture({ "content/modules/discovery/bad.json": body });
    try {
      await assert.rejects(() => loadCatalog(root), (error) => {
        assert.match(error.message, /content\/modules\/discovery\/bad\.json/);
        assert.match(error.message, expected);
        return true;
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("a malformed resource is reported the same way as a malformed module", async () => {
  const root = await fixture({ "content/resources/packs/broken.json": "not json at all" });
  try {
    await assert.rejects(() => loadCatalog(root), /content\/resources\/packs\/broken\.json is not valid JSON/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the shipped content tree still loads, and every discovered module is a record with an id", async () => {
  const catalog = await loadCatalog(repoRoot);
  assert.ok(catalog.modules.length > 0);
  for (const module of catalog.modules) {
    assert.equal(typeof module, "object");
    assert.equal(typeof module.id, "string", `module without an id: ${JSON.stringify(module).slice(0, 80)}`);
    assert.notEqual(module.id, "");
  }
});

// Module pages are served at /learn/<pathId>/<moduleId>, so a module no path
// lists has no URL. The same publisher that shipped the seven Markdown files
// also never added them to a path, meaning they would have been unreachable
// even if every one of them had been valid JSON.
test("every module is reachable from a learning path", async () => {
  const catalog = await loadCatalog(repoRoot);
  const listed = new Set((catalog.paths ?? []).flatMap((path) => path.moduleIds ?? []));
  const orphans = catalog.modules.map((module) => module.id).filter((id) => !listed.has(id));
  assert.deepEqual(orphans, [], "modules with no path cannot be opened by a learner");
});

test("every module a learning path lists actually exists", async () => {
  const catalog = await loadCatalog(repoRoot);
  const present = new Set(catalog.modules.map((module) => module.id));
  const dangling = (catalog.paths ?? []).flatMap((path) =>
    (path.moduleIds ?? []).filter((id) => !present.has(id)).map((id) => `${path.id} -> ${id}`),
  );
  assert.deepEqual(dangling, [], "a path that lists a missing module renders a broken step");
});
