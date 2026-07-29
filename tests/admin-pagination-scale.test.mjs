import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { Pool } from "pg";
import {
  buildAdminAccountPageQuery,
  buildAdminAuditPageQuery,
} from "../dist/admin-pagination-query.js";
import { applyPostgresMigrations } from "../dist/self-host/migrate.js";
import { toPostgresParameters } from "../dist/self-host/postgres-d1.js";
import { D1Project42Repository } from "../dist/worker.js";

const ACCOUNT_COUNT = 1_205;
const AUDIT_COUNT = 1_803;
const TARGET_INSTALLATION = "pagination-scale-target";
const OTHER_INSTALLATION = "pagination-scale-other";

function sqlLiteral(value) {
  if (value === null) return "NULL";
  if (typeof value === "number") {
    assert.ok(Number.isSafeInteger(value));
    return String(value);
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function insertRows(database, table, columns, rows, chunkSize = 100) {
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const values = rows
      .slice(offset, offset + chunkSize)
      .map((row) => `(${row.map(sqlLiteral).join(",")})`)
      .join(",");
    await database.exec(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${values};`,
    );
  }
}

function accountFixture(installationId, index) {
  const suffix = String(index).padStart(5, "0");
  const id = `${installationId}-user-${suffix}`;
  const createdAt = new Date(
    Date.parse("2026-01-01T00:00:00.000Z") +
      Math.floor(index / 7) * 1_000,
  ).toISOString();
  const states = ["pending", "approved", "rejected", "suspended", "revoked"];
  return {
    id,
    installationId,
    state: states[index % states.length],
    createdAt,
    owner: index % 101 === 0,
  };
}

function planDetails(result) {
  return result.results.map((row) => String(row.detail));
}

function assertIndexSeek(details, indexName) {
  assert.ok(
    details.some(
      (detail) =>
        detail.includes("SEARCH") && detail.includes(indexName),
    ),
    `expected indexed search through ${indexName}:\n${details.join("\n")}`,
  );
  assert.ok(
    details.every((detail) => !detail.includes("USE TEMP B-TREE FOR ORDER BY")),
    `pagination must not sort into a temporary B-tree:\n${details.join("\n")}`,
  );
}

function postgresPlanIndexes(node, indexes = new Set()) {
  if (typeof node?.["Index Name"] === "string") {
    indexes.add(node["Index Name"]);
  }
  for (const child of node?.Plans ?? []) {
    postgresPlanIndexes(child, indexes);
  }
  return indexes;
}

test("large D1 fixtures traverse account and audit pages through indexed keyset seeks", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-29",
    d1Databases: { PROJECT42_DB: "project42-admin-pagination-scale" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
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

  await insertRows(
    database,
    "installations",
    ["id", "display_name", "created_at", "updated_at"],
    [
      [TARGET_INSTALLATION, "Pagination target", "2026-01-01", "2026-01-01"],
      [OTHER_INSTALLATION, "Pagination other", "2026-01-01", "2026-01-01"],
    ],
  );

  const targetAccounts = Array.from(
    { length: ACCOUNT_COUNT },
    (_, index) => accountFixture(TARGET_INSTALLATION, index),
  );
  const otherAccounts = Array.from(
    { length: ACCOUNT_COUNT },
    (_, index) => accountFixture(OTHER_INSTALLATION, index),
  );
  const allAccounts = targetAccounts.flatMap((target, index) => [
    target,
    otherAccounts[index],
  ]);
  await insertRows(
    database,
    "users",
    [
      "id",
      "installation_id",
      "display_name",
      "primary_email",
      "email_verified",
      "account_state",
      "created_at",
      "updated_at",
    ],
    allAccounts.map((account) => [
      account.id,
      account.installationId,
      `Fixture ${account.id}`,
      null,
      0,
      account.state,
      account.createdAt,
      account.createdAt,
    ]),
  );
  await insertRows(
    database,
    "user_identities",
    [
      "id",
      "installation_id",
      "provider",
      "issuer",
      "subject",
      "user_id",
      "provider_login",
      "display_name",
      "status",
      "is_primary",
      "link_method",
      "linked_at",
      "last_verified_at",
      "last_seen_at",
      "unlinked_at",
    ],
    allAccounts.map((account) => [
      `identity-${account.id}`,
      account.installationId,
      "oidc",
      "https://identity.example.test",
      `subject-${account.id}`,
      account.id,
      null,
      null,
      "active",
      1,
      "registration",
      account.createdAt,
      account.createdAt,
      account.createdAt,
      null,
    ]),
  );
  await insertRows(
    database,
    "role_assignments",
    [
      "installation_id",
      "user_id",
      "role",
      "assigned_by_user_id",
      "assigned_at",
    ],
    allAccounts.flatMap((account) => [
      [account.installationId, account.id, "learner", null, account.createdAt],
      ...(account.owner
        ? [
            [
              account.installationId,
              account.id,
              "owner",
              null,
              account.createdAt,
            ],
          ]
        : []),
    ]),
  );

  const targetAuditIds = [];
  const auditRows = [];
  for (let index = 0; index < AUDIT_COUNT; index += 1) {
    for (const installationId of [
      TARGET_INSTALLATION,
      OTHER_INSTALLATION,
    ]) {
      const suffix = String(index).padStart(5, "0");
      const id = `${installationId}-audit-${suffix}`;
      if (installationId === TARGET_INSTALLATION) targetAuditIds.push(id);
      auditRows.push([
        id,
        installationId,
        null,
        null,
        null,
        "fixture.page",
        "pagination",
        null,
        `request-${id}`,
        "success",
        "Scale fixture",
        "{}",
        new Date(
          Date.parse("2026-01-01T00:00:00.000Z") + index * 1_000,
        ).toISOString(),
      ]);
    }
  }
  await insertRows(
    database,
    "audit_events",
    [
      "id",
      "installation_id",
      "actor_user_id",
      "actor_issuer",
      "actor_subject",
      "action",
      "target_type",
      "target_id",
      "request_id",
      "outcome",
      "reason",
      "metadata_json",
      "occurred_at",
    ],
    auditRows,
  );
  await database.exec(
    "ANALYZE users; ANALYZE user_identities; ANALYZE role_assignments; ANALYZE audit_events;",
  );

  const repository = new D1Project42Repository(
    database,
    TARGET_INSTALLATION,
  );
  const accountIds = [];
  let accountCursor;
  do {
    const page = await repository.listAccountPage({
      pageSize: 73,
      ...(accountCursor ? { cursor: accountCursor } : {}),
    });
    assert.ok(page.accounts.length >= 1 && page.accounts.length <= 73);
    assert.ok(
      page.accounts.every(
        (account) => account.installationId === TARGET_INSTALLATION,
      ),
    );
    accountIds.push(...page.accounts.map((account) => account.id));
    accountCursor = page.page.nextCursor ?? undefined;
  } while (accountCursor);
  assert.deepEqual(
    accountIds,
    targetAccounts
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .map((account) => account.id),
  );
  assert.equal(new Set(accountIds).size, ACCOUNT_COUNT);

  const pendingIds = [];
  let pendingCursor;
  do {
    const page = await repository.listAccountPage({
      state: "pending",
      pageSize: 41,
      ...(pendingCursor ? { cursor: pendingCursor } : {}),
    });
    assert.ok(page.accounts.every((account) => account.state === "pending"));
    pendingIds.push(...page.accounts.map((account) => account.id));
    pendingCursor = page.page.nextCursor ?? undefined;
  } while (pendingCursor);
  assert.deepEqual(
    pendingIds,
    targetAccounts
      .filter((account) => account.state === "pending")
      .toSorted(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.id.localeCompare(right.id),
      )
      .map((account) => account.id),
  );

  const auditIds = [];
  let auditCursor;
  do {
    const page = await repository.listAuditEventPage({
      pageSize: 67,
      ...(auditCursor ? { cursor: auditCursor } : {}),
    });
    assert.ok(page.events.length >= 1 && page.events.length <= 67);
    auditIds.push(...page.events.map((event) => event.id));
    auditCursor = page.page.nextCursor ?? undefined;
  } while (auditCursor);
  assert.deepEqual(auditIds, targetAuditIds.toReversed());
  assert.equal(new Set(auditIds).size, AUDIT_COUNT);

  const positionedAccount = targetAccounts[500];
  const unfilteredPlan = planDetails(
    await database
      .prepare(`EXPLAIN QUERY PLAN ${buildAdminAccountPageQuery({
        stateFiltered: false,
        positioned: true,
      })}`)
      .bind(
        TARGET_INSTALLATION,
        positionedAccount.createdAt,
        positionedAccount.id,
        51,
      )
      .all(),
  );
  assertIndexSeek(unfilteredPlan, "users_by_installation_created_id");
  assert.ok(
    unfilteredPlan.every((detail) => !detail.includes("MATERIALIZE")),
    `role aggregation must remain row-scoped:\n${unfilteredPlan.join("\n")}`,
  );

  const filteredPlan = planDetails(
    await database
      .prepare(`EXPLAIN QUERY PLAN ${buildAdminAccountPageQuery({
        stateFiltered: true,
        positioned: true,
      })}`)
      .bind(
        TARGET_INSTALLATION,
        "pending",
        positionedAccount.createdAt,
        positionedAccount.id,
        51,
      )
      .all(),
  );
  assertIndexSeek(filteredPlan, "users_by_installation_state");

  const auditPlan = planDetails(
    await database
      .prepare(
        `EXPLAIN QUERY PLAN ${buildAdminAuditPageQuery(true)}`,
      )
      .bind(TARGET_INSTALLATION, 9_000_000, 51)
      .all(),
  );
  assertIndexSeek(auditPlan, "audits_by_installation_sequence");
});

test(
  "large PostgreSQL fixtures choose the matching account and audit keyset indexes",
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_POSTGRES_URL });
    const client = await pool.connect();
    const nonce = crypto.randomUUID();
    const targetInstallation = `pagination-plan-target-${nonce}`;
    const otherInstallation = `pagination-plan-other-${nonce}`;
    let transactionOpen = false;
    try {
      await applyPostgresMigrations(pool, "self-host/postgres");
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query(
        `INSERT INTO installations (id, display_name, created_at, updated_at)
         VALUES ($1, 'Pagination plan target', '2026-01-01', '2026-01-01'),
                ($2, 'Pagination plan other', '2026-01-01', '2026-01-01')`,
        [targetInstallation, otherInstallation],
      );
      await client.query(
        `INSERT INTO users (
           id, installation_id, display_name, primary_email, email_verified,
           account_state, created_at, updated_at
         )
         SELECT installation_id || '-user-' || lpad(number::text, 5, '0'),
                installation_id,
                'Pagination fixture',
                NULL,
                0,
                (ARRAY[
                  'pending', 'approved', 'rejected', 'suspended', 'revoked'
                ]::text[])[(number % 5) + 1],
                to_char(
                  timestamp '2026-01-01 00:00:00' +
                    floor(number / 7.0) * interval '1 second',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                ),
                to_char(
                  timestamp '2026-01-01 00:00:00' +
                    floor(number / 7.0) * interval '1 second',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                )
           FROM (
             SELECT $1::text AS installation_id, generate_series(0, 1204) AS number
             UNION ALL
             SELECT $2::text AS installation_id, generate_series(0, 1204) AS number
           ) fixture`,
        [targetInstallation, otherInstallation],
      );
      await client.query(
        `INSERT INTO user_identities (
           id, installation_id, provider, issuer, subject, user_id,
           provider_login, display_name, status, is_primary, link_method,
           linked_at, last_verified_at, last_seen_at, unlinked_at
         )
         SELECT 'identity-' || id,
                installation_id,
                'oidc',
                'https://identity.example.test',
                'subject-' || id,
                id,
                NULL,
                NULL,
                'active',
                1,
                'registration',
                created_at::timestamptz,
                created_at::timestamptz,
                created_at::timestamptz,
                NULL
           FROM users
          WHERE installation_id IN ($1, $2)`,
        [targetInstallation, otherInstallation],
      );
      await client.query(
        `INSERT INTO role_assignments (
           installation_id, user_id, role, assigned_by_user_id, assigned_at
         )
         SELECT installation_id, id, 'learner', NULL, created_at
           FROM users
          WHERE installation_id IN ($1, $2)`,
        [targetInstallation, otherInstallation],
      );
      await client.query(
        `INSERT INTO audit_events (
           id, installation_id, actor_user_id, actor_issuer, actor_subject,
           action, target_type, target_id, request_id, outcome, reason,
           metadata_json, occurred_at
         )
         SELECT installation_id || '-audit-' || lpad(number::text, 5, '0'),
                installation_id,
                NULL,
                NULL,
                NULL,
                'fixture.page',
                'pagination',
                NULL,
                'request-' || installation_id || '-' || number::text,
                'success',
                'Scale fixture',
                '{}',
                to_char(
                  timestamp '2026-01-01 00:00:00' +
                    number * interval '1 second',
                  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
                )
           FROM (
             SELECT $1::text AS installation_id, generate_series(0, 1802) AS number
             UNION ALL
             SELECT $2::text AS installation_id, generate_series(0, 1802) AS number
           ) fixture`,
        [targetInstallation, otherInstallation],
      );
      await client.query(
        "ANALYZE users; ANALYZE user_identities; ANALYZE role_assignments; ANALYZE audit_events;",
      );

      const positionCreatedAt = "2026-01-01T00:01:00.000Z";
      const positionUserId = `${targetInstallation}-user-00420`;
      const accountSql = toPostgresParameters(
        buildAdminAccountPageQuery({
          stateFiltered: true,
          positioned: true,
        }),
      );
      const accountRows = await client.query(accountSql, [
        targetInstallation,
        "pending",
        positionCreatedAt,
        positionUserId,
        51,
      ]);
      assert.ok(accountRows.rows.length >= 1 && accountRows.rows.length <= 51);
      assert.ok(
        accountRows.rows.every(
          (row) => row.installation_id === targetInstallation,
        ),
      );
      const accountExplain = await client.query(
        `EXPLAIN (FORMAT JSON, COSTS FALSE) ${accountSql}`,
        [
          targetInstallation,
          "pending",
          positionCreatedAt,
          positionUserId,
          51,
        ],
      );
      assert.ok(
        postgresPlanIndexes(accountExplain.rows[0]["QUERY PLAN"][0].Plan).has(
          "users_by_installation_state",
        ),
      );

      const auditSql = toPostgresParameters(
        buildAdminAuditPageQuery(true),
      );
      const auditRows = await client.query(auditSql, [
        targetInstallation,
        "9000000000000000000",
        51,
      ]);
      assert.equal(auditRows.rows.length, 51);
      assert.ok(
        auditRows.rows.every(
          (row) => row.id.startsWith(`${targetInstallation}-audit-`),
        ),
      );
      const auditExplain = await client.query(
        `EXPLAIN (FORMAT JSON, COSTS FALSE) ${auditSql}`,
        [targetInstallation, "9000000000000000000", 51],
      );
      assert.ok(
        postgresPlanIndexes(auditExplain.rows[0]["QUERY PLAN"][0].Plan).has(
          "audits_by_installation_sequence",
        ),
      );
    } finally {
      if (transactionOpen) {
        await client.query("ROLLBACK").catch(() => undefined);
      }
      client.release();
      await pool
        .query(
          "ANALYZE users; ANALYZE user_identities; ANALYZE role_assignments; ANALYZE audit_events;",
        )
        .catch(() => undefined);
      await pool.end();
    }
  },
);
