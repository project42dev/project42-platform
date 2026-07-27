import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  classScriptPackages,
  getClassScriptPackage,
  getLearningModule,
  starterCatalog,
  trainingPackageCoverage,
  validateClassScriptPackage,
} from "../dist/index.js";
import { buildTrainingFixtureArtifacts } from "../scripts/training-fixture-lib.mjs";
import { buildTrainingCoverage } from "../scripts/training-package-catalog-lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const classSchema = JSON.parse(
  await readFile(
    resolve(root, "schemas/training/class-script-package.schema.json"),
    "utf8",
  ),
);
const validateClassSchema = new Ajv2020({
  allErrors: true,
  strict: true,
}).compile(classSchema);

test("publishes the first complete AI Foundations class-script wave", () => {
  const expectedModuleIds = [
    "ai-systems-and-use-cases",
    "context-tokens-and-modalities",
    "language-models-and-generation",
  ];

  for (const moduleId of expectedModuleIds) {
    const script = getClassScriptPackage(moduleId);
    const module = getLearningModule(moduleId);
    assert.ok(script, `missing class script for ${moduleId}`);
    assert.ok(module, `missing module ${moduleId}`);
    assert.equal(
      validateClassSchema(script),
      true,
      JSON.stringify(validateClassSchema.errors),
    );
    assert.deepEqual(validateClassScriptPackage(script, module), {
      valid: true,
      errors: [],
    });
    assert.ok(script.spokenWordCount >= 900);
    assert.equal(script.releaseStatus, "draft");
    assert.equal(script.provenance.approvals.length, 0);
    assert.ok(
      script.provenance.contributions.every(
        (contribution) => contribution.status === "planned",
      ),
    );
  }
});

test("publishes the second complete AI Foundations class-script wave", () => {
  const expectedModuleIds = [
    "context-and-evidence-construction",
    "examples-and-output-contracts",
    "prompt-anatomy-and-success-criteria",
  ];

  for (const moduleId of expectedModuleIds) {
    const script = getClassScriptPackage(moduleId);
    const module = getLearningModule(moduleId);
    assert.ok(script, `missing class script for ${moduleId}`);
    assert.ok(module, `missing module ${moduleId}`);
    assert.equal(
      validateClassSchema(script),
      true,
      JSON.stringify(validateClassSchema.errors),
    );
    assert.deepEqual(validateClassScriptPackage(script, module), {
      valid: true,
      errors: [],
    });
    assert.ok(script.spokenWordCount >= 900);
    assert.equal(script.releaseStatus, "draft");
    assert.equal(script.provenance.approvals.length, 0);
    assert.ok(
      script.provenance.contributions.every(
        (contribution) => contribution.status === "planned",
      ),
    );
  }
});

test("publishes the evidence-led research class package", () => {
  const moduleId = "research-with-evidence";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script, `missing class script for ${moduleId}`);
  assert.ok(module, `missing module ${moduleId}`);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.ok(script.spokenWordCount >= 1_200);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.approvals.length, 0);
  assert.ok(
    script.provenance.contributions.every(
      (contribution) => contribution.status === "planned",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "demonstration" &&
        segment.id === "removed-source-demonstration",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.feedback?.retry.includes("geographic scope"),
    ),
  );
});

test("publishes the reviewed writing transformation class package", () => {
  const moduleId = "writing-and-transformation-workflow";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script, `missing class script for ${moduleId}`);
  assert.ok(module, `missing module ${moduleId}`);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.ok(script.spokenWordCount >= 1_100);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.approvals.length, 0);
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "checkpoint" &&
        segment.id === "changed-obligation-checkpoint",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.feedback?.retry.includes("who acts"),
    ),
  );
});

test("publishes the verified coding and analysis class package", () => {
  const moduleId = "coding-and-analysis-workflow";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script, `missing class script for ${moduleId}`);
  assert.ok(module, `missing module ${moduleId}`);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.ok(script.spokenWordCount >= 1_200);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.approvals.length, 0);
  assert.ok(
    script.provenance.contributions.every(
      (contribution) => contribution.status === "planned",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "checkpoint" &&
        segment.id === "join-explosion-checkpoint",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.feedback?.retry.includes("more than one row"),
    ),
  );
});

