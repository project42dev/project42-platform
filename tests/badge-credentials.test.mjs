import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  BADGE_DEFINITION_CONTRACT_VERSION,
  BADGE_LIFECYCLE_EVENT_CONTRACT_VERSION,
  BadgeCredentialError,
  OPEN_BADGES_3_MAPPING_BOUNDARY,
  projectBadgeLifecycle,
  validateBadgeDefinition,
  validateBadgeIssuanceEvidence,
  validateBadgeLifecycleEvent,
} from "../dist/index.js";

const fixtureRoot = new URL("./fixtures/badges/", import.meta.url);
const schemaUrl = new URL(
  "../schemas/badges/badge-credential-domain-1.0.schema.json",
  import.meta.url,
);

async function json(name) {
  return JSON.parse(await readFile(new URL(name, fixtureRoot), "utf8"));
}

const [schema, masteryDefinition, masteryLifecycle, visitOnly, unversioned] =
  await Promise.all([
    JSON.parse(await readFile(schemaUrl, "utf8")),
    json("mastery-definition.json"),
    json("mastery-lifecycle.json"),
    json("mastery-visit-only.json"),
    json("mastery-unversioned.json"),
  ]);

function expectBadgeError(action, code, messagePattern) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof BadgeCredentialError);
    assert.equal(error.code, code);
    if (messagePattern) assert.match(error.message, messagePattern);
    return true;
  });
}

test("defines a versioned, localized, provider-neutral mastery credential", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validateSchema = ajv.compile(schema);
  assert.equal(
    validateSchema(masteryDefinition),
    true,
    JSON.stringify(validateSchema.errors),
  );
  for (const event of masteryLifecycle) {
    assert.equal(
      validateSchema(event),
      true,
      JSON.stringify(validateSchema.errors),
    );
  }
  assert.equal(validateSchema(unversioned), false);

  assert.equal(
    masteryDefinition.schemaVersion,
    BADGE_DEFINITION_CONTRACT_VERSION,
  );
  assert.deepEqual(validateBadgeDefinition(masteryDefinition), {
    valid: true,
    errors: [],
  });
  assert.equal(masteryDefinition.badgeClass, "mastery");
  assert.equal(masteryDefinition.display.length, 2);
  assert.equal(masteryDefinition.criteria.version, "2.1.0");
  assert.equal(
    masteryDefinition.issuerPolicy.issuanceMode,
    "durable-record-only",
  );
  assert.deepEqual(
    masteryDefinition.openBadges3,
    OPEN_BADGES_3_MAPPING_BOUNDARY,
  );
  assert.equal(masteryDefinition.openBadges3.conformanceClaim, false);
});

test("definition validation fails closed on weak mastery and conformance claims", () => {
  const visitMastery = structuredClone(masteryDefinition);
  visitMastery.criteria.evidence = [
    {
      id: "requirement-visit-only",
      kind: "module.visited",
      subjectId: "module-introduction",
      subjectVersion: "1.0.0",
      contentVersion: "2026.7.0",
      requiredResult: "visited",
      minimumScorePercent: null,
    },
  ];
  const visitErrors = validateBadgeDefinition(visitMastery).errors.join("\n");
  assert.match(visitErrors, /cannot require visit-only evidence/);
  assert.match(visitErrors, /must require a passing version-bound assessment/);

  const unscoredMastery = structuredClone(masteryDefinition);
  unscoredMastery.criteria.evidence[0].minimumScorePercent = null;
  assert.match(
    validateBadgeDefinition(unscoredMastery).errors.join("\n"),
    /must declare a minimum passing score/,
  );

  const prematureConformance = structuredClone(masteryDefinition);
  prematureConformance.openBadges3.status = "conformant";
  prematureConformance.openBadges3.conformanceClaim = true;
  const conformanceErrors =
    validateBadgeDefinition(prematureConformance).errors.join("\n");
  assert.match(conformanceErrors, /future-mapping-not-conformant/);
  assert.match(conformanceErrors, /must not be claimed/);

  const unsupported = structuredClone(masteryDefinition);
  unsupported.schemaVersion = "2.0";
  assert.match(
    validateBadgeDefinition(unsupported).errors.join("\n"),
    /unsupported badge-definition schema version/,
  );
  expectBadgeError(
    () => projectBadgeLifecycle([unsupported], []),
    "invalid-definition",
    /unsupported badge-definition schema version/,
  );
});

