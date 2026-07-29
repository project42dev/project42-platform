import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_ACCOUNT_MERGE_CONSENT_REQUIREMENTS,
  readAccountMergeConsentRequirements,
} from "../dist/account-merge-policy.js";

test("account merge consent requirements are explicit and configurable", () => {
  assert.deepEqual(DEFAULT_ACCOUNT_MERGE_CONSENT_REQUIREMENTS, [
    {
      purpose: "learning-record",
      policyVersion: "2026-07-27",
    },
  ]);
  assert.deepEqual(
    readAccountMergeConsentRequirements(
      JSON.stringify([
        { purpose: "service", policyVersion: "2" },
        { purpose: "learning-record", policyVersion: "3" },
      ]),
    ),
    [
      { purpose: "learning-record", policyVersion: "3" },
      { purpose: "service", policyVersion: "2" },
    ],
  );
});

test("account merge consent configuration fails closed", () => {
  for (const unsafe of [
    "not-json",
    "[]",
    '[{"purpose":"learning-record"}]',
    '[{"purpose":"learning record","policyVersion":"1"}]',
    '[{"purpose":"learning-record","policyVersion":"1","extra":true}]',
    '[{"purpose":"learning-record","policyVersion":"1"},{"purpose":"learning-record","policyVersion":"1"}]',
  ]) {
    assert.throws(
      () => readAccountMergeConsentRequirements(unsafe),
      /ACCOUNT_MERGE_REQUIRED_CONSENTS|consent requirement|safe purpose/,
    );
  }
});
