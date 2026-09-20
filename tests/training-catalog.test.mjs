import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  classScriptPackages,
  getClassScriptPackage,
  getInstructorRendering,
  getLearningModule,
  instructorRenderings,
  starterCatalog,
  trainingPackageCoverage,
  validateClassScriptPackage,
  validateInstructorRenderingManifest,
} from "../dist/index.js";
import { buildTrainingFixtureArtifacts } from "../scripts/training-fixture-lib.mjs";
import {
  buildTrainingCoverage,
  loadInstructorRenderings,
} from "../scripts/training-package-catalog-lib.mjs";

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
        segment.id === "pine-recovery-demonstration" &&
        segment.spokenText.includes("VEN-04") &&
        segment.spokenText.includes("Record A") &&
        segment.spokenText.includes("failure receipt") &&
        segment.spokenText.includes("Record B") &&
        segment.spokenText.includes(
          "Pine Studio Authorized Event Record PS-2026-062",
        ) &&
        segment.spokenText.includes("The two rows must remain separate") &&
        segment.visual?.altText.includes("Record A supports only") &&
        segment.visual?.altText.includes("Record B independently supports"),
    ),
  );
  const changedInputLearnerPromptIndex = script.segments.findIndex(
    (segment) => segment.id === "changed-input-learner-prompt",
  );
  const changedInputWorkPauseIndex = script.segments.findIndex(
    (segment) => segment.id === "changed-input-work-pause",
  );
  const changedInputAnswerKeyIndex = script.segments.findIndex(
    (segment) => segment.id === "changed-input-answer-key",
  );
  const changedInputFeedbackIndex = script.segments.findIndex(
    (segment) => segment.id === "changed-input-specific-feedback",
  );
  assert.ok(changedInputLearnerPromptIndex >= 0);
  assert.ok(changedInputWorkPauseIndex > changedInputLearnerPromptIndex);
  assert.ok(changedInputAnswerKeyIndex > changedInputWorkPauseIndex);
  assert.ok(changedInputFeedbackIndex > changedInputAnswerKeyIndex);
  const changedInputWorkPause = script.segments[changedInputWorkPauseIndex];
  assert.equal(changedInputWorkPause.kind, "pause");
  assert.equal(changedInputWorkPause.delivery, "silent");
  assert.equal(changedInputWorkPause.estimatedSeconds, 300);
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.id === "changed-input-explanation" &&
        segment.spokenText.includes(
          "Capacity must now be at least sixty-five",
        ),
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.id === "changed-input-specific-feedback" &&
        segment.spokenText.includes("Pine's thirty-two fails sixty-five") &&
        segment.spokenText.includes("Harbor") &&
        segment.spokenText.includes("unsupported") &&
        segment.feedback?.retry.includes("40, 60, and 32"),
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
  const source = script.segments.find(
    (segment) => segment.id === "writing-source-narration",
  );
  const corrected = script.segments.find(
    (segment) => segment.id === "writing-corrected-narration",
  );
  const traceability = script.segments.find(
    (segment) => segment.id === "writing-traceability-narration",
  );
  const checkpoint = script.segments.find(
    (segment) => segment.id === "writing-verify-checkpoint",
  );
  assert.ok(source?.spokenText.includes('"$8 per participant."'));
  assert.ok(
    source?.spokenText.includes(
      '"Residents age 60 or older may attend free."',
    ),
  );
  assert.ok(
    source?.spokenText.includes(
      '"Residents who cannot pay may request a fee waiver when registering."',
    ),
  );
  assert.ok(source?.spokenText.includes("not a promise that the request will be granted"));
  assert.ok(corrected?.spokenText.includes("The review status is pending") || corrected?.spokenText.includes("review is pending"));
  assert.ok(corrected?.spokenText.includes("A request is not guaranteed."));
  assert.ok(
    traceability?.spokenText.includes("O1 links the date and schedule") &&
      traceability.spokenText.includes("O13 records PENDING review"),
  );
  assert.equal(checkpoint?.kind, "checkpoint");
  assert.ok(checkpoint?.spokenText.includes("may request a fee waiver when registering"));
  const practicePrompt = script.segments.find(
    (segment) => segment.id === "writing-practice-prompt",
  );
  const practicePause = script.segments.find(
    (segment) => segment.id === "writing-practice-pause",
  );
  const practiceAnswer = script.segments.find(
    (segment) => segment.id === "writing-practice-answer-narration",
  );
  const practiceFeedback = script.segments.find(
    (segment) => segment.id === "writing-practice-feedback-narration",
  );
  const waiverFeedback = script.segments.find(
    (segment) => segment.id === "writing-verify-feedback",
  );
  assert.equal(practicePrompt?.kind, "learner-prompt");
  assert.equal(practicePause?.kind, "pause");
  assert.equal(practicePause?.delivery, "silent");
  assert.equal(practicePause?.estimatedSeconds, 180);
  assert.equal(practiceAnswer?.kind, "narration");
  assert.equal(practiceFeedback?.kind, "narration");
  assert.ok(
    practicePrompt &&
      practicePause &&
      practiceAnswer &&
      practiceFeedback &&
      script.segments.indexOf(practicePrompt) < script.segments.indexOf(practicePause) &&
      script.segments.indexOf(practicePause) < script.segments.indexOf(practiceAnswer) &&
      script.segments.indexOf(practiceAnswer) < script.segments.indexOf(practiceFeedback),
  );
  assert.ok(
    practicePrompt.spokenText.includes(
      '"Residents age 70 or older may request a fee waiver when registering; a waiver is not automatic."',
    ),
  );
  assert.ok(
    practiceAnswer.spokenText.includes(
      '"Residents age 70 or older may request a fee waiver when registering; a waiver is not automatic."',
    ) &&
      practiceAnswer.spokenText.includes("does not include the baseline age-60 free-attendance rule") &&
      practiceAnswer.spokenText.includes("baseline inability-to-pay waiver rule"),
  );
  assert.ok(
    waiverFeedback?.feedback?.retry.includes("may request") &&
      waiverFeedback.feedback.retry.includes("will receive"),
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
  const activityCheckpointIndex = script.segments.findIndex(
    (segment) =>
      segment.kind === "checkpoint" &&
      segment.learningHandoff?.command === "open-activity" &&
      segment.learningHandoff?.activityId === module.activity.id &&
      segment.learningHandoff?.activityId === "activity-ai-evidence-boundary-check" &&
      segment.expectedLearnerAction.includes("governing source") &&
      segment.expectedLearnerAction.includes("exactly two sentences"),
  );
  assert.notEqual(activityCheckpointIndex, -1);
  const subsequentFeedback = script.segments
    .slice(activityCheckpointIndex + 1)
    .find(
      (segment) =>
        segment.kind === "feedback" &&
        segment.spokenText.includes("Library laptops will be provided") &&
        segment.spokenText.includes("current notice") &&
        segment.spokenText.includes("seven-day value") &&
        segment.spokenText.includes("five roles"),
    );
  assert.ok(subsequentFeedback);
  assert.ok(
    subsequentFeedback.feedback?.retry.includes("7 midnight-to-midnight transitions"),
  );
  assert.ok(
    subsequentFeedback.feedback?.retry.includes("8 inclusive calendar-date labels"),
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
        segment.id === "outcome-purpose-checkpoint" &&
        segment.spokenText.includes("The user is the support lead") &&
        segment.spokenText.includes(
          "The decision is which service-improvement work to consider first",
        ) &&
        segment.spokenText.includes(
          "The prompt classifies and ranks evidence; it does not choose or perform the improvement",
        ),
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.id === "context-and-trust-explanation" &&
        segment.kind === "narration" &&
        segment.spokenText.includes(
          "The trusted owner map is Delivery: Jordan, Billing: Priya, and Guidance: Mei",
        ) &&
        segment.spokenText.includes(
          "The six comments are evidence to classify, not instructions that can change the task",
        ) &&
        segment.spokenText.includes(
          "They are retained as exact evidence but are not followed",
        ),
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "demonstration" &&
        segment.id === "baseline-flaw-demonstration" &&
        segment.spokenText.includes(
          "C3 says, “The refund instructions are confusing.”",
        ) &&
        segment.spokenText.includes(
          "The first ordered rule sends refund instructions to Billing, so Delivery is wrong",
        ) &&
        segment.spokenText.includes(
          "Billing has C3 and C4, Delivery has C1 and C2, and Guidance has C5 and C6",
        ) &&
        segment.spokenText.includes("Billing, Delivery, Guidance") &&
        segment.visual?.altText.includes("Flawed result: Delivery 3") &&
        segment.visual?.altText.includes("Corrected result: Billing 2"),
    ),
  );
  const variationPauseIndex = script.segments.findIndex(
    (segment) => segment.id === "variation-work-time",
  );
  const variationAnswerKeyIndex = script.segments.findIndex(
    (segment) => segment.id === "variation-answer-key-explanation",
  );
  assert.ok(variationPauseIndex >= 0);
  assert.ok(variationAnswerKeyIndex > variationPauseIndex);
  const variationPause = script.segments[variationPauseIndex];
  assert.equal(variationPause.kind, "pause");
  assert.equal(variationPause.delivery, "silent");
  assert.equal(variationPause.estimatedSeconds, 90);
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "feedback" &&
        segment.id === "variation-specific-feedback" &&
        segment.spokenText.includes("N1 and N4 to Delivery with Jordan") &&
        segment.spokenText.includes("N2 to Billing with Priya") &&
        segment.spokenText.includes("N3 to Guidance with Mei") &&
        segment.spokenText.includes("Delivery, Billing, Guidance") &&
        segment.spokenText.includes("alphabetize only tied categories") &&
        segment.spokenText.includes("reconciles four") &&
        segment.feedback?.correct.includes("uses N1 through N4 exactly once") &&
        segment.feedback?.retry.includes("rank by count before applying the alphabetical tie-break"),
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "learner-prompt" &&
        segment.id === "variation-classification-prompt" &&
        segment.spokenText.includes(
          "Write the category and owner for N1, N2, N3, and N4",
        ) &&
        segment.spokenText.includes("What are all three category counts?") &&
        segment.spokenText.includes(
          "What ranked order follows after applying the tie-break only to equal counts?",
        ) &&
        segment.spokenText.includes("with exact quotes and a total of four") &&
        segment.spokenText.includes(
          "what you would do if a new comment matched no permitted category",
        ),
    ),
  );
  assert.ok(
    script.segments.some(
      (segment) =>
        segment.kind === "narration" &&
        segment.id === "variation-answer-key-explanation" &&
        segment.spokenText.includes(
          "Delivery therefore has two comments, N1 and N4",
        ) &&
        segment.spokenText.includes("Billing has one, N2") &&
        segment.spokenText.includes("Guidance has one, N3") &&
        segment.spokenText.includes(
          "The final ranking is Delivery, Billing, Guidance, and two plus one plus one equals four",
        ),
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
  const claimPrompt = script.segments.find(
    (segment) => segment.id === "verify-by-claim-prompt",
  );
  const sourceCorpus = script.segments.find(
    (segment) => segment.id === "source-corpus-narration",
  );
  const claimCheckpoint = script.segments.find(
    (segment) => segment.id === "verify-by-claim-checkpoint",
  );
  assert.equal(claimCheckpoint?.kind, "checkpoint");
  assert.ok(
    claimPrompt?.spokenText.includes(
      '‘Standard adult single ride: $3.00.’',
    ),
  );
  assert.ok(
    sourceCorpus?.spokenText.includes(
      '“Standard adult single ride: $3.00. A day pass costs $10.00. Reduced fares are available only to riders with a valid reduced-fare card.”',
    ),
  );
  assert.ok(
    sourceCorpus?.spokenText.includes("Source B therefore does not create an unresolved conflict where A controls") &&
      sourceCorpus.spokenText.includes("Sources C and D are both version 1.0") &&
      sourceCorpus.spokenText.includes("No supplied rule gives either source precedence"),
  );
  const fiveRidePrompt = script.segments.find(
    (segment) => segment.id === "changed-input-task-prompt",
  );
  const fiveRidePause = script.segments.find(
    (segment) => segment.id === "changed-input-task-pause",
  );
  const fiveRideAnswer = script.segments.find(
    (segment) => segment.id === "changed-input-answer-key-narration",
  );
  const fiveRideFeedback = script.segments.find(
    (segment) => segment.id === "changed-input-answer-key-feedback",
  );
  assert.equal(fiveRidePrompt?.kind, "learner-prompt");
  assert.equal(fiveRidePause?.kind, "pause");
  assert.equal(fiveRidePause?.delivery, "silent");
  assert.equal(fiveRidePause?.estimatedSeconds, 120);
  assert.equal(fiveRideAnswer?.kind, "narration");
  assert.equal(fiveRideFeedback?.kind, "feedback");
  assert.ok(
    fiveRidePrompt &&
      fiveRidePause &&
      fiveRideAnswer &&
      fiveRideFeedback &&
      script.segments.indexOf(fiveRidePrompt) < script.segments.indexOf(fiveRidePause) &&
      script.segments.indexOf(fiveRidePause) < script.segments.indexOf(fiveRideAnswer) &&
      script.segments.indexOf(fiveRideAnswer) < script.segments.indexOf(fiveRideFeedback),
  );
  assert.ok(
    fiveRideAnswer.spokenText.includes('“Standard adult single ride: $3.00.”') &&
      fiveRideAnswer.spokenText.includes("5 × $3.00 = $15.00") &&
      fiveRideAnswer.spokenText.includes("no supplied source states a reduced-fare amount"),
  );
  const corpusDemonstration = script.segments.find(
    (segment) => segment.id === "source-corpus-demonstration",
  );
  assert.equal(corpusDemonstration?.kind, "demonstration");
  assert.ok(
    corpusDemonstration?.spokenText.includes(
      "Source A controls rather than conflicting with superseded Source B",
    ) &&
      corpusDemonstration.spokenText.includes(
        "Sources C and D remain unresolved because both are equally authoritative and applicable",
      ) &&
      corpusDemonstration.spokenText.includes("requires HOLD"),
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
  assert.equal(script.spokenWordCount, 2967);
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

test("publishes the complete self-hosted model operations capstone class", () => {
  const moduleId = "self-hosted-model-operations-capstone";
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
  assert.equal(script.spokenWordCount, 1191);
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

test("publishes the bounded agent work-order class package", () => {
  const moduleId = "prepare-agent-work";
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
  assert.equal(
    script.spokenWordCount,
    script.segments.filter((segment) => segment.delivery === "spoken")
      .reduce((count, segment) => count + segment.spokenText.trim().split(/\s+/u).length, 0),
  );
  assert.ok(script.spokenWordCount >= 1103, "retain substantive spoken instruction");
  assert.equal(script.releaseStatus, "draft");
  assert.equal(script.provenance.canonicalContentVersion, "0.41.0");
  assert.equal(script.provenance.approvals.length, 0);
  for (const section of module.sections) {
    assert.ok(
      script.segments.some(
        (segment) =>
          segment.sectionId === section.id &&
          segment.delivery === "spoken" &&
          ["narration", "demonstration"].includes(segment.kind),
      ),
      `missing substantive spoken section ${section.id}`,
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
  assert.deepEqual(
    script.segments.find(
      (segment) => segment.kind === "assessment-handoff",
    )?.learningHandoff.questionIds,
    module.knowledgeCheck.questions.map((question) => question.id),
  );
});

test("publishes complete agent tool, context, and memory class packages", () => {
  const expectedWordCounts = new Map([
    ["control-agent-actions", 1224],
    ["context-engineering", 1831],
    ["memory-boundaries", 1598],
  ]);

  for (const [moduleId, expectedWordCount] of expectedWordCounts) {
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
    assert.equal(script.spokenWordCount, expectedWordCount);
    assert.equal(script.releaseStatus, "draft");
    assert.equal(script.provenance.canonicalContentVersion, moduleId === "context-engineering" ? "0.42.0" : "0.41.0");
    assert.equal(script.provenance.approvals.length, 0);
    for (const section of module.sections) {
      assert.ok(
        script.segments.some(
          (segment) =>
            segment.sectionId === section.id &&
            segment.delivery === "spoken" &&
            ["narration", "demonstration"].includes(segment.kind),
        ),
        `${moduleId} missing substantive spoken section ${section.id}`,
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
        `${moduleId} missing ${kind}`,
      );
    }
    assert.deepEqual(
      script.segments.find(
        (segment) => segment.kind === "assessment-handoff",
      )?.learningHandoff.questionIds,
      module.knowledgeCheck.questions.map((question) => question.id),
    );
  }
});

test("publishes complete MCP, orchestration, and handoff class packages", () => {
  const expectedWordCounts = new Map([
    ["mcp-architecture", 1963],
    ["mcp-trust-and-security", 904],
    ["orchestration-patterns", 1002],
    ["multi-agent-handoffs", 1013],
  ]);

  for (const [moduleId, expectedWordCount] of expectedWordCounts) {
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
    assert.equal(script.spokenWordCount, expectedWordCount);
    assert.equal(script.releaseStatus, "draft");
    assert.equal(script.provenance.canonicalContentVersion, moduleId === "mcp-architecture" ? "0.42.0" : "0.41.0");
    assert.equal(script.provenance.approvals.length, 0);
    for (const section of module.sections) {
      assert.ok(
        script.segments.some(
          (segment) =>
            segment.sectionId === section.id &&
            segment.delivery === "spoken" &&
            ["narration", "demonstration"].includes(segment.kind),
        ),
        `${moduleId} missing substantive spoken section ${section.id}`,
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
        `${moduleId} missing ${kind}`,
      );
    }
    assert.deepEqual(
      script.segments.find(
        (segment) => segment.kind === "assessment-handoff",
      )?.learningHandoff.questionIds,
      module.knowledgeCheck.questions.map((question) => question.id),
    );
  }
});

test("publishes complete agent evaluation, operations, and capstone packages", () => {
  const expectedWordCounts = new Map([
    ["agent-evaluation", 940],
    ["agent-observability", 955],
    ["review-agent-results", 1279],
    ["operate-and-recover-agent-systems", 945],
    ["reliable-agent-capstone", 1178],
  ]);

  for (const [moduleId, expectedWordCount] of expectedWordCounts) {
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
    assert.equal(script.spokenWordCount, expectedWordCount);
    assert.equal(script.releaseStatus, "draft");
    assert.equal(script.provenance.canonicalContentVersion, moduleId === "review-agent-results" ? "0.42.0" : "0.41.0");
    assert.equal(script.provenance.approvals.length, 0);
    for (const section of module.sections) {
      assert.ok(
        script.segments.some(
          (segment) =>
            segment.sectionId === section.id &&
            segment.delivery === "spoken" &&
            ["narration", "demonstration"].includes(segment.kind),
        ),
        `${moduleId} missing substantive spoken section ${section.id}`,
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
        `${moduleId} missing ${kind}`,
      );
    }
    assert.deepEqual(
      script.segments.find(
        (segment) => segment.kind === "assessment-handoff",
      )?.learningHandoff.questionIds,
      module.knowledgeCheck.questions.map((question) => question.id),
    );
  }

  const capstoneScript = getClassScriptPackage("reliable-agent-capstone");
  const capstoneModule = getLearningModule("reliable-agent-capstone");
  assert.ok(capstoneScript);
  assert.ok(capstoneModule?.capstone);
  const spokenText = capstoneScript.segments
    .map((segment) => segment.spokenText ?? "")
    .join(" ");
  assert.equal(capstoneModule.capstone.requiredArtifacts.length, 8);
  assert.equal(capstoneModule.capstone.rubric.criteria.length, 6);
  for (const artifact of capstoneModule.capstone.requiredArtifacts) {
    assert.ok(
      spokenText.includes(artifact),
      `capstone narration missing required artifact ${artifact}`,
    );
  }
  assert.match(spokenText, /eighty-percent knowledge check/u);
  assert.match(spokenText, /capstone score of at least eighty percent/u);
  assert.match(spokenText, /Preserve the first submission/u);
});

// ADR-0020: instructor-led delivery is a rendering of the same module, so
// which lessons have been filmed is a fact about the curriculum. It used to be
// a hand-kept list in project-42.dev's config/, which meant one deployment's
// front end decided what the catalogue claimed to have filmed.
test("publishes the filmed lessons the curriculum declares, and only those", async () => {
  const fromDisk = await loadInstructorRenderings(root);
  assert.deepEqual(instructorRenderings, fromDisk);
  assert.equal(
    trainingPackageCoverage.renderedModuleCount,
    instructorRenderings.length,
  );

  for (const rendering of instructorRenderings) {
    const script = getClassScriptPackage(rendering.moduleId);
    assert.ok(script, `${rendering.moduleId} has no class script to render`);
    const result = validateInstructorRenderingManifest(rendering, script);
    assert.deepEqual(result.errors, []);
    assert.ok(result.valid);

    // The learner has to be told the instructor is synthetic, and the media key
    // may not carry a deployment's directory layout into the shared contract.
    assert.match(rendering.production.disclosure, /synthetic|generated|virtual/i);
    assert.doesNotMatch(rendering.media.key, /[\\/]|^\./);

    const module = getLearningModule(rendering.moduleId);
    assert.ok(module?.instructorScript, "a rendering needs a declared script");
    const entry = trainingPackageCoverage.modules.find(
      (candidate) => candidate.moduleId === rendering.moduleId,
    );
    assert.equal(entry?.rendering?.renderedSegments, rendering.renderedSegments);
    assert.equal(getInstructorRendering(rendering.moduleId), rendering);
  }

  // A scripted-but-unfilmed module must not resolve, or a consumer building
  // routes from this list publishes pages for lessons nobody can watch.
  const unfilmed = classScriptPackages.find(
    (script) => !getInstructorRendering(script.moduleId),
  );
  assert.ok(unfilmed, "expected at least one scripted, unfilmed module");
  assert.equal(getInstructorRendering(unfilmed.moduleId), undefined);
});

test("rejects a rendering that claims more of the script than was filmed", async () => {
  const [rendering] = instructorRenderings;
  const script = getClassScriptPackage(rendering.moduleId);
  const overclaimed = validateInstructorRenderingManifest(
    { ...rendering, renderedSegments: script.segments.length + 1 },
    script,
  );
  assert.equal(overclaimed.valid, false);
  const wrongScript = validateInstructorRenderingManifest(
    { ...rendering, classScriptVersion: "9.9.9" },
    script,
  );
  assert.equal(wrongScript.valid, false);
  const undisclosed = validateInstructorRenderingManifest(
    { ...rendering, production: { ...rendering.production, disclosure: "  " } },
    script,
  );
  assert.equal(undisclosed.valid, false);
  const pathAsKey = validateInstructorRenderingManifest(
    { ...rendering, media: { ...rendering.media, key: "/preview/lesson.mp4" } },
    script,
  );
  assert.equal(pathAsKey.valid, false);
});

test("coverage classifies every substantive module without overstating readiness", async () => {
  const committedCoverage = JSON.parse(
    await readFile(resolve(root, "content/training/coverage.json"), "utf8"),
  );
  assert.deepEqual(committedCoverage, trainingPackageCoverage);
  // Derived, not pinned. A literal here froze the curriculum at the size it
  // happened to be when the platform still carried its own copy, so the
  // canonical catalogue could never grow without failing this test.
  assert.equal(
    trainingPackageCoverage.substantiveModuleCount,
    starterCatalog.modules.filter((module) => module.instructorScript).length,
  );
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
  assert.equal(
    trainingPackageCoverage.modules.length,
    trainingPackageCoverage.substantiveModuleCount,
  );
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
