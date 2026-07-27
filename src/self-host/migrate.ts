import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import type { Pool } from "pg";

const MIGRATION_LOCK = 4_242_545_600;

export async function applyPostgresMigrations(
  pool: Pool,
  migrationDirectory: string,
): Promise<string[]> {
  const directory = resolve(migrationDirectory);
  const files = (await readdir(directory))
    .filter((file) => /^\d+_[a-z0-9_-]+\.sql$/i.test(file))
    .sort();
  if (files.length === 0) {
    throw new Error(`No PostgreSQL migrations found in ${directory}`);
  }

  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS project42_schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    for (const file of files) {
      const sql = await readFile(resolve(directory, file), "utf8");
      const checksum = await sha256(sql);
      const existing = await client.query<{ checksum: string }>(
        "SELECT checksum FROM project42_schema_migrations WHERE name = $1",
        [file],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration ${file} has changed`);
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        const body = sql
          .replace(/^\s*BEGIN;\s*/i, "")
          .replace(/\s*COMMIT;\s*$/i, "");
        await client.query(body);
        await client.query(
          "INSERT INTO project42_schema_migrations (name, checksum) VALUES ($1, $2)",
          [file, checksum],
        );
        await client.query("COMMIT");
        applied.push(file);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK])
      .catch(() => undefined);
    client.release();
  }
  return applied;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Buffer.from(digest).toString("hex");
}