test("lifecycle validation requires supported versions and version-bound evidence", () => {
  for (const event of masteryLifecycle) {
    assert.equal(
      event.schemaVersion,
      BADGE_LIFECYCLE_EVENT_CONTRACT_VERSION,
    );
    assert.deepEqual(validateBadgeLifecycleEvent(event), {
      valid: true,
      errors: [],
    });
  }
  assert.deepEqual(validateBadgeLifecycleEvent(visitOnly), {
    valid: true,
    errors: [],
  });

  const unversionedErrors =
    validateBadgeLifecycleEvent(unversioned).errors.join("\n");
  assert.match(unversionedErrors, /subject version is required and invalid/);
  expectBadgeError(
    () => projectBadgeLifecycle([masteryDefinition], [unversioned]),
    "invalid-event",
    /subject version is required and invalid/,
  );

  const unsupported = structuredClone(masteryLifecycle[0]);
  unsupported.schemaVersion = "2.0";
  assert.match(
    validateBadgeLifecycleEvent(unsupported).errors.join("\n"),
    /unsupported badge-lifecycle event schema version/,
  );
  expectBadgeError(
    () => projectBadgeLifecycle([masteryDefinition], [unsupported]),
    "invalid-event",
    /unsupported badge-lifecycle event schema version/,
  );

  const extended = structuredClone(masteryLifecycle[0]);
  extended.signedCredential = "premature-boundary-crossing";
  assert.match(
    validateBadgeLifecycleEvent(extended).errors.join("\n"),
    /unsupported field: signedCredential/,
  );
});

test("visit-only, wrong-version, and below-threshold evidence cannot issue mastery", () => {
  assert.match(
    validateBadgeIssuanceEvidence(
      masteryDefinition,
      visitOnly.evidence,
    ).errors.join("\n"),
    /mastery issuance requires passing version-bound assessment evidence/,
  );
  expectBadgeError(
    () => projectBadgeLifecycle([masteryDefinition], [visitOnly]),
    "invalid-evidence",
    /mastery issuance requires passing version-bound assessment evidence/,
  );

  const wrongVersion = structuredClone(masteryLifecycle[0]);
  wrongVersion.evidence[0].subjectVersion = "2.9.0";
  expectBadgeError(
    () => projectBadgeLifecycle([masteryDefinition], [wrongVersion]),
    "invalid-evidence",
    /version-bound result/,
  );

  const wrongContentVersion = structuredClone(masteryLifecycle[0]);
  wrongContentVersion.evidence[0].contentVersion = "2026.6.0";
  expectBadgeError(
    () => projectBadgeLifecycle([masteryDefinition], [wrongContentVersion]),
    "invalid-evidence",
    /version-bound result/,
  );

  const belowThreshold = structuredClone(masteryLifecycle[0]);
  belowThreshold.evidence[0].scorePercent = 79;
  expectBadgeError(
    () => projectBadgeLifecycle([masteryDefinition], [belowThreshold]),
    "invalid-evidence",
    /version-bound result/,
  );

  const futureEvidence = structuredClone(masteryLifecycle[0]);
  futureEvidence.evidence[0].occurredAt = "2026-07-29T12:00:01.000Z";
  expectBadgeError(
    () => projectBadgeLifecycle([masteryDefinition], [futureEvidence]),
    "invalid-evidence",
    /evidence cannot occur after its lifecycle event/,
  );

  const issued = projectBadgeLifecycle(
    [masteryDefinition],
    [masteryLifecycle[0]],
  );
  assert.equal(issued.length, 1);
  assert.equal(issued[0].status, "active");
  assert.equal(issued[0].badgeClass, "mastery");
});

test("correction and revocation append history without changing original issuance", () => {
  const definitionInput = structuredClone(masteryDefinition);
  const eventInput = structuredClone(masteryLifecycle);
  const originalIssuance = structuredClone(eventInput[0]);

  const corrected = projectBadgeLifecycle(
    [definitionInput],
    eventInput.slice(0, 2),
  )[0];
  assert.equal(corrected.status, "active");
  assert.deepEqual(corrected.originalIssuance, originalIssuance);
  assert.equal(corrected.corrections.length, 1);
  assert.equal(corrected.effectiveEvidence[0].scorePercent, 92);
  assert.equal(corrected.originalIssuance.evidence[0].scorePercent, 90);

  const revoked = projectBadgeLifecycle([definitionInput], eventInput)[0];
  assert.equal(revoked.status, "revoked");
  assert.deepEqual(revoked.originalIssuance, originalIssuance);
  assert.equal(revoked.corrections.length, 1);
  assert.equal(revoked.revocation.eventId, "badge-event-revoked-0003");
  assert.equal(revoked.lastEventId, "badge-event-revoked-0003");

  assert.deepEqual(definitionInput, masteryDefinition);
  assert.deepEqual(eventInput, masteryLifecycle);
});

