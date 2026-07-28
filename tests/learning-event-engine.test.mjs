import assert from "node:assert/strict";
import test from "node:test";
import {
  InMemoryLearningEventStore,
  LearningEventEngine,
  LearningEventEngineError,
  projectLearningEvents,
} from "../dist/index.js";

const installationId = "test-installation";
const learnerId = "learner-42";
const contentVersion = "0.36.0";
const learnerAccess = {
  installationId,
  actorType: "learner",
  actorUserId: learnerId,
  permissions: [
    "learning:write:self",
    "learning:read:self",
    "learning:delete:self",
  ],
};
const ownerAccess = {
  installationId,
  actorType: "owner",
  actorUserId: "owner-42",
  permissions: [
    "learning:write:any",
    "learning:read:any",
    "learning:delete:any",
  ],
};

function command(type, idempotencyKey, payload, options = {}) {
  return {
    schemaVersion: "1.0",
    type,
    installationId,
    learnerId,
    idempotencyKey,
    contentVersion,
    occurredAt: options.occurredAt ?? "2026-07-28T12:00:00.000Z",
    actor: options.actor ?? {
      type: "learner",
      userId: learnerId,
    },
    payload,
  };
}

function createEngine() {
  const store = new InMemoryLearningEventStore();
  const engine = new LearningEventEngine(store, {
    now: () => "2026-07-28T13:00:00.000Z",
  });
  return { store, engine };
}

async function enroll(engine) {
  return engine.execute(
    command("path.enroll", "path-enroll-example-0001", {
      pathId: "foundations",
      pathTitle: "AI Foundations",
      moduleIds: ["module-1", "module-2"],
      badge: {
        id: "foundations-badge",
        name: "Foundations",
        description: "Completed the AI Foundations path.",
      },
    }),
    learnerAccess,
  );
}

test("identical retries return the original event and one authoritative record", async () => {
  const { engine } = createEngine();
  const first = await enroll(engine);
  const second = await enroll(engine);

  assert.equal(first.replayed, false);
  assert.equal(second.replayed, true);
  assert.deepEqual(second.event, first.event);
  assert.equal(second.projection.revision, 1);
  assert.equal(second.projection.enrollments.length, 1);
});

test("idempotency keys cannot be rebound and attempt IDs remain immutable", async () => {
  const { engine } = createEngine();
  await enroll(engine);

  const attempt = command("assessment.record", "assessment-example-key-0001", {
    attemptId: "attempt-1",
    pathId: "foundations",
    moduleId: "module-1",
    assessmentVersion: "1.0.0",
    answers: { "question-1": 0 },
    scorePercent: 0,
    passed: false,
  });
  await engine.execute(attempt, learnerAccess);

  await assert.rejects(
    () =>
      engine.execute(
        {
          ...attempt,
          payload: {
            ...attempt.payload,
            scorePercent: 100,
            passed: true,
          },
        },
        learnerAccess,
      ),
    (error) =>
      error instanceof LearningEventEngineError &&
      error.code === "idempotency-conflict",
  );

  await assert.rejects(
    () =>
      engine.execute(
        {
          ...attempt,
          idempotencyKey: "assessment-example-key-0002",
        },
        learnerAccess,
      ),
    (error) =>
      error instanceof LearningEventEngineError &&
      error.code === "duplicate-attempt-id",
  );
});

test("distinct concurrent attempts retain their original answers and scores", async () => {
  const { engine } = createEngine();
  await enroll(engine);
  const attempts = [
    command(
      "assessment.record",
      "assessment-concurrent-key-0001",
      {
        attemptId: "attempt-concurrent-1",
        pathId: "foundations",
        moduleId: "module-1",
        assessmentVersion: "1.0.0",
        answers: { "question-1": 0, "question-2": null },
        scorePercent: 0,
        passed: false,
      },
      { occurredAt: "2026-07-28T12:01:00.000Z" },
    ),
    command(
      "assessment.record",
      "assessment-concurrent-key-0002",
      {
        attemptId: "attempt-concurrent-2",
        pathId: "foundations",
        moduleId: "module-1",
        assessmentVersion: "1.0.0",
        answers: { "question-1": 1, "question-2": 0 },
        scorePercent: 100,
        passed: true,
      },
      { occurredAt: "2026-07-28T12:02:00.000Z" },
    ),
  ];

  await Promise.all(
    attempts.map((attempt) => engine.execute(attempt, learnerAccess)),
  );
  const projection = await engine.rebuild(
    installationId,
    learnerId,
    learnerAccess,
  );

  assert.equal(projection.attempts.length, 2);
  assert.deepEqual(projection.attempts[0].answers, {
    "question-1": 0,
    "question-2": null,
  });
  assert.equal(projection.attempts[0].originalScorePercent, 0);
  assert.deepEqual(projection.attempts[1].answers, {
    "question-1": 1,
    "question-2": 0,
  });
  assert.equal(projection.attempts[1].originalScorePercent, 100);
});

