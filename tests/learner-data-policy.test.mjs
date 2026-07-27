import assert from "node:assert/strict";
import test from "node:test";
import {
  LEARNER_ACCOUNT_STATES,
  LEARNER_DATA_PERMISSIONS,
  LEARNER_DATA_ROLES,
  canTransitionLearnerAccount,
  defaultLearnerDataPolicy,
  learnerDataRoleCan,
  validateLearnerDataPolicy,
} from "../dist/index.js";

test("publishes a valid, versioned, pre-account learner-data policy", () => {
  assert.deepEqual(validateLearnerDataPolicy(defaultLearnerDataPolicy), {
    valid: true,
    errors: [],
  });
  assert.equal(defaultLearnerDataPolicy.schemaVersion, 1);
  assert.equal(defaultLearnerDataPolicy.policyVersion, "2026-07-27");
  assert.equal(defaultLearnerDataPolicy.accountBackedRecords, "planned");
  assert.equal(defaultLearnerDataPolicy.identity.authoritativeKey, "issuer-subject");
  assert.equal(defaultLearnerDataPolicy.identity.emailIsAuthoritative, false);
  assert.equal(defaultLearnerDataPolicy.adapters.hostedRecordStore, "cloudflare-d1");
  assert.equal(defaultLearnerDataPolicy.adapters.referenceRecordStore, "postgresql");
});

test("defines every account state and only explicit transitions", () => {
  assert.deepEqual(defaultLearnerDataPolicy.lifecycle.states, [
    ...LEARNER_ACCOUNT_STATES,
  ]);
  assert.equal(
    canTransitionLearnerAccount(defaultLearnerDataPolicy, "created", "active"),
    true,
  );
  assert.equal(
    canTransitionLearnerAccount(
      defaultLearnerDataPolicy,
      "deletion-requested",
      "deleted",
    ),
    true,
  );
  assert.equal(
    canTransitionLearnerAccount(defaultLearnerDataPolicy, "deleted", "active"),
    false,
  );
  assert.equal(
    defaultLearnerDataPolicy.lifecycle.transitions.some(
      ({ from }) => from === "deleted",
    ),
    false,
  );
});

test("enumerates role permissions and denies ungranted access", () => {
  assert.deepEqual(
    defaultLearnerDataPolicy.authorization.grants.map(({ role }) => role),
    [...LEARNER_DATA_ROLES],
  );
  assert.equal(
    learnerDataRoleCan(
      defaultLearnerDataPolicy,
      "learner",
      "transcript:export:self",
    ),
    true,
  );
  assert.equal(
    learnerDataRoleCan(
      defaultLearnerDataPolicy,
      "support",
      "profile:update:self",
    ),
    false,
  );
  assert.equal(
    learnerDataRoleCan(
      defaultLearnerDataPolicy,
      "content-editor",
      "learner-summary:read:tenant",
    ),
    false,
  );
  for (const grant of defaultLearnerDataPolicy.authorization.grants) {
    for (const permission of grant.permissions) {
      assert.ok(LEARNER_DATA_PERMISSIONS.includes(permission));
    }
  }
});

test("covers consent, retention, export, deletion, and recovery", () => {
  assert.ok(
    defaultLearnerDataPolicy.consent.purposes.some(
      ({ id, required }) => id === "learning-record" && required,
    ),
  );
  assert.deepEqual(
    new Set(defaultLearnerDataPolicy.retention.classes.map(({ id }) => id)),
    new Set([
      "active-account",
      "inactive-account",
      "privileged-audit",
      "support-diagnostics",
      "deletion-receipt",
    ]),
  );
  assert.equal(defaultLearnerDataPolicy.export.recentAuthenticationMinutes, 15);
  assert.equal(defaultLearnerDataPolicy.export.publicObjectUrlAllowed, false);
  assert.equal(defaultLearnerDataPolicy.deletion.backupExpiryDays, 35);
  assert.equal(defaultLearnerDataPolicy.deletion.restoreTimeDeletionReplay, true);
  assert.equal(defaultLearnerDataPolicy.recovery.deletionReplayRequired, true);
  assert.equal(defaultLearnerDataPolicy.recovery.restoreTestCadenceDays, 90);
});

test("rejects unsafe identity, tenancy, export, deletion, and role policies", () => {
  const unsafeIdentity = structuredClone(defaultLearnerDataPolicy);
  unsafeIdentity.identity.authoritativeKey = "email";
  unsafeIdentity.identity.emailIsAuthoritative = true;

  const unsafeTenant = structuredClone(defaultLearnerDataPolicy);
  unsafeTenant.tenancy.denyCrossTenantByDefault = false;

  const unsafeExport = structuredClone(defaultLearnerDataPolicy);
  unsafeExport.export.publicObjectUrlAllowed = true;

  const unsafeDeletion = structuredClone(defaultLearnerDataPolicy);
  unsafeDeletion.deletion.restoreTimeDeletionReplay = false;

  const unsafeEditor = structuredClone(defaultLearnerDataPolicy);
  unsafeEditor.authorization.grants
    .find(({ role }) => role === "content-editor")
    .permissions.push("transcript:read:self");

  const unstableIdentity = structuredClone(defaultLearnerDataPolicy);
  unstableIdentity.identity.protocol = "implicit";
  unstableIdentity.identity.stableSubjectRequired = false;

  const invalidRecovery = structuredClone(defaultLearnerDataPolicy);
  invalidRecovery.recovery.recoveryPointHours = 0;

  const invalidEffectiveDate = structuredClone(defaultLearnerDataPolicy);
  invalidEffectiveDate.effectiveDate = "soon";

  const obsoleteHostedAdapter = structuredClone(defaultLearnerDataPolicy);
  obsoleteHostedAdapter.adapters.hostedRecordStore = "sites-d1";

  for (const [policy, message] of [
    [unsafeIdentity, /issuer and subject|email cannot/],
    [unstableIdentity, /Authorization Code with PKCE|stable subject/],
    [unsafeTenant, /cross-tenant/],
    [unsafeExport, /public object URLs/],
    [unsafeDeletion, /expire from backups/],
    [invalidRecovery, /recovery objectives/],
    [invalidEffectiveDate, /effectiveDate/],
    [obsoleteHostedAdapter, /Cloudflare D1/],
    [unsafeEditor, /content editors/],
  ]) {
    const result = validateLearnerDataPolicy(policy);
    assert.equal(result.valid, false);
    assert.match(result.errors.join("; "), message);
  }
});
