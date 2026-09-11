// Learner-progress persistence gate for the hosted smoke (T-02).
//
// The progress defect that left production module_progress empty survived
// because "sign-in verified" only ever covered the OIDC redirect chain. Nothing
// ever wrote. A signed-in learner completed a module, the page showed it, and
// nothing reached D1 -- first because the worker refused the source the app
// sent (a silent 400), then because a CHECK constraint on progress_imports
// failed inside the batch that writes module_progress (a silent 500). A read
// that returned 200 with the wrong shape would have looked identical to both.
//
// This module is the assertion logic, kept free of any browser or network
// dependency so it can be proven against a mocked API and against the real
// worker in-process (tests/hosted-progress-persistence-gate.test.mjs). The
// hosted smoke (scripts/smoke-hosted-browser-session.mjs) drives it against the
// deployed API through two independently signed-in browser sessions.
//
// A "client" is `async ({ method, path, body }) => ({ status, text })`: one
// authenticated session talking to the account API. The gate never sees
// credentials.
//
// The sequence, and why each step is there:
//   1. Baseline read. 200 with a strict envelope, or fail.
//   2. Pre-clean. A crashed earlier run can leave the test module completed,
//      which would let a broken write pass. Remove it, then prove it is gone
//      from BOTH the progress read and the module_progress rows (the export).
//   3. Write one completion exactly as the front end does: PUT
//      /v1/me/progress with ACCOUNT_BACKED_PROGRESS_SOURCE and the whole
//      record produced by recordAssessmentAttempt. Fail on non-2xx and on a
//      2xx whose body does not carry the completion.
//   4. Open a FRESH session and read it back. The completion must be in
//      GET /v1/me/progress, and a module_progress row must exist for it in
//      GET /v1/me/export -- that row is what T-01's done-when is about.
//   5. Clean up: remove the test module again and prove it is gone, so the
//      gate is repeatable. Cleanup runs even when the gate failed (a 500 can
//      still leave the learning event committed), and a cleanup failure is
//      reported without hiding the original failure.

import {
  ACCOUNT_BACKED_PROGRESS_SOURCE,
  recordAssessmentAttempt,
  starterCatalog,
} from "../../dist/index.js";

export const GATE_ATTEMPT_PREFIX = "hosted-persistence-gate-";

export class ProgressPersistenceGateError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "ProgressPersistenceGateError";
  }
}

function fail(message, options) {
  throw new ProgressPersistenceGateError(message, options);
}

/**
 * The module the gate completes. It must come from the catalogue the worker
 * resolves against: importProgress silently skips any module id it cannot map
 * to a path, so a made-up id would let a broken module_progress write pass.
 * A capstone module needs a passed capstone submission before it counts as
 * completed, so the first non-capstone module is used.
 */
export function selectGateModule(catalog = starterCatalog) {
  const modulesById = new Map(catalog.modules.map((module) => [module.id, module]));
  for (const path of catalog.paths) {
    for (const moduleId of path.moduleIds) {
      const module = modulesById.get(moduleId);
      if (module && !module.capstone) return { pathId: path.id, moduleId };
    }
  }
  fail("The catalogue has no non-capstone module the gate can complete.");
}

function describeResponse(label, response) {
  let code = "";
  let requestId = "";
  try {
    const parsed = JSON.parse(response.text);
    if (typeof parsed?.error?.code === "string") code = `, ${parsed.error.code}`;
    if (typeof parsed?.error?.requestId === "string") {
      requestId = ` Request ${parsed.error.requestId}.`;
    }
  } catch {
    // The body is reported by status alone when it is not JSON.
  }
  return `${label} returned HTTP ${response.status}${code}.${requestId}`;
}

