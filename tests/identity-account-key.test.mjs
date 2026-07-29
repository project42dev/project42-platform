import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { D1Project42Repository } from "../dist/worker.js";

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

function identity(subject, email) {
  return {
    provider: "oidc",
    issuer: "https://identity.example.test",
    subject,
    email,
    emailVerified: true,
    displayName: `Learner ${subject}`,
    issuedAt: Math.floor(Date.now() / 1_000),
    authenticatedAt: Math.floor(Date.now() / 1_000),
  };
}

test("issuer and subject remain the account key when verified email changes", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-identity-key" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  const repository = new D1Project42Repository(database, "identity-key-test");
  const now = "2026-07-29T12:00:00.000Z";
  await repository.ensureInstallation(now);

  const originalIdentity = identity("stable-subject", "first@example.test");
  const originalAccount = await repository.createOrRefreshAccount(
    originalIdentity,
    false,
    "identity-key-original",
    now,
  );
  const refreshedAccount = await repository.createOrRefreshAccount(
    {
      ...originalIdentity,
      email: "changed@example.test",
      displayName: "Learner with changed email",
    },
    false,
    "identity-key-email-change",
    "2026-07-29T12:01:00.000Z",
  );
  assert.equal(refreshedAccount.id, originalAccount.id);
  assert.equal(refreshedAccount.primaryEmail, "changed@example.test");
  assert.equal(
    (
      await database
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE installation_id = ?",
        )
        .bind("identity-key-test")
        .first()
    ).count,
    1,
  );

  const separateAccount = await repository.createOrRefreshAccount(
    identity("different-subject", "changed@example.test"),
    false,
    "identity-key-email-collision",
    "2026-07-29T12:02:00.000Z",
  );
  assert.notEqual(separateAccount.id, originalAccount.id);
  assert.equal(separateAccount.primaryEmail, "changed@example.test");
  assert.equal(
    (
      await database
        .prepare(
          "SELECT COUNT(*) AS count FROM users WHERE installation_id = ?",
        )
        .bind("identity-key-test")
        .first()
    ).count,
    2,
  );
});
