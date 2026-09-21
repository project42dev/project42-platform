import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadCatalog } from "../scripts/load-catalog.mjs";

const root = new URL("../", import.meta.url);
const catalog = await loadCatalog(fileURLToPath(root));
const contract = JSON.parse(
  await readFile(
    new URL(
      "../content/training/agentic-ai-literacy/delivery-contract.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const modules = new Map(catalog.modules.map((entry) => [entry.id, entry]));
const path = catalog.paths.find((entry) => entry.id === "agentic-ai-literacy");
const requiredSections = {
  "agentic-ai-layers": ["layers-model", "layers-product-terms", "layers-evidence", "layers-unknown"],
  "agentic-control-flow": ["control-one-call", "control-workflow", "control-agent", "control-multi"],
  "agentic-tools-state-authority": ["authority-tools", "authority-state", "authority-human", "authority-recovery"],
  "agentic-product-comparison": ["comparison-unit", "comparison-evidence", "comparison-families", "comparison-freshness"],
  "agentic-classification-capstone": ["capstone-scope", "capstone-evidence", "capstone-compare", "capstone-review"],
};
const questionPrefixes = {
  "agentic-ai-layers": "q-agentic-layers",
  "agentic-control-flow": "q-agentic-control",
  "agentic-tools-state-authority": "q-agentic-authority",
  "agentic-product-comparison": "q-agentic-comparison",
  "agentic-classification-capstone": "q-agentic-capstone",
};

test("publishes the complete five-stage agentic-AI learning path", () => {
  assert.ok(path);
  assert.deepEqual(path.moduleIds, [
    "agentic-ai-layers",
    "agentic-control-flow",
    "agentic-tools-state-authority",
    "agentic-product-comparison",
    "agentic-classification-capstone",
  ]);
  assert.equal(path.moduleIds.length, contract.learnSequence.length);
  assert.deepEqual(
    path.moduleIds,
    contract.learnSequence.map((stage) => stage.moduleId),
  );
  assert.equal(path.badge.id, "badge-agentic-ai-literacy");
});

test("connects every module through one prerequisite chain", () => {
  for (const [index, id] of path.moduleIds.entries()) {
    const module = modules.get(id);
    assert.ok(module, `${id} must exist`);
    const sectionIds = new Set(module.sections.map((section) => section.id));
    assert.equal(sectionIds.size, module.sections.length, `${id} section IDs must be unique`);
    for (const sectionId of requiredSections[id]) {
      assert.ok(sectionIds.has(sectionId), `${id} must retain ${sectionId}`);
    }
    for (const section of module.sections) {
      assert.ok(section.paragraphs.some((text) => text.trim()), `${section.id} needs teaching text`);
      assert.ok(
        module.instructorScript.cues.some((cue) => cue.kind === "narration" && cue.sectionId === section.id),
        `${section.id} needs instructor narration`,
      );
    }
    assert.ok(module.objectives.length >= 4);
    assert.ok(module.activity?.instructions.length >= 4);
    assert.ok(module.activity?.evidence.length >= 2);
    assert.equal(module.knowledgeCheck.passPercent, 80);
    const questions = module.knowledgeCheck.questions;
    assert.ok(questions.length >= 5, `${id} must retain at least five assessment questions`);
    assert.equal(new Set(questions.map((question) => question.id)).size, questions.length);
    for (let number = 1; number <= 5; number += 1) {
      assert.ok(questions.some((question) => question.id === `${questionPrefixes[id]}-${number}`));
    }
    for (const question of questions) {
      assert.ok(question.prompt.trim() && question.explanation.trim());
      assert.ok(Number.isInteger(question.answerIndex));
      assert.ok(question.answerIndex >= 0 && question.answerIndex < question.choices.length);
    }
    assert.ok(new Set(module.knowledgeCheck.questions.map((q) => q.answerIndex)).size >= 2);
    assert.deepEqual(
      module.prerequisites,
      [index === 0 ? "what-ai-does" : path.moduleIds[index - 1]],
    );
  }
});

test("teaches exact experience, control, authority, comparison, and mastery", () => {
  const serialized = path.moduleIds
    .map((id) => JSON.stringify(modules.get(id)))
    .join("\n");
  for (const phrase of [
    "exact",
    "model-directed",
    "human authority",
    "documented",
    "tested",
    "inference",
    "unknown",
    "multi-agent",
  ]) {
    assert.match(serialized, new RegExp(phrase, "i"));
  }
  assert.doesNotMatch(serialized, /\b(?:all|every)\s+\w+\s+(?:is|are)\s+agentic\b/i);
});

test("requires applied capstone evidence and critical human review", () => {
  const capstone = modules.get("agentic-classification-capstone").capstone;
  assert.deepEqual(capstone.requiredArtifacts, [
    "experience-layer-and-scope-map.md",
    "control-flow-responsibility-trace.md",
    "claim-evidence-and-freshness-ledger.json",
    "classification-comparison-and-disposition.md",
  ]);
  assert.equal(capstone.requiresCriterionEvidence, true);
  assert.equal(capstone.rubric.passPercent, 80);
  assert.equal(
    capstone.rubric.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0),
    100,
  );
  assert.ok(
    capstone.rubric.criteria.some((criterion) =>
      /critical classification safety/i.test(criterion.title),
    ),
  );
  assert.ok(
    capstone.rubric.criteria.some((criterion) =>
      /human disposition/i.test(criterion.title),
    ),
  );
});

test("uses dated primary sources and contains no private operations material", () => {
  const serialized = path.moduleIds
    .map((id) => JSON.stringify(modules.get(id)))
    .join("\n");
  for (const id of path.moduleIds) {
    const module = modules.get(id);
    assert.ok(module.sources.length >= 3);
    assert.ok(
      module.sources.every(
        (source) =>
          source.url.startsWith("https://") &&
          /^\d{4}-\d{2}-\d{2}$/.test(source.lastVerified),
      ),
    );
  }
  assert.doesNotMatch(
    serialized,
    /dev\.azure\.com|project42dev-ops|tenant[_ -]?id|subscription[_ -]?id|account[_ -]?id|client[_ -]?secret|kristopher|icloud\.com/i,
  );
});
