import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { Pool } from "pg";
import {
  PROJECT42_AUTHORIZATION_DENIAL_CODES,
  PROJECT42_AUTHORIZATION_PERMISSIONS,
  PROJECT42_AUTHORIZATION_ROLES,
  authorizeProject42Operation,
} from "../dist/index.js";
import { applyPostgresMigrations } from "../dist/self-host/migrate.js";

const installationId = "authorization-test";
const accountId = "learner-1";

function decide(
  permission,
  actorOverrides = {},
  requestOverrides = {},
) {
  return authorizeProject42Operation(
    {
      authenticated: true,
      accountId,
      installationId,
      accountState: "approved",
      roles: ["learner"],
      ...actorOverrides,
    },
    {
      permission,
      installationId,
      ...(permission.startsWith("self:")
        ? { targetAccountId: accountId }
        : {}),
      ...requestOverrides,
    },
  );
}

test("authorization contract exposes only learner and owner roles", () => {
  assert.deepEqual(PROJECT42_AUTHORIZATION_ROLES, ["learner", "owner"]);
  assert.deepEqual(PROJECT42_AUTHORIZATION_PERMISSIONS, [
    "session:establish",
    "self:account-state",
    "self:data-rights",
    "self:learner-records",
    "installation:owner-administration",
  ]);
  assert.ok(PROJECT42_AUTHORIZATION_DENIAL_CODES.length > 0);

  assert.equal(decide("self:learner-records").allowed, true);
  assert.deepEqual(
    decide("self:learner-records", { roles: ["owner"] }),
    {
      allowed: true,
      permission: "self:learner-records",
      roles: ["owner"],
    },
  );
  assert.equal(
    decide("installation:owner-administration", { roles: ["owner"] }).allowed,
    true,
  );
  assert.deepEqual(decide("installation:owner-administration"), {
    allowed: false,
    permission: "installation:owner-administration",
    code: "owner_role_required",
  });
});

test("authorization fails closed for malformed, unknown, and future roles", () => {
  for (const roles of [
    [],
    ["admin"],
    ["owner", "admin"],
    ["learner", "learner"],
    [42],
    [null],
    "owner",
  ]) {
    assert.deepEqual(decide("self:learner-records", { roles }), {
      allowed: false,
      permission: "self:learner-records",
      code: "role_assignment_invalid",
    });
  }
});

test("authorization denies missing, cross-installation, and cross-learner scope", () => {
  assert.deepEqual(
    decide("self:learner-records", { installationId: "" }),
    {
      allowed: false,
      permission: "self:learner-records",
      code: "installation_scope_invalid",
    },
  );
  assert.deepEqual(
    decide(
      "self:learner-records",
      {},
      { installationId: "another-installation" },
    ),
    {
      allowed: false,
      permission: "self:learner-records",
      code: "installation_scope_mismatch",
    },
  );
  assert.deepEqual(
    decide("self:learner-records", {}, { targetAccountId: "learner-2" }),
    {
      allowed: false,
      permission: "self:learner-records",
      code: "self_scope_mismatch",
    },
  );
  assert.deepEqual(
    decide("self:learner-records", { authenticated: false }),
    {
      allowed: false,
      permission: "self:learner-records",
      code: "authentication_required",
    },
  );
});

test("account state is independent from role and permits only privacy rights before approval", () => {
  for (const accountState of [
    "pending",
    "rejected",
    "suspended",
    "revoked",
  ]) {
    for (const permission of [
      "session:establish",
      "self:learner-records",
      "installation:owner-administration",
    ]) {
      assert.deepEqual(
        decide(permission, { accountState, roles: ["owner"] }),
        {
          allowed: false,
          permission,
          code: "account_not_approved",
        },
      );
    }
    for (const permission of ["self:account-state", "self:data-rights"]) {
      assert.equal(
        decide(permission, { accountState, roles: ["learner"] }).allowed,
        true,
      );
    }
  }
  assert.deepEqual(
    decide("self:learner-records", { accountState: "future-state" }),
    {
      allowed: false,
      permission: "self:learner-records",
      code: "account_state_invalid",
    },
  );
});

