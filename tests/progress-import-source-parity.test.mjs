// D1 and PostgreSQL must admit the same progress_imports sources.
//
// progress_imports has carried a CHECK on `source` since the first migration
// of each store. D1 migration 0020 widened it for the signed-in app's
// 'account-backed-v1' saves (plus 'legacy-hosted-v1' and 'account-merge-v1');
// the PostgreSQL self-host schema was not touched, so a self-hosted
// account-backed save reached importProgress and aborted on the CHECK -- the
// same silent failure 0020 fixed on D1. PostgreSQL migration 014 closes it.
//
// This file keeps the two from drifting again. The static test reads the
// constraint each store ends up with after all its migrations and requires
// the sets to be equal, to cover everything the Worker accepts, and to match
// the learning-event contract's progress-import source enum. The engine tests
// then insert every source EITHER store admits into a fully migrated database
// -- D1 through Miniflare always, PostgreSQL wherever TEST_POSTGRES_URL is set
// (it is in CI) -- so a store that falls behind fails on its own engine, and a
// parser that misread a migration cannot pass silently.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import pg from "pg";
import { PROGRESS_IMPORT_SOURCES } from "../dist/index.js";
import { applyPostgresMigrations } from "../dist/self-host/migrate.js";

const { Pool } = pg;
const root = new URL("../", import.meta.url);
const MIGRATION_FILE = /^\d+_[a-z0-9_-]+\.sql$/i;

function stripSqlComments(sql) {
  // The 0020 header quotes the OLD two-value CHECK verbatim, so comments must
  // go before anything is matched.
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

// The progress_imports source list in force after every migration in
// `directory` has run: the last CHECK (source IN (...)) in a statement that
// names progress_imports (0020 defines it on progress_imports_v2, then renames).
async function effectiveProgressImportSources(directory) {
  const files = (await readdir(new URL(directory, root)))
    .filter((name) => MIGRATION_FILE.test(name))
    .sort();
  let sources = null;
  let definedIn = null;
  for (const file of files) {
    const sql = stripSqlComments(
      await readFile(new URL(`${directory}${file}`, root), "utf8"),
    );
    for (const statement of sql.split(";")) {
      if (!/\bprogress_imports\w*\b/i.test(statement)) continue;
      const match = /CHECK\s*\(\s*source\s+IN\s*\(([^)]*)\)/i.exec(statement);
      if (!match) continue;
      sources = [...match[1].matchAll(/'([^']+)'/g)]
        .map(([, value]) => value)
        .sort();
      definedIn = file;
    }
  }
  assert.ok(sources, `no progress_imports source CHECK found in ${directory}`);
  return { sources, definedIn };
}

// The union, so a store that is behind fails on its own engine, not only in
// the static comparison above.
async function sourcesEitherStoreAdmits() {
  const d1 = await effectiveProgressImportSources("migrations/");
  const postgres = await effectiveProgressImportSources("self-host/postgres/");
  return [...new Set([...d1.sources, ...postgres.sources])].sort();
}

function contractProgressImportSources(schema) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    const values = node.properties?.source?.enum;
    if (Array.isArray(values) && values.includes("browser-local-v1")) {
      found.push([...values].sort());
    }
    for (const child of Object.values(node)) visit(child);
  };
  visit(schema);
  assert.equal(found.length, 1, "expected one progress-import source enum in the event contract");
  return found[0];
}

test("D1 and PostgreSQL admit the same progress_imports sources", async () => {
  const d1 = await effectiveProgressImportSources("migrations/");
  const postgres = await effectiveProgressImportSources("self-host/postgres/");

  assert.deepEqual(
    postgres.sources,
    d1.sources,
    `PostgreSQL (${postgres.definedIn}) and D1 (${d1.definedIn}) progress_imports ` +
      "CHECK constraints admit different sources. Add a migration to the store that is behind.",
  );

  for (const source of PROGRESS_IMPORT_SOURCES) {
    assert.ok(
      d1.sources.includes(source),
      `D1 progress_imports must admit '${source}', which the Worker accepts`,
    );
    assert.ok(
      postgres.sources.includes(source),
      `PostgreSQL progress_imports must admit '${source}', which the Worker accepts`,
    );
  }

  const contract = contractProgressImportSources(
    JSON.parse(
      await readFile(
        new URL("schemas/learning/learning-event-contract.schema.json", root),
        "utf8",
      ),
    ),
  );
  assert.deepEqual(
    d1.sources,
    contract,
    "progress_imports must admit exactly the learning-event contract's progress-import sources",
  );
});

test("every source either store admits is insertable into migrated D1", async (t) => {
  const sources = await sourcesEitherStoreAdmits();
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-progress-import-source-parity" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  const files = (await readdir(new URL("migrations/", root)))
    .filter((name) => MIGRATION_FILE.test(name))
    .sort();
  for (const file of files) {
    const sql = await readFile(new URL(`migrations/${file}`, root), "utf8");
    await database.exec(sql.replace(/\r?\n/g, " "));
  }

  await database.batch([
    database.prepare(
      "INSERT INTO installations VALUES ('parity','Parity','2026-09-11','2026-09-11')",
    ),
    database.prepare(
      "INSERT INTO users (id,installation_id,display_name,primary_email,email_verified,account_state,created_at,updated_at) VALUES ('u1','parity','Learner','learner@example.com',1,'approved','2026-09-11','2026-09-11')",
    ),
  ]);
  const insert = (id, source) =>
    database
      .prepare(
        "INSERT INTO progress_imports (id,installation_id,user_id,source,source_checksum,imported_revision,imported_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(id, "parity", "u1", source, "0".repeat(64), 1, "2026-09-11T00:00:00.000Z")
      .run();

  for (const source of sources) {
    await insert(`import-${source}`, source);
  }
  await assert.rejects(() => insert("import-unknown", "not-a-source"), /CHECK constraint/i);
});

test(
  "every source either store admits is insertable into migrated PostgreSQL",
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const sources = await sourcesEitherStoreAdmits();
    const administrationPool = new Pool({
      connectionString: process.env.TEST_POSTGRES_URL,
    });
    const schema = `source_parity_${crypto.randomUUID().replaceAll("-", "")}`;
    await administrationPool.query(`CREATE SCHEMA "${schema}"`);
    const pool = new Pool({
      connectionString: process.env.TEST_POSTGRES_URL,
      options: `-c search_path=${schema}`,
    });
    try {
      await applyPostgresMigrations(pool, "self-host/postgres");
      await pool.query(
        "INSERT INTO installations VALUES ('parity','Parity','2026-09-11','2026-09-11')",
      );
      await pool.query(
        "INSERT INTO users (id,installation_id,display_name,primary_email,email_verified,account_state,created_at,updated_at) VALUES ('u1','parity','Learner','learner@example.com',1,'approved','2026-09-11','2026-09-11')",
      );
      const insert = (id, source) =>
        pool.query(
          "INSERT INTO progress_imports (id,installation_id,user_id,source,source_checksum,imported_revision,imported_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [id, "parity", "u1", source, "0".repeat(64), 1, "2026-09-11T00:00:00.000Z"],
        );
      for (const source of sources) {
        await insert(`import-${source}`, source);
      }
      await assert.rejects(
        () => insert("import-unknown", "not-a-source"),
        (error) => error.code === "23514",
      );
    } finally {
      await pool.end();
      await administrationPool
        .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
        .catch(() => undefined);
      await administrationPool.end();
    }
  },
);
