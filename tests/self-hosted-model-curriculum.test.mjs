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
    "deployment-shape-and-operating-model",
    "model-identity-license-and-provenance",
    "model-artifact-integrity",
    "hardware-runtime-and-capacity-planning",
    "serving-api-and-compatibility-contracts",
    "endpoint-identity-network-and-secrets",
    "evaluate-the-exact-serving-build",
    "observability-cost-and-performance",
    "scaling-failure-and-capacity-controls",
    "model-update-and-rollback-lifecycle",
    "model-incident-response-and-recovery",
    "self-hosted-model-operations-capstone",
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
  const deployment = modules.get("deployment-shape-and-operating-model");
  const capacity = modules.get("hardware-runtime-and-capacity-planning");
  const serving = modules.get("serving-api-and-compatibility-contracts");
  const security = modules.get("endpoint-identity-network-and-secrets");
  const evaluation = modules.get("evaluate-the-exact-serving-build");
  const observability = modules.get("observability-cost-and-performance");
  const scaling = modules.get("scaling-failure-and-capacity-controls");
  const lifecycle = modules.get("model-update-and-rollback-lifecycle");
  const incident = modules.get("model-incident-response-and-recovery");
  const capstone = modules.get("self-hosted-model-operations-capstone");
  assert.ok(identity);
  assert.ok(integrity);
  assert.ok(deployment);
  assert.ok(capacity);
  assert.ok(serving);
  assert.ok(security);
  assert.ok(evaluation);
  assert.ok(observability);
  assert.ok(scaling);
  assert.ok(lifecycle);
  assert.ok(incident);
  assert.ok(capstone);
  assert.ok(deployment.prerequisites.includes("ai-foundations-capstone"));
  assert.ok(
    identity.prerequisites.includes("deployment-shape-and-operating-model"),
  );
  assert.ok(
    integrity.prerequisites.includes("model-identity-license-and-provenance"),
  );
  assert.ok(
    capacity.prerequisites.includes("model-artifact-integrity"),
  );
  assert.ok(
    serving.prerequisites.includes("hardware-runtime-and-capacity-planning"),
  );
  assert.ok(
    security.prerequisites.includes("serving-api-and-compatibility-contracts"),
  );
  assert.ok(
    evaluation.prerequisites.includes("endpoint-identity-network-and-secrets"),
  );
  assert.ok(
    observability.prerequisites.includes("evaluate-the-exact-serving-build"),
  );
  assert.ok(
    scaling.prerequisites.includes("observability-cost-and-performance"),
  );
  assert.ok(
    lifecycle.prerequisites.includes("scaling-failure-and-capacity-controls"),
  );
  assert.ok(
    incident.prerequisites.includes("model-update-and-rollback-lifecycle"),
  );
  assert.ok(
    capstone.prerequisites.includes("model-incident-response-and-recovery"),
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

  const lifecycleText = JSON.stringify(lifecycle);
  assert.match(lifecycleText, /complete serving unit/i);
  assert.match(lifecycleText, /known-good/i);
  assert.match(lifecycleText, /human approval/i);
  assert.match(lifecycleText, /rollback/i);

  const incidentText = JSON.stringify(incident);
  assert.match(incidentText, /contain/i);
  assert.match(incidentText, /reconcile/i);
  assert.match(incidentText, /recovery objective/i);
  assert.match(incidentText, /confirmed facts/i);

  assert.ok(capstone.capstone);
  assert.equal(capstone.capstone.requiredArtifacts.length, 8);
  assert.equal(capstone.capstone.requiresCriterionEvidence, true);
  assert.equal(
    capstone.capstone.rubric.criteria.reduce(
      (total, criterion) => total + criterion.maxPoints,
      0,
    ),
    100,
  );
  const capstoneText = JSON.stringify(capstone);
  for (const requiredEvidence of [
    "artifact",
    "license",
    "provenance",
    "endpoint",
    "security",
    "evaluation",
    "load",
    "capacity",
    "telemetry",
    "cost",
    "update",
    "rollback",
    "incident",
    "recovery",
    "approval",
  ]) {
    assert.match(capstoneText, new RegExp(requiredEvidence, "i"));
  }
});
