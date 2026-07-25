import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  buildAssessmentHistory,
  buildCapstoneHistory,
  buildPortableLearnerRecord,
  buildTranscriptCsv,
  buildTranscript,
  createEmptyProgress,
  recordAssessmentAttempt,
  recordCapstoneSubmission,
  recordModuleVisit,
  restorePortableLearnerRecord,
  scoreKnowledgeCheck,
  starterCatalog,
  validateCatalog,
  validatePortableLearnerRecord,
} from "../dist/index.js";

test("starter catalog is valid", () => {
  assert.deepEqual(validateCatalog(starterCatalog), { valid: true, errors: [] });
  assert.equal(starterCatalog.contentVersion, "0.21.0");
  assert.equal(starterCatalog.paths[0].moduleIds.length, 16);
  const referencedModuleIds = new Set(
    starterCatalog.paths.flatMap((path) => path.moduleIds),
  );
  assert.equal(starterCatalog.modules.length, referencedModuleIds.size);
});

test("AI Foundations preserves its prerequisite chain and varied answer positions", () => {
  const path = starterCatalog.paths.find((candidate) => candidate.id === "ai-foundations");
  assert.ok(path);
  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );

  for (let index = 1; index < path.moduleIds.length; index += 1) {
    const module = modules.get(path.moduleIds[index]);
    assert.ok(module);
    assert.ok(
      module.prerequisites.includes(path.moduleIds[index - 1]),
      `${module.id} must require ${path.moduleIds[index - 1]}`,
    );
  }

  for (const moduleId of [
    "prompt-anatomy-and-success-criteria",
    "context-and-evidence-construction",
    "examples-and-output-contracts",
    "verification-and-iterative-improvement",
    "research-with-evidence",
    "writing-and-transformation-workflow",
    "coding-and-analysis-workflow",
    "safe-tool-use-workflow",
    "ai-foundations-capstone",
  ]) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
  }
});

test("validates capstone contracts and rejects an incomplete rubric", () => {
  const broken = structuredClone(starterCatalog);
  const capstone = broken.modules.find(
    (candidate) => candidate.id === "ai-foundations-capstone",
  );
  assert.ok(capstone?.capstone);
  capstone.capstone.rubric.criteria[0].maxPoints = 19;

  const validation = validateCatalog(broken);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes(
      "Module ai-foundations-capstone capstone rubric must total 100 points",
    ),
  );

  const unrelated = structuredClone(starterCatalog);
  const reliableCapstone = unrelated.modules.find(
    (candidate) => candidate.id === "reliable-agent-capstone",
  );
  assert.ok(reliableCapstone?.capstone?.exemplars);
  reliableCapstone.capstone.exemplars[0].artifacts[0].ref =
    "complete/unrelated-artifact.md";
  const unrelatedValidation = validateCatalog(unrelated);
  assert.equal(unrelatedValidation.valid, false);
  assert.ok(
    unrelatedValidation.errors.includes(
      "Capstone exemplar reliable-capstone-complete-exemplar needs unique, complete required artifacts",
    ),
  );
});

test("publishes the complete agent-loop tool context and memory curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(0, 4), [
    "prepare-agent-work",
    "control-agent-actions",
    "context-engineering",
    "memory-boundaries",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(0, 4).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 4, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 2, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 4);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    if (index > 0) {
      assert.ok(
        module.prerequisites.includes(path.moduleIds[index - 1]),
        `${moduleId} must require ${path.moduleIds[index - 1]}`,
      );
    }
  }
});

test("publishes the Claude orientation and prompting curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "anthropic-claude-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(0, 2), [
    "anthropic-ecosystem-and-interfaces",
    "claude-prompting-in-practice",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(0, 2).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }
});

test("publishes the Claude API tool-use and agent curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "anthropic-claude-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(2, 4), [
    "claude-api-and-sdk-workflows",
    "claude-tools-and-agent-loops",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(2, 4).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? path.moduleIds[1] : path.moduleIds[index + 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }

  const apiModule = modules.get("claude-api-and-sdk-workflows");
  const apiExample = apiModule?.sections
    .flatMap((section) => section.code?.code ?? [])
    .join("\n");
  assert.match(apiExample, /process\.env\.ANTHROPIC_API_KEY/);
  assert.match(apiExample, /process\.env\.ANTHROPIC_MODEL/);
  assert.doesNotMatch(JSON.stringify(apiModule), /sk-ant-/i);
  assert.ok(
    apiModule?.sources.some(
      (source) =>
        source.url === "https://platform.claude.com/docs/en/api/messages/create",
    ),
  );

  const toolsModule = modules.get("claude-tools-and-agent-loops");
  assert.deepEqual(
    toolsModule?.sections.map((section) => section.id),
    [
      "tool-use-is-a-contract",
      "design-narrow-tools",
      "drive-an-explicit-loop",
      "enforce-side-effect-safety",
      "workflow-or-agent",
    ],
  );
  assert.ok(
    toolsModule?.sources.some(
      (source) =>
        source.url ===
        "https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works",
    ),
  );
});