test("publishes the safe tool-use class package", () => {
  const moduleId = "safe-tool-use-workflow";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script, `missing class script for ${moduleId}`);
  assert.ok(module, `missing module ${moduleId}`);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.ok(script.spokenWordCount >= 1_300);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.approvals.length, 0);
  assert.ok(
    script.provenance.contributions.every(
      (contribution) => contribution.status === "planned",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "checkpoint" &&
        segment.id === "timeout-after-success-checkpoint",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.feedback?.retry.includes("missing response"),
    ),
  );
});

test("publishes the bounded agents and guardrails class package", () => {
  const moduleId = "agents-and-guardrails";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script, `missing class script for ${moduleId}`);
  assert.ok(module, `missing module ${moduleId}`);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.ok(script.spokenWordCount >= 1_300);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.approvals.length, 0);
  assert.ok(
    script.provenance.contributions.every(
      (contribution) => contribution.status === "planned",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "checkpoint" &&
        segment.id === "non-progress-loop-checkpoint",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.feedback?.retry.includes("remaining turn budget"),
    ),
  );
});

test("publishes the mastery-evidence AI Foundations capstone class", () => {
  const moduleId = "ai-foundations-capstone";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script, `missing class script for ${moduleId}`);
  assert.ok(module, `missing module ${moduleId}`);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.ok(script.spokenWordCount >= 1_250);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.approvals.length, 0);
  assert.ok(
    script.provenance.contributions.every(
      (contribution) => contribution.status === "planned",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "checkpoint" &&
        segment.id === "missing-safety-evidence-checkpoint",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.feedback?.retry.includes("rubric criterion"),
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "assessment-handoff" &&
        segment.spokenText.includes("five artifacts for rubric review"),
    ),
  );
});

test("publishes the evidence-aware What AI Does opening class", () => {
  const moduleId = "what-ai-does";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script, `missing class script for ${moduleId}`);
  assert.ok(module, `missing module ${moduleId}`);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.ok(script.spokenWordCount >= 1_250);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.approvals.length, 0);
  assert.ok(
    script.provenance.contributions.every(
      (contribution) => contribution.status === "planned",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "checkpoint" &&
        segment.id === "current-policy-checkpoint",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.feedback?.retry.includes("current effective policy"),
    ),
  );
});

test("publishes the responsible-use and recovery class", () => {
  const moduleId = "privacy-safety-and-responsibility";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script, `missing class script for ${moduleId}`);
  assert.ok(module, `missing module ${moduleId}`);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.ok(script.spokenWordCount >= 1_350);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.approvals.length, 0);
  assert.ok(
    script.provenance.contributions.every(
      (contribution) => contribution.status === "planned",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "checkpoint" &&
        segment.id === "data-boundary-checkpoint",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.feedback?.retry.includes("unapproved public account"),
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "narration" &&
        segment.id === "build-controls-explanation" &&
        segment.spokenText.includes("retirement owner"),
    ),
  );
});

test("publishes the purpose-first prompting class", () => {
  const moduleId = "prompt-with-purpose";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script, `missing class script for ${moduleId}`);
  assert.ok(module, `missing module ${moduleId}`);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.ok(script.spokenWordCount >= 1_400);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.approvals.length, 0);
  assert.ok(
    script.provenance.contributions.every(
      (contribution) => contribution.status === "planned",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "checkpoint" &&
        segment.id === "suitability-checkpoint",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.feedback?.retry.includes("employment decision"),
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "checkpoint" &&
        segment.id === "untrusted-content-checkpoint",
    ),
  );
});

test("publishes the claim-evidence verification class", () => {
  const moduleId = "verification-and-iterative-improvement";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script, `missing class script for ${moduleId}`);
  assert.ok(module, `missing module ${moduleId}`);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.ok(script.spokenWordCount >= 1_200);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.approvals.length, 0);
  assert.ok(
    script.provenance.contributions.every(
      (contribution) => contribution.status === "planned",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "checkpoint" &&
        segment.id === "volatile-claim-checkpoint",
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.feedback?.retry.includes("undated community post"),
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "demonstration" &&
        segment.id === "mixed-claim-demonstration",
    ),
  );
});

