import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  validateGovernanceDocuments,
  validateGovernanceFiles,
} from "../scripts/governance-docs-validation.mjs";

// This file is installed into a consuming repository, where the tree above it
// IS the repository root and its governance package is the real gate. It also
// runs in place inside the platform's own web/ tree, which is product code with
// no README of its own but which carries the scaffold template. Each root is
// therefore checked only where it exists, so neither context fails falsely.
const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const templateRoot = fileURLToPath(
  new URL("../template/frontend/", import.meta.url),
);
const templateAdvisoriesUrl =
  "https://example.org/{{NAME}}/security/advisories/new";

function validFixture() {
  const filler = "Documented behavior and evidence. ".repeat(20);
  return {
    documents: {
      "CONTRIBUTING.md": [
        "# Contributing to the Project 42 gateway",
        "## Before opening a change",
        "## Develop and verify",
        "npm run verify",
        "## Pull requests",
        "## Content and licensing",
        "[Security](SECURITY.md)",
        "[Support](SUPPORT.md)",
        "[SECURITY.md](SECURITY.md)",
        "[SUPPORT.md](SUPPORT.md)",
        filler,
      ].join("\n"),
      "SECURITY.md": [
        "# Security policy",
        "## Report a vulnerability privately",
        "Use [GitHub private vulnerability reporting](https://github.com/project42dev/project-42.dev/security/advisories/new).",
        "## Supported boundary",
        "[Support](SUPPORT.md)",
        "[SUPPORT.md](SUPPORT.md)",
        "## Dependency and disclosure handling",
        filler,
      ].join("\n"),
      "SUPPORT.md": [
        "# Support, compatibility, and deprecation",
        "## Supported surface",
        "[Security](SECURITY.md)",
        "[SECURITY.md](SECURITY.md)",
        "## Compatibility boundary",
        "## Deprecation policy",
        filler,
      ].join("\n"),
    },
    readme: [
      "[Contributing](CONTRIBUTING.md)",
      "[Security](SECURITY.md)",
      "[Support](SUPPORT.md)",
    ].join("\n"),
  };
}

test(
  "the repository's governance package passes",
  {
    skip:
      !existsSync(path.join(repositoryRoot, "README.md")) &&
      "not a repository root",
  },
  async () => {
    assert.deepEqual(await validateGovernanceFiles(repositoryRoot), []);
  },
);

test(
  "the scaffold template governance package passes",
  { skip: !existsSync(templateRoot) && "scaffold template not present" },
  async () => {
    assert.deepEqual(await validateGovernanceFiles(templateRoot), []);
  },
);

test("rejects a missing document", () => {
  const fixture = validFixture();
  delete fixture.documents["SECURITY.md"];
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes("missing required governance document"),
    ),
  );
});

test("rejects an empty document", () => {
  const fixture = validFixture();
  fixture.documents["SUPPORT.md"] = "short";
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes("empty or not substantive"),
    ),
  );
});

test("rejects an unlinked governance document", () => {
  const fixture = validFixture();
  fixture.readme = fixture.readme.replace(
    "[Security](SECURITY.md)",
    "Security guidance exists.",
  );
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes("does not link SECURITY.md"),
    ),
  );
});

test("rejects a private tracker URL", () => {
  const fixture = validFixture();
  fixture.documents["CONTRIBUTING.md"] +=
    "\nhttps://dev." + "azure.com/example/private";
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes("private Azure DevOps URL"),
    ),
  );
});

test("rejects credential-like material", () => {
  const fixture = validFixture();
  fixture.documents["SECURITY.md"] +=
    "\nclient_secret=abcdefghijklmnop";
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes("credential assignment"),
    ),
  );
});

test("rejects a missing canonical private-reporting link", () => {
  const fixture = validFixture();
  fixture.documents["SECURITY.md"] = fixture.documents["SECURITY.md"].replace(
    "[GitHub private vulnerability reporting](https://github.com/project42dev/project-42.dev/security/advisories/new)",
    "private vulnerability reporting",
  );
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes("missing required link"),
    ),
  );
});

test("rejects a private operations repository URL", () => {
  const fixture = validFixture();
  fixture.documents["CONTRIBUTING.md"] +=
    "\nhttps://github.com/project42dev/" + "project42dev-ops";
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes("private operations repository URL"),
    ),
  );
});

test("rejects a bearer credential", () => {
  const fixture = validFixture();
  fixture.documents["SECURITY.md"] +=
    "\nAuthorization: Bearer synthetic-secret-value";
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes("bearer credential"),
    ),
  );
});

test("rejects an Azure resource identifier", () => {
  const fixture = validFixture();
  fixture.documents["SUPPORT.md"] +=
    "\n/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/private/providers/Microsoft.Storage/storageAccounts/example";
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes("Azure resource identifier"),
    ),
  );
});

test("rejects a required heading hidden in an HTML comment", () => {
  const fixture = validFixture();
  fixture.documents["SUPPORT.md"] = fixture.documents["SUPPORT.md"].replace(
    "## Deprecation policy",
    "<!-- ## Deprecation policy -->",
  );
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes('missing required heading "## Deprecation policy"'),
    ),
  );
});

test("rejects a canonical link hidden in a fenced code block", () => {
  const fixture = validFixture();
  fixture.documents["SECURITY.md"] = fixture.documents["SECURITY.md"].replace(
    "[GitHub private vulnerability reporting](https://github.com/project42dev/project-42.dev/security/advisories/new)",
    "```\n[GitHub private vulnerability reporting](https://github.com/project42dev/project-42.dev/security/advisories/new)\n```",
  );
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes("missing required link"),
    ),
  );
});

test("rejects structurally incomplete guidance even when heading text remains", () => {
  const fixture = validFixture();
  fixture.documents["SUPPORT.md"] = fixture.documents["SUPPORT.md"].replace(
    "## Deprecation policy",
    "Deprecation policy",
  );
  assert.ok(
    validateGovernanceDocuments(fixture).some((error) =>
      error.includes('missing required heading "## Deprecation policy"'),
    ),
  );
});

test("the private-reporting destination is configurable", () => {
  const fixture = validFixture();
  fixture.documents["SECURITY.md"] = fixture.documents["SECURITY.md"].replace(
    "https://github.com/project42dev/project-42.dev/security/advisories/new",
    templateAdvisoriesUrl,
  );
  fixture.securityAdvisoriesUrl = templateAdvisoriesUrl;
  assert.deepEqual(validateGovernanceDocuments(fixture), []);

  const stale = validFixture();
  stale.securityAdvisoriesUrl = templateAdvisoriesUrl;
  assert.ok(
    validateGovernanceDocuments(stale).some((error) =>
      error.includes("missing required link"),
    ),
  );
});

test("any level-1 Contributing heading is accepted", () => {
  const named = validFixture();
  named.documents["CONTRIBUTING.md"] = named.documents["CONTRIBUTING.md"].replace(
    "# Contributing to the Project 42 gateway",
    "# Contributing to Example Org",
  );
  assert.deepEqual(validateGovernanceDocuments(named), []);

  const wrong = validFixture();
  wrong.documents["CONTRIBUTING.md"] = wrong.documents["CONTRIBUTING.md"].replace(
    "# Contributing to the Project 42 gateway",
    "# Contributions welcome",
  );
  assert.ok(
    validateGovernanceDocuments(wrong).some((error) =>
      error.includes('missing required heading starting with "# contributing"'),
    ),
  );
});