test("provider and repository metadata cannot grant product authority", () => {
  const result = decide("installation:owner-administration", {
    roles: ["learner"],
    providerClaims: { role: "owner" },
    githubTeams: ["owners"],
    contributorCredit: "maintainer",
    codeowners: true,
    uiRole: "owner",
  });
  assert.deepEqual(result, {
    allowed: false,
    permission: "installation:owner-administration",
    code: "owner_role_required",
  });
});

test("D1 persists only the provider-neutral learner and owner roles", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-authorization-d1" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  const migrations = (
    await readdir(new URL("../migrations/", import.meta.url))
  )
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(
      new URL(`../migrations/${migration}`, import.meta.url),
      "utf8",
    );
    await database.exec(sql.replace(/\r?\n/g, " "));
  }
  await database.exec(
    `INSERT INTO installations
       (id, display_name, created_at, updated_at)
     VALUES
       ('authorization-test', 'Authorization test', '2026-07-30', '2026-07-30');
     INSERT INTO users
       (id, installation_id, email_verified, account_state, created_at, updated_at)
     VALUES
       ('learner-1', 'authorization-test', 1, 'approved', '2026-07-30', '2026-07-30');`
      .replace(/\r?\n/g, " "),
  );
  await assert.rejects(
    database
      .prepare(
        `INSERT INTO role_assignments
           (installation_id, user_id, role, assigned_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind(
        "authorization-test",
        "learner-1",
        "admin",
        "2026-07-30",
      )
      .run(),
    /CHECK constraint failed/,
  );
  for (const role of PROJECT42_AUTHORIZATION_ROLES) {
    await database
      .prepare(
        `INSERT INTO role_assignments
           (installation_id, user_id, role, assigned_at)
         VALUES (?, ?, ?, ?)`,
      )
      .bind("authorization-test", "learner-1", role, "2026-07-30")
      .run();
  }
  const persisted = await database
    .prepare(
      `SELECT role
         FROM role_assignments
        WHERE installation_id = ? AND user_id = ?
        ORDER BY role`,
    )
    .bind("authorization-test", "learner-1")
    .all();
  assert.deepEqual(
    persisted.results.map((row) => row.role),
    ["learner", "owner"],
  );
});

test(
  "PostgreSQL persists the same provider-neutral role contract",
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const administrationPool = new Pool({
      connectionString: process.env.TEST_POSTGRES_URL,
    });
    const schema = `authorization_${crypto.randomUUID().replaceAll("-", "")}`;
    let pool;
    try {
      await administrationPool.query(`CREATE SCHEMA "${schema}"`);
      pool = new Pool({
        connectionString: process.env.TEST_POSTGRES_URL,
        options: `-c search_path=${schema}`,
      });
      await applyPostgresMigrations(pool, "self-host/postgres");
      await pool.query(
        `INSERT INTO installations
           (id, display_name, created_at, updated_at)
         VALUES ($1, $2, $3, $3)`,
        ["authorization-test", "Authorization test", "2026-07-30"],
      );
      await pool.query(
        `INSERT INTO users
           (id, installation_id, email_verified, account_state, created_at, updated_at)
         VALUES ($1, $2, 1, 'approved', $3, $3)`,
        ["learner-1", "authorization-test", "2026-07-30"],
      );
      await assert.rejects(
        pool.query(
          `INSERT INTO role_assignments
             (installation_id, user_id, role, assigned_at)
           VALUES ($1, $2, $3, $4)`,
          ["authorization-test", "learner-1", "admin", "2026-07-30"],
        ),
        (error) => error?.code === "23514",
      );
      for (const role of PROJECT42_AUTHORIZATION_ROLES) {
        await pool.query(
          `INSERT INTO role_assignments
             (installation_id, user_id, role, assigned_at)
           VALUES ($1, $2, $3, $4)`,
          ["authorization-test", "learner-1", role, "2026-07-30"],
        );
      }
      const persisted = await pool.query(
        `SELECT role
           FROM role_assignments
          WHERE installation_id = $1 AND user_id = $2
          ORDER BY role`,
        ["authorization-test", "learner-1"],
      );
      assert.deepEqual(
        persisted.rows.map((row) => row.role),
        ["learner", "owner"],
      );
    } finally {
      await pool?.end();
      await administrationPool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await administrationPool.end();
    }
  },
);
