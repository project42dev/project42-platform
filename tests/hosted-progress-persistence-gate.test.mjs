// Proof that the T-02 persistence gate catches what it exists to catch.
//
// scripts/smoke-hosted-browser-session.mjs runs scripts/lib/
// hosted-progress-persistence.mjs against the deployed API with a real hosted
// sign-in, so it cannot run here. The assertion logic can. These tests run it
// against:
//
//   1. an in-memory account API with switchable faults -- the three cases the
//      gate must separate (persists -> pass; 500 -> fail; 200 without the
//      completion -> fail) plus the shape mismatch that previously looked
//      identical to success, a missing module_progress row, residue from a
//      crashed earlier run, and a cleanup that silently does nothing;
//   2. the real worker (handleRequest) over Miniflare D1 with every migration
//      applied -> pass; and with migration 0020 withheld, which reproduces the
//      CHECK constraint that made every production save a silent 500 until
//      2026-09-10 -> fail.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { D1Project42Repository, handleRequest } from "../dist/worker.js";
import { createEmptyProgress, starterCatalog } from "../dist/index.js";
import {
  GATE_ATTEMPT_PREFIX,
  ProgressPersistenceGateError,
  hasGateResidue,
  runProgressPersistenceGate,
  selectGateModule,
} from "../scripts/lib/hosted-progress-persistence.mjs";

const { pathId, moduleId } = selectGateModule();

// ---------------------------------------------------------------------------
// In-memory account API. It models the three routes the gate uses the way the
// worker answers them: GET/PUT /v1/me/progress return { progress: { revision,
// progress } }, and GET /v1/me/export returns module_progress rows derived from
// the last accepted snapshot.

function fakeAccountApi(faults = {}) {
  const store = {
    revision: 0,
    progress: createEmptyProgress("Smoke"),
    moduleRows: [],
    writes: [],
  };
  let completionWrites = 0;

  const envelope = () => ({
    revision: store.revision,
    progress: structuredClone(store.progress),
    synchronizedAt: "2026-09-11T00:00:00.000Z",
  });
  const reply = (status, body) => ({ status, text: JSON.stringify(body) });

  const client = (sessionName) => async ({ method, path, body }) => {
    if (method === "GET" && path === "/v1/me/progress") {
      if (faults.getStatus?.[sessionName]) {
        return reply(faults.getStatus[sessionName], {
          error: { code: "internal_error", requestId: "req-get" },
        });
      }
      const current = envelope();
      if (faults.flatShape) return reply(200, { progress: current.progress });
      if (faults.noEnvelope) return reply(200, { revision: current.revision });
      return reply(200, { progress: current });
    }
    if (method === "PUT" && path === "/v1/me/progress") {
      const isCompletion = body.progress.completedModuleIds.includes(moduleId);
      if (isCompletion) completionWrites += 1;
      store.writes.push({ session: sessionName, completion: isCompletion });
      if (isCompletion && faults.completionPutStatus) {
        return reply(faults.completionPutStatus, {
          error: { code: "internal_error", requestId: "req-put" },
        });
      }
      if (!isCompletion && faults.ignoreCleanup && completionWrites > 0) {
        // Accept the cleanup and keep the completion -- a 200 that did nothing.
        return reply(200, { progress: envelope() });
      }
      if (isCompletion && faults.dropCompletion) {
        // Answer 200 but persist nothing. Optionally echo the submitted record
        // so the response itself looks like success.
        return reply(200, {
          progress: faults.echoSubmitted
            ? { revision: store.revision + 1, progress: body.progress }
            : envelope(),
        });
      }
      store.revision += 1;
      store.progress = structuredClone(body.progress);
      store.moduleRows = faults.skipModuleRows
        ? []
        : body.progress.completedModuleIds.map((id) => ({
            pathId,
            moduleId: id,
            status: "completed",
          }));
      return reply(200, { progress: envelope() });
    }
    if (method === "GET" && path === "/v1/me/export") {
      return reply(200, {
        export: { progress: envelope(), moduleProgress: store.moduleRows },
      });
    }
    return reply(404, { error: { code: "not_found" } });
  };

  let freshSessions = 0;
  return {
    store,
    get freshSessions() {
      return freshSessions;
    },
    gateInput: (runId = "mock-run-0001") => ({
      primary: client("primary"),
      openFreshSession: async () => {
        freshSessions += 1;
        return client("fresh");
      },
      runId,
    }),
  };
}

test("the gate completes a real catalogue module that is not a capstone", () => {
  const path = starterCatalog.paths.find((candidate) => candidate.id === pathId);
  const module = starterCatalog.modules.find((candidate) => candidate.id === moduleId);
  assert.ok(path?.moduleIds.includes(moduleId));
  assert.ok(module && !module.capstone);
});