test("publishes and validates the complete seven-module Claude practice path", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "anthropic-claude-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(4), [
    "claude-safety-and-trust-boundaries",
    "claude-evaluation-and-observability",
    "migrating-to-and-from-claude",
  ]);
  assert.equal(path.moduleIds.length, 7);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }

  const migration = modules.get("migrating-to-and-from-claude");
  assert.ok(
    migration?.sources.some((source) =>
      source.url.includes("/about-claude/models/migration-guide"),
    ),
  );
  assert.ok(
    migration?.sources.some((source) =>
      source.url.includes("/about-claude/model-deprecations"),
    ),
  );
});

test("publishes the OpenAI orientation and prompting curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "openai-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(0, 2), [
    "openai-ecosystem-and-interfaces",
    "openai-prompting-in-practice",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(0, 2).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }
});

test("publishes the OpenAI Responses API tool-use and agent curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "openai-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(2, 4), [
    "openai-responses-api-and-sdk-workflows",
    "openai-tools-and-codex-agent-loops",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(2, 4).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? path.moduleIds[1] : path.moduleIds[index + 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }

  const api = modules.get("openai-responses-api-and-sdk-workflows");
  const apiText = JSON.stringify(api);
  assert.match(apiText, /process\.env\.OPENAI_MODEL/);
  assert.doesNotMatch(apiText, /sk-[A-Za-z0-9_-]{8,}/);
  assert.ok(
    api.sources.some((source) =>
      source.url.includes("/api/docs/guides/migrate-to-responses"),
    ),
  );

  const tools = modules.get("openai-tools-and-codex-agent-loops");
  assert.ok(
    tools.sections.some((section) => section.id === "match-calls-results-and-state"),
  );
  assert.ok(
    tools.sections.some((section) => section.id === "bound-codex-and-agent-autonomy"),
  );
  assert.ok(
    tools.sources.some((source) =>
      source.url.includes("/api/docs/guides/function-calling"),
    ),
  );
});

test("publishes and validates the complete seven-module OpenAI practice path", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "openai-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(4), [
    "openai-safety-and-trust-boundaries",
    "openai-evaluation-and-observability",
    "migrating-to-and-from-openai",
  ]);
  assert.equal(path.moduleIds.length, 7);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }

  const safety = modules.get("openai-safety-and-trust-boundaries");
  assert.ok(
    safety.sources.some((source) =>
      source.url.includes("/api/docs/guides/safety-best-practices"),
    ),
  );
  assert.ok(
    safety.sections.some((section) => section.id === "red-team-output-and-trajectories"),
  );

  const evaluation = modules.get("openai-evaluation-and-observability");
  assert.ok(
    evaluation.sources.some((source) =>
      source.url.includes("/api/docs/guides/trace-grading"),
    ),
  );

  const migration = modules.get("migrating-to-and-from-openai");
  assert.ok(
    migration.sources.some((source) =>
      source.url.includes("/api/docs/guides/migrate-to-responses"),
    ),
  );
  assert.ok(
    migration.sources.some((source) =>
      source.url.includes("/api/docs/deprecations"),
    ),
  );
});

test("publishes the Gemini orientation and prompting curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "google-gemini-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(0, 2), [
    "gemini-ecosystem-and-interfaces",
    "gemini-prompting-in-practice",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(0, 2).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.instructions.length >= 4, `${moduleId} needs practice`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
    assert.match(
      JSON.stringify(module.activity),
      /conceptual|fixture|no-cost/i,
      `${moduleId} needs a no-paid-call alternative`,
    );
  }

  const orientation = modules.get("gemini-ecosystem-and-interfaces");
  assert.ok(
    orientation.sources.some((source) =>
      source.url.startsWith("https://support.google.com/gemini/"),
    ),
  );
  assert.ok(
    orientation.sources.some((source) =>
      source.url.includes("/gemini-api/docs/ai-studio-quickstart"),
    ),
  );

  const prompting = modules.get("gemini-prompting-in-practice");
  assert.ok(
    prompting.sources.some((source) =>
      source.url.includes("/gemini-api/docs/prompting-strategies"),
    ),
  );
  assert.ok(
    prompting.sources.some((source) =>
      source.url.includes("/gemini-api/docs/structured-output"),
    ),
  );
});

