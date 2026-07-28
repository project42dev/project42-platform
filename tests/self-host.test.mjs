import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Pool } from "pg";
import {
  runLearningEventStoreConformance,
  runLearningRecordReceiptConformance,
  SqlLearningEventStore,
} from "../dist/index.js";
import { readConfiguration } from "../dist/self-host/config.js";
import { FilesystemProfilePhotoBucket } from "../dist/self-host/filesystem-profile-photo-bucket.js";
import { applyPostgresMigrations } from "../dist/self-host/migrate.js";
import {
  toPostgresParameters,
  toPostgresValue,
} from "../dist/self-host/postgres-d1.js";
import { PostgresD1CompatibilityDatabase } from "../dist/self-host/postgres-d1.js";
import { D1Project42Repository } from "../dist/worker.js";

const evaluationEnvironment = {
  NODE_ENV: "evaluation",
  PROJECT42_EVALUATION_MODE: "true",
  PUBLIC_URL: "http://localhost:8787",
  INSTALLATION_ID: "test-installation",
  DATABASE_URL: "postgresql://project42:test@database:5432/project42",
  OIDC_ISSUER: "http://localhost:8080/realms/project42",
  OIDC_AUDIENCE: "project42-api",
  OIDC_JWKS_URL:
    "http://identity:8080/realms/project42/protocol/openid-connect/certs",
  ALLOWED_ORIGINS: "http://localhost:3000",
};

test("local evaluation profile permits only its explicit HTTP service hosts", () => {
  const configuration = readConfiguration(evaluationEnvironment);
  assert.equal(configuration.publicUrl.href, "http://localhost:8787/");
  assert.equal(configuration.oidcJwksUrl.startsWith("http://identity:"), true);

  assert.throws(
    () =>
      readConfiguration({
        ...evaluationEnvironment,
        OIDC_JWKS_URL: "http://untrusted:8080/keys",
      }),
    /must use HTTPS/,
  );
});

test("production self-host configuration fails closed on HTTP and placeholders", () => {
  assert.throws(
    () =>
      readConfiguration({
        ...evaluationEnvironment,
        NODE_ENV: "production",
        PROJECT42_EVALUATION_MODE: "false",
      }),
    /must use HTTPS/,
  );

  assert.throws(
    () =>
      readConfiguration({
        ...evaluationEnvironment,
        NODE_ENV: "production",
        PROJECT42_EVALUATION_MODE: "false",
        PUBLIC_URL: "https://learn.example.org",
        OIDC_ISSUER: "https://identity.example.org/realms/project42",
        OIDC_JWKS_URL: "https://identity.example.org/realms/project42/certs",
        ALLOWED_ORIGINS: "https://learn.example.org",
        DATABASE_URL: "postgresql://project42:change-me@database/project42",
      }),
    /unsafe production placeholder/,
  );
});

test("PostgreSQL adapter translates D1 parameters and role aggregation", () => {
  assert.equal(
    toPostgresParameters(
      "SELECT GROUP_CONCAT(r.role) AS roles FROM role_assignments r WHERE a = ? AND b = ?",
    ),
    "SELECT string_agg(r.role, ',') AS roles FROM role_assignments r WHERE a = $1 AND b = $2",
  );
  assert.equal(toPostgresValue(true), 1);
  assert.equal(toPostgresValue(false), 0);
});

test("filesystem profile-photo adapter is private, durable, and traversal-safe", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "project42-profile-photos-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const bucket = new FilesystemProfilePhotoBucket(directory);
  await bucket.initialize();
  const key =
    "profiles/0123456789abcdef/00000000-0000-4000-8000-000000000001/" +
    "00000000-0000-4000-8000-000000000002.png";
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
  ]);
  const stored = await bucket.put(key, bytes.buffer);
  assert.match(stored.etag, /^[a-f0-9]{64}$/);
  const object = await bucket.get(key);
  assert.ok(object);
  assert.deepEqual(
    new Uint8Array(await new Response(object.body).arrayBuffer()),
    bytes,
  );
  await bucket.delete(key);
  assert.equal(await bucket.get(key), null);
  await assert.rejects(
    () => bucket.put("../../outside.png", bytes.buffer),
    /supported storage contract/,
  );
});

test(
  "PostgreSQL migrations and account repository operate together",
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_POSTGRES_URL });
    try {
      const applied = await applyPostgresMigrations(pool, "self-host/postgres");
      assert.deepEqual(applied, [
        "001_initial.sql",
        "002_learner_profiles.sql",
        "003_linked_identities.sql",
        "004_account_merges.sql",
        "005_learning_events.sql",
        "006_learning_record_receipts.sql",
      ]);
      assert.deepEqual(
        await applyPostgresMigrations(pool, "self-host/postgres"),
        [],
      );

      const database = new PostgresD1CompatibilityDatabase(pool);
      const repository = new D1Project42Repository(
        database,
        "postgres-integration-test",
      );
      const now = "2026-07-27T12:00:00.000Z";
      await repository.ensureInstallation(now);
      const identity = {
        issuer: "https://identity.example.test",
        subject: "owner-subject",
        email: "owner@example.test",
        emailVerified: true,
        displayName: "Owner",
        issuedAt: 1_785_153_600,
      };
      const account = await repository.createOrRefreshAccount(
        identity,
        true,
        "postgres-integration-request",
        now,
      );
      assert.equal(account.state, "approved");
      assert.deepEqual(account.roles, ["learner", "owner"]);
      assert.deepEqual(await repository.findAccount(identity), account);

      const report = await runLearningEventStoreConformance(
        new SqlLearningEventStore(database),
        {
          installationId: "postgres-integration-test",
          learnerId: account.id,
          keyPrefix: "postgres-contract",
        },
      );
      assert.equal(report.contractVersion, "1.0");
      assert.equal(report.eventCountBeforeDeletion, 6);
      assert.equal(report.deletedEventCount, 6);

      const receiptReport = await runLearningRecordReceiptConformance(
        new SqlLearningEventStore(database),
        {
          installationId: "postgres-integration-test",
          learnerId: account.id,
          keyPrefix: "postgres-receipt-contract",
        },
      );
      assert.equal(receiptReport.exportedEventCount, 2);
      assert.equal(receiptReport.deletedEventCount, 2);
      assert.equal(receiptReport.replayedEventCount, 2);
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT COUNT(*) AS count FROM learning_record_deletion_receipts",
            )
          ).rows[0].count,
        ),
        1,
      );
      assert.equal(
        Number(
          (
            await pool.query(
              "SELECT COUNT(*) AS count FROM learning_record_deletion_replays",
            )
          ).rows[0].count,
        ),
        1,
      );
      await assert.rejects(
        () =>
          pool.query(
            "UPDATE learning_record_deletion_receipts SET event_count = 0",
          ),
        /learning record receipts are immutable/,
      );
    } finally {
      await pool.end();
    }
  },
);
