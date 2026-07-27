import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const root = new URL("../", import.meta.url);
const json = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const schema = await json(
  "schemas/training/agentic-ai-literacy-contract.schema.json",
);
const contract = await json(
  "content/training/agentic-ai-literacy/delivery-contract.json",
);
const matrix = await json(
  "content/reference/agentic-ai-product-evidence.json",
);
const documentation = await readFile(
  new URL("docs/training/agentic-ai-literacy-contract.md", root),
  "utf8",
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

test("publishes a schema-valid beginner-to-advanced delivery contract", () => {
  assert.equal(validate(contract), true, JSON.stringify(validate.errors));
  assert.deepEqual(contract.audiences, [
    "beginner",
    "practitioner",
    "advanced",
  ]);
  assert.deepEqual(
    contract.learnSequence.map((stage) => stage.order),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    contract.learnSequence.map((stage) => stage.audienceFloor),
    ["beginner", "beginner", "practitioner", "practitioner", "advanced"],
  );
});

test("uses the evidence matrix taxonomy and provider families without drift", () => {
  assert.equal(
    contract.evidenceMatrix,
    "content/reference/agentic-ai-product-evidence.json",
  );
  assert.deepEqual(
    contract.taxonomyClassIds,
    matrix.taxonomy.map((entry) => entry.id),
  );
  assert.deepEqual(
    new Set(contract.providerCaseFamilies),
    new Set(matrix.cases.map((entry) => entry.providerFamily)),
  );
  assert.equal(contract.taxonomyClassIds.length, 8);
  assert.equal(contract.providerCaseFamilies.length, 8);
});

test("sequences observable behavior before provider comparison and system claims", () => {
  const stages = new Map(
    contract.learnSequence.map((stage) => [stage.id, stage]),
  );
  assert.ok(stages.get("name-the-layers").requiredClassIds.includes("model"));
  assert.ok(
    stages
      .get("classify-control-flow")
      .requiredClassIds.includes("deterministic-workflow"),
  );
  assert.match(
    stages.get("locate-tools-state-and-authority").outcome,
    /executes actions.*durable state.*accountable/i,
  );
  assert.match(
    stages.get("compare-product-experiences").outcome,
    /version-scoped experiences/i,
  );
  assert.ok(
    stages
      .get("justify-system-classification")
      .requiredClassIds.includes("multi-agent-system"),
  );
});

test("connects Field Guide assets to valid Learn stages and one evidence source", () => {
  const stageIds = new Set(contract.learnSequence.map((stage) => stage.id));
  const assetTypes = new Set(
    contract.fieldGuideAssets.map((asset) => asset.type),
  );
  for (const type of [
    "decision-card",
    "comparison-table",
    "case-study",
    "classification-checklist",
    "glossary",
  ]) {
    assert.ok(assetTypes.has(type));
  }
  for (const asset of contract.fieldGuideAssets) {
    assert.ok(asset.learnStageIds.every((id) => stageIds.has(id)));
  }
  assert.ok(Object.values(contract.crossSurfaceRules).every(Boolean));
});

test("fails closed on missing taxonomy, critical-error, or publication controls", () => {
  for (const mutate of [
    (value) => value.taxonomyClassIds.pop(),
    (value) => value.mastery.criticalErrors.splice(0, 4),
    (value) => {
      value.publication.automaticPublication = true;
    },
    (value) => {
      value.freshness.staleCasesBlockPublication = false;
    },
  ]) {
    const invalid = structuredClone(contract);
    mutate(invalid);
    assert.equal(validate(invalid), false);
  }
});

test("requires scored, corrective, retained, and human-reviewed mastery evidence", () => {
  assert.ok(contract.assessment.minimumFormativeChecks >= 5);
  assert.ok(contract.assessment.minimumProductCases >= 8);
  assert.equal(contract.assessment.correctiveFeedbackRequired, true);
  assert.equal(contract.assessment.reattemptSupported, true);
  assert.equal(contract.assessment.attemptHistoryRetained, true);
  assert.equal(contract.mastery.knowledgeScoreMinimum, 0.8);
  assert.equal(contract.mastery.criticalErrorsMustPass, true);
  assert.equal(contract.mastery.humanReviewRequired, true);
  assert.ok(contract.mastery.requiredArtifacts.length >= 4);
});

test("requires complete accessible instructor assets independent of the player", () => {
  assert.ok(Object.values(contract.accessibility).every(Boolean));
  assert.match(documentation, /complete narration script/i);
  assert.match(documentation, /non-color\s+classification cues/i);
  assert.match(documentation, /deferred virtual-instructor player runtime/i);
});

test("preserves evidence labels, freshness, and human publication authority", () => {
  assert.deepEqual(contract.freshness.evidenceKinds, [
    "documented",
    "tested",
    "inference",
    "unknown",
  ]);
  assert.ok(contract.freshness.maximumReviewDays <= 90);
  assert.equal(contract.freshness.testedEvidenceSeparate, true);
  assert.equal(contract.publication.automaticPublication, false);
  assert.deepEqual(contract.publication.requiredApprovals, [
    "editorial",
    "subject-matter",
    "accessibility",
    "safety",
    "publication",
  ]);
  assert.match(documentation, /No model, agent, provider/i);
});

test("contains no private operational material", () => {
  const serialized = `${JSON.stringify(contract)}\n${JSON.stringify(schema)}\n${documentation}`;
  assert.doesNotMatch(
    serialized,
    /dev\.azure\.com|project42dev-ops|tenant[_ -]?id|subscription[_ -]?id|account[_ -]?id|client[_ -]?secret|bearer\s+[a-z0-9._-]+|kristopher|icloud\.com/i,
  );
});