test("publishes the Gemini API tool-use and agent curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "google-gemini-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(2, 4), [
    "gemini-api-and-sdk-workflows",
    "gemini-tools-and-agent-loops",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(2, 4).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? path.moduleIds[1] : path.moduleIds[index + 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
    assert.match(
      JSON.stringify(module.activity),
      /synthetic|fixture|no-paid-call/i,
      `${moduleId} needs a no-paid-call fixture`,
    );
  }

  const api = modules.get("gemini-api-and-sdk-workflows");
  const apiText = JSON.stringify(api);
  assert.match(apiText, /process\.env\.GEMINI_API_KEY/);
  assert.match(apiText, /process\.env\.GEMINI_MODEL/);
  assert.match(apiText, /SAFETY/);
  assert.match(apiText, /MAX_TOKENS/);
  assert.match(apiText, /RECITATION/);
  assert.doesNotMatch(apiText, /AIza[A-Za-z0-9_-]{20,}/);
  assert.ok(
    api.sources.some((source) =>
      source.url.includes("/gemini-api/docs/troubleshooting"),
    ),
  );

  const tools = modules.get("gemini-tools-and-agent-loops");
  assert.ok(
    tools.sections.some((section) => section.id === "match-calls-results-and-loop-state"),
  );
  assert.ok(
    tools.sources.some((source) =>
      source.url.includes("/gemini-api/docs/function-calling"),
    ),
  );
  assert.ok(
    tools.sources.some((source) => source.url.startsWith("https://google.github.io/adk-docs/")),
  );
});

test("publishes and validates the complete seven-module Gemini practice path", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "google-gemini-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(4), [
    "gemini-safety-and-trust-boundaries",
    "gemini-evaluation-and-observability",
    "migrating-to-and-from-gemini",
  ]);
  assert.equal(path.moduleIds.length, 7);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(module.prerequisites.includes(expectedPrerequisite));
    assert.match(JSON.stringify(module.activity), /synthetic|fixture|no-paid-call/i);
  }

  const safety = modules.get("gemini-safety-and-trust-boundaries");
  assert.ok(safety.sources.some((source) => source.url.includes("/safety-settings")));
  const evaluation = modules.get("gemini-evaluation-and-observability");
  assert.ok(evaluation.sources.some((source) => source.url.includes("/evaluate/")));
  const migration = modules.get("migrating-to-and-from-gemini");
  assert.ok(migration.sources.some((source) => source.url.includes("/deprecations")));
  assert.ok(migration.sources.some((source) => source.url.includes("/libraries")));
});

test("publishes a balanced source-backed provider comparison matrix", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "providers-in-practice",
  );
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === "compare-provider-capabilities",
  );
  assert.ok(path);
  assert.ok(module);
  assert.equal(path.moduleIds[3], module.id);
  assert.ok(module.prerequisites.includes("choose-a-provider"));
  assert.equal(module.sections.length, 5);
  assert.ok(module.activity?.instructions.length >= 5);
  assert.equal(module.activity?.evidence.length, 2);
  assert.equal(module.knowledgeCheck.questions.length, 5);
  assert.equal(module.instructorScript?.schemaVersion, "1.1");
  assert.ok(module.instructorScript?.captions?.length >= 5);
  assert.ok(module.instructorScript?.reducedMotionAlternative);

  const matrix = module.comparisonMatrix;
  assert.ok(matrix);
  assert.equal(matrix.asOf, "2026-07-25");
  assert.deepEqual(
    matrix.dimensions.map((dimension) => dimension.id),
    [
      "provider-interfaces",
      "api-request-response",
      "tool-calling",
      "context-and-state",
      "safety-controls",
      "evaluation",
      "observability",
      "operational-constraints",
    ],
  );

  const declaredSources = new Set(module.sources.map((source) => source.url));
  const statuses = new Set();
  const providerCellCounts = { anthropic: 0, openai: 0, google: 0 };
  for (const dimension of matrix.dimensions) {
    assert.ok(dimension.portableCore);
    for (const provider of ["anthropic", "openai", "google"]) {
      const cell = dimension.providers[provider];
      assert.ok(cell.summary);
      assert.ok(cell.sourceUrls.length >= 1);
      assert.ok(
        cell.sourceUrls.every((sourceUrl) => declaredSources.has(sourceUrl)),
      );
      statuses.add(cell.status);
      providerCellCounts[provider] += 1;
    }
  }
  assert.deepEqual(providerCellCounts, {
    anthropic: 8,
    openai: 8,
    google: 8,
  });
  assert.deepEqual(
    [...statuses].sort(),
    ["changing", "documented", "non-equivalent", "unknown"],
  );
  assert.deepEqual(
    Object.fromEntries(
      ["Anthropic", "OpenAI", "Google"].map((publisher) => [
        publisher,
        module.sources.filter((source) => source.publisher === publisher).length,
      ]),
    ),
    { Anthropic: 7, OpenAI: 7, Google: 7 },
  );
  assert.match(
    JSON.stringify(module.activity),
    /synthetic no-paid-call fixtures/i,
  );
});

