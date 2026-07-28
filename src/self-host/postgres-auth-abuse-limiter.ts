import type { Pool, PoolClient, QueryResultRow } from "pg";
import {
  AuthAbuseLimiterUnavailableError,
  normalizeAuthClientAddress,
  type AuthAbuseLimitDecision,
  type AuthAbuseLimiter,
  type AuthAbuseLimitRequest,
} from "../auth-abuse-limiter.js";

interface AttemptCountRow extends QueryResultRow {
  attempts: number;
}

export interface PostgresAuthAbuseLimiterOptions {
  perClientLimit?: number;
  perInstallationLimit?: number;
  windowSeconds?: number;
  clock?: () => Date;
}

export class PostgresAuthAbuseLimiter implements AuthAbuseLimiter {
  private readonly perClientLimit: number;
  private readonly perInstallationLimit: number;
  private readonly windowSeconds: number;
  private readonly clock: () => Date;

  constructor(
    private readonly pool: Pool,
    options: PostgresAuthAbuseLimiterOptions = {},
  ) {
    this.perClientLimit = positiveLimit(options.perClientLimit ?? 10);
    this.perInstallationLimit = positiveLimit(
      options.perInstallationLimit ?? 100,
    );
    this.windowSeconds = positiveLimit(options.windowSeconds ?? 60);
    this.clock = options.clock ?? (() => new Date());
  }

  async check(
    input: AuthAbuseLimitRequest,
  ): Promise<AuthAbuseLimitDecision> {
    const installationId = requiredValue(input.installationId);
    const clientDigest = await sha256Hex(
      `${installationId}\u0000${normalizeAuthClientAddress(input.clientAddress)}`,
    );
    const installationDigest = await sha256Hex(installationId);
    const now = this.clock();
    if (!Number.isFinite(now.getTime())) {
      throw new AuthAbuseLimiterUnavailableError();
    }
    const cutoff = new Date(
      now.getTime() - this.windowSeconds * 1_000,
    ).toISOString();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO installations (id, display_name, created_at, updated_at)
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (id) DO NOTHING`,
        [
          installationId,
          "Project 42",
          now.toISOString(),
        ],
      );
      await lockSubjects(client, [
        `${installationId}:${input.route}:client:${clientDigest}`,
        `${installationId}:${input.route}:installation:${installationDigest}`,
      ]);
      const clientAttempts = await countAcceptedAttempts(
        client,
        installationId,
        input.route,
        "client",
        clientDigest,
        cutoff,
      );
      const installationAttempts = await countAcceptedAttempts(
        client,
        installationId,
        input.route,
        "installation",
        installationDigest,
        cutoff,
      );
      const allowed =
        clientAttempts < this.perClientLimit &&
        installationAttempts < this.perInstallationLimit;
      if (allowed) {
        await recordAcceptedAttempt(
          client,
          installationId,
          input.route,
          "client",
          clientDigest,
          now.toISOString(),
        );
        await recordAcceptedAttempt(
          client,
          installationId,
          input.route,
          "installation",
          installationDigest,
          now.toISOString(),
        );
      } else {
        await recordDeniedAttemptOnce(
          client,
          installationId,
          input.route,
          clientAttempts >= this.perClientLimit
            ? "client"
            : "installation",
          installationDigest,
          cutoff,
          now.toISOString(),
        );
      }
      await client.query("COMMIT");
      return {
        allowed,
        retryAfterSeconds: this.windowSeconds,
      };
    } catch {
      await rollback(client);
      throw new AuthAbuseLimiterUnavailableError();
    } finally {
      client.release();
    }
  }
}

async function lockSubjects(client: PoolClient, subjects: string[]) {
  for (const subject of [...subjects].sort()) {
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [subject],
    );
  }
}

async function countAcceptedAttempts(
  client: PoolClient,
  installationId: string,
  route: AuthAbuseLimitRequest["route"],
  dimension: "client" | "installation",
  subjectDigest: string,
  cutoff: string,
): Promise<number> {
  const result = await client.query<AttemptCountRow>(
    `SELECT count(*)::integer AS attempts
       FROM audit_events
      WHERE installation_id = $1
        AND action = $2
        AND target_type = $3
        AND target_id = $4
        AND outcome = 'success'
        AND occurred_at >= $5`,
    [
      installationId,
      `auth.${route}.attempt`,
      `auth-abuse-${dimension}`,
      subjectDigest,
      cutoff,
    ],
  );
  return result.rows[0]?.attempts ?? 0;
}

async function recordDeniedAttemptOnce(
  client: PoolClient,
  installationId: string,
  route: AuthAbuseLimitRequest["route"],
  limitingDimension: "client" | "installation",
  installationDigest: string,
  cutoff: string,
  occurredAt: string,
) {
  const existing = await client.query<AttemptCountRow>(
    `SELECT count(*)::integer AS attempts
       FROM audit_events
      WHERE installation_id = $1
        AND action = $2
        AND target_type = 'auth-abuse-denial-window'
        AND target_id = $3
        AND outcome = 'denied'
        AND occurred_at >= $4`,
    [
      installationId,
      `auth.${route}.attempt`,
      installationDigest,
      cutoff,
    ],
  );
  if ((existing.rows[0]?.attempts ?? 0) > 0) return;

  await client.query(
    `INSERT INTO audit_events (
       id, installation_id, actor_user_id, actor_issuer, actor_subject,
       action, target_type, target_id, request_id, outcome, reason,
       metadata_json, occurred_at
     ) VALUES ($1, $2, NULL, NULL, NULL, $3, $4, $5, $6, 'denied', $7, $8, $9)`,
    [
      crypto.randomUUID(),
      installationId,
      `auth.${route}.attempt`,
      "auth-abuse-denial-window",
      installationDigest,
      crypto.randomUUID(),
      "Authentication attempts denied by the abuse limiter; repeated denials are coalesced for this window.",
      JSON.stringify({ limitingDimension }),
      occurredAt,
    ],
  );
}

async function recordAcceptedAttempt(
  client: PoolClient,
  installationId: string,
  route: AuthAbuseLimitRequest["route"],
  dimension: "client" | "installation",
  subjectDigest: string,
  occurredAt: string,
) {
  await client.query(
    `INSERT INTO audit_events (
       id, installation_id, actor_user_id, actor_issuer, actor_subject,
       action, target_type, target_id, request_id, outcome, reason,
       metadata_json, occurred_at
     ) VALUES ($1, $2, NULL, NULL, NULL, $3, $4, $5, $6, 'success', $7, '{}', $8)`,
    [
      crypto.randomUUID(),
      installationId,
      `auth.${route}.attempt`,
      `auth-abuse-${dimension}`,
      subjectDigest,
      crypto.randomUUID(),
      "Authentication attempt admitted by the abuse limiter.",
      occurredAt,
    ],
  );
}

async function rollback(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the fail-closed limiter error when the connection is already lost.
  }
}

function positiveLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 100_000) {
    throw new Error("Authentication abuse-limit values must be positive integers.");
  }
  return value;
}

function requiredValue(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) {
    throw new AuthAbuseLimiterUnavailableError();
  }
  return normalized;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
