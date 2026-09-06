import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertWorkflowGovernance,
  validateWorkflowGovernance,
} from "../scripts/workflow-governance-validation.mjs";

const workflowDirectory = new URL("../.github/workflows/", import.meta.url);
const deploymentWorkflow = await readFile(
  new URL("deploy-pages.yml", workflowDirectory),
  "utf8",
);
const ciWorkflow = await readFile(
  new URL("ci.yml", workflowDirectory),
  "utf8",
);
const intakeWorkflow = await readFile(
  new URL("ado-sync.yml", workflowDirectory),
  "utf8",
);
const releaseWorkflow = await readFile(
  new URL("release.yml", workflowDirectory),
  "utf8",
);

const pinnedCheckout =
  "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1";
const pinnedDeploy =
  "actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128";

const validDeploymentFixture = `name: Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
jobs:
  validate:
    permissions:
      contents: read
    runs-on: ubuntu-latest
    steps:
      - uses: ${pinnedCheckout}
        with:
          persist-credentials: false
      - run: npm test
  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    permissions:
      contents: read
      pages: write
      id-token: write
    environment:
      name: github-pages
    runs-on: ubuntu-latest
    steps:
      - uses: ${pinnedDeploy}
`;

test("current workflows satisfy the immutable and deployment boundaries", () => {
  assertWorkflowGovernance([
    {
      name: "deploy-pages.yml",
      workflow: deploymentWorkflow,
      deploymentWorkflow: true,
    },
    { name: "ci.yml", workflow: ciWorkflow },
    { name: "ado-sync.yml", workflow: intakeWorkflow },
    { name: "release.yml", workflow: releaseWorkflow },
  ]);
});

test("accepts a minimal read-only manual validation and guarded deploy", () => {
  assert.deepEqual(
    validateWorkflowGovernance({
      name: "fixture.yml",
      workflow: validDeploymentFixture,
      deploymentWorkflow: true,
    }),
    [],
  );
});

const adversarialCases = [
  {
    name: "mutable action",
    mutate: (workflow) =>
      workflow.replace(pinnedCheckout, "actions/checkout@v7"),
    expected: "immutable 40-character SHA",
  },
  {
    name: "mutable reusable workflow",
    mutate: (workflow) =>
      workflow.replace(
        "  validate:\n",
        "  reusable:\n    uses: example/example/.github/workflows/check.yml@main\n  validate:\n",
      ),
    expected: "immutable 40-character SHA",
  },
  {
    name: "persisted checkout credentials",
    mutate: (workflow) =>
      workflow.replace("persist-credentials: false", "fetch-depth: 0"),
    expected: "persist-credentials to false",
  },
  {
    name: "manual deployment without event guard",
    mutate: (workflow) =>
      workflow.replace(
        "if: github.event_name == 'push' && github.ref == 'refs/heads/main'",
        "if: success()",
      ),
    expected: "positive push and main/tag guard",
  },
  {
    name: "workflow-wide OIDC permission",
    mutate: (workflow) =>
      workflow.replace(
        "permissions:\n  contents: read",
        "permissions:\n  contents: read\n  id-token: write",
      ),
    expected: "workflow-wide write or OIDC permissions",
  },
  {
    name: "workflow-wide write-all",
    mutate: (workflow) =>
      workflow.replace(
        "permissions:\n  contents: read",
        "permissions: write-all",
      ),
    expected: "workflow-wide write or OIDC permissions",
  },
  {
    name: "write permission in validation",
    mutate: (workflow) =>
      workflow.replace(
        "validate:\n    permissions:\n      contents: read",
        "validate:\n    permissions:\n      contents: write",
      ),
    expected: "read-only job 'validate' has write permissions",
  },
  {
    name: "deploy command in validation",
    mutate: (workflow) =>
      workflow.replace("      - run: npm test", "      - run: npm publish"),
    expected: "read-only job 'validate' contains a publish or deploy command",
  },
  {
    name: "missing deploy OIDC",
    mutate: (workflow) =>
      workflow.replace("      id-token: write\n", ""),
    expected: "lacks 'id-token: write'",
  },
  {
    name: "excess deployment permission",
    mutate: (workflow) =>
      workflow.replace(
        "      pages: write",
        "      pages: write\n      contents: write",
      ),
    expected: "excessive write permissions",
  },
  {
    name: "no separate validation job",
    mutate: (workflow) =>
      workflow.replace(
        /  validate:\n[\s\S]*?(?=  deploy:)/,
        "",
      ),
    expected: "separate read-only validation job",
  },
];

for (const adversarialCase of adversarialCases) {
  test(`rejects ${adversarialCase.name}`, () => {
    const errors = validateWorkflowGovernance({
      name: "adversarial.yml",
      workflow: adversarialCase.mutate(validDeploymentFixture),
      deploymentWorkflow: true,
    });
    assert.match(errors.join("\n"), new RegExp(adversarialCase.expected));
  });
}
