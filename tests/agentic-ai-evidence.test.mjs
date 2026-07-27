import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const root = new URL("../", import.meta.url);
const json = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));

const matrix = await json(
  "content/reference/agentic-ai-product-evidence.json",
);
const schema = await json(
  "schemas/agentic-ai-product-evidence.schema.json",
);
const registry = await json("content/source-registry.json");
const method = await readFile(
  new URL("docs/agentic-ai-evidence-method.md", root),
  "utf8",
);

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);
const daysBetween = (start, end) =>
  Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86_400_000,
  );

test("publishes a schema-valid documentation-backed classification matrix", () => {
  assert.equal(validate(matrix), true, JSON.stringify(validate.errors));
  assert.equal(matrix.evidencePolicy.documentationOnly, true);
  assert.equal(matrix.evidencePolicy.unitOfClassification, "version-scoped-product-experience");
  assert.deepEqual(
    new Set(matrix.evidencePolicy.allowedEvidenceKinds),
    new Set(["documented", "tested", "inference", "unknown"]),
  );
  assert.ok(daysBetween(matrix.asOf, matrix.reviewBy) <= 90);
  assert.ok(daysBetween(matrix.asOf, matrix.reviewBy) > 0);
});

test("defines every required observable-behavior class without category collapse", () => {
  const expected = [
    "model",
    "chatbot",
    "assistant",
    "copilot",
    "deterministic-workflow",
    "agent",
    "agentic-system",
    "multi-agent-system",
  ];
  assert.deepEqual(
    matrix.taxonomy.map((entry) => entry.id),
    expected,
  );
  assert.equal(new Set(matrix.taxonomy.map((entry) => entry.id)).size, 8);
  const model = matrix.taxonomy.find((entry) => entry.id === "model");
  const agent = matrix.taxonomy.find((entry) => entry.id === "agent");
  const multi = matrix.taxonomy.find(
    (entry) => entry.id === "multi-agent-system",
  );
  assert.match(model.boundary, /surrounding system/i);
  assert.ok(agent.requiredSignals.includes("model-directed-next-step"));
  assert.ok(agent.requiredSignals.includes("feedback-loop"));
  assert.ok(multi.requiredSignals.includes("handoff"));
  for (const entry of matrix.taxonomy) {
    assert.equal(
      new Set(entry.requiredSignals).size,
      entry.requiredSignals.length,
    );
  }
});

test("covers every required provider family with scoped and refreshable cases", () => {
  const expectedFamilies = [
    "anthropic",
    "openai",
    "microsoft",
    "google",
    "xai",
    "moonshot-kimi",
    "deepseek",
    "open-weight",
  ];
  assert.deepEqual(
    new Set(matrix.cases.map((entry) => entry.providerFamily)),
    new Set(expectedFamilies),
  );
  assert.equal(
    new Set(matrix.cases.map((entry) => entry.id)).size,
    matrix.cases.length,
  );
  for (const entry of matrix.cases) {
    assert.equal(entry.observedAt, matrix.asOf);
    assert.ok(daysBetween(entry.observedAt, entry.reviewBy) <= 90);
    assert.ok(daysBetween(entry.observedAt, entry.reviewBy) > 0);
    assert.ok(entry.boundaryNotes.length >= 2);
    assert.ok(entry.unknowns.length >= 1);
    assert.doesNotMatch(entry.conclusion, /\b(?:all|every)\s+\w+\s+(?:is|are)\s+agentic\b/i);
  }
});

test("preserves model versus agent-system boundaries inside provider families", () => {
  const byId = new Map(matrix.cases.map((entry) => [entry.id, entry]));
  const pairs = [
    ["anthropic-claude-api-model", "anthropic-claude-code"],
    ["openai-gpt-api-model", "openai-codex"],
    ["microsoft-mai-image-model", "microsoft-foundry-agent-service"],
    ["google-gemini-api-model", "google-adk-agent"],
    ["moonshot-kimi-api-model", "moonshot-kimi-client-agent-loop"],
    ["open-weight-model-alone", "open-weight-smolagents-system"],
  ];
  for (const [modelId, systemId] of pairs) {
    assert.equal(byId.get(modelId).conclusionClass, "model");
    assert.equal(byId.get(systemId).conclusionClass, "agentic-system");
    assert.equal(
      byId.get(modelId).providerFamily,
      byId.get(systemId).providerFamily,
    );
  }
  assert.equal(byId.get("xai-grok-assistant").conclusionClass, "assistant");
  assert.equal(byId.get("xai-grok-assistant").conclusionStatus, "qualified");
  assert.equal(
    byId.get("deepseek-api-tool-calls").conclusionClass,
    "model",
  );
});

test("keeps documentation claims distinct from testing and inference", () => {
  const claims = matrix.cases.flatMap((entry) => entry.claims);
  assert.ok(claims.some((entry) => entry.kind === "documented"));
  assert.ok(claims.some((entry) => entry.kind === "inference"));
  assert.equal(claims.some((entry) => entry.kind === "tested"), false);
  assert.match(matrix.scope, /documentation-backed snapshot/i);
  assert.match(method, /documentation-only and makes no tested claims/i);
  assert.match(method, /provider logo or model\s+family/i);
  assert.match(method, /model that emits a tool-call proposal is still a model/i);
});

test("maps every claim to unique current primary sources in the source registry", () => {
  const sourceIds = new Set(matrix.sourceIndex.map((entry) => entry.id));
  assert.equal(sourceIds.size, matrix.sourceIndex.length);
  for (const source of matrix.sourceIndex) {
    assert.ok(daysBetween(source.verifiedAt, source.reviewBy) <= 90);
    assert.ok(daysBetween(source.verifiedAt, source.reviewBy) > 0);
    const registered = registry.sources.find(
      (entry) =>
        source.url.startsWith(entry.urlPrefix) &&
        source.publisher === entry.publisher,
    );
    assert.ok(
      registered,
      `${source.id} must match a primary source-registry publisher and prefix`,
    );
    assert.equal(registered.trustTier, "primary");
  }
  for (const productCase of matrix.cases) {
    for (const claim of productCase.claims) {
      assert.ok(claim.sourceIds.length >= 1);
      for (const sourceId of claim.sourceIds) {
        assert.ok(
          sourceIds.has(sourceId),
          `${productCase.id}/${claim.id} references ${sourceId}`,
        );
      }
    }
  }
});

test("contains no private operational material or hidden publication authority", () => {
  const serialized = [JSON.stringify(matrix), JSON.stringify(schema), method].join(
    "\n",
  );
  assert.doesNotMatch(
    serialized,
    /dev\.azure\.com|project42dev-ops|tenant[_ -]?id|subscription[_ -]?id|account[_ -]?id|client[_ -]?secret|bearer\s+[a-z0-9._-]+|kristopher|icloud\.com/i,
  );
  assert.match(method, /No model or automated maintenance process can approve/i);
  assert.match(method, /human editorial, subject-matter, accessibility, safety/i);
});
