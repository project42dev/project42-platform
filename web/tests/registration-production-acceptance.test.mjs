import assert from "node:assert/strict";
import { mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  readRegistrationAcceptanceConfig,
  REGISTRATION_ACCEPTANCE_CONFIRMATION,
} from "./production/registration-acceptance-config.ts";

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "project42-registration-"));
  const statePath = join(directory, "pending.json");
  writeFileSync(statePath, "{}\n");
  return {
    PROJECT42_REGISTRATION_ACCEPTANCE_CONFIRMATION:
      REGISTRATION_ACCEPTANCE_CONFIRMATION,
    PROJECT42_REGISTRATION_ACCEPTANCE_STATE: statePath,
    PROJECT42_REGISTRATION_ACCEPTANCE_REQUESTED_AT:
      "2026-07-30T12:00:00.000Z",
    PROJECT42_REGISTRATION_ACCEPTANCE_RUN_ID: "registration-20260730-001",
    PROJECT42_REGISTRATION_ACCEPTANCE_LEARN_ORIGIN:
      "https://learn.project-42.dev",
    PROJECT42_REGISTRATION_ACCEPTANCE_API_ORIGIN:
      "https://api.project-42.dev",
  };
}

test("accepts an explicit private pending-receipt configuration", () => {
  const config = readRegistrationAcceptanceConfig(fixture(), process.cwd());
  assert.equal(config.runId, "registration-20260730-001");
});

for (const [label, change, pattern] of [
  [
    "confirmation",
    (environment) => {
      environment.PROJECT42_REGISTRATION_ACCEPTANCE_CONFIRMATION = "yes";
    },
    /exact receipt-use confirmation/,
  ],
  [
    "absolute private state",
    (environment) => {
      environment.PROJECT42_REGISTRATION_ACCEPTANCE_STATE = "pending.json";
    },
    /absolute path/,
  ],
  [
    "canonical request timestamp",
    (environment) => {
      environment.PROJECT42_REGISTRATION_ACCEPTANCE_REQUESTED_AT =
        "2026-07-30T12:00:00Z";
    },
    /canonical ISO-8601/,
  ],
  [
    "bounded run identifier",
    (environment) => {
      environment.PROJECT42_REGISTRATION_ACCEPTANCE_RUN_ID = "INVALID ID";
    },
    /8-64 lowercase/,
  ],
  [
    "HTTPS origin",
    (environment) => {
      environment.PROJECT42_REGISTRATION_ACCEPTANCE_API_ORIGIN =
        "http://api.project-42.dev";
    },
    /production HTTPS origin/,
  ],
]) {
  test(`fails closed without valid ${label}`, () => {
    const environment = fixture();
    change(environment);
    assert.throws(
      () => readRegistrationAcceptanceConfig(environment, process.cwd()),
      pattern,
    );
  });
}

test("rejects a registration receipt stored inside the repository", () => {
  const environment = fixture();
  environment.PROJECT42_REGISTRATION_ACCEPTANCE_STATE = resolve(
    "tests",
    "registration-production-acceptance.test.mjs",
  );
  assert.throws(
    () => readRegistrationAcceptanceConfig(environment, process.cwd()),
    /outside the repository/,
  );
});

test("rejects an outside symlink that resolves into the repository", (context) => {
  const environment = fixture();
  const outside = mkdtempSync(
    join(tmpdir(), "project42-registration-link-"),
  );
  const linkedState = join(outside, "linked-state.json");
  try {
    symlinkSync(
      resolve("tests", "registration-production-acceptance.test.mjs"),
      linkedState,
    );
  } catch (error) {
    if (error?.code === "EPERM") {
      context.skip("The current Windows session cannot create symbolic links.");
      return;
    }
    throw error;
  }
  environment.PROJECT42_REGISTRATION_ACCEPTANCE_STATE = linkedState;
  assert.throws(
    () => readRegistrationAcceptanceConfig(environment, process.cwd()),
    /outside the repository/,
  );
});