test("(a) an API that persists the completion passes, and cleanup leaves nothing behind", async () => {
  const api = fakeAccountApi();
  const summary = await runProgressPersistenceGate(api.gateInput());
  assert.equal(summary.moduleId, moduleId);
  assert.equal(summary.attemptId, `${GATE_ATTEMPT_PREFIX}mock-run-0001`);
  assert.equal(summary.preCleaned, false);
  assert.equal(api.freshSessions, 1, "the read-back must come from a fresh session");
  assert.ok(
    api.store.writes.some((write) => write.completion && write.session === "primary"),
    "the gate must actually have written a completion",
  );
  assert.equal(hasGateResidue(api.store.progress, moduleId), false);
  assert.deepEqual(api.store.moduleRows, []);

  // Repeatable: a second run on the same account passes too.
  await runProgressPersistenceGate(api.gateInput("mock-run-0002"));
  assert.equal(hasGateResidue(api.store.progress, moduleId), false);
});

test("(b) a 500 on the completion write fails the gate and names the status", async () => {
  const api = fakeAccountApi({ completionPutStatus: 500 });
  await assert.rejects(
    runProgressPersistenceGate(api.gateInput()),
    (error) =>
      error instanceof ProgressPersistenceGateError &&
      /Completion PUT \/v1\/me\/progress: PUT \/v1\/me\/progress returned HTTP 500, internal_error\. Request req-put\./.test(
        error.message,
      ),
  );
});

test("(b) a 500 on the fresh-session read fails the gate, and cleanup still runs", async () => {
  const api = fakeAccountApi({ getStatus: { fresh: 500 } });
  await assert.rejects(
    runProgressPersistenceGate(api.gateInput()),
    /Fresh-session GET \/v1\/me\/progress: GET \/v1\/me\/progress returned HTTP 500/,
  );
  // The fresh session could not read, so cleanup fell back to the baseline
  // record; the completion must still have been removed.
  assert.equal(hasGateResidue(api.store.progress, moduleId), false);
});

test("(c) a 200 that persisted nothing fails at the write response", async () => {
  const api = fakeAccountApi({ dropCompletion: true });
  await assert.rejects(
    runProgressPersistenceGate(api.gateInput()),
    /Completion PUT \/v1\/me\/progress response: HTTP 200, but completedModuleIds does not contain/,
  );
});

test("(c) a 200 that echoes the completion but never stored it fails on the fresh-session read", async () => {
  const api = fakeAccountApi({ dropCompletion: true, echoSubmitted: true });
  await assert.rejects(
    runProgressPersistenceGate(api.gateInput()),
    new RegExp(
      `Fresh-session GET /v1/me/progress: HTTP 200, but completedModuleIds does not contain ${moduleId}\\. The completion was not persisted\\.`,
    ),
  );
});

test("a 200 whose body has the wrong shape fails and says which part is missing", async () => {
  await assert.rejects(
    runProgressPersistenceGate(fakeAccountApi({ flatShape: true }).gateInput()),
    /Baseline GET \/v1\/me\/progress: `progress\.revision` is undefined/,
  );
  await assert.rejects(
    runProgressPersistenceGate(fakeAccountApi({ noEnvelope: true }).gateInput()),
    /Baseline GET \/v1\/me\/progress: the response has no `progress` envelope \(top-level keys: revision\)/,
  );
});

test("a completion that never reaches module_progress fails the gate", async () => {
  const api = fakeAccountApi({ skipModuleRows: true });
  await assert.rejects(
    runProgressPersistenceGate(api.gateInput()),
    new RegExp(`module_progress has no row for ${moduleId}`),
  );
});

test("residue from a crashed earlier run is removed before the write, not counted as success", async () => {
  const api = fakeAccountApi();
  api.store.progress.completedModuleIds = [moduleId];
  api.store.progress.attempts = [
    {
      id: `${GATE_ATTEMPT_PREFIX}crashed-run`,
      pathId,
      moduleId,
      contentVersion: starterCatalog.contentVersion,
      scorePercent: 100,
      passed: true,
      completedAt: "2026-09-10T00:00:00.000Z",
    },
  ];
  api.store.moduleRows = [{ pathId, moduleId, status: "completed" }];
  api.store.revision = 3;

  const summary = await runProgressPersistenceGate(api.gateInput());
  assert.equal(summary.preCleaned, true);
  assert.equal(api.store.writes.filter((write) => write.completion).length, 1);
  assert.equal(hasGateResidue(api.store.progress, moduleId), false);

  // Residue the API answers 200 to but never removes must stop the gate BEFORE
  // it writes: otherwise the stale completion would satisfy the read-back.
  const stuck = fakeAccountApi();
  stuck.store.progress.completedModuleIds = [moduleId];
  stuck.store.moduleRows = [{ pathId, moduleId, status: "completed" }];
  const input = stuck.gateInput();
  const primary = input.primary;
  input.primary = async (request) =>
    request.method === "PUT"
      ? {
          status: 200,
          text: JSON.stringify({
            progress: { revision: 1, progress: stuck.store.progress },
          }),
        }
      : primary(request);
  await assert.rejects(
    runProgressPersistenceGate(input),
    /Baseline: the progress record still carries test module/,
  );
  assert.equal(stuck.store.writes.length, 0);
});