test("publishes the first complete Self-Hosted Model Operations class", () => {
  const moduleId = "deployment-shape-and-operating-model";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script);
  assert.ok(module);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.equal(script.spokenWordCount, 1283);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.canonicalContentVersion, "0.41.0");
  assert.equal(script.provenance.approvals.length, 0);
  assert.ok(
    script.provenance.contributions.every(
      (contribution) => contribution.status === "planned",
    ),
  );
  for (const section of module.sections) {
    assert.ok(
      script.segments.some(
        (segment) =>
          segment.kind === "narration" &&
          segment.sectionId === section.id &&
          segment.delivery === "spoken",
      ),
      `missing narrated section ${section.id}`,
    );
  }
  for (const kind of [
    "demonstration",
    "learner-prompt",
    "checkpoint",
    "feedback",
    "assessment-handoff",
  ]) {
    assert.ok(
      script.segments.some((segment) => segment.kind === kind),
      `missing ${kind}`,
    );
  }
});

test("publishes complete model identity and artifact-integrity classes", () => {
  const expected = new Map([
    ["model-identity-license-and-provenance", 1060],
    ["model-artifact-integrity", 992],
  ]);

  for (const [moduleId, spokenWordCount] of expected) {
    const script = getClassScriptPackage(moduleId);
    const module = getLearningModule(moduleId);
    assert.ok(script, `missing class script for ${moduleId}`);
    assert.ok(module, `missing module ${moduleId}`);
    assert.equal(
      validateClassSchema(script),
      true,
      JSON.stringify(validateClassSchema.errors),
    );
    assert.deepEqual(validateClassScriptPackage(script, module), {
      valid: true,
      errors: [],
    });
    assert.equal(script.spokenWordCount, spokenWordCount);
    assert.equal(script.releaseStatus, "draft");
    assert.equal(script.provenance.canonicalContentVersion, "0.41.0");
    assert.equal(script.provenance.approvals.length, 0);
    assert.ok(
      script.provenance.contributions.every(
        (contribution) => contribution.status === "planned",
      ),
    );
    for (const section of module.sections) {
      assert.ok(
        script.segments.some(
          (segment) =>
            segment.kind === "narration" &&
            segment.sectionId === section.id &&
            segment.delivery === "spoken",
        ),
        `${moduleId} is missing narrated section ${section.id}`,
      );
    }
    for (const kind of [
      "demonstration",
      "learner-prompt",
      "checkpoint",
      "feedback",
      "assessment-handoff",
    ]) {
      assert.ok(
        script.segments.some((segment) => segment.kind === kind),
        `${moduleId} is missing ${kind}`,
      );
    }
  }
});

test("publishes the complete hardware, runtime, and capacity class", () => {
  const moduleId = "hardware-runtime-and-capacity-planning";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script);
  assert.ok(module);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.equal(script.spokenWordCount, 976);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.canonicalContentVersion, "0.41.0");
  assert.equal(script.provenance.approvals.length, 0);
  for (const section of module.sections) {
    assert.ok(
      script.segments.some(
        (segment) =>
          segment.kind === "narration" &&
          segment.sectionId === section.id &&
          segment.delivery === "spoken",
      ),
      `missing narrated section ${section.id}`,
    );
  }
  for (const kind of [
    "demonstration",
    "learner-prompt",
    "checkpoint",
    "feedback",
    "assessment-handoff",
  ]) {
    assert.ok(
      script.segments.some((segment) => segment.kind === kind),
      `missing ${kind}`,
    );
  }
});

test("publishes the complete serving and compatibility-contract class", () => {
  const moduleId = "serving-api-and-compatibility-contracts";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script);
  assert.ok(module);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.equal(script.spokenWordCount, 1021);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.canonicalContentVersion, "0.41.0");
  assert.equal(script.provenance.approvals.length, 0);
  for (const section of module.sections) {
    assert.ok(
      script.segments.some(
        (segment) =>
          segment.kind === "narration" &&
          segment.sectionId === section.id &&
          segment.delivery === "spoken",
      ),
      `missing narrated section ${section.id}`,
    );
  }
  for (const kind of [
    "demonstration",
    "learner-prompt",
    "checkpoint",
    "feedback",
    "assessment-handoff",
  ]) {
    assert.ok(
      script.segments.some((segment) => segment.kind === kind),
      `missing ${kind}`,
    );
  }
});

test("publishes the complete endpoint identity, network, and secrets class", () => {
  const moduleId = "endpoint-identity-network-and-secrets";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script);
  assert.ok(module);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.equal(script.spokenWordCount, 1253);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.canonicalContentVersion, "0.41.0");
  assert.equal(script.provenance.approvals.length, 0);
  for (const section of module.sections) {
    assert.ok(
      script.segments.some(
        (segment) =>
          segment.kind === "narration" &&
          segment.sectionId === section.id &&
          segment.delivery === "spoken",
      ),
      `missing narrated section ${section.id}`,
    );
  }
  for (const kind of [
    "demonstration",
    "learner-prompt",
    "checkpoint",
    "feedback",
    "assessment-handoff",
  ]) {
    assert.ok(
      script.segments.some((segment) => segment.kind === kind),
      `missing ${kind}`,
    );
  }
});

