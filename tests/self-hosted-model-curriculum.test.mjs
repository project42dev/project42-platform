import assert from "node:assert/strict";
import test from "node:test";
import { starterCatalog, validateCatalog } from "../dist/index.js";

const path = starterCatalog.paths.find(
  (candidate) => candidate.id === "self-hosted-model-operations",
);
const modules = new Map(
  starterCatalog.modules.map((module) => [module.id, module]),
);

test("publishes the first source-backed self-hosted model operations unit", () => {
  assert.ok(path);
  assert.equal(path.level, "advanced");
  assert.deepEqual(path.moduleIds, [
    "model-identity-license-and-provenance",
    "model-artifact-integrity",
  ]);
  assert.deepEqual(validateCatalog(starterCatalog), { valid: true, errors: [] });

  for (const moduleId of path.moduleIds) {
    const module = modules.get(moduleId);
    assert.ok(module, `missing ${moduleId}`);
    assert.deepEqual(module.providers, ["provider-neutral"]);
    assert.ok(module.objectives.length >= 4);
    assert.ok(module.sections.length >= 5);
    assert.ok(module.activity?.evidence.length >= 3);
    assert.ok(module.instructorScript?.cues.length >= 8);
    assert.ok(module.instructorScript?.transcript?.length >= 700);
    assert.ok(module.instructorScript?.captions?.length >= 6);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    assert.ok(module.knowledgeCheck.questions.length >= 6);
    assert.ok(
      new Set(
        module.knowledgeCheck.questions.map((question) => question.answerIndex),
      ).size >= 4,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4);
    assert.ok(
      module.sources.every((source) => source.lastVerified === "2026-07-27"),
    );
  }
});

test("self-hosted model unit preserves prerequisites and evidence boundaries", () => {
  const identity = modules.get("model-identity-license-and-provenance");
  const integrity = modules.get("model-artifact-integrity");
  assert.ok(identity);
  assert.ok(integrity);
  assert.ok(identity.prerequisites.includes("ai-foundations-capstone"));
  assert.ok(
    integrity.prerequisites.includes("model-identity-license-and-provenance"),
  );

  const identityText = JSON.stringify(identity);
  assert.match(identityText, /open-weight/i);
  assert.match(identityText, /Open Source AI Definition/);
  assert.match(identityText, /authorized legal or policy reviewer/i);
  assert.match(identityText, /immutable revision/i);

  const integrityText = JSON.stringify(integrity);
  assert.match(integrityText, /quarantine/i);
  assert.match(integrityText, /digest/i);
  assert.match(integrityText, /signature/i);
  assert.match(integrityText, /provenance/i);
  assert.match(integrityText, /fail closed/i);
  assert.match(integrityText, /last verified bundle/i);
  assert.doesNotMatch(
    integrityText,
    /curl\s+[^|]+\|\s*(?:sh|bash)|trust_remote_code\s*[:=]\s*true/i,
  );
});
