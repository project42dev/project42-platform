import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const schema = JSON.parse(
  await readFile(
    new URL(
      "../schemas/training/learning-path-contract.schema.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const contract = JSON.parse(
  await readFile(
    new URL(
      "../content/training/reliable-agent-workflows/path-contract.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const catalog = JSON.parse(
  await readFile(new URL("../content/catalog.json", import.meta.url), "utf8"),
);
const documentation = await readFile(
  new URL(
    "../docs/training/reliable-agent-workflows-contract.md",
    import.meta.url,
  ),
  "utf8",
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

test("reliable agent path contract validates and matches the catalog sequence", () => {
  assert.equal(validate(contract), true, JSON.stringify(validate.errors));
  const path = catalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  assert.ok(path);
  assert.deepEqual(
    contract.moduleSequence.map((entry) => entry.moduleId),
    path.moduleIds,
  );
  assert.equal(contract.moduleSequence.length, 12);
});

test("every module is prerequisite-connected and leaves mastery evidence", () => {
  for (const [index, entry] of contract.moduleSequence.entries()) {
    assert.ok(entry.competencies.length >= 2);
    assert.ok(entry.requiredEvidence.length >= 1);
    if (index === 0) {
      assert.deepEqual(entry.dependsOn, ["agents-and-guardrails"]);
    } else {
      assert.deepEqual(entry.dependsOn, [
        contract.moduleSequence[index - 1].moduleId,
      ]);
    }
  }
});

test("trusted system boundaries cover the complete agent operating lifecycle", () => {
  assert.deepEqual(Object.keys(contract.systemBoundaries), [
    "identity",
    "tools",
    "state",
    "memory",
    "orchestration",
    "evaluation",
    "observability",
    "recovery",
    "humanAuthority",
  ]);
  for (const boundary of Object.values(contract.systemBoundaries)) {
    assert.ok(boundary.owner.length > 20);
    assert.ok(boundary.learnerMustDemonstrate.length > 20);
    assert.ok(boundary.failureEvidence.length > 20);
  }
});

test("single-agent and multi-agent claims require equivalent measured cases", () => {
  assert.deepEqual(contract.comparison.designs, [
    "deterministic-workflow",
    "single-agent",
    "multi-agent",
  ]);
  assert.equal(contract.comparison.sameCasesRequired, true);
  for (const measure of [
    "outcome-quality",
    "critical-safety",
    "latency",
    "cost",
    "coordination-overhead",
    "recovery",
  ]) {
    assert.ok(contract.comparison.measures.includes(measure));
  }
  assert.match(contract.comparison.releaseRule, /least complex design/i);
});

test("the lab contract fails closed on unsafe outcome and adversarial omissions", () => {
  const invalid = structuredClone(contract);
  invalid.lab.terminalOutcomes = ["succeeded", "failed"];
  invalid.lab.adversarialCases = ["prompt-injected-observation"];
  assert.equal(validate(invalid), false);
  assert.ok(
    validate.errors?.some((error) =>
      error.instancePath.endsWith("/terminalOutcomes"),
    ),
  );
  assert.ok(
    validate.errors?.some((error) =>
      error.instancePath.endsWith("/adversarialCases"),
    ),
  );
});

test("mastery, accessibility, freshness, portability, and publication fail closed", () => {
  assert.ok(contract.mastery.requiredArtifacts.length >= 8);
  assert.equal(contract.mastery.knowledgeScoreMinimum, 0.8);
  assert.equal(contract.mastery.criticalCriteriaMustPass, true);
  assert.equal(contract.mastery.humanReviewRequired, true);
  assert.ok(Object.values(contract.accessibility).every(Boolean));
  assert.equal(contract.sourcePolicy.primarySourcesRequired, true);
  assert.ok(contract.sourcePolicy.reviewCadenceDays <= 90);
  assert.equal(contract.portability.providerNeutral, true);
  assert.equal(contract.portability.runtimeNeutral, true);
  assert.equal(contract.portability.adapterSpecificStepsSeparated, true);
  assert.equal(contract.publication.releaseStatus, "draft");
  assert.equal(contract.publication.automaticPublication, false);
  assert.deepEqual(contract.publication.requiredApprovals, [
    "editorial",
    "subject-matter",
    "accessibility",
    "safety",
    "publication",
  ]);
});

test("public contract and documentation contain no private operational material", () => {
  const serialized = `${JSON.stringify(contract)}\n${documentation}`;
  assert.doesNotMatch(
    serialized,
    /dev\.azure\.com|tenant[_ -]?id|subscription[_ -]?id|account[_ -]?id|client[_ -]?secret|bearer\s|kristopher|icloud\.com/i,
  );
  assert.match(documentation, /model may propose actions/i);
  assert.match(documentation, /does not authenticate a\s+principal/i);
  assert.match(documentation, /forbids automatic publication/i);
});
