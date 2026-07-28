import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  canonicalizeLearningCommand,
  digestLearningCommand,
  validateLearningCommand,
  validateLearningEvent,
} from "../dist/index.js";

const schemaUrl = new URL(
  "../schemas/learning/learning-event-contract.schema.json",
  import.meta.url,
);
const exampleRoot = new URL("../examples/learning-events/", import.meta.url);
const invalidRoot = new URL("./fixtures/learning-events/", import.meta.url);

async function json(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

const [schema, assessmentCommand, recordedEvent, invalidPrivateField] =
  await Promise.all([
    json(schemaUrl),
    json(new URL("assessment-command.json", exampleRoot)),
    json(new URL("assessment-recorded-event.json", exampleRoot)),
    json(new URL("invalid-private-field.json", invalidRoot)),
  ]);

test("learning-event schema accepts commands and events and rejects private fields", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validate = ajv.compile(schema);

  assert.equal(
    validate(assessmentCommand),
    true,
    ajv.errorsText(validate.errors),
  );
  assert.equal(validate(recordedEvent), true, ajv.errorsText(validate.errors));
  assert.equal(validate(invalidPrivateField), false);
  assert.ok(
    validate.errors?.some(
      (error) =>
        error.keyword === "additionalProperties" &&
        error.params.additionalProperty === "primaryEmail",
    ),
  );
});

test("runtime validation enforces immutable assessment evidence", () => {
  assert.deepEqual(validateLearningCommand(assessmentCommand), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(validateLearningEvent(recordedEvent), {
    valid: true,
    errors: [],
  });

  const invalid = structuredClone(assessmentCommand);
  invalid.idempotencyKey = "short";
  invalid.payload.answers["question-1"] = -1;
  invalid.payload.primaryEmail = "not-allowed@example.test";
  const result = validateLearningCommand(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /idempotency key/);
  assert.match(result.errors.join("\n"), /nonnegative integer/);
  assert.match(result.errors.join("\n"), /primaryEmail/);
});

test("canonical command digests ignore object key insertion order", async () => {
  const reordered = {
    payload: {
      passed: assessmentCommand.payload.passed,
      scorePercent: assessmentCommand.payload.scorePercent,
      answers: {
        "question-2": 0,
        "question-1": 1,
      },
      assessmentVersion: assessmentCommand.payload.assessmentVersion,
      moduleId: assessmentCommand.payload.moduleId,
      pathId: assessmentCommand.payload.pathId,
      attemptId: assessmentCommand.payload.attemptId,
    },
    actor: {
      userId: assessmentCommand.actor.userId,
      type: assessmentCommand.actor.type,
    },
    occurredAt: assessmentCommand.occurredAt,
    contentVersion: assessmentCommand.contentVersion,
    idempotencyKey: assessmentCommand.idempotencyKey,
    learnerId: assessmentCommand.learnerId,
    installationId: assessmentCommand.installationId,
    type: assessmentCommand.type,
    schemaVersion: assessmentCommand.schemaVersion,
  };

  assert.equal(
    canonicalizeLearningCommand(reordered),
    canonicalizeLearningCommand(assessmentCommand),
  );
  assert.equal(
    await digestLearningCommand(reordered),
    await digestLearningCommand(assessmentCommand),
  );
  assert.equal(
    await digestLearningCommand(assessmentCommand),
    recordedEvent.commandDigest,
  );
  assert.match(await digestLearningCommand(assessmentCommand), /^[a-f0-9]{64}$/);
});

test("corrections require an accountable reason and preserve their own version", () => {
  const correction = {
    ...assessmentCommand,
    type: "assessment.correct",
    idempotencyKey: "assessment-correction-example-0001",
    actor: {
      type: "owner",
      userId: "owner-42",
    },
    payload: {
      correctionId: "correction-0001",
      attemptId: "attempt-0001",
      assessmentVersion: "1.0.0",
      scorePercent: 75,
      passed: false,
      reason: "A rubric arithmetic error was confirmed.",
    },
  };
  assert.deepEqual(validateLearningCommand(correction), {
    valid: true,
    errors: [],
  });

  correction.payload.reason = "";
  const rejected = validateLearningCommand(correction);
  assert.equal(rejected.valid, false);
  assert.match(rejected.errors.join("\n"), /correction reason/);
});
