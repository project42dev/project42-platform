import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertRepositoryGovernance,
  validateRepositoryGovernance,
} from "../scripts/validate-repository-governance.mjs";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("the repository governance documents are complete and linked", () => {
  const result = assertRepositoryGovernance(repositoryRoot);
  assert.equal(result.documentCount, 3);
  assert.deepEqual(result.errors, []);
});

test("rejects a missing governance document", (t) => {
  const fixture = createFixture(t);
  fs.rmSync(path.join(fixture, "SECURITY.md"));

  assert.match(
    errorText(() => assertRepositoryGovernance(fixture)),
    /SECURITY\.md is missing/u,
  );
});

test("rejects an empty governance document", (t) => {
  const fixture = createFixture(t);
  fs.writeFileSync(path.join(fixture, "SUPPORT.md"), " \n", "utf8");

  assert.match(
    errorText(() => assertRepositoryGovernance(fixture)),
    /SUPPORT\.md is empty or too short/u,
  );
});

test("rejects private data and private operational references", (t) => {
  const cases = [
    [
      "private Azure DevOps URL",
      "https://" + "dev." + "azure.com/example/private",
    ],
    ["private work-item reference", "AB" + "#1234"],
    ["private operations repository name", "project42dev-" + "ops"],
    ["email address", "owner" + "@example.invalid"],
    [
      "GUID-like identifier",
      "12345678-" + "1234-4234-9234-" + "123456789012",
    ],
    ["local Windows path", "D:" + "\\private\\inventory.json"],
    ["credential-like assignment", "client_secret=not-a-real-secret"],
    ["resource-identifier assignment", "tenant_id=private12345"],
  ];

  for (const [expected, unsafeText] of cases) {
    const fixture = createFixture(t);
    fs.appendFileSync(
      path.join(fixture, "CONTRIBUTING.md"),
      `\n${unsafeText}\n`,
      "utf8",
    );
    assert.match(
      errorText(() => assertRepositoryGovernance(fixture)),
      new RegExp(expected, "u"),
    );
  }
});

test("scans README for private material", (t) => {
  const fixture = createFixture(t);
  fs.appendFileSync(
    path.join(fixture, "README.md"),
    "\nInternal reference: " + "AB" + "#1234\n",
    "utf8",
  );

  assert.match(
    errorText(() => assertRepositoryGovernance(fixture)),
    /README\.md contains private work-item reference/u,
  );
});

test("rejects quoted JSON-style secret assignments", (t) => {
  const fixture = createFixture(t);
  fs.appendFileSync(
    path.join(fixture, "SECURITY.md"),
    '\n```json\n{"client_secret": "not a real secret value"}\n```\n',
    "utf8",
  );

  assert.match(
    errorText(() => assertRepositoryGovernance(fixture)),
    /SECURITY\.md contains credential-like assignment/u,
  );
});

test("validates repository roots containing spaces", (t) => {
  const fixture = createFixture(t, "project 42 learn governance-");
  const result = assertRepositoryGovernance(fixture);

  assert.equal(result.documentCount, 3);
  assert.deepEqual(result.errors, []);
});

test("rejects governance documents that are not linked from the README", (t) => {
  const fixture = createFixture(t);
  const readmePath = path.join(fixture, "README.md");
  const readme = fs
    .readFileSync(readmePath, "utf8")
    .replace("(SECURITY.md)", "(#security)");
  fs.writeFileSync(readmePath, readme, "utf8");

  assert.match(
    errorText(() => assertRepositoryGovernance(fixture)),
    /README\.md must link to SECURITY\.md/u,
  );
});

test("rejects missing cross-links and required sections", (t) => {
  const fixture = createFixture(t);
  const contributingPath = path.join(fixture, "CONTRIBUTING.md");
  const contributing = fs
    .readFileSync(contributingPath, "utf8")
    .replace("(SUPPORT.md)", "(#support)")
    .replace("## Pull requests", "## Change proposals");
  fs.writeFileSync(contributingPath, contributing, "utf8");

  const errors = validateRepositoryGovernance(fixture).errors.join("\n");
  assert.match(errors, /CONTRIBUTING\.md must link to SUPPORT\.md/u);
  assert.match(errors, /missing the "Pull requests" section/u);
});

test("rejects broken local links in governance documents", (t) => {
  const fixture = createFixture(t);
  fs.appendFileSync(
    path.join(fixture, "SUPPORT.md"),
    "\n[Missing policy](MISSING.md)\n",
    "utf8",
  );

  assert.match(
    errorText(() => assertRepositoryGovernance(fixture)),
    /SUPPORT\.md links to missing file MISSING\.md/u,
  );
});

function createFixture(t, prefix = "project42-learn-governance-") {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(fixture, { force: true, recursive: true }));
  for (const file of [
    "README.md",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "SUPPORT.md",
    "LICENSE",
  ]) {
    fs.copyFileSync(path.join(repositoryRoot, file), path.join(fixture, file));
  }
  fs.mkdirSync(path.join(fixture, "public"));
  fs.copyFileSync(
    path.join(repositoryRoot, "public", "release-facts.json"),
    path.join(fixture, "public", "release-facts.json"),
  );
  return fixture;
}

function errorText(operation) {
  try {
    operation();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  assert.fail("Expected operation to fail.");
}
