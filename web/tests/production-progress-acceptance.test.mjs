import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  PRODUCTION_PROGRESS_ACCEPTANCE_CONFIRMATION,
  readProductionProgressAcceptanceConfig,
} from "./production/progress-acceptance-config.ts";

function fixture() {
  const privateDirectory = mkdtempSync(
    join(tmpdir(), "project42-progress-acceptance-"),
  );
  const primary = join(privateDirectory, "primary.json");
  const secondary = join(privateDirectory, "secondary.json");
  writeFileSync(primary, "{}\n");
  writeFileSync(secondary, "{}\n");
  return {
    environment: {
      PROJECT42_PROGRESS_ACCEPTANCE_CONFIRMATION:
        PRODUCTION_PROGRESS_ACCEPTANCE_CONFIRMATION,
      PROJECT42_PROGRESS_ACCEPTANCE_PRIMARY_STATE: primary,
      PROJECT42_PROGRESS_ACCEPTANCE_SECONDARY_STATE: secondary,
      PROJECT42_PROGRESS_ACCEPTANCE_ACCOUNT_ID: "account-acceptance-0001",
      PROJECT42_PROGRESS_ACCEPTANCE_RUN_ID: "acceptance-20260730-001",
      PROJECT42_PROGRESS_ACCEPTANCE_OCCURRED_AT:
        "2026-07-30T12:00:00.000Z",
      PROJECT42_PROGRESS_ACCEPTANCE_BACKUP_DECISION: "retain",
      PROJECT42_PROGRESS_ACCEPTANCE_LEARN_ORIGIN:
        "https://learn.project-42.dev",
      PROJECT42_PROGRESS_ACCEPTANCE_API_ORIGIN:
        "https://api.project-42.dev",
    },
    primary,
    secondary,
  };
}

test("accepts an explicit two-session production configuration", () => {
  const { environment, primary, secondary } = fixture();
  const config = readProductionProgressAcceptanceConfig(
    environment,
    process.cwd(),
  );
  assert.equal(config.primaryStatePath, primary);
  assert.equal(config.secondaryStatePath, secondary);
  assert.equal(config.backupDecision, "retain");
});

for (const [name, mutate, expected] of [
  [
    "exact mutation confirmation",
    (environment) => {
      environment.PROJECT42_PROGRESS_ACCEPTANCE_CONFIRMATION = "yes";
    },
    /exact mutation confirmation/,
  ],
  [
    "distinct browser sessions",
    (environment) => {
      environment.PROJECT42_PROGRESS_ACCEPTANCE_SECONDARY_STATE =
        environment.PROJECT42_PROGRESS_ACCEPTANCE_PRIMARY_STATE;
    },
    /distinct authenticated browser state/,
  ],
  [
    "absolute state paths",
    (environment) => {
      environment.PROJECT42_PROGRESS_ACCEPTANCE_PRIMARY_STATE = "primary.json";
    },
    /absolute path/,
  ],
  [
    "HTTPS Learn origin",
    (environment) => {
      environment.PROJECT42_PROGRESS_ACCEPTANCE_LEARN_ORIGIN =
        "http://learn.project-42.dev";
    },
    /production HTTPS origin/,
  ],
  [
    "origin without a path",
    (environment) => {
      environment.PROJECT42_PROGRESS_ACCEPTANCE_API_ORIGIN =
        "https://api.project-42.dev/v1";
    },
    /production HTTPS origin/,
  ],
  [
    "canonical timestamp",
    (environment) => {
      environment.PROJECT42_PROGRESS_ACCEPTANCE_OCCURRED_AT =
        "2026-07-30T12:00:00Z";
    },
    /canonical ISO-8601/,
  ],
  [
    "bounded run identifier",
    (environment) => {
      environment.PROJECT42_PROGRESS_ACCEPTANCE_RUN_ID = "BAD ID";
    },
    /8-64 lowercase/,
  ],
  [
    "explicit backup decision",
    (environment) => {
      environment.PROJECT42_PROGRESS_ACCEPTANCE_BACKUP_DECISION = "delete";
    },
    /retain or remove-after-verified-export/,
  ],
]) {
  test(`fails closed without a valid ${name}`, () => {
    const { environment } = fixture();
    mutate(environment);
    assert.throws(
      () =>
        readProductionProgressAcceptanceConfig(environment, process.cwd()),
      expected,
    );
  });
}

test("rejects authenticated state stored inside the repository", () => {
  const { environment } = fixture();
  environment.PROJECT42_PROGRESS_ACCEPTANCE_PRIMARY_STATE = resolve(
    "tests",
    "production-progress-acceptance.test.mjs",
  );
  assert.throws(
    () => readProductionProgressAcceptanceConfig(environment, process.cwd()),
    /outside the repository/,
  );
});

test("rejects an outside symlink that resolves into the repository", (context) => {
  const { environment } = fixture();
  const privateDirectory = mkdtempSync(
    join(tmpdir(), "project42-progress-acceptance-link-"),
  );
  const linkedState = join(privateDirectory, "linked-state.json");
  try {
    symlinkSync(
      resolve("tests", "production-progress-acceptance.test.mjs"),
      linkedState,
    );
  } catch (error) {
    if (error?.code === "EPERM") {
      context.skip("The current Windows session cannot create symbolic links.");
      return;
    }
    throw error;
  }
  environment.PROJECT42_PROGRESS_ACCEPTANCE_PRIMARY_STATE = linkedState;
  assert.throws(
    () => readProductionProgressAcceptanceConfig(environment, process.cwd()),
    /outside the repository/,
  );
});
