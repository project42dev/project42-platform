import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  assessIdentityProvisioningDrift,
  canTransitionIdentityProvisioningState,
  evaluateIdentityProvisioningReadiness,
  validateIdentityProviderCompatibility,
  validateIdentityProvisioningPlan,
  validateIdentityProvisioningRecord,
} from "../dist/index.js";

const invalidFixtureRoot = new URL(
  "./fixtures/identity-provisioning/",
  import.meta.url,
);
const exampleRoot = new URL(
  "../examples/identity-provisioning/",
  import.meta.url,
);
const schemaUrl = new URL(
  "../schemas/identity/identity-provisioning-contract.schema.json",
  import.meta.url,
);

async function json(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

const [
  schema,
  apiPlan,
  readyRecord,
  ownerGatePlan,
  awaitingOwnerRecord,
  providerCompatibility,
  invalidCredentialLeak,
] = await Promise.all([
  json(schemaUrl),
  json(new URL("api-plan.json", exampleRoot)),
  json(new URL("ready-record.json", exampleRoot)),
  json(new URL("owner-gate-plan.json", exampleRoot)),
  json(new URL("awaiting-owner-record.json", exampleRoot)),
  json(new URL("provider-compatibility.json", exampleRoot)),
  json(new URL("invalid-credential-leak.json", invalidFixtureRoot)),
]);

test("identity-provisioning schema accepts each public contract kind", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);

  for (const value of [
    apiPlan,
    readyRecord,
    ownerGatePlan,
    awaitingOwnerRecord,
    providerCompatibility,
  ]) {
    assert.equal(validate(value), true, ajv.errorsText(validate.errors));
  }

  assert.equal(validate(invalidCredentialLeak), false);
  assert.ok(
    validate.errors?.some(
      (error) =>
        error.keyword === "additionalProperties" &&
        error.params.additionalProperty === "clientSecret",
    ),
  );
});

test("runtime plan validation enforces OIDC, PKCE, and secret boundaries", () => {
  assert.deepEqual(validateIdentityProvisioningPlan(apiPlan), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(validateIdentityProvisioningPlan(ownerGatePlan), {
    valid: true,
    errors: [],
  });

  const unsafeBrowser = structuredClone(apiPlan);
  unsafeBrowser.client.clientKind = "browser-public";
  unsafeBrowser.client.tokenEndpointAuthMethod = "client_secret_basic";
  unsafeBrowser.client.pkceRequired = false;
  unsafeBrowser.secretPolicy.required = false;
  unsafeBrowser.secretPolicy.rotationIntervalDays = null;
  unsafeBrowser.secretPolicy.overlapRequired = false;
  unsafeBrowser.client.redirectUris = ["http://learn.example.test/callback"];
  unsafeBrowser.client.allowedOrigins = ["https://learn.example.test/path"];

  const result = validateIdentityProvisioningPlan(unsafeBrowser);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /must require PKCE/);
  assert.match(result.errors.join("\n"), /cannot use a client credential/);
  assert.match(result.errors.join("\n"), /must use HTTPS/);
  assert.match(result.errors.join("\n"), /exact origin/);
});

test("credential values are forbidden while opaque references remain valid", () => {
  const result = validateIdentityProvisioningPlan(invalidCredentialLeak);
  assert.equal(result.valid, false);
  assert.match(
    result.errors.join("\n"),
    /forbidden credential field: clientSecret/,
  );
  assert.match(
    result.errors.join("\n"),
    /client contains unsupported field: clientSecret/,
  );

  assert.doesNotMatch(
    JSON.stringify(readyRecord),
    /must-never-be-persisted|clientSecret|accessToken|privateKey/,
  );
});

test("state transition contract is explicit and retired is terminal", () => {
  assert.equal(
    canTransitionIdentityProvisioningState("planned", "preflight"),
    true,
  );
  assert.equal(
    canTransitionIdentityProvisioningState("preflight", "awaiting-authority"),
    true,
  );
  assert.equal(
    canTransitionIdentityProvisioningState("awaiting-authority", "ready"),
    false,
  );
  assert.equal(
    canTransitionIdentityProvisioningState("ready", "rotating"),
    true,
  );
  assert.equal(
    canTransitionIdentityProvisioningState("failed", "recovering"),
    true,
  );
  assert.equal(
    canTransitionIdentityProvisioningState("retired", "ready"),
    false,
  );
});