test("a cleanup that answers 200 but removes nothing fails the gate as not repeatable", async () => {
  const api = fakeAccountApi({ ignoreCleanup: true });
  await assert.rejects(
    runProgressPersistenceGate(api.gateInput()),
    /The completion persisted, but cleanup failed and the gate is not repeatable: Cleanup verification: the progress record still carries test module/,
  );
});

// ---------------------------------------------------------------------------
// The real worker, over a real (Miniflare) D1 database.

const issuer = "https://issuer.example.test";
const origin = "https://learn.example.test";

async function realWorker(t, { withholdMigration } = {}) {
  const installationId = `persistence-gate-${withholdMigration ? "regressed" : "current"}`;
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: installationId },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  const migrations = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql") && name !== withholdMigration)
    .sort();
  assert.ok(migrations.length > 0, "the migrations directory must not be empty");
  for (const migration of migrations) {
    const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
    await database.exec(sql.replace(/\r?\n/g, " "));
  }
  const repository = new D1Project42Repository(database, installationId);
  const now = Math.floor(Date.now() / 1_000);
  const identity = {
    issuer,
    subject: "hosted-smoke-subject",
    email: "hosted-smoke@example.test",
    emailVerified: true,
    displayName: "Hosted Smoke",
    issuedAt: now,
    authenticatedAt: now,
  };
  const env = {
    PROJECT42_DB: database,
    INSTALLATION_ID: installationId,
    ALLOWED_ORIGINS: origin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: identity.subject,
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
  };
  const verifier = { verify: async () => identity };
  const client = (token) => async ({ method, path, body }) => {
    const headers = new Headers({
      accept: "application/json",
      authorization: `Bearer ${token}`,
      origin,
    });
    if (body !== undefined) headers.set("content-type", "application/json");
    const response = await handleRequest(
      new Request(`https://api.example.test${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
      env,
      verifier,
      repository,
    );
    return { status: response.status, text: await response.text() };
  };
  const session = await client("bootstrap")({ method: "POST", path: "/v1/session" });
  assert.equal(session.status, 200, `session bootstrap failed: ${session.text}`);
  assert.equal(JSON.parse(session.text).account.state, "approved");

  const countModuleRows = async () =>
    (
      await database
        .prepare(`SELECT COUNT(*) AS n FROM module_progress WHERE installation_id = ?`)
        .bind(installationId)
        .first()
    ).n;
  return { client, countModuleRows };
}

test("the real worker with every migration applied passes the gate and ends clean", async (t) => {
  const worker = await realWorker(t);
  const summary = await runProgressPersistenceGate({
    primary: worker.client("session-one"),
    openFreshSession: async () => worker.client("session-two"),
    runId: "worker-run-0001",
  });
  assert.equal(summary.moduleId, moduleId);
  assert.ok(summary.freshSessionRevision >= 1);
  assert.equal(await worker.countModuleRows(), 0, "cleanup must remove the module_progress row");

  // And again, on the same account: the gate is repeatable.
  await runProgressPersistenceGate({
    primary: worker.client("session-three"),
    openFreshSession: async () => worker.client("session-four"),
    runId: "worker-run-0002",
  });
});

test("the real worker without migration 0020 -- production until 2026-09-10 -- fails the gate", async (t) => {
  const worker = await realWorker(t, {
    withholdMigration: "0020_account_backed_progress_source.sql",
  });
  await assert.rejects(
    runProgressPersistenceGate({
      primary: worker.client("session-one"),
      openFreshSession: async () => worker.client("session-two"),
      runId: "worker-run-regressed",
    }),
    /Completion PUT \/v1\/me\/progress: PUT \/v1\/me\/progress returned HTTP 500/,
  );
  assert.equal(await worker.countModuleRows(), 0, "the regressed schema writes no module_progress row");
});