test("rebuild reproduces completion, correction, transcript, and badge history", async () => {
  const { engine } = createEngine();
  await enroll(engine);
  await engine.execute(
    command(
      "module.visit",
      "module-visit-example-0001",
      { pathId: "foundations", moduleId: "module-1" },
      { occurredAt: "2026-07-28T12:01:00.000Z" },
    ),
    learnerAccess,
  );
  await engine.execute(
    command(
      "assessment.record",
      "assessment-history-key-0001",
      {
        attemptId: "attempt-history-1",
        pathId: "foundations",
        moduleId: "module-1",
        assessmentVersion: "1.0.0",
        answers: { "question-1": 1 },
        scorePercent: 70,
        passed: false,
      },
      { occurredAt: "2026-07-28T12:02:00.000Z" },
    ),
    learnerAccess,
  );
  const corrected = await engine.execute(
    command(
      "assessment.correct",
      "assessment-correction-key-0001",
      {
        correctionId: "correction-history-1",
        attemptId: "attempt-history-1",
        assessmentVersion: "1.0.0",
        scorePercent: 80,
        passed: true,
        reason: "The recorded total omitted one accepted answer.",
      },
      {
        occurredAt: "2026-07-28T12:03:00.000Z",
        actor: { type: "owner", userId: "owner-42" },
      },
    ),
    ownerAccess,
  );
  await engine.execute(
    command(
      "module.complete",
      "module-complete-example-0001",
      {
        pathId: "foundations",
        moduleId: "module-1",
        evidenceRefs: ["assessment:attempt-history-1"],
      },
      { occurredAt: "2026-07-28T12:04:00.000Z" },
    ),
    learnerAccess,
  );
  const completed = await engine.execute(
    command(
      "module.complete",
      "module-complete-example-0002",
      {
        pathId: "foundations",
        moduleId: "module-2",
        evidenceRefs: ["project:module-2"],
      },
      { occurredAt: "2026-07-28T12:05:00.000Z" },
    ),
    learnerAccess,
  );

  const rebuilt = await engine.rebuild(
    installationId,
    learnerId,
    learnerAccess,
  );
  assert.deepEqual(rebuilt, completed.projection);
  assert.equal(rebuilt.attempts[0].originalScorePercent, 70);
  assert.equal(rebuilt.attempts[0].originalPassed, false);
  assert.equal(rebuilt.attempts[0].effectiveScorePercent, 80);
  assert.equal(rebuilt.attempts[0].effectivePassed, true);
  assert.equal(rebuilt.attempts[0].corrections.length, 1);
  assert.equal(corrected.projection.attempts[0].corrections.length, 1);
  assert.deepEqual(rebuilt.transcript, [
    {
      pathId: "foundations",
      pathTitle: "AI Foundations",
      contentVersion,
      completedModules: 2,
      totalModules: 2,
      completionPercent: 100,
      bestScorePercent: 80,
    },
  ]);
  assert.equal(rebuilt.badges.length, 1);
  assert.equal(rebuilt.badges[0].earnedAt, "2026-07-28T12:05:00.000Z");
});

test("projection fails closed on missing enrollment and version-changing corrections", async () => {
  const { engine } = createEngine();
  await assert.rejects(
    () =>
      engine.execute(
        command("module.visit", "module-without-path-0001", {
          pathId: "missing",
          moduleId: "missing-module",
        }),
        learnerAccess,
      ),
    (error) =>
      error instanceof LearningEventEngineError &&
      error.code === "projection-conflict",
  );
  assert.equal(
    (
      await engine.rebuild(
        installationId,
        learnerId,
        learnerAccess,
      )
    ).revision,
    0,
  );

  const { engine: correctionEngine } = createEngine();
  await enroll(correctionEngine);
  await correctionEngine.execute(
    command("assessment.record", "assessment-version-key-0001", {
      attemptId: "attempt-version-1",
      pathId: "foundations",
      moduleId: "module-1",
      assessmentVersion: "1.0.0",
      answers: { "question-1": 0 },
      scorePercent: 0,
      passed: false,
    }),
    learnerAccess,
  );
  await assert.rejects(
    () =>
      correctionEngine.execute(
        command(
          "assessment.correct",
          "assessment-version-correction-0001",
          {
            correctionId: "correction-version-1",
            attemptId: "attempt-version-1",
            assessmentVersion: "2.0.0",
            scorePercent: 100,
            passed: true,
            reason: "Attempted retroactive rubric change.",
          },
          { actor: { type: "owner", userId: "owner-42" } },
        ),
        ownerAccess,
      ),
    (error) =>
      error instanceof LearningEventEngineError &&
      error.code === "projection-conflict",
  );
});

test("authorization isolates installations and learner records", async () => {
  const { engine } = createEngine();
  await assert.rejects(
    () =>
      engine.execute(
        command("path.enroll", "unauthorized-enrollment-0001", {
          pathId: "foundations",
          pathTitle: "AI Foundations",
          moduleIds: ["module-1"],
          badge: {
            id: "foundations-badge",
            name: "Foundations",
            description: "Completed foundations.",
          },
        }),
        {
          ...learnerAccess,
          installationId: "another-installation",
        },
      ),
    (error) =>
      error instanceof LearningEventEngineError &&
      error.code === "access-denied",
  );

  await enroll(engine);
  await assert.rejects(
    () =>
      engine.rebuild(installationId, learnerId, {
        ...learnerAccess,
        actorUserId: "another-learner",
      }),
    (error) =>
      error instanceof LearningEventEngineError &&
      error.code === "access-denied",
  );
});

test("export is lossless and deletion requires explicit authority", async () => {
  const { engine } = createEngine();
  await enroll(engine);
  const exported = await engine.export(
    installationId,
    learnerId,
    learnerAccess,
  );
  assert.equal(exported.length, 1);
  assert.deepEqual(
    projectLearningEvents(exported, installationId, learnerId),
    await engine.rebuild(installationId, learnerId, learnerAccess),
  );

  await assert.rejects(
    () =>
      engine.delete(installationId, learnerId, {
        ...learnerAccess,
        permissions: ["learning:read:self"],
      }),
    (error) =>
      error instanceof LearningEventEngineError &&
      error.code === "access-denied",
  );
  assert.equal(
    await engine.delete(installationId, learnerId, learnerAccess),
    1,
  );
  assert.equal(
    (
      await engine.rebuild(
        installationId,
        learnerId,
        learnerAccess,
      )
    ).revision,
    0,
  );
});