test("publishes cross-provider migration planning and cutover runbooks", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "providers-in-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(-2), [
    "plan-cross-provider-migration",
    "execute-cross-provider-cutover",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(-2).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.equal(module.sections.length, 5);
    assert.ok(module.activity?.instructions.length >= 5);
    assert.equal(module.activity?.evidence.length, 2);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 8);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0
        ? "compare-provider-capabilities"
        : "plan-cross-provider-migration";
    assert.ok(module.prerequisites.includes(expectedPrerequisite));
    assert.match(
      JSON.stringify(module.activity),
      /synthetic no-paid-call/i,
    );
  }

  const planning = modules.get("plan-cross-provider-migration");
  const planningText = JSON.stringify(planning);
  const configCode = planning.sections.find(
    (section) => section.id === "build-a-compatibility-map",
  )?.code?.code;
  assert.ok(configCode);
  assert.match(planningText, /process\.env\.ANTHROPIC_API_KEY/);
  assert.match(planningText, /process\.env\.OPENAI_API_KEY/);
  assert.match(planningText, /process\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(configCode, /sk-[A-Za-z0-9_-]{8,}/);
  assert.doesNotMatch(configCode, /AIza[A-Za-z0-9_-]{20,}/);
  assert.ok(
    planning.sources.some((source) => source.url.includes("migration-guide")),
  );
  assert.ok(
    planning.sources.filter((source) => source.url.includes("deprecation")).length >= 3,
  );

  const cutover = modules.get("execute-cross-provider-cutover");
  const cutoverText = JSON.stringify(cutover);
  assert.match(cutoverText, /stable identifiers/i);
  assert.match(cutoverText, /side effects/i);
  assert.match(cutoverText, /residual-risk/i);
  assert.match(cutoverText, /process\.env\.MIGRATION_ROUTE/);
});

test("restores a v0.20 provider learner record after migration modules are appended", () => {
  const priorCatalog = structuredClone(starterCatalog);
  priorCatalog.contentVersion = "0.20.0";
  const addedIds = new Set([
    "plan-cross-provider-migration",
    "execute-cross-provider-cutover",
  ]);
  priorCatalog.modules = priorCatalog.modules.filter(
    (module) => !addedIds.has(module.id),
  );
  const priorPath = priorCatalog.paths.find(
    (candidate) => candidate.id === "providers-in-practice",
  );
  assert.ok(priorPath);
  priorPath.moduleIds = priorPath.moduleIds.filter(
    (moduleId) => !addedIds.has(moduleId),
  );
  assert.deepEqual(validateCatalog(priorCatalog), { valid: true, errors: [] });
  assert.deepEqual(priorPath.moduleIds, [
    "anthropic-in-practice",
    "openai-in-practice",
    "choose-a-provider",
    "compare-provider-capabilities",
  ]);

  const module = priorCatalog.modules.find(
    (candidate) => candidate.id === "compare-provider-capabilities",
  );
  assert.ok(module);
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [
        question.id,
        question.answerIndex,
      ]),
    ),
    module.knowledgeCheck.passPercent,
  );
  const progress = recordAssessmentAttempt(
    createEmptyProgress("Portable provider learner"),
    priorCatalog,
    {
      attemptId: "attempt-provider-comparison-v020",
      pathId: priorPath.id,
      moduleId: module.id,
      completedAt: "2026-07-25T14:30:00.000Z",
      result,
    },
  );
  const record = buildPortableLearnerRecord(
    priorCatalog,
    progress,
    "2026-07-25T14:31:00.000Z",
  );
  const restored = restorePortableLearnerRecord(record, starterCatalog);

  assert.equal(restored.valid, true);
  assert.deepEqual(restored.progress, progress);
  assert.equal(record.catalogVersion, "0.20.0");
  assert.equal(progress.attempts[0].contentVersion, "0.20.0");
});

test("publishes the MCP orchestration and handoff curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(4, 8), [
    "mcp-architecture",
    "mcp-trust-and-security",
    "orchestration-patterns",
    "multi-agent-handoffs",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(4, 8).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 3, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "memory-boundaries" : path.moduleIds[index + 3];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }

  const evaluation = modules.get("agent-evaluation");
  assert.ok(evaluation?.prerequisites.includes("multi-agent-handoffs"));
});

test("publishes the evaluation observability and operations curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(8, 11), [
    "agent-evaluation",
    "agent-observability",
    "review-agent-results",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(8, 11).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "multi-agent-handoffs" : path.moduleIds[index + 7];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }
});

