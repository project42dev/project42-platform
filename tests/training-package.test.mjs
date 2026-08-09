import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  getLearningModule,
  validateClassScriptPackage,
  validateVirtualInstructorMediaManifest,
} from "../dist/index.js";
import { buildTrainingFixtureArtifacts } from "../scripts/training-fixture-lib.mjs";

const fixtureRoot = new URL(
  "../content/training/ai-foundations/language-models-and-generation/",
  import.meta.url,
);
const schemaRoot = new URL("../schemas/training/", import.meta.url);

async function json(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

const [classScript, mediaManifest, classSchema, mediaSchema] = await Promise.all([
  json(new URL("class-script.json", fixtureRoot)),
  json(new URL("media-manifest.example.json", fixtureRoot)),
  json(new URL("class-script-package.schema.json", schemaRoot)),
  json(new URL("virtual-instructor-media-manifest.schema.json", schemaRoot)),
]);

function clone(value) {
  return structuredClone(value);
}

test("machine-readable training schemas accept complete draft fixtures", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validateClassSchema = ajv.compile(classSchema);
  const validateMediaSchema = ajv.compile(mediaSchema);

  assert.equal(validateClassSchema(classScript), true, JSON.stringify(validateClassSchema.errors));
  assert.equal(validateMediaSchema(mediaManifest), true, JSON.stringify(validateMediaSchema.errors));

  const extra = clone(classScript);
  extra.privateDeploymentAlias = "must-not-be-accepted";
  assert.equal(validateClassSchema(extra), false);
  assert.ok(
    validateClassSchema.errors?.some(
      (error) => error.keyword === "additionalProperties",
    ),
  );
});

test("representative class fixture is read-aloud, section-complete, sourced, and paced", () => {
  const module = getLearningModule(classScript.moduleId);
  assert.ok(module);
  const result = validateClassScriptPackage(classScript, module);
  assert.deepEqual(result, { valid: true, errors: [] });
  assert.ok(classScript.spokenWordCount >= 900);
  assert.ok(classScript.segments.some((segment) => segment.kind === "demonstration"));
  assert.ok(classScript.segments.some((segment) => segment.kind === "feedback"));
});

test("class-script gate rejects outline-only, unsourced, dependent, and unapproved packages", () => {
  const module = getLearningModule(classScript.moduleId);
  assert.ok(module);
  const invalid = clone(classScript);
  invalid.spokenWordCount = 12;
  invalid.segments = invalid.segments.filter(
    (segment) => segment.id !== "certainty-explanation",
  );
  invalid.plannedDurationSeconds -= 80;
  invalid.segments.find(
    (segment) => segment.id === "generation-step-explanation",
  ).sourceUrls = [];
  invalid.provenance.contributions.find(
    (entry) => entry.role === "factual-verification",
  ).providerFamily = invalid.provenance.contributions.find(
    (entry) => entry.role === "curriculum-writing",
  ).providerFamily;
  invalid.releaseStatus = "approved";

  const result = validateClassScriptPackage(invalid, module);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("spokenWordCount")));
  assert.ok(result.errors.some((error) => error.includes("capability-not-certainty")));
  assert.ok(result.errors.some((error) => error.includes("needs at least one source")));
  assert.ok(result.errors.some((error) => error.includes("different provider families")));
  assert.ok(result.errors.some((error) => error.includes("editorial approval")));
  assert.ok(result.errors.some((error) => error.includes("subject-matter approval")));
  assert.ok(result.errors.some((error) => error.includes("accessibility approval")));
  assert.ok(
    result.errors.some((error) =>
      error.includes("completed factual-verification"),
    ),
  );
});

test("media manifest is publish-time, portable, accessible, and human-gated", () => {
  assert.deepEqual(validateVirtualInstructorMediaManifest(mediaManifest), {
    valid: true,
    errors: [],
  });

  const invalid = clone(mediaManifest);
  invalid.artifacts[0].path = "../private/audio.mp3";
  invalid.artifacts = invalid.artifacts.filter(
    (artifact) => artifact.kind !== "captions",
  );
  invalid.releaseStatus = "approved";

  const result = validateVirtualInstructorMediaManifest(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("unsafe or duplicated")));
  assert.ok(result.errors.some((error) => error.includes("captions artifact")));
  assert.ok(result.errors.some((error) => error.includes("editorial approval")));
  assert.ok(result.errors.some((error) => error.includes("factual approval")));
  assert.ok(result.errors.some((error) => error.includes("accessibility approval")));
  assert.ok(result.errors.some((error) => error.includes("media-release approval")));
});

test("caption, transcript, text-only, reduced-motion, and integrity fixtures are reproducible", async () => {
  const expected = buildTrainingFixtureArtifacts(classScript);
  const generatedRoot = fixtureRoot;
  for (const [path, content] of Object.entries(expected)) {
    const fixture = await readFile(new URL(path, generatedRoot), "utf8");
    assert.equal(fixture.replaceAll("\r\n", "\n"), content.replaceAll("\r\n", "\n"));
  }
  assert.ok(expected["captions/en-US.vtt"].startsWith("WEBVTT\n"));
  assert.ok(expected["transcripts/en-US.md"].includes(classScript.title));
});
