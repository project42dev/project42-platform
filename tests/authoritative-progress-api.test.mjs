import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import {
  D1Project42Repository,
  handleRequest,
} from "../dist/worker.js";

const issuer = "https://issuer.example.test";
const origin = "https://learn.example.test";

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

function progress(displayName, updatedAt) {
  return {
    schemaVersion: 1,
    displayName,
    startedPathIds: [],
    completedModuleIds: [],
    attempts: [],
    capstoneSubmissions: [],
    badges: [],
    updatedAt,
  };
}

test("hosted progress promotes legacy snapshots and reads authoritative events", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-authoritative-progress" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyMigrations(database);
  const repository = new D1Project42Repository(database, "progress-e2e");
  const identity = {
    issuer,
    subject: "owner-subject",
    email: "owner@example.test",
    emailVerified: true,
    displayName: "Owner",
    issuedAt: Math.floor(Date.now() / 1_000),
  };
  const verifier = { verify: async () => identity };
  const env = {
    PROJECT42_DB: database,
    INSTALLATION_ID: "progress-e2e",
    ALLOWED_ORIGINS: origin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: identity.subject,
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
  };
  const api = (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", "Bearer owner");
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
  const legacy = progress("Legacy learner", "2026-07-20T12:00:00.000Z");
  await database
    .prepare(
      `INSERT INTO learning_progress (
         installation_id, user_id, schema_version, revision, progress_json,
         updated_at
       ) VALUES (?, ?, 1, 4, ?, ?)`,
    )
    .bind(
      "progress-e2e",
      account.id,
      JSON.stringify(legacy),
      "2026-07-20T12:00:00.000Z",
    )
    .run();

  const promotedResponse = await api("/v1/me/progress");
  assert.equal(promotedResponse.status, 200);
  const promoted = (await promotedResponse.json()).progress;
  assert.equal(promoted.revision, 1);
  assert.deepEqual(promoted.progress, legacy);
  const promotedEvent = await database
    .prepare(
      `SELECT schema_version, event_type, actor_type, payload_json
         FROM learning_events
        WHERE installation_id = ? AND user_id = ?`,
    )
    .bind("progress-e2e", account.id)
    .first();
  assert.equal(promotedEvent.schema_version, "1.1");
  assert.equal(promotedEvent.event_type, "progress.imported");
  assert.equal(promotedEvent.actor_type, "system");
  assert.equal(JSON.parse(promotedEvent.payload_json).source, "legacy-hosted-v1");

  const importedProgress = progress(
    "Cross-device learner",
    "2026-07-21T12:00:00.000Z",
  );
  const importRequest = {
    importId: "authoritative-progress-import-1",
    source: "browser-local-v1",
    progress: importedProgress,
  };
  for (let retry = 0; retry < 2; retry += 1) {
    const response = await api("/v1/me/progress", {
      method: "POST",
      body: JSON.stringify(importRequest),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).progress.revision, 2);
  }
  const events = await database
    .prepare(
      `SELECT COUNT(*) AS count
         FROM learning_events
        WHERE installation_id = ? AND user_id = ?`,
    )
    .bind("progress-e2e", account.id)
    .first();
  assert.equal(Number(events.count), 2);

  const conflict = await api("/v1/me/progress", {
    method: "POST",
    body: JSON.stringify({
      ...importRequest,
      progress: { ...importedProgress, displayName: "Rebound import" },
    }),
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "progress_import_conflict");

  const staleShadow = progress("Stale shadow", "2020-01-01T00:00:00.000Z");
  await database
    .prepare(
      `UPDATE learning_progress
          SET progress_json = ?, updated_at = ?
        WHERE installation_id = ? AND user_id = ?`,
    )
    .bind(
      JSON.stringify(staleShadow),
      "2020-01-01T00:00:00.000Z",
      "progress-e2e",
      account.id,
    )
    .run();
  const authoritativeResponse = await api("/v1/me/progress");
  assert.equal(authoritativeResponse.status, 200);
  const authoritative = (await authoritativeResponse.json()).progress;
  assert.equal(authoritative.revision, 2);
  assert.deepEqual(authoritative.progress, importedProgress);

  await assert.rejects(
    database
      .prepare(
        `UPDATE learning_events
            SET payload_json = '{}'
          WHERE installation_id = ? AND user_id = ?`,
      )
      .bind("progress-e2e", account.id)
      .run(),
    /learning events are immutable/,
  );
});