test("publishes a calibrated evidence-mapped reliable-agent capstone", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === "reliable-agent-capstone",
  );
  assert.ok(path);
  assert.ok(module?.capstone);
  assert.equal(path.moduleIds.length, 12);
  assert.equal(path.moduleIds.at(-1), module.id);
  assert.ok(module.prerequisites.includes("review-agent-results"));
  assert.equal(module.sections.length, 6);
  assert.equal(module.knowledgeCheck.questions.length, 5);
  assert.equal(module.instructorScript?.schemaVersion, "1.1");
  assert.equal(module.capstone.requiredArtifacts.length, 8);
  assert.equal(module.capstone.requiresCriterionEvidence, true);
  assert.equal(module.capstone.requiresCalibrationExemplars, true);
  assert.equal(
    module.capstone.rubric.criteria.reduce(
      (total, criterion) => total + criterion.maxPoints,
      0,
    ),
    100,
  );

  const exemplars = new Map(
    module.capstone.exemplars.map((exemplar) => [exemplar.kind, exemplar]),
  );
  assert.equal(exemplars.get("complete")?.expectedScorePercent, 100);
  assert.equal(exemplars.get("complete")?.expectedPassed, true);
  assert.equal(exemplars.get("flawed")?.expectedScorePercent, 31);
  assert.equal(exemplars.get("flawed")?.expectedPassed, false);
});

test("rejects incomplete instructor caption and transcript packages", () => {
  const broken = structuredClone(starterCatalog);
  const module = broken.modules.find(
    (candidate) => candidate.id === "context-engineering",
  );
  assert.ok(module?.instructorScript);
  module.instructorScript.transcript = "Incomplete transcript.";
  module.instructorScript.captions[1].startSeconds =
    module.instructorScript.captions[0].endSeconds - 1;
  module.instructorScript.captions[1].cueId = "missing-cue";
  module.instructorScript.captions[2].text = "Text that differs from its cue.";
  module.instructorScript.reducedMotionAlternative = "";

  const validation = validateCatalog(broken);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes(
      "Module context-engineering instructor script has an invalid caption",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Module context-engineering instructor script needs a reduced-motion alternative",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Module context-engineering caption references missing cue missing-cue",
    ),
  );
  assert.ok(
    validation.errors.some((error) =>
      error.startsWith("Module context-engineering caption text differs from cue"),
    ),
  );
  assert.ok(
    validation.errors.some((error) =>
      error.startsWith("Module context-engineering transcript is missing narration cue"),
    ),
  );
});

test("rejects incomplete or unsourced provider comparison cells", () => {
  const broken = structuredClone(starterCatalog);
  const module = broken.modules.find(
    (candidate) => candidate.id === "compare-provider-capabilities",
  );
  assert.ok(module?.comparisonMatrix);
  module.comparisonMatrix.asOf = "whenever";
  module.comparisonMatrix.dimensions[0].providers.anthropic.sourceUrls = [
    "https://example.com/unsupported",
  ];
  module.comparisonMatrix.dimensions[1].providers.openai.summary = "";

  const validation = validateCatalog(broken);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes(
      "Module compare-provider-capabilities comparison matrix has an invalid asOf date",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Module compare-provider-capabilities comparison dimension provider-interfaces references an undeclared source: https://example.com/unsupported",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Module compare-provider-capabilities comparison dimension api-request-response has an incomplete openai cell",
    ),
  );
});

test("catalog validation catches broken references and unsafe source metadata", () => {
  const broken = structuredClone(starterCatalog);
  broken.paths[0].moduleIds.push("missing-module");
  broken.modules[0].providers = [];
  broken.modules[0].sources[0].url = "http://example.com/source";
  broken.modules[0].sections.push(structuredClone(broken.modules[0].sections[0]));
  broken.modules[0].prerequisites = ["prompt-with-purpose"];
  broken.resources[0].lastVerified = "next Thursday";
  broken.modules[1].prerequisites = ["what-ai-does"];

  const validation = validateCatalog(broken);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes(
      "Path ai-foundations references missing module missing-module",
    ),
  );
  assert.ok(validation.errors.includes("Module what-ai-does has no providers"));
  assert.ok(
    validation.errors.includes(
      "Module what-ai-does source must use HTTPS: http://example.com/source",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Resource ai-glossary has an invalid lastVerified date",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Module what-ai-does has duplicate section id models-predict",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Prerequisite cycle includes module what-ai-does",
    ),
  );
});

test("scores a knowledge check and returns explanations", () => {
  const module = starterCatalog.modules[0];
  const answers = Object.fromEntries(
    module.knowledgeCheck.questions.map((question) => [question.id, question.answerIndex]),
  );
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    answers,
    module.knowledgeCheck.passPercent,
  );

  assert.equal(result.scorePercent, 100);
  assert.equal(result.passed, true);
  assert.equal(result.feedback.length, module.knowledgeCheck.questions.length);
});

