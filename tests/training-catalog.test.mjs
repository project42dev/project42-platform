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

test("coverage classifies every substantive module without overstating readiness", async () => {
  const committedCoverage = JSON.parse(
    await readFile(resolve(root, "content/training/coverage.json"), "utf8"),
  );
  assert.deepEqual(committedCoverage, trainingPackageCoverage);
  assert.equal(trainingPackageCoverage.substantiveModuleCount, 49);
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
  assert.equal(trainingPackageCoverage.modules.length, 49);
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
