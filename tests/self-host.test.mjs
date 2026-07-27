import assert from "node:assert/strict";
import { test } from "node:test";
import { Pool } from "pg";
import { readConfiguration } from "../dist/self-host/config.js";
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

test(
  "PostgreSQL migrations and account repository operate together",
  { skip: !process.env.TEST_POSTGRES_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_POSTGRES_URL });
    try {
      const applied = await applyPostgresMigrations(pool, "self-host/postgres");
      assert.deepEqual(applied, ["001_initial.sql"]);
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
    } finally {
      await pool.end();
    }
  },
);
