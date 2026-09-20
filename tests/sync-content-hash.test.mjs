import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(repoRoot, "scripts", "sync-content.mjs");
const fixtureParent = path.join(repoRoot, "tests", ".fixtures");

function assertOwnedFixture(target) {
  const relative = path.relative(fixtureParent, target);
  assert.ok(
    relative && !relative.startsWith("..") && !path.isAbsolute(relative),
    `Refusing to remove fixture outside ${fixtureParent}: ${target}`,
  );
}

function productionHash(file) {
  return execFileSync(process.execPath, [script, "--hash-file", file], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

async function withFixture(run) {
  await mkdir(fixtureParent, { recursive: true });
  const fixture = await mkdtemp(path.join(fixtureParent, "sync-content-hash-"));
  assertOwnedFixture(fixture);

  try {
    await run(fixture);
  } finally {
    assertOwnedFixture(fixture);
    await rm(fixture, { recursive: true, force: true });
  }
}

test("production hashing normalizes PowerShell CRLF without hiding substantive changes", async () => {
  await withFixture(async (fixture) => {
    const lfFile = path.join(fixture, "serving-contract-lf.ps1");
    const crlfFile = path.join(fixture, "serving-contract-crlf.ps1");
    const changedFile = path.join(fixture, "serving-contract-changed.ps1");

    const lfContent = [
      "param(",
      "  [string]$ModelName",
      ")",
      "",
      "Write-Output \"Serving $ModelName\"",
      "",
    ].join("\n");
    const crlfContent = lfContent.replaceAll("\n", "\r\n");
    const changedContent = lfContent.replace(
      "Write-Output \"Serving $ModelName\"",
      "Write-Output \"Serving model $ModelName\"",
    );

    await writeFile(lfFile, lfContent, "utf8");
    await writeFile(crlfFile, crlfContent, "utf8");
    await writeFile(changedFile, changedContent, "utf8");

    const lfBytes = await readFile(lfFile);
    const crlfBytes = await readFile(crlfFile);

    assert.notEqual(lfBytes.indexOf(0x0a), -1, "LF fixture must contain a real 0x0A byte");
    assert.equal(lfBytes.indexOf(0x0d), -1, "LF fixture must not contain carriage returns");
    assert.equal(
      lfBytes.includes(Buffer.from("\\n", "ascii")),
      false,
      "LF fixture must not use literal slash-n text in place of newline bytes",
    );
    assert.notEqual(
      crlfBytes.indexOf(Buffer.from([0x0d, 0x0a])),
      -1,
      "CRLF fixture must contain a real 0x0D 0x0A byte pair",
    );
    assert.equal(
      crlfBytes.includes(Buffer.from("\\r\\n", "ascii")),
      false,
      "CRLF fixture must not use literal slash-r-slash-n text in place of line-ending bytes",
    );

    const lfHash = productionHash(lfFile);
    const crlfHash = productionHash(crlfFile);
    const changedHash = productionHash(changedFile);

    assert.equal(
      crlfHash,
      lfHash,
      "LF and CRLF .ps1 hashes differ; .ps1 must stay in the production text allowlist",
    );
    assert.notEqual(
      changedHash,
      lfHash,
      "a substantive PowerShell content change must change the production hash",
    );
  });
});

for (const name of ["controller.js", "exercise.mjs", "fixture.cjs", "contracts.d.ts", "module.mts", "module.cts", ".gitattributes"]) {
  test(`production hashing normalizes ${name} checkout endings and detects edits`, async () => {
    await withFixture(async (fixture) => {
      const file = path.join(fixture, name);
      const content = name === ".gitattributes" ? "expected-summary.txt text eol=lf\n" : "export const limit = 3;\n";
      await writeFile(file, content);
      const lfHash = productionHash(file);
      await writeFile(file, content.replaceAll("\n", "\r\n"));
      assert.equal(productionHash(file), lfHash);
      await writeFile(file, content.replace(name === ".gitattributes" ? "lf" : "3", name === ".gitattributes" ? "crlf" : "4"));
      assert.notEqual(productionHash(file), lfHash);
    });
  });
}

test("production hashing keeps binary CRLF and LF bytes distinct", async () => {
  await withFixture(async (fixture) => {
    const lfFile = path.join(fixture, "payload-lf.bin");
    const crlfFile = path.join(fixture, "payload-crlf.bin");
    const lfBytes = Buffer.from([0x41, 0x0a, 0x42, 0x0a]);
    const crlfBytes = Buffer.from([0x41, 0x0d, 0x0a, 0x42, 0x0d, 0x0a]);

    await writeFile(lfFile, lfBytes);
    await writeFile(crlfFile, crlfBytes);

    const writtenLfBytes = await readFile(lfFile);
    const writtenCrlfBytes = await readFile(crlfFile);
    assert.deepEqual(writtenLfBytes, lfBytes, "binary LF fixture bytes changed while writing");
    assert.deepEqual(
      writtenCrlfBytes,
      crlfBytes,
      "binary CRLF fixture bytes changed while writing",
    );

    assert.notEqual(
      productionHash(crlfFile),
      productionHash(lfFile),
      "binary CRLF and LF hashes matched; binary files must remain raw-byte-sensitive",
    );
  });
});