async function call(client, label, method, path, body) {
  let response;
  try {
    response = await client({ method, path, body });
  } catch (error) {
    fail(`${label}: ${method} ${path} did not complete (${error?.message ?? error}).`, {
      cause: error,
    });
  }
  if (!response || !Number.isInteger(response.status)) {
    fail(`${label}: ${method} ${path} produced no HTTP status.`);
  }
  if (response.status < 200 || response.status > 299) {
    fail(`${label}: ${describeResponse(`${method} ${path}`, response)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(response.text);
  } catch {
    fail(
      `${label}: ${method} ${path} returned HTTP ${response.status} with a body that is not JSON.`,
    );
  }
  return parsed;
}

/**
 * The exact envelope the front end reads: { progress: { revision, progress } }.
 * A 200 with any other shape is a failure, and the message says which part is
 * missing -- the client treats a missing `progress` key as "could not load", so
 * a shape drift here is a learner who sees nothing.
 */
export function readProgressEnvelope(body, label) {
  const envelope = body?.progress;
  if (!envelope || typeof envelope !== "object") {
    fail(
      `${label}: the response has no \`progress\` envelope (top-level keys: ${
        Object.keys(body ?? {}).join(", ") || "none"
      }). Expected { progress: { revision, progress } }.`,
    );
  }
  if (!Number.isInteger(envelope.revision) || envelope.revision < 0) {
    fail(
      `${label}: \`progress.revision\` is ${JSON.stringify(envelope.revision)}, not a non-negative integer.`,
    );
  }
  const progress = envelope.progress;
  if (
    !progress ||
    typeof progress !== "object" ||
    progress.schemaVersion !== 1 ||
    !Array.isArray(progress.completedModuleIds) ||
    !Array.isArray(progress.attempts) ||
    !Array.isArray(progress.startedPathIds) ||
    !Array.isArray(progress.badges) ||
    typeof progress.displayName !== "string" ||
    typeof progress.updatedAt !== "string"
  ) {
    fail(
      `${label}: \`progress.progress\` is not a Project 42 v1 learner record (keys: ${
        Object.keys(envelope).join(", ") || "none"
      }).`,
    );
  }
  return { revision: envelope.revision, progress };
}

function moduleRows(exportBody, label) {
  const rows = exportBody?.export?.moduleProgress;
  if (!Array.isArray(rows)) {
    fail(
      `${label}: GET /v1/me/export has no \`export.moduleProgress\` array, so the module_progress rows cannot be verified.`,
    );
  }
  return rows;
}

export function hasGateResidue(progress, moduleId) {
  return (
    progress.completedModuleIds.includes(moduleId) ||
    progress.attempts.some((attempt) => attempt.moduleId === moduleId) ||
    (progress.capstoneSubmissions ?? []).some(
      (submission) => submission.moduleId === moduleId,
    ) ||
    progress.badges.some((badge) =>
      (badge.evidenceModuleIds ?? []).includes(moduleId),
    ) ||
    progress.recentModule?.moduleId === moduleId
  );
}

/** The learner record with every trace of the test module removed. */
export function withoutGateModule(progress, moduleId, updatedAt) {
  const cleaned = {
    ...progress,
    completedModuleIds: progress.completedModuleIds.filter((id) => id !== moduleId),
    attempts: progress.attempts.filter((attempt) => attempt.moduleId !== moduleId),
    capstoneSubmissions: (progress.capstoneSubmissions ?? []).filter(
      (submission) => submission.moduleId !== moduleId,
    ),
    badges: progress.badges.filter(
      (badge) => !(badge.evidenceModuleIds ?? []).includes(moduleId),
    ),
    updatedAt,
  };
  if (cleaned.recentModule?.moduleId === moduleId) delete cleaned.recentModule;
  return cleaned;
}

async function readProgress(client, label) {
  return readProgressEnvelope(
    await call(client, label, "GET", "/v1/me/progress"),
    label,
  );
}

async function writeProgress(client, label, progress, importId) {
  return readProgressEnvelope(
    await call(client, label, "PUT", "/v1/me/progress", {
      importId,
      source: ACCOUNT_BACKED_PROGRESS_SOURCE,
      progress,
    }),
    `${label} response`,
  );
}

async function readModuleRows(client, label) {
  return moduleRows(await call(client, label, "GET", "/v1/me/export"), label);
}

function assertAbsent(progress, rows, moduleId, label) {
  if (hasGateResidue(progress, moduleId)) {
    fail(`${label}: the progress record still carries test module ${moduleId}.`);
  }
  if (rows.some((row) => row?.moduleId === moduleId)) {
    fail(`${label}: module_progress still holds a row for test module ${moduleId}.`);
  }
}

function assertCompletion(progress, { moduleId, attemptId }, label) {
  if (!progress.completedModuleIds.includes(moduleId)) {
    fail(
      `${label}: HTTP 200, but completedModuleIds does not contain ${moduleId}. The completion was not persisted.`,
    );
  }
  if (!progress.attempts.some((attempt) => attempt.id === attemptId)) {
    fail(
      `${label}: HTTP 200, but attempt ${attemptId} is missing. The completion was not persisted.`,
    );
  }
}

async function removeGateModule({ client, label, moduleId, now, newImportId, fallback }) {
  let current = fallback;
  try {
    current = (await readProgress(client, `${label} read`)).progress;
  } catch (error) {
    if (!fallback) throw error;
  }
  await writeProgress(
    client,
    `${label} write`,
    withoutGateModule(current, moduleId, now()),
    newImportId(),
  );
  const after = await readProgress(client, `${label} verification read`);
  const rows = await readModuleRows(client, `${label} verification export`);
  assertAbsent(after.progress, rows, moduleId, `${label} verification`);
  return after;
}

