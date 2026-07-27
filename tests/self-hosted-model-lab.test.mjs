import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const schema = JSON.parse(
  await readFile(
    new URL(
      "../schemas/training/self-hosted-model-lab.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const fixture = JSON.parse(
  await readFile(
    new URL(
      "../examples/training/self-hosted-model-lab/lab-package.example.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

test("portable self-hosted model lab contract accepts the complete draft fixture", () => {
  assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
  assert.equal(fixture.learningPathId, "self-hosted-model-operations");
  assert.equal(fixture.implementation.specificStepsSeparated, true);
  assert.ok(fixture.portability.portableConcepts.length >= 5);
  assert.ok(fixture.portability.alternatives.length >= 1);
  assert.equal(fixture.releaseStatus, "draft");
  assert.deepEqual(fixture.approvals, []);
});

test("portable lab requires artifact, endpoint, evaluation, telemetry, and recovery evidence", () => {
  const kinds = new Set(fixture.evidence.map((entry) => entry.kind));
  for (const required of [
    "artifact",
    "license-provenance",
    "endpoint",
    "evaluation",
    "load-capacity",
    "telemetry",
    "update",
    "rollback",
    "recovery",
  ]) {
    assert.ok(kinds.has(required), `missing ${required} evidence`);
  }
});

test("portable lab contract fails closed on mutable artifacts and missing recovery", () => {
  const invalid = structuredClone(fixture);
  invalid.modelArtifact.digest = "latest";
  delete invalid.lifecycle.rollbackEvidencePath;
  invalid.recovery.runbookPath = "../private/runbook.md";
  assert.equal(validate(invalid), false);
  assert.ok(validate.errors?.some((error) => error.instancePath.endsWith("/digest")));
  assert.ok(
    validate.errors?.some(
      (error) =>
        error.instancePath.endsWith("/lifecycle") &&
        error.keyword === "required" &&
        error.params.missingProperty === "rollbackEvidencePath",
    ),
  );
  assert.ok(
    validate.errors?.some((error) =>
      error.instancePath.endsWith("/runbookPath"),
    ),
  );
});

test("public portable lab fixture contains no private operational material", () => {
  const serialized = JSON.stringify(fixture);
  assert.doesNotMatch(
    serialized,
    /dev\.azure\.com|tenant[_ -]?id|subscription[_ -]?id|account[_ -]?id|client[_ -]?secret|bearer\s|kristopher|icloud\.com/i,
  );
  assert.match(fixture.endpoint.baseUrlTemplate, /^http:\/\/localhost/u);
  assert.ok(
    fixture.safety.stopConditions.some((condition) =>
      condition.includes("authority"),
    ),
  );
});