test("records attempts idempotently and builds a transcript", () => {
  const path = starterCatalog.paths[0];
  const module = starterCatalog.modules.find((candidate) => candidate.id === path.moduleIds[0]);
  assert.ok(module);
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [question.id, question.answerIndex]),
    ),
  );
  const input = {
    attemptId: "attempt-1",
    pathId: path.id,
    moduleId: module.id,
    completedAt: "2026-07-23T12:00:00.000Z",
    result,
  };
  const once = recordAssessmentAttempt(createEmptyProgress(), starterCatalog, input);
  const twice = recordAssessmentAttempt(once, starterCatalog, input);
  const transcript = buildTranscript(starterCatalog, twice);
  const history = buildAssessmentHistory(starterCatalog, twice);

  assert.equal(twice.attempts.length, 1);
  assert.deepEqual(twice.completedModuleIds, [module.id]);
  assert.equal(transcript[0].completedModules, 1);
  assert.equal(history.length, 1);
  assert.equal(history[0].moduleTitle, module.title);
  assert.equal(history[0].scorePercent, 100);
  assert.equal(history[0].passed, true);
});

test("records a recent module visit without completing the lesson", () => {
  const path = starterCatalog.paths[0];
  const moduleId = path.moduleIds[0];
  const visited = recordModuleVisit(createEmptyProgress(), starterCatalog, {
    pathId: path.id,
    moduleId,
    visitedAt: "2026-07-23T13:00:00.000Z",
  });

  assert.deepEqual(visited.startedPathIds, [path.id]);
  assert.deepEqual(visited.completedModuleIds, []);
  assert.deepEqual(visited.recentModule, {
    pathId: path.id,
    moduleId,
    visitedAt: "2026-07-23T13:00:00.000Z",
  });
  assert.throws(
    () =>
      recordModuleVisit(visited, starterCatalog, {
        pathId: path.id,
        moduleId: "not-in-this-path",
        visitedAt: "2026-07-23T13:01:00.000Z",
      }),
    /does not belong/,
  );
});

test("requires both a passing check and traceable capstone evidence", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "ai-foundations",
  );
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === "ai-foundations-capstone",
  );
  assert.ok(path);
  assert.ok(module?.capstone);
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [
        question.id,
        question.answerIndex,
      ]),
    ),
    module.knowledgeCheck.passPercent,
  );
  const afterCheck = recordAssessmentAttempt(
    createEmptyProgress("Capstone learner"),
    starterCatalog,
    {
      attemptId: "attempt-capstone-check",
      pathId: path.id,
      moduleId: module.id,
      completedAt: "2026-07-25T12:00:00.000Z",
      result,
    },
  );
  assert.equal(afterCheck.completedModuleIds.includes(module.id), false);

  const input = {
    submissionId: "submission-capstone-1",
    pathId: path.id,
    moduleId: module.id,
    submittedAt: "2026-07-25T12:30:00.000Z",
    artifactRefs: [
      "portfolio/objective.md",
      "portfolio/workflow.md",
      "portfolio/evidence.md",
      "portfolio/verification.md",
      "portfolio/handoff.md",
    ],
    criterionScores: module.capstone.rubric.criteria.map((criterion) => ({
      criterionId: criterion.id,
      pointsAwarded: criterion.maxPoints,
    })),
    reflection: "Independent checks changed the final recommendation.",
  };
  const completed = recordCapstoneSubmission(
    afterCheck,
    starterCatalog,
    input,
  );
  const idempotent = recordCapstoneSubmission(
    completed,
    starterCatalog,
    input,
  );
  const history = buildCapstoneHistory(starterCatalog, idempotent);
  const csv = buildTranscriptCsv(starterCatalog, idempotent);

  assert.deepEqual(completed.completedModuleIds, [module.id]);
  assert.equal(idempotent.capstoneSubmissions.length, 1);
  assert.equal(history.length, 1);
  assert.equal(history[0].capstoneTitle, module.capstone.title);
  assert.equal(history[0].scorePercent, 100);
  assert.equal(history[0].passed, true);
  assert.match(csv, /Capstone/);
  assert.match(csv, /submission-capstone-1/);
  assert.match(csv, /portfolio\/objective\.md/);

  const record = buildPortableLearnerRecord(
    starterCatalog,
    idempotent,
    "2026-07-25T13:00:00.000Z",
  );
  assert.deepEqual(restorePortableLearnerRecord(record, starterCatalog), {
    valid: true,
    progress: idempotent,
  });

  const capstoneFirst = recordCapstoneSubmission(
    createEmptyProgress("Capstone first"),
    starterCatalog,
    { ...input, submissionId: "submission-capstone-first" },
  );
  assert.equal(capstoneFirst.completedModuleIds.includes(module.id), false);
  const completedAfterCheck = recordAssessmentAttempt(
    capstoneFirst,
    starterCatalog,
    {
      attemptId: "attempt-after-capstone",
      pathId: path.id,
      moduleId: module.id,
      completedAt: "2026-07-25T13:15:00.000Z",
      result,
    },
  );
  assert.equal(completedAfterCheck.completedModuleIds.includes(module.id), true);

  const tampered = structuredClone(record);
  tampered.learner.capstoneSubmissions[0].scorePercent = 99;
  const rejected = restorePortableLearnerRecord(tampered, starterCatalog);
  assert.equal(rejected.valid, false);
  assert.ok(
    rejected.errors.some((error) => error.includes("inconsistent score")),
  );
});