test("publishes the complete exact-serving-build evaluation class", () => {
  const moduleId = "evaluate-the-exact-serving-build";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script);
  assert.ok(module);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.equal(script.spokenWordCount, 1249);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.canonicalContentVersion, "0.41.0");
  assert.equal(script.provenance.approvals.length, 0);
  for (const section of module.sections) {
    assert.ok(
      script.segments.some(
        (segment) =>
          segment.kind === "narration" &&
          segment.sectionId === section.id &&
          segment.delivery === "spoken",
      ),
      `missing narrated section ${section.id}`,
    );
  }
  for (const kind of [
    "demonstration",
    "learner-prompt",
    "checkpoint",
    "feedback",
    "assessment-handoff",
  ]) {
    assert.ok(
      script.segments.some((segment) => segment.kind === kind),
      `missing ${kind}`,
    );
  }
});

test("publishes the complete observability, cost, and performance class", () => {
  const moduleId = "observability-cost-and-performance";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script);
  assert.ok(module);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.equal(script.spokenWordCount, 1223);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.canonicalContentVersion, "0.41.0");
  assert.equal(script.provenance.approvals.length, 0);
  for (const section of module.sections) {
    assert.ok(
      script.segments.some(
        (segment) =>
          segment.kind === "narration" &&
          segment.sectionId === section.id &&
          segment.delivery === "spoken",
      ),
      `missing narrated section ${section.id}`,
    );
  }
  for (const kind of [
    "demonstration",
    "learner-prompt",
    "checkpoint",
    "feedback",
    "assessment-handoff",
  ]) {
    assert.ok(
      script.segments.some((segment) => segment.kind === kind),
      `missing ${kind}`,
    );
  }
});

test("publishes the complete scaling, failure, and capacity-controls class", () => {
  const moduleId = "scaling-failure-and-capacity-controls";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script);
  assert.ok(module);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.equal(script.spokenWordCount, 1250);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.canonicalContentVersion, "0.41.0");
  assert.equal(script.provenance.approvals.length, 0);
  for (const section of module.sections) {
    assert.ok(
      script.segments.some(
        (segment) =>
          segment.kind === "narration" &&
          segment.sectionId === section.id &&
          segment.delivery === "spoken",
      ),
      `missing narrated section ${section.id}`,
    );
  }
  for (const kind of [
    "demonstration",
    "learner-prompt",
    "checkpoint",
    "feedback",
    "assessment-handoff",
  ]) {
    assert.ok(
      script.segments.some((segment) => segment.kind === kind),
      `missing ${kind}`,
    );
  }
});

test("publishes the complete model update and rollback lifecycle class", () => {
  const moduleId = "model-update-and-rollback-lifecycle";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script);
  assert.ok(module);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.equal(script.spokenWordCount, 1160);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.canonicalContentVersion, "0.41.0");
  assert.equal(script.provenance.approvals.length, 0);
  for (const section of module.sections) {
    assert.ok(
      script.segments.some(
        (segment) =>
          segment.kind === "narration" &&
          segment.sectionId === section.id &&
          segment.delivery === "spoken",
      ),
      `missing narrated section ${section.id}`,
    );
  }
  for (const kind of [
    "demonstration",
    "learner-prompt",
    "checkpoint",
    "feedback",
    "assessment-handoff",
  ]) {
    assert.ok(
      script.segments.some((segment) => segment.kind === kind),
      `missing ${kind}`,
    );
  }
});

