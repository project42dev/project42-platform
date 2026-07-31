import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { D1Project42Repository, handleRequest } from "../dist/worker.js";

const issuer = "https://issuer.example.test";
const allowedOrigin = "https://learn.example.test";
const installationId = "owner-recovery";

async function applyD1Migrations(database) {
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

function identity(subject) {
  const authenticatedAt = Math.floor(Date.now() / 1_000);
  return {
    provider: "oidc",
    issuer,
    subject,
    email: `${subject}@example.test`,
    emailVerified: true,
    displayName: subject,
    issuedAt: authenticatedAt,
    authenticatedAt,
  };
}

test("owner access is recoverable through configuration without a bypass role", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-owner-recovery" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);

  const repository = new D1Project42Repository(database, installationId);
  const now = new Date().toISOString();
  await repository.ensureInstallation(now);

  const identities = new Map([
    ["original-owner-token", identity("original-owner")],
    ["recovery-owner-token", identity("recovery-owner")],
    ["opportunist-token", identity("opportunist")],
  ]);

  const verifier = {
    verify: async (request) => {
      const token = request.headers
        .get("authorization")
        ?.replace(/^Bearer /, "");
      const verified = token ? identities.get(token) : undefined;
      if (!verified) throw new Error("Test request is missing a known identity.");
      return verified;
    },
  };

  // The deployment's bootstrap configuration is the recovery control surface.
  const env = {
    INSTALLATION_ID: installationId,
    ALLOWED_ORIGINS: allowedOrigin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: "original-owner",
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    PROJECT42_DB: database,
  };

  async function api(token, path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("origin", allowedOrigin);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return handleRequest(
      new Request(`https://api.example.test${path}`, { ...init, headers }),
      env,
      verifier,
      repository,
    );
  }

  // The configured owner signs in and holds owner authority.
  assert.equal((await api("original-owner-token", "/v1/session", { method: "POST" })).status, 200);
  assert.equal((await api("original-owner-token", "/v1/admin/accounts")).status, 200);

  // Someone else registering cannot become owner, and cannot self-approve.
  assert.equal((await api("opportunist-token", "/v1/session", { method: "POST" })).status, 202);
  assert.equal((await api("opportunist-token", "/v1/admin/accounts")).status, 403);

  // The owner loses access. Recovery is a deliberate configuration change:
  // point the bootstrap identity at the replacement.
  env.BOOTSTRAP_OWNER_SUBJECT = "recovery-owner";

  // An identity that is not the newly configured one gains nothing from the
  // change - recovery must not open a window for anyone else. It stays pending
  // (202 is the pending receipt, not access) and is refused at every admin route.
  const opportunistDuringRecovery = await api("opportunist-token", "/v1/session", {
    method: "POST",
  });
  assert.equal(opportunistDuringRecovery.status, 202);
  assert.equal(
    (await opportunistDuringRecovery.json()).account.state,
    "pending",
  );
  assert.equal((await api("opportunist-token", "/v1/admin/accounts")).status, 403);

  // The replacement owner signs in and holds owner authority immediately.
  const recovered = await api("recovery-owner-token", "/v1/session", {
    method: "POST",
  });
  assert.equal(recovered.status, 200);
  assert.equal((await recovered.json()).account.state, "approved");
  assert.equal((await api("recovery-owner-token", "/v1/admin/accounts")).status, 200);
  assert.equal((await api("recovery-owner-token", "/v1/admin/audit")).status, 200);

  // Recovery grants no new role: the roles are still exactly learner and owner,
  // and authority came from the configured identity, not a bypass grant.
  const roles = await database
    .prepare(
      "SELECT DISTINCT role FROM role_assignments WHERE installation_id = ? ORDER BY role",
    )
    .bind(installationId)
    .all();
  assert.deepEqual(
    roles.results.map((row) => row.role).filter((role) => role !== "learner"),
    ["owner"],
    "recovery must not introduce a role outside the accepted model",
  );

  // Clearing the bootstrap configuration must not strip the recovered owner:
  // recovery is not a session-scoped elevation.
  delete env.BOOTSTRAP_OWNER_SUBJECT;
  assert.equal((await api("recovery-owner-token", "/v1/admin/accounts")).status, 200);

  // ...and with no bootstrap configured, an unknown identity still cannot
  // register itself into owner authority.
  assert.equal((await api("opportunist-token", "/v1/admin/audit")).status, 403);

  // The recovery is auditable.
  const audit = await database
    .prepare(
      `SELECT COUNT(*) AS count FROM audit_events
        WHERE installation_id = ? AND action LIKE 'account.%'`,
    )
    .bind(installationId)
    .first();
  assert.ok(
    Number(audit.count) > 0,
    "account transitions during recovery must be audited",
  );
});