test("rejects capstone submissions with missing artifacts or invalid scores", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "ai-foundations",
  );
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === "ai-foundations-capstone",
  );
  assert.ok(path);
  assert.ok(module?.capstone);
  const base = {
    submissionId: "submission-invalid",
    pathId: path.id,
    moduleId: module.id,
    submittedAt: "2026-07-25T12:30:00.000Z",
    artifactRefs: ["only-one-artifact.md"],
    criterionScores: module.capstone.rubric.criteria.map((criterion) => ({
      criterionId: criterion.id,
      pointsAwarded: criterion.maxPoints,
    })),
    reflection: "A reflection.",
  };

  assert.throws(
    () => recordCapstoneSubmission(createEmptyProgress(), starterCatalog, base),
    /at least 5 artifact references/,
  );
  assert.throws(
    () =>
      recordCapstoneSubmission(createEmptyProgress(), starterCatalog, {
        ...base,
        artifactRefs: ["a", "b", "c", "d", "e"],
        criterionScores: base.criterionScores.map((score, index) => ({
          ...score,
          pointsAwarded: index === 0 ? 21 : score.pointsAwarded,
        })),
      }),
    /Invalid score/,
  );
});

test("requires reliable-capstone criterion evidence and preserves revisions", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === "reliable-agent-capstone",
  );
  assert.ok(path);
  assert.ok(module?.capstone);

  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [
        question.id,
        question.answerIndex,
      ]),
    ),
    module.knowledgeCheck.passPercent,
  );
  const afterCheck = recordAssessmentAttempt(
    createEmptyProgress("Agent operator"),
    starterCatalog,
    {
      attemptId: "attempt-reliable-capstone-check",
      pathId: path.id,
      moduleId: module.id,
      completedAt: "2026-07-25T15:00:00.000Z",
      result,
    },
  );
  const artifactRefs = module.capstone.requiredArtifacts.map(
    (artifact) => `portfolio/${artifact}`,
  );
  const unlinkedScores = module.capstone.rubric.criteria.map((criterion) => ({
    criterionId: criterion.id,
    pointsAwarded: criterion.maxPoints,
  }));
  const base = {
    pathId: path.id,
    moduleId: module.id,
    artifactRefs,
    reflection: "Failure testing added reconciliation before retry.",
  };

  assert.throws(
    () =>
      recordCapstoneSubmission(afterCheck, starterCatalog, {
        ...base,
        submissionId: "submission-reliable-unlinked",
        submittedAt: "2026-07-25T15:30:00.000Z",
        criterionScores: unlinkedScores,
      }),
    /needs mapped artifact or assessment evidence/,
  );

  const failed = recordCapstoneSubmission(afterCheck, starterCatalog, {
    ...base,
    submissionId: "submission-reliable-failed",
    submittedAt: "2026-07-25T15:40:00.000Z",
    criterionScores: module.capstone.rubric.criteria.map((criterion, index) => ({
      criterionId: criterion.id,
      pointsAwarded: index < 2 ? 0 : criterion.maxPoints,
      evidenceRefs: [
        artifactRefs[index],
        "assessment:attempt-reliable-capstone-check",
      ],
    })),
  });
  assert.equal(failed.completedModuleIds.includes(module.id), false);
  assert.equal(failed.capstoneSubmissions.length, 1);

  const passed = recordCapstoneSubmission(failed, starterCatalog, {
    ...base,
    submissionId: "submission-reliable-revised",
    submittedAt: "2026-07-25T16:00:00.000Z",
    criterionScores: module.capstone.rubric.criteria.map((criterion, index) => ({
      criterionId: criterion.id,
      pointsAwarded: criterion.maxPoints,
      evidenceRefs: [
        artifactRefs[index],
        "assessment:attempt-reliable-capstone-check",
      ],
    })),
  });
  assert.equal(passed.completedModuleIds.includes(module.id), true);
  assert.equal(passed.capstoneSubmissions.length, 2);
  assert.equal(passed.badges.some((badge) => badge.id === path.badge.id), false);

  const record = buildPortableLearnerRecord(starterCatalog, passed);
  assert.deepEqual(restorePortableLearnerRecord(record, starterCatalog), {
    valid: true,
    progress: passed,
  });
  const csv = buildTranscriptCsv(starterCatalog, passed);
  assert.match(csv, /Criterion evidence/);
  assert.match(csv, /assessment:attempt-reliable-capstone-check/);

  const tampered = structuredClone(record);
  tampered.learner.capstoneSubmissions[1].criterionScores[0].evidenceRefs = [
    "not-submitted.md",
  ];
  const rejected = restorePortableLearnerRecord(tampered, starterCatalog);
  assert.equal(rejected.valid, false);
  assert.ok(
    rejected.errors.some((error) =>
      error.includes("unmapped criterion evidence"),
    ),
  );
});