test("publishes the complete model incident response and recovery class", () => {
  const moduleId = "model-incident-response-and-recovery";
  const script = getClassScriptPackage(moduleId);
  const module = getLearningModule(moduleId);
  assert.ok(script);
  assert.ok(module);
  assert.equal(
    validateClassSchema(script),
    true,
    JSON.stringify(validateClassSchema.errors),
  );
  assert.deepEqual(validateClassScriptPackage(script, module), {
    valid: true,
    errors: [],
  });
  assert.equal(script.spokenWordCount, 1152);
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.canonicalContentVersion, "0.41.0");
  assert.equal(script.provenance.approvals.length, 0);
  for (const section of module.sections) {
    assert.ok(
      script.segments.some(
        (segment) =>
          segment.kind === "narration" &&
          segment.sectionId === section.id &&
          segment.delivery === "spoken",
      ),
      `missing narrated section ${section.id}`,
    );
  }
  for (const kind of [
    "demonstration",
    "learner-prompt",
    "checkpoint",
    "feedback",
    "assessment-handoff",
  ]) {
    assert.ok(
      script.segments.some((segment) => segment.kind === kind),
      `missing ${kind}`,
    );
  }
});

test("coverage classifies every substantive module without overstating readiness", async () => {
  const committedCoverage = JSON.parse(
    await readFile(resolve(root, "content/training/coverage.json"), "utf8"),
  );
  assert.deepEqual(committedCoverage, trainingPackageCoverage);
  assert.equal(trainingPackageCoverage.substantiveModuleCount, 64);
  assert.equal(
    trainingPackageCoverage.classReadyModuleCount,
    classScriptPackages.length,
  );
  assert.equal(
    trainingPackageCoverage.outlineOnlyModuleCount,
    trainingPackageCoverage.substantiveModuleCount -
      trainingPackageCoverage.classReadyModuleCount,
  );
  assert.equal(trainingPackageCoverage.coverageStatus, "migration-active");
  assert.equal(trainingPackageCoverage.modules.length, 64);
  assert.ok(
    trainingPackageCoverage.modules.every(
      (entry) =>
        entry.status === "outline-only" ||
        (entry.classScriptId &&
          entry.classScriptVersion &&
          entry.classScriptPath &&
          !entry.classScriptPath.includes("..")),
    ),
  );
});

test("canonical accessibility artifacts and integrity files are deterministic", async () => {
  for (const script of classScriptPackages) {
    const coverage = trainingPackageCoverage.modules.find(
      (entry) => entry.moduleId === script.moduleId,
    );
    assert.ok(coverage?.classScriptPath);
    const packageRoot = dirname(resolve(root, coverage.classScriptPath));
    const expected = buildTrainingFixtureArtifacts(script);

    for (const [relativePath, content] of Object.entries(expected)) {
      const committed = await readFile(resolve(packageRoot, relativePath), "utf8");
      assert.equal(
        committed.replaceAll("\r\n", "\n"),
        content.replaceAll("\r\n", "\n"),
        `${script.moduleId} ${relativePath} drifted`,
      );
    }

    const captions = expected["captions/en-US.vtt"];
    for (const block of captions.trim().split(/\n\n/u).slice(1)) {
      const lines = block.split("\n");
      assert.match(lines[0], /^\d+$/u);
      const [start, end] = lines[1].split(" --> ").map(parseTimestamp);
      assert.ok(end > start);
      assert.ok(end - start <= 7_000);
      assert.ok(lines.slice(2).length <= 2);
      assert.ok(lines.slice(2).every((line) => line.length <= 42));
    }
  }
});

test("coverage and semantic gates reject duplicate and broken package references", () => {
  const entries = classScriptPackages.map((script) => {
    const coverage = trainingPackageCoverage.modules.find(
      (entry) => entry.moduleId === script.moduleId,
    );
    return {
      script,
      classScriptPath: coverage.classScriptPath,
      pathId: coverage.pathIds[0],
    };
  });
  assert.throws(
    () => buildTrainingCoverage(starterCatalog, [...entries, entries[0]]),
    /Duplicate class script/u,
  );

  const broken = structuredClone(classScriptPackages[0]);
  const handoff = broken.segments.find(
    (segment) => segment.kind === "assessment-handoff",
  );
  handoff.learningHandoff.questionIds = ["missing-question"];
  const result = validateClassScriptPackage(
    broken,
    getLearningModule(broken.moduleId),
  );
  assert.equal(result.valid, false);
  assert.ok(
    result.errors.some((error) => error.includes("missing question")),
  );
  assert.ok(
    result.errors.some((error) =>
      error.includes("must map every module question"),
    ),
  );
});

function parseTimestamp(value) {
  const match = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/u.exec(value);
  assert.ok(match, `invalid WebVTT timestamp ${value}`);
  return (
    Number(match[1]) * 3_600_000 +
    Number(match[2]) * 60_000 +
    Number(match[3]) * 1_000 +
    Number(match[4])
  );
}