test("ready records require complete observation, secret reference, and audit", () => {
  assert.deepEqual(validateIdentityProvisioningRecord(readyRecord), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(validateIdentityProvisioningRecord(awaitingOwnerRecord), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(evaluateIdentityProvisioningReadiness(apiPlan, readyRecord), {
    ready: true,
    blockers: [],
  });

  const incomplete = structuredClone(readyRecord);
  incomplete.observation = null;
  incomplete.secret = null;
  incomplete.audit[1].sequence = 4;
  const result = validateIdentityProvisioningRecord(incomplete);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /ready records require/);
  assert.match(result.errors.join("\n"), /audit sequence/);
  const readiness = evaluateIdentityProvisioningReadiness(apiPlan, incomplete);
  assert.equal(readiness.ready, false);
  assert.match(readiness.blockers.join("\n"), /observation is missing/);
  assert.match(readiness.blockers.join("\n"), /active secret reference is missing/);
});

test("post-registration drift fails readiness on ownership and callback changes", () => {
  const changed = structuredClone(readyRecord);
  changed.observation.observedStateDigest =
    "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  changed.observation.ownershipVerified = false;
  changed.observation.callbacksVerified = false;
  changed.drift = assessIdentityProvisioningDrift(apiPlan, changed.observation);

  assert.deepEqual(
    changed.drift.map((finding) => finding.code),
    [
      "state-digest-mismatch",
      "ownership-unverified",
      "callback-mismatch",
    ],
  );
  assert.equal(
    changed.drift.find(
      (finding) => finding.code === "ownership-unverified",
    ).securityCritical,
    true,
  );
  const readiness = evaluateIdentityProvisioningReadiness(apiPlan, changed);
  assert.equal(readiness.ready, false);
  assert.match(readiness.blockers.join("\n"), /ownership-unverified/);
  assert.match(readiness.blockers.join("\n"), /callback-mismatch/);
});

test("owner gates are resumable, expiring, authority-bound, and never ready", () => {
  const result = validateIdentityProvisioningRecord(awaitingOwnerRecord);
  assert.equal(result.valid, true);
  assert.equal(awaitingOwnerRecord.continuation.status, "pending");
  assert.equal(
    awaitingOwnerRecord.continuation.requiredAuthority,
    "organization-admin",
  );
  assert.equal(
    evaluateIdentityProvisioningReadiness(
      ownerGatePlan,
      awaitingOwnerRecord,
    ).ready,
    false,
  );

  const invalidGate = structuredClone(awaitingOwnerRecord);
  invalidGate.continuation.status = "approved";
  assert.match(
    validateIdentityProvisioningRecord(invalidGate).errors.join("\n"),
    /awaiting-authority requires a pending continuation/,
  );
});

test("provider compatibility is evidence-dated and capability-consistent", () => {
  assert.deepEqual(
    validateIdentityProviderCompatibility(providerCompatibility),
    { valid: true, errors: [] },
  );

  const inconsistent = structuredClone(providerCompatibility);
  inconsistent.evidenceSources = [];
  inconsistent.operations = ["create", "validate"];
  inconsistent.overlappingRotation = true;
  inconsistent.recovery = true;
  inconsistent.authorityGates.push(
    structuredClone(inconsistent.authorityGates[0]),
  );
  const result = validateIdentityProviderCompatibility(inconsistent);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /first-party evidence source/);
  assert.match(result.errors.join("\n"), /overlapping rotation requires/);
  assert.match(result.errors.join("\n"), /recovery support requires/);
  assert.match(result.errors.join("\n"), /duplicate authority gate/);
});

test("failed and retired records preserve typed failure and revocation rules", () => {
  const failed = structuredClone(awaitingOwnerRecord);
  failed.state = "failed";
  failed.continuation.status = "expired";
  failed.error = {
    code: "owner-gate-expired",
    retryable: true,
    retryAfter: "2026-07-28T10:10:00.000Z",
    publicMessage:
      "The provider confirmation expired. Restart the bounded owner step.",
  };
  assert.equal(validateIdentityProvisioningRecord(failed).valid, true);

  const retired = structuredClone(readyRecord);
  retired.state = "retired";
  retired.secret.status = "active";
  assert.match(
    validateIdentityProvisioningRecord(retired).errors.join("\n"),
    /cannot retain an unrevoked secret reference/,
  );
});