test("exports a portable learner record and spreadsheet-safe transcript", () => {
  const progress = {
    ...createEmptyProgress("=SUM(A1:A2)"),
    updatedAt: "2026-07-23T12:00:00.000Z",
  };
  const record = buildPortableLearnerRecord(
    starterCatalog,
    progress,
    "2026-07-23T12:30:00.000Z",
  );
  const csv = buildTranscriptCsv(starterCatalog, progress);

  assert.deepEqual(validatePortableLearnerRecord(record), { valid: true, errors: [] });
  assert.equal(record.catalogVersion, starterCatalog.contentVersion);
  assert.equal(record.transcript.length, starterCatalog.paths.length);
  assert.match(csv, /Path,Module,Completed modules/);
  assert.match(csv, /AI Foundations/);
  assert.deepEqual(restorePortableLearnerRecord(record, starterCatalog), {
    valid: true,
    progress,
  });
});

test("exports individual assessment attempts in the transcript CSV", () => {
  const path = starterCatalog.paths[0];
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === path.moduleIds[0],
  );
  assert.ok(module);
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [
        question.id,
        question.answerIndex,
      ]),
    ),
    module.knowledgeCheck.passPercent,
  );
  const progress = recordAssessmentAttempt(createEmptyProgress(), starterCatalog, {
    attemptId: "attempt-csv",
    pathId: path.id,
    moduleId: module.id,
    completedAt: "2026-07-23T12:00:00.000Z",
    result,
  });
  const csv = buildTranscriptCsv(starterCatalog, progress);

  assert.ok(csv.includes(module.title));
  assert.ok(
    csv.includes(
      `2026-07-23T12:00:00.000Z,100,Yes,${starterCatalog.contentVersion}`,
    ),
  );
});

test("rejects incompatible learner-record exports", () => {
  assert.deepEqual(
    validatePortableLearnerRecord({
      format: "another-product",
      formatVersion: "9",
      exportedAt: "not-a-date",
      catalogVersion: "",
      learner: null,
      transcript: null,
    }),
    {
      valid: false,
      errors: [
        "Unsupported learner-record format",
        "Unsupported learner-record version",
        "exportedAt must be an ISO date",
        "catalogVersion is required",
        "learner is not a valid version 1 progress record",
        "transcript must be an array of valid path summaries",
      ],
    },
  );
});

test("rejects unsafe learner records and accepts compatible older catalogs", () => {
  const record = buildPortableLearnerRecord(
    starterCatalog,
    createEmptyProgress(),
    "2026-07-23T12:30:00.000Z",
  );
  record.learner.attempts.push({
    id: "unknown-attempt",
    pathId: "unknown-path",
    moduleId: "unknown-module",
    contentVersion: starterCatalog.contentVersion,
    scorePercent: 100,
    passed: true,
    completedAt: "2026-07-23T12:00:00.000Z",
  });

  const result = restorePortableLearnerRecord(record, starterCatalog);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("unknown path")));
  assert.ok(result.errors.some((error) => error.includes("unknown module")));

  const compatibleOlderRecord = buildPortableLearnerRecord(
    starterCatalog,
    createEmptyProgress(),
    "2026-07-23T12:30:00.000Z",
  );
  compatibleOlderRecord.catalogVersion = "0.0.1";
  delete compatibleOlderRecord.learner.capstoneSubmissions;
  const restoredOlderRecord = restorePortableLearnerRecord(
    compatibleOlderRecord,
    starterCatalog,
  );
  assert.equal(
    restoredOlderRecord.valid,
    true,
  );
  assert.deepEqual(restoredOlderRecord.progress.capstoneSubmissions, []);

  const malformed = buildPortableLearnerRecord(
    starterCatalog,
    createEmptyProgress(),
    "2026-07-23T12:30:00.000Z",
  );
  malformed.learner.displayName = "x".repeat(81);
  assert.deepEqual(validatePortableLearnerRecord(malformed), {
    valid: false,
    errors: ["learner is not a valid version 1 progress record"],
  });
});

test("content freshness gate passes current sources and rejects stale ones", () => {
  const current = runFreshnessCheck("2026-07-23");
  const stale = runFreshnessCheck("2027-07-23");

  assert.equal(current.status, 0, current.stderr);
  const expectedReferenceCount =
    starterCatalog.modules.reduce(
      (total, module) => total + module.sources.length,
      0,
    ) +
    starterCatalog.resources.reduce(
      (total, resource) => total + resource.sources.length,
      0,
    );
  assert.match(
    current.stdout,
    new RegExp(`Checked ${expectedReferenceCount} references`),
  );
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /ERROR .* is \d+ days old/);
});

function runFreshnessCheck(asOf) {
  return spawnSync(process.execPath, ["scripts/check-freshness.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PROJECT42_AS_OF: asOf },
  });
}
