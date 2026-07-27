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
const homesteadModelFixture = JSON.parse(
  await readFile(
    new URL(
      "../examples/training/self-hosted-model-lab/homestead-foundry-reference.example.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const agentSchema = JSON.parse(
  await readFile(
    new URL(
      "../schemas/training/self-hosted-agent-lab.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const homesteadAgentFixture = JSON.parse(
  await readFile(
    new URL(
      "../examples/training/self-hosted-agent-lab/homestead-foundry-reference.example.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const referenceLabReadme = await readFile(
  new URL(
    "../examples/training/homestead-foundry-reference-labs/README.md",
    import.meta.url,
  ),
  "utf8",
);
const portableModelContract = await readFile(
  new URL(
    "../examples/training/homestead-foundry-reference-labs/model-service/portable-contract.md",
    import.meta.url,
  ),
  "utf8",
);
const homesteadModelAdapter = await readFile(
  new URL(
    "../examples/training/homestead-foundry-reference-labs/model-service/homestead-foundry-adapter.md",
    import.meta.url,
  ),
  "utf8",
);
const portableAgentContract = await readFile(
  new URL(
    "../examples/training/homestead-foundry-reference-labs/agent-runtime/portable-contract.md",
    import.meta.url,
  ),
  "utf8",
);
const homesteadAgentAdapter = await readFile(
  new URL(
    "../examples/training/homestead-foundry-reference-labs/agent-runtime/homestead-foundry-adapter.md",
    import.meta.url,
  ),
  "utf8",
);

const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const validateAgent = new Ajv2020({
  allErrors: true,
  strict: true,
}).compile(agentSchema);

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

test("Homestead Foundry model reference preserves the portable contract", () => {
  assert.equal(
    validate(homesteadModelFixture),
    true,
    JSON.stringify(validate.errors),
  );
  assert.equal(
    homesteadModelFixture.implementation.kind,
    "homestead-foundry-reference",
  );
  assert.equal(
    homesteadModelFixture.implementation.specificStepsSeparated,
    true,
  );
  assert.ok(
    homesteadModelFixture.portability.alternatives.some(
      (entry) => entry.adapter === "generic-openai-compatible-runtime",
    ),
  );
  assert.equal(homesteadModelFixture.releaseStatus, "draft");
  assert.deepEqual(homesteadModelFixture.approvals, []);
});

test("portable agent runtime contract covers identity, tools, state, telemetry, evaluation, and recovery", () => {
  assert.equal(
    validateAgent(homesteadAgentFixture),
    true,
    JSON.stringify(validateAgent.errors),
  );
  assert.equal(
    homesteadAgentFixture.implementation.kind,
    "homestead-foundry-reference",
  );
  assert.deepEqual(homesteadAgentFixture.outputs.terminalStatuses, [
    "succeeded",
    "failed",
    "unknown",
  ]);
  assert.deepEqual(homesteadAgentFixture.tools.resultStates, [
    "success",
    "failure",
    "unknown",
  ]);
  for (const field of [
    "identityAndAccess",
    "tools",
    "state",
    "telemetry",
    "evaluation",
    "recovery",
  ]) {
    assert.ok(homesteadAgentFixture[field], `missing ${field}`);
  }
  const kinds = new Set(
    homesteadAgentFixture.evidence.map((entry) => entry.kind),
  );
  assert.deepEqual(
    kinds,
    new Set([
      "input-output",
      "identity",
      "tools",
      "state",
      "telemetry",
      "evaluation",
      "recovery",
    ]),
  );
  assert.equal(homesteadAgentFixture.releaseStatus, "draft");
  assert.deepEqual(homesteadAgentFixture.approvals, []);
});

test("agent lab fails closed on missing unknown outcomes and unsafe evidence paths", () => {
  const invalid = structuredClone(homesteadAgentFixture);
  invalid.outputs.terminalStatuses = ["succeeded", "failed"];
  invalid.tools.resultStates = ["success", "failure"];
  invalid.state.checkpointPath = "../private/checkpoint.json";
  assert.equal(validateAgent(invalid), false);
  assert.ok(
    validateAgent.errors?.some((error) =>
      error.instancePath.endsWith("/terminalStatuses"),
    ),
  );
  assert.ok(
    validateAgent.errors?.some((error) =>
      error.instancePath.endsWith("/resultStates"),
    ),
  );
  assert.ok(
    validateAgent.errors?.some((error) =>
      error.instancePath.endsWith("/checkpointPath"),
    ),
  );
});

test("reference labs separate portable concepts from optional adapter steps", () => {
  assert.doesNotMatch(portableModelContract, /Homestead Foundry/i);
  assert.doesNotMatch(portableAgentContract, /Homestead Foundry/i);
  assert.match(homesteadModelAdapter, /OpenAI-compatible v1/i);
  assert.match(homesteadModelAdapter, /does not promise separate portable health/i);
  assert.match(homesteadAgentAdapter, /model endpoint behind a portable agent/i);
  assert.match(homesteadAgentAdapter, /does not create a Foundry prompt agent/i);
  assert.match(referenceLabReadme, /not\s+live-execution evidence/i);
  assert.match(referenceLabReadme, /Homestead Foundry is optional/i);
});

test("public reference lab packages contain no private operational material", () => {
  const serialized = [
    JSON.stringify(homesteadModelFixture),
    JSON.stringify(homesteadAgentFixture),
    referenceLabReadme,
    portableModelContract,
    homesteadModelAdapter,
    portableAgentContract,
    homesteadAgentAdapter,
  ].join("\n");
  assert.doesNotMatch(
    serialized,
    /dev\.azure\.com|tenant[_ -]?id|subscription[_ -]?id|account[_ -]?id|client[_ -]?secret|bearer\s+[a-z0-9._-]+|kristopher|icloud\.com/i,
  );
  assert.match(serialized, /illustrative evidence digests/i);
});