/**
 * Runs the gate. Resolves with a sanitized summary; rejects with a
 * ProgressPersistenceGateError whose message names the failing step.
 */
export async function runProgressPersistenceGate({
  primary,
  openFreshSession,
  runId,
  catalog = starterCatalog,
  now = () => new Date().toISOString(),
  newImportId = () => crypto.randomUUID(),
  log = () => {},
}) {
  if (typeof primary !== "function" || typeof openFreshSession !== "function") {
    fail("The gate needs a primary session client and a fresh-session factory.");
  }
  if (typeof runId !== "string" || !/^[a-z0-9][a-z0-9-]{5,62}$/.test(runId)) {
    fail("The gate needs a 6-63 character lowercase run identifier.");
  }
  const { pathId, moduleId } = selectGateModule(catalog);
  const attemptId = `${GATE_ATTEMPT_PREFIX}${runId}`;
  const target = { moduleId, attemptId };
  const summary = { pathId, moduleId, attemptId, preCleaned: false };

  // 1. Baseline.
  let baseline = await readProgress(primary, "Baseline GET /v1/me/progress");

  // 2. Pre-clean residue from an earlier run, then prove absence in both reads.
  if (hasGateResidue(baseline.progress, moduleId)) {
    log(`Removing residue for ${moduleId} left by an earlier run.`);
    await writeProgress(
      primary,
      "Pre-clean PUT /v1/me/progress",
      withoutGateModule(baseline.progress, moduleId, now()),
      newImportId(),
    );
    baseline = await readProgress(primary, "Post-clean GET /v1/me/progress");
    summary.preCleaned = true;
  }
  assertAbsent(
    baseline.progress,
    await readModuleRows(primary, "Baseline GET /v1/me/export"),
    moduleId,
    "Baseline",
  );

  // 3. One completion, built and sent exactly as the front end builds it.
  const completedAt = now();
  const next = recordAssessmentAttempt(baseline.progress, catalog, {
    attemptId,
    pathId,
    moduleId,
    completedAt,
    result: { correct: 1, total: 1, scorePercent: 100, passed: true, feedback: [] },
  });
  if (!next.completedModuleIds.includes(moduleId)) {
    fail(`recordAssessmentAttempt did not complete ${moduleId}; the gate cannot write it.`);
  }

  let attemptedWrite = false;
  let freshSession;
  let gateError;
  try {
    attemptedWrite = true;
    const written = await writeProgress(
      primary,
      "Completion PUT /v1/me/progress",
      next,
      newImportId(),
    );
    assertCompletion(written.progress, target, "Completion PUT /v1/me/progress response");
    summary.revisionAfterWrite = written.revision;

    // 4. A fresh session must see it, in the record and in module_progress.
    freshSession = await openFreshSession();
    const reread = await readProgress(freshSession, "Fresh-session GET /v1/me/progress");
    assertCompletion(reread.progress, target, "Fresh-session GET /v1/me/progress");
    const rows = await readModuleRows(freshSession, "Fresh-session GET /v1/me/export");
    const row = rows.find((candidate) => candidate?.moduleId === moduleId);
    if (!row) {
      fail(
        `Fresh-session GET /v1/me/export: HTTP 200, but module_progress has no row for ${moduleId}. The completion reached the event log but not the module_progress table.`,
      );
    }
    if (row.status !== "completed") {
      fail(
        `Fresh-session GET /v1/me/export: the module_progress row for ${moduleId} has status ${JSON.stringify(row.status)}, not "completed".`,
      );
    }
    summary.freshSessionRevision = reread.revision;
    summary.moduleProgressRows = rows.length;
  } catch (error) {
    gateError = error;
  }

  // 5. Cleanup, always, once a write was attempted.
  let cleanupError;
  if (attemptedWrite) {
    try {
      const cleaned = await removeGateModule({
        client: freshSession ?? primary,
        label: "Cleanup",
        moduleId,
        now,
        newImportId,
        fallback: baseline.progress,
      });
      summary.revisionAfterCleanup = cleaned.revision;
    } catch (error) {
      cleanupError = error;
    }
  }

  if (gateError && cleanupError) {
    fail(
      `${gateError.message} Cleanup also failed, so the next run will pre-clean: ${cleanupError.message}`,
      { cause: gateError },
    );
  }
  if (gateError) throw gateError;
  if (cleanupError) {
    fail(
      `The completion persisted, but cleanup failed and the gate is not repeatable: ${cleanupError.message}`,
      { cause: cleanupError },
    );
  }
  return summary;
}
