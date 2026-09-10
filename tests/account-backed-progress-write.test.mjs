// The gate for the defect that made progress vanish in production.
//
// Between the front end shipping account-backed saves and 2026-09-09, every
// routine PUT /v1/me/progress from a signed-in learner was refused 400
// invalid_progress_import: the app stamped source "account-backed-v1" and the
// worker's allow-list named only the two *import* sources. Reads were
// unaffected, so the failure was silent -- a learner completed a module, saw
// it, reloaded, and it was gone. Production D1 held zero rows in
// module_progress and assessment_attempts, with learning_progress frozen at
// revision 1 from 2026-07-30.
//
// Nothing caught it. tests/authoritative-progress-api.test.mjs exercised the
// endpoint with source "browser-local-v1" and empty completedModuleIds, so it
// passed throughout. The browser suites mock the PUT and accept any body.
//
// This test closes both holes at once: it sends the source the app actually
// sends, and it asserts on the ROWS rather than on the status code, so a 200
// that writes nothing still fails.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import {
  D1Project42Repository,
  handleRequest,
} from "../dist/worker.js";
import {
  ACCOUNT_BACKED_PROGRESS_SOURCE,
  PROGRESS_IMPORT_SOURCES,
  starterCatalog,
} from "../dist/index.js";

const issuer = "https://issuer.example.test";
const origin = "https://learn.example.test";
const installationId = "account-backed-write";

async function applyMigrations(database) {
  const migrations = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(
      new URL(`../migrations/${migration}`, import.meta.url),
      "utf8",
    );
    await database.exec(sql.replace(/\r?\n/g, " "));
  }
}

test("the source the client hardcodes is the source the worker accepts", async () => {
  const clientSource = await readFile(
    new URL("../web/app/components/ProgressProvider.tsx", import.meta.url),
    "utf8",
  );
  // The client must take the value from the shared contract. A re-inlined
  // literal is exactly how the two sides drifted apart the first time.
  assert.match(
    clientSource,
    /source: ACCOUNT_BACKED_PROGRESS_SOURCE/,
    "ProgressProvider must send the shared ACCOUNT_BACKED_PROGRESS_SOURCE constant, not a hardcoded string.",
  );
  assert.ok(
    PROGRESS_IMPORT_SOURCES.includes(ACCOUNT_BACKED_PROGRESS_SOURCE),
    "The worker's accepted-source list must include the source the app sends.",
  );
});

test("an account-backed save from the signed-in app reaches D1", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-account-backed-write" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyMigrations(database);
  const repository = new D1Project42Repository(database, installationId);
  const identity = {
    issuer,
    subject: "learner-subject",
    email: "learner@example.test",
    emailVerified: true,
    displayName: "Learner",
    issuedAt: Math.floor(Date.now() / 1_000),
  };
  const verifier = { verify: async () => identity };
  const env = {
    PROJECT42_DB: database,
    INSTALLATION_ID: installationId,
    ALLOWED_ORIGINS: origin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: identity.subject,
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
  };
  const api = (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", "Bearer learner");
    headers.set("origin", origin);
    if (init.body) headers.set("content-type", "application/json");
    return handleRequest(
      new Request(`https://api.example.test${path}`, { ...init, headers }),
      env,
      verifier,
      repository,
    );
  };

  const session = await api("/v1/session", { method: "POST" });
  assert.equal(session.status, 200);
  const account = (await session.json()).account;
  assert.equal(account.state, "approved");

  // Take the module from the catalogue the worker itself resolves against.
  // importProgress skips any module id it cannot find a path for, silently, so
  // a made-up id would let a broken write pass this test.
  const path = starterCatalog.paths.find((candidate) => candidate.moduleIds.length > 0);
  assert.ok(path, "the shipped catalogue must contain at least one path with modules");
  const moduleId = path.moduleIds[0];

  const completedAt = "2026-09-10T12:00:00.000Z";
  const progress = {
    schemaVersion: 1,
    displayName: "Learner",
    startedPathIds: [path.id],
    completedModuleIds: [moduleId],
    attempts: [
      {
        id: "attempt-account-backed-1",
        pathId: path.id,
        moduleId,
        contentVersion: starterCatalog.contentVersion,
        scorePercent: 100,
        passed: true,
        completedAt,
      },
    ],
    capstoneSubmissions: [],
    badges: [],
    updatedAt: completedAt,
  };

  // This is the request the browser makes: PUT, not POST, with the app's own
  // source. Both verbs route to the same handler; PUT is what shipped.
  const saved = await api("/v1/me/progress", {
    method: "PUT",
    body: JSON.stringify({
      importId: "account-backed-write-1",
      source: ACCOUNT_BACKED_PROGRESS_SOURCE,
      progress,
    }),
  });
  assert.equal(
    saved.status,
    200,
    `an account-backed save must be accepted; body: ${await saved.clone().text()}`,
  );

  // The status code is not the gate. These rows are.
  const modules = await database
    .prepare(
      `SELECT path_id, module_id, status, completed_at
         FROM module_progress
        WHERE installation_id = ? AND user_id = ?`,
    )
    .bind(installationId, account.id)
    .all();
  assert.equal(
    modules.results.length,
    1,
    "a completed module must land a module_progress row",
  );
  assert.equal(modules.results[0].module_id, moduleId);
  assert.equal(modules.results[0].path_id, path.id);
  assert.equal(modules.results[0].status, "completed");

  const attempts = await database
    .prepare(
      `SELECT id, module_id, score_percent, passed
         FROM assessment_attempts
        WHERE installation_id = ? AND user_id = ?`,
    )
    .bind(installationId, account.id)
    .all();
  assert.equal(
    attempts.results.length,
    1,
    "a scored attempt must land an assessment_attempts row",
  );
  assert.equal(attempts.results[0].id, "attempt-account-backed-1");
  assert.equal(Number(attempts.results[0].passed), 1);

  const transcript = await database
    .prepare(
      `SELECT path_id, completed_modules
         FROM transcript_entries
        WHERE installation_id = ? AND user_id = ? AND path_id = ?`,
    )
    .bind(installationId, account.id, path.id)
    .first();
  assert.ok(transcript, "the transcript must record the path the learner worked");
  assert.equal(Number(transcript.completed_modules), 1);

  // The append-only log must carry the true provenance, not a relabelled one.
  const event = await database
    .prepare(
      `SELECT event_type, actor_type, payload_json
         FROM learning_events
        WHERE installation_id = ? AND user_id = ?`,
    )
    .bind(installationId, account.id)
    .first();
  assert.equal(event.event_type, "progress.imported");
  assert.equal(event.actor_type, "learner");
  assert.equal(
    JSON.parse(event.payload_json).source,
    ACCOUNT_BACKED_PROGRESS_SOURCE,
  );

  // A reload must show the learner what they just did.
  const reread = await api("/v1/me/progress");
  assert.equal(reread.status, 200);
  const envelope = (await reread.json()).progress;
  assert.ok(envelope, "GET must return a progress envelope");
  assert.deepEqual(envelope.progress.completedModuleIds, [moduleId]);

  // And an unknown source must still be refused, with the received value named.
  const refused = await api("/v1/me/progress", {
    method: "PUT",
    body: JSON.stringify({
      importId: "account-backed-write-2",
      source: "not-a-real-source",
      progress,
    }),
  });
  assert.equal(refused.status, 400);
  const refusedBody = await refused.json();
  assert.equal(refusedBody.error.code, "invalid_progress_import");
  assert.match(refusedBody.error.message, /not-a-real-source/);
});