test("replay is deterministic and ordered by immutable event sequence", () => {
  const first = projectBadgeLifecycle(
    [masteryDefinition],
    masteryLifecycle,
  );
  const second = projectBadgeLifecycle(
    [structuredClone(masteryDefinition)],
    structuredClone(masteryLifecycle),
  );
  const reverseTransportOrder = projectBadgeLifecycle(
    [masteryDefinition],
    [...masteryLifecycle].reverse(),
  );

  assert.deepEqual(second, first);
  assert.deepEqual(reverseTransportOrder, first);
  assert.equal(JSON.stringify(second), JSON.stringify(first));

  const secondCredential = structuredClone(masteryLifecycle[0]);
  secondCredential.eventId = "badge-event-issued-credential-0002";
  secondCredential.credentialId = "credential-reliable-agent-0002";
  secondCredential.subjectId = "learner-opaque-0004";
  const twoCredentialReplay = projectBadgeLifecycle(
    [masteryDefinition],
    [secondCredential, masteryLifecycle[0]],
  );
  assert.equal(twoCredentialReplay.length, 2);
  assert.deepEqual(
    twoCredentialReplay.map((credential) => credential.credentialId),
    [
      "credential-reliable-agent-0001",
      "credential-reliable-agent-0002",
    ],
  );
});

test("adversarial lifecycle streams fail closed", () => {
  const duplicateSequence = structuredClone(masteryLifecycle);
  duplicateSequence[1].sequence = 1;
  expectBadgeError(
    () => projectBadgeLifecycle([masteryDefinition], duplicateSequence),
    "duplicate-sequence",
    /Duplicate badge lifecycle sequence 1 for credential/,
  );

  const brokenChain = structuredClone(masteryLifecycle);
  brokenChain[1].supersedesEventId = "badge-event-that-is-not-current";
  expectBadgeError(
    () => projectBadgeLifecycle([masteryDefinition], brokenChain),
    "invalid-lifecycle-chain",
    /does not supersede the current event/,
  );

  const postRevocationCorrection = structuredClone(masteryLifecycle[1]);
  postRevocationCorrection.eventId = "badge-event-corrected-0004";
  postRevocationCorrection.sequence = 4;
  postRevocationCorrection.supersedesEventId =
    "badge-event-revoked-0003";
  expectBadgeError(
    () =>
      projectBadgeLifecycle(
        [masteryDefinition],
        [...masteryLifecycle, postRevocationCorrection],
      ),
    "invalid-lifecycle-transition",
    /cannot change after revoked/,
  );

  const duplicateIssuance = structuredClone(masteryLifecycle[0]);
  duplicateIssuance.eventId = "badge-event-issued-0004";
  duplicateIssuance.sequence = 4;
  expectBadgeError(
    () =>
      projectBadgeLifecycle(
        [masteryDefinition],
        [masteryLifecycle[0], duplicateIssuance],
      ),
    "duplicate-issuance",
    /already has an issuance event/,
  );

  const unknownDefinition = structuredClone(masteryLifecycle[0]);
  unknownDefinition.badgeDefinitionVersion = "9.9.9";
  expectBadgeError(
    () => projectBadgeLifecycle([masteryDefinition], [unknownDefinition]),
    "missing-definition",
    /is unavailable/,
  );

  const neverExpires = {
    schemaVersion: "1.0",
    eventId: "badge-event-expired-0002",
    sequence: 2,
    type: "badge.expired",
    credentialId: "credential-reliable-agent-0001",
    occurredAt: "2030-07-29T12:00:00.000Z",
    actor: {
      type: "system",
      id: "actor-credential-engine",
    },
    supersedesEventId: "badge-event-issued-0001",
    reason: "Attempt to expire a non-expiring credential.",
  };
  expectBadgeError(
    () =>
      projectBadgeLifecycle(
        [masteryDefinition],
        [masteryLifecycle[0], neverExpires],
      ),
    "invalid-lifecycle-transition",
    /does not expire/,
  );
});
