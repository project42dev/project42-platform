import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import {
  buildTranscript,
  createEmptyProgress,
  starterCatalog,
  type LearnerProgress,
} from "./index.js";
import {
  canTransitionAccount,
  getVerifiedEmailDomain,
  normalizeExactDomain,
  type AccountState,
  type IdentityVerifier,
  type VerifiedIdentity,
} from "./identity.js";
import type {
  Account,
  CreateDomainRuleRequest,
  DomainRule,
  ProgressEnvelope,
  ProgressImportRequest,
  Project42Role,
} from "./api-contract.js";

type WorkerEnvironment = Env;

interface AccountRow {
  id: string;
  installation_id: string;
  issuer: string;
  subject: string;
  display_name: string | null;
  primary_email: string | null;
  email_verified: number;
  account_state: AccountState;
  created_at: string;
  updated_at: string;
  roles: string | null;
}

interface DomainRow {
  id: string;
  domain: string;
  enabled: number;
  policy_version: number;
  created_at: string;
  updated_at: string;
}

class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

class OidcJwtVerifier implements IdentityVerifier {
  private readonly keySet: ReturnType<typeof createRemoteJWKSet>;

  constructor(private readonly env: WorkerEnvironment) {
    this.keySet = createRemoteJWKSet(new URL(env.OIDC_JWKS_URL));
  }

  async verify(request: Request): Promise<VerifiedIdentity> {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new ApiFailure(401, "missing_access_token", "A Bearer access token is required.");
    }
    const token = authorization.slice("Bearer ".length).trim();
    if (!token) {
      throw new ApiFailure(401, "missing_access_token", "A Bearer access token is required.");
    }

    try {
      const { payload } = await jwtVerify(token, this.keySet, {
        issuer: this.env.OIDC_ISSUER,
        audience: this.env.OIDC_AUDIENCE,
        requiredClaims: ["iss", "sub", "aud", "exp", "iat"],
      });
      if (!payload.iss || !payload.sub) {
        throw new ApiFailure(401, "invalid_access_token", "Token identity is incomplete.");
      }
      const emailValue = payload[this.env.OIDC_EMAIL_CLAIM];
      const verifiedValue = payload[this.env.OIDC_EMAIL_VERIFIED_CLAIM];
      const displayNameValue = payload.name;
      return {
        issuer: payload.iss,
        subject: payload.sub,
        email: typeof emailValue === "string" ? emailValue.trim().toLowerCase() : null,
        emailVerified: verifiedValue === true,
        displayName:
          typeof displayNameValue === "string" && displayNameValue.trim()
            ? displayNameValue.trim()
            : null,
      };
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      if (error instanceof joseErrors.JOSEError) {
        throw new ApiFailure(401, "invalid_access_token", "The access token is not valid.");
      }
      throw error;
    }
  }
}

class D1Project42Repository {
  constructor(
    private readonly db: D1Database,
    private readonly installationId: string,
  ) {}

  async ensureInstallation(now: string): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO installations (id, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at`,
      )
      .bind(this.installationId, "Project 42", now, now)
      .run();
  }

  async findAccount(identity: VerifiedIdentity): Promise<Account | null> {
    const row = await this.db
      .prepare(
        `SELECT u.id, u.installation_id, i.issuer, i.subject, u.display_name,
                u.primary_email, u.email_verified, u.account_state, u.created_at,
                u.updated_at, GROUP_CONCAT(r.role) AS roles
           FROM user_identities i
           JOIN users u
             ON u.installation_id = i.installation_id AND u.id = i.user_id
           LEFT JOIN role_assignments r
             ON r.installation_id = u.installation_id AND r.user_id = u.id
          WHERE i.installation_id = ? AND i.issuer = ? AND i.subject = ?
          GROUP BY u.id`,
      )
      .bind(this.installationId, identity.issuer, identity.subject)
      .first<AccountRow>();
    return row ? mapAccount(row) : null;
  }

  async createOrRefreshAccount(
    identity: VerifiedIdentity,
    ownerBootstrap: boolean,
    requestId: string,
    now: string,
  ): Promise<Account> {
    const existing = await this.findAccount(identity);
    if (existing) {
      await this.db.batch([
        this.db
          .prepare(
            `UPDATE users
                SET display_name = COALESCE(?, display_name),
                    primary_email = CASE WHEN ? = 1 THEN ? ELSE primary_email END,
                    email_verified = CASE WHEN ? = 1 THEN 1 ELSE email_verified END,
                    updated_at = ?
              WHERE installation_id = ? AND id = ?`,
          )
          .bind(
            identity.displayName,
            identity.emailVerified ? 1 : 0,
            identity.email,
            identity.emailVerified ? 1 : 0,
            now,
            this.installationId,
            existing.id,
          ),
        this.db
          .prepare(
            `UPDATE user_identities SET last_seen_at = ?
              WHERE installation_id = ? AND issuer = ? AND subject = ?`,
          )
          .bind(now, this.installationId, identity.issuer, identity.subject),
      ]);
      return (await this.findAccount(identity)) ?? existing;
    }

    const verifiedDomain = getVerifiedEmailDomain(identity);
    const domainRule = verifiedDomain
      ? await this.db
          .prepare(
            `SELECT id, domain, policy_version FROM approved_email_domains
              WHERE installation_id = ? AND domain = ? AND enabled = 1`,
          )
          .bind(this.installationId, verifiedDomain)
          .first<{ id: string; domain: string; policy_version: number }>()
      : null;
    const state: AccountState = ownerBootstrap || domainRule ? "approved" : "pending";
    const userId = crypto.randomUUID();
    const decisionId = crypto.randomUUID();
    const auditId = crypto.randomUUID();
    const decisionKind = ownerBootstrap
      ? "owner-decision"
      : domainRule
        ? "domain-auto-approval"
        : "registration";
    const reason = ownerBootstrap
      ? "Immutable identity matched the configured bootstrap owner."
      : domainRule
        ? `Provider-verified email matched exact domain ${domainRule.domain}.`
        : "New accounts require owner approval.";
    const statements = [
      this.db
        .prepare(
          `INSERT INTO users (
             id, installation_id, display_name, primary_email, email_verified,
             account_state, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          userId,
          this.installationId,
          identity.displayName,
          identity.emailVerified ? identity.email : null,
          identity.emailVerified ? 1 : 0,
          state,
          now,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO user_identities (
             installation_id, issuer, subject, user_id, last_seen_at
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(this.installationId, identity.issuer, identity.subject, userId, now),
      this.db
        .prepare(
          `INSERT INTO role_assignments (
             installation_id, user_id, role, assigned_by_user_id, assigned_at
           ) VALUES (?, ?, 'learner', NULL, ?)`,
        )
        .bind(this.installationId, userId, now),
      this.db
        .prepare(
          `INSERT INTO approval_decisions (
             id, installation_id, user_id, from_state, to_state, decision_kind,
             reason, actor_user_id, domain_rule_id, decided_at
           ) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?)`,
        )
        .bind(
          decisionId,
          this.installationId,
          userId,
          state,
          decisionKind,
          reason,
          domainRule?.id ?? null,
          now,
        ),
      this.auditStatement({
        id: auditId,
        actor: identity,
        actorUserId: userId,
        action: "account.register",
        targetType: "user",
        targetId: userId,
        requestId,
        outcome: "success",
        reason,
        metadata: {
          state,
          decisionKind,
          domainPolicyVersion: domainRule?.policy_version ?? null,
        },
        now,
      }),
    ];
    if (ownerBootstrap) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO role_assignments (
               installation_id, user_id, role, assigned_by_user_id, assigned_at
             ) VALUES (?, ?, 'owner', ?, ?)`,
          )
          .bind(this.installationId, userId, userId, now),
      );
    }
    try {
      await this.db.batch(statements);
    } catch (error) {
      const concurrent = await this.findAccount(identity);
      if (concurrent) return concurrent;
      throw error;
    }
    const created = await this.findAccount(identity);
    if (!created) throw new Error("Account creation did not return an account.");
    return created;
  }

  async listAccounts(state?: AccountState): Promise<Account[]> {
    const condition = state ? "AND u.account_state = ?" : "";
    const statement = this.db.prepare(
      `SELECT u.id, u.installation_id, i.issuer, i.subject, u.display_name,
              u.primary_email, u.email_verified, u.account_state, u.created_at,
              u.updated_at, GROUP_CONCAT(r.role) AS roles
         FROM users u
         JOIN user_identities i
           ON i.installation_id = u.installation_id AND i.user_id = u.id
         LEFT JOIN role_assignments r
           ON r.installation_id = u.installation_id AND r.user_id = u.id
        WHERE u.installation_id = ? ${condition}
        GROUP BY u.id
        ORDER BY u.created_at ASC
        LIMIT 500`,
    );
    const result = state
      ? await statement.bind(this.installationId, state).all<AccountRow>()
      : await statement.bind(this.installationId).all<AccountRow>();
    return result.results.map(mapAccount);
  }

  async changeAccountState(input: {
    actor: Account;
    targetId: string;
    to: AccountState;
    reason: string;
    requestId: string;
    now: string;
  }): Promise<Account> {
    const current = await this.db
      .prepare(
        `SELECT account_state FROM users WHERE installation_id = ? AND id = ?`,
      )
      .bind(this.installationId, input.targetId)
      .first<{ account_state: AccountState }>();
    if (!current) throw new ApiFailure(404, "account_not_found", "Account was not found.");
    if (!canTransitionAccount(current.account_state, input.to)) {
      throw new ApiFailure(
        409,
        "invalid_account_transition",
        `Cannot transition ${current.account_state} to ${input.to}.`,
      );
    }
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE users SET account_state = ?, updated_at = ?
            WHERE installation_id = ? AND id = ?`,
        )
        .bind(input.to, input.now, this.installationId, input.targetId),
      this.db
        .prepare(
          `INSERT INTO approval_decisions (
             id, installation_id, user_id, from_state, to_state, decision_kind,
             reason, actor_user_id, domain_rule_id, decided_at
           ) VALUES (?, ?, ?, ?, ?, 'owner-decision', ?, ?, NULL, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          this.installationId,
          input.targetId,
          current.account_state,
          input.to,
          input.reason,
          input.actor.id,
          input.now,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.actor.identity,
        actorUserId: input.actor.id,
        action: "account.state.change",
        targetType: "user",
        targetId: input.targetId,
        requestId: input.requestId,
        outcome: "success",
        reason: input.reason,
        metadata: { from: current.account_state, to: input.to },
        now: input.now,
      }),
    ]);
    const accounts = await this.listAccounts();
    const updated = accounts.find((account) => account.id === input.targetId);
    if (!updated) throw new Error("Updated account could not be loaded.");
    return updated;
  }

  async listDomains(): Promise<DomainRule[]> {
    const result = await this.db
      .prepare(
        `SELECT id, domain, enabled, policy_version, created_at, updated_at
           FROM approved_email_domains
          WHERE installation_id = ?
          ORDER BY domain`,
      )
      .bind(this.installationId)
      .all<DomainRow>();
    return result.results.map(mapDomain);
  }

  async createDomain(input: {
    actor: Account;
    request: CreateDomainRuleRequest;
    requestId: string;
    now: string;
  }): Promise<DomainRule> {
    const domain = normalizeExactDomain(input.request.domain);
    const id = crypto.randomUUID();
    try {
      await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO approved_email_domains (
               id, installation_id, domain, enabled, created_by_user_id,
               created_at, updated_at, policy_version
             ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
          )
          .bind(
            id,
            this.installationId,
            domain,
            input.request.enabled === false ? 0 : 1,
            input.actor.id,
            input.now,
            input.now,
          ),
        this.auditStatement({
          id: crypto.randomUUID(),
          actor: input.actor.identity,
          actorUserId: input.actor.id,
          action: "domain.create",
          targetType: "approved_email_domain",
          targetId: id,
          requestId: input.requestId,
          outcome: "success",
          reason: input.request.reason,
          metadata: {
            domain,
            enabled: input.request.enabled !== false,
            policyVersion: 1,
          },
          now: input.now,
        }),
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE")) {
        throw new ApiFailure(409, "domain_exists", "That exact domain already exists.");
      }
      throw error;
    }
    return {
      id,
      domain,
      enabled: input.request.enabled !== false,
      policyVersion: 1,
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  async setDomainEnabled(input: {
    actor: Account;
    domainId: string;
    enabled: boolean;
    reason: string;
    requestId: string;
    now: string;
  }): Promise<DomainRule> {
    const existing = await this.db
      .prepare(
        `SELECT id, domain, enabled, policy_version, created_at, updated_at
           FROM approved_email_domains
          WHERE installation_id = ? AND id = ?`,
      )
      .bind(this.installationId, input.domainId)
      .first<DomainRow>();
    if (!existing) throw new ApiFailure(404, "domain_not_found", "Domain rule was not found.");
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE approved_email_domains SET enabled = ?, updated_at = ?
            WHERE installation_id = ? AND id = ?`,
        )
        .bind(input.enabled ? 1 : 0, input.now, this.installationId, input.domainId),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.actor.identity,
        actorUserId: input.actor.id,
        action: "domain.state.change",
        targetType: "approved_email_domain",
        targetId: input.domainId,
        requestId: input.requestId,
        outcome: "success",
        reason: input.reason,
        metadata: {
          enabled: input.enabled,
          domain: existing.domain,
          policyVersion: existing.policy_version,
        },
        now: input.now,
      }),
    ]);
    return {
      ...mapDomain(existing),
      enabled: input.enabled,
      updatedAt: input.now,
    };
  }

  async getProgress(userId: string): Promise<ProgressEnvelope> {
    const row = await this.db
      .prepare(
        `SELECT revision, progress_json, updated_at
           FROM learning_progress
          WHERE installation_id = ? AND user_id = ?`,
      )
      .bind(this.installationId, userId)
      .first<{ revision: number; progress_json: string; updated_at: string }>();
    if (!row) {
      return { revision: 0, progress: createEmptyProgress(), synchronizedAt: new Date(0).toISOString() };
    }
    return {
      revision: row.revision,
      progress: JSON.parse(row.progress_json) as LearnerProgress,
      synchronizedAt: row.updated_at,
    };
  }

  async importProgress(input: {
    account: Account;
    request: ProgressImportRequest;
    requestId: string;
    now: string;
  }): Promise<ProgressEnvelope> {
    const duplicate = await this.db
      .prepare(
        `SELECT imported_revision FROM progress_imports
          WHERE installation_id = ? AND user_id = ? AND id = ?`,
      )
      .bind(this.installationId, input.account.id, input.request.importId)
      .first<{ imported_revision: number }>();
    if (duplicate) return this.getProgress(input.account.id);

    validateProgress(input.request.progress);
    const current = await this.getProgress(input.account.id);
    const revision = current.revision + 1;
    const progressJson = JSON.stringify(input.request.progress);
    const checksum = await sha256(progressJson);
    const transcript = buildTranscript(starterCatalog, input.request.progress);
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO learning_progress (
             installation_id, user_id, schema_version, revision, progress_json, updated_at
           ) VALUES (?, ?, 1, ?, ?, ?)
           ON CONFLICT (installation_id, user_id) DO UPDATE SET
             schema_version = excluded.schema_version,
             revision = excluded.revision,
             progress_json = excluded.progress_json,
             updated_at = excluded.updated_at`,
        )
        .bind(this.installationId, input.account.id, revision, progressJson, input.now),
      this.db
        .prepare(
          `INSERT INTO progress_imports (
             id, installation_id, user_id, source, source_checksum,
             imported_revision, imported_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.request.importId,
          this.installationId,
          input.account.id,
          input.request.source,
          checksum,
          revision,
          input.now,
        ),
      this.db
        .prepare(
          `DELETE FROM module_progress WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(this.installationId, input.account.id),
      this.db
        .prepare(
          `DELETE FROM transcript_entries WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(this.installationId, input.account.id),
      this.db
        .prepare(
          `DELETE FROM assessment_attempts WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(this.installationId, input.account.id),
      this.db
        .prepare(
          `DELETE FROM user_badges WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(this.installationId, input.account.id),
    ];

    for (const moduleId of input.request.progress.completedModuleIds) {
      const path = starterCatalog.paths.find((candidate) =>
        candidate.moduleIds.includes(moduleId),
      );
      if (!path) continue;
      statements.push(
        this.db
          .prepare(
            `INSERT INTO module_progress (
               installation_id, user_id, path_id, module_id, content_version,
               status, first_seen_at, completed_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, 'completed', ?, ?, ?)`,
          )
          .bind(
            this.installationId,
            input.account.id,
            path.id,
            moduleId,
            starterCatalog.contentVersion,
            input.now,
            input.now,
            input.now,
          ),
      );
    }
    for (const attempt of input.request.progress.attempts) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO assessment_attempts (
               id, installation_id, user_id, path_id, module_id, content_version,
               score_percent, passed, completed_at, recorded_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (installation_id, user_id, id) DO NOTHING`,
          )
          .bind(
            attempt.id,
            this.installationId,
            input.account.id,
            attempt.pathId,
            attempt.moduleId,
            attempt.contentVersion,
            attempt.scorePercent,
            attempt.passed ? 1 : 0,
            attempt.completedAt,
            input.now,
          ),
      );
    }
    for (const entry of transcript) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO transcript_entries (
               installation_id, user_id, path_id, path_title, completed_modules,
               total_modules, completion_percent, best_score_percent,
               content_version, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            this.installationId,
            input.account.id,
            entry.pathId,
            entry.pathTitle,
            entry.completedModules,
            entry.totalModules,
            entry.completionPercent,
            entry.bestScorePercent,
            starterCatalog.contentVersion,
            input.now,
          ),
      );
    }
    for (const badge of input.request.progress.badges) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO badge_definitions (
               id, name, description, definition_version, active, created_at, updated_at
             ) VALUES (?, ?, ?, ?, 1, ?, ?)
             ON CONFLICT (id) DO UPDATE SET
               name = excluded.name,
               description = excluded.description,
               definition_version = excluded.definition_version,
               updated_at = excluded.updated_at`,
          )
          .bind(
            badge.id,
            badge.name,
            badge.description,
            starterCatalog.contentVersion,
            input.now,
            input.now,
          ),
        this.db
          .prepare(
            `INSERT INTO user_badges (
               installation_id, user_id, badge_id, name, description, earned_at,
               evidence_module_ids_json, recorded_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (installation_id, user_id, badge_id) DO UPDATE SET
               name = excluded.name,
               description = excluded.description,
               earned_at = excluded.earned_at,
               evidence_module_ids_json = excluded.evidence_module_ids_json,
               recorded_at = excluded.recorded_at`,
          )
          .bind(
            this.installationId,
            input.account.id,
            badge.id,
            badge.name,
            badge.description,
            badge.earnedAt,
            JSON.stringify(badge.evidenceModuleIds),
            input.now,
          ),
      );
    }
    statements.push(
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "progress.import",
        targetType: "learning_progress",
        targetId: input.account.id,
        requestId: input.requestId,
        outcome: "success",
        reason: input.request.source,
        metadata: { revision, checksum },
        now: input.now,
      }),
    );
    await this.db.batch(statements);
    return {
      revision,
      progress: input.request.progress,
      synchronizedAt: input.now,
    };
  }

  async listAuditEvents(): Promise<unknown[]> {
    const result = await this.db
      .prepare(
        `SELECT id, actor_user_id, action, target_type, target_id, request_id,
                outcome, reason, metadata_json, occurred_at
           FROM audit_events
          WHERE installation_id = ?
          ORDER BY sequence DESC
          LIMIT 200`,
      )
      .bind(this.installationId)
      .all<Record<string, unknown>>();
    return result.results.map((event) => ({
      ...event,
      metadata_json:
        typeof event.metadata_json === "string"
          ? JSON.parse(event.metadata_json)
          : event.metadata_json,
    }));
  }

  private auditStatement(input: {
    id: string;
    actor: Pick<VerifiedIdentity, "issuer" | "subject">;
    actorUserId: string | null;
    action: string;
    targetType: string;
    targetId: string | null;
    requestId: string;
    outcome: "success" | "denied" | "failed";
    reason: string;
    metadata: Record<string, unknown>;
    now: string;
  }): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO audit_events (
           id, installation_id, actor_user_id, actor_issuer, actor_subject,
           action, target_type, target_id, request_id, outcome, reason,
           metadata_json, occurred_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.id,
        this.installationId,
        input.actorUserId,
        input.actor.issuer,
        input.actor.subject,
        input.action,
        input.targetType,
        input.targetId,
        input.requestId,
        input.outcome,
        input.reason,
        JSON.stringify(input.metadata),
        input.now,
      );
  }
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    installationId: row.installation_id,
    identity: { issuer: row.issuer, subject: row.subject },
    displayName: row.display_name,
    primaryEmail: row.primary_email,
    emailVerified: row.email_verified === 1,
    state: row.account_state,
    roles: (row.roles?.split(",").filter(Boolean) ?? []) as Project42Role[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapDomain(row: DomainRow): DomainRule {
  return {
    id: row.id,
    domain: row.domain,
    enabled: row.enabled === 1,
    policyVersion: row.policy_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateProgress(value: LearnerProgress): void {
  if (
    value.schemaVersion !== 1 ||
    !Array.isArray(value.startedPathIds) ||
    !Array.isArray(value.completedModuleIds) ||
    !Array.isArray(value.attempts) ||
    !Array.isArray(value.badges) ||
    typeof value.displayName !== "string" ||
    typeof value.updatedAt !== "string"
  ) {
    throw new ApiFailure(400, "invalid_progress", "Progress must use the Project 42 v1 schema.");
  }
  if (
    value.attempts.length > 10_000 ||
    value.badges.length > 1_000 ||
    value.completedModuleIds.length > 10_000
  ) {
    throw new ApiFailure(413, "progress_too_large", "Progress exceeds supported record limits.");
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isOwner(account: Account): boolean {
  return account.state === "approved" && account.roles.includes("owner");
}

function requireApproved(account: Account): void {
  if (account.state !== "approved") {
    throw new ApiFailure(
      403,
      `account_${account.state}`,
      `This account is ${account.state} and cannot access learner records.`,
    );
  }
}

function requireOwner(account: Account): void {
  if (!isOwner(account)) {
    throw new ApiFailure(403, "owner_required", "An approved owner account is required.");
  }
}

async function readJson<T>(request: Request): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 1_000_000) {
    throw new ApiFailure(413, "request_too_large", "Request body exceeds 1 MB.");
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    throw new ApiFailure(400, "invalid_json", "Request body could not be read.");
  }
  if (text.length > 1_000_000) {
    throw new ApiFailure(413, "request_too_large", "Request body exceeds 1 MB.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiFailure(400, "invalid_json", "Request body must be valid JSON.");
  }
}

function json(
  body: unknown,
  status: number,
  requestId: string,
  origin: string | null,
): Response {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "x-request-id": requestId,
  });
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "false");
    headers.set("vary", "Origin");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function permittedOrigin(request: Request, env: WorkerEnvironment): string | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = env.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (!allowed.includes(origin)) {
    throw new ApiFailure(403, "origin_not_allowed", "Request origin is not allowed.");
  }
  return origin;
}

async function handleRequest(
  request: Request,
  env: WorkerEnvironment,
  verifier: IdentityVerifier = new OidcJwtVerifier(env),
  repositoryOverride?: D1Project42Repository,
): Promise<Response> {
  const requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
  let origin: string | null = null;
  try {
    origin = permittedOrigin(request, env);
    if (request.method === "OPTIONS") {
      if (!origin) throw new ApiFailure(400, "origin_required", "CORS preflight requires an origin.");
      const response = json({}, 204, requestId, origin);
      response.headers.set("access-control-allow-methods", "GET,POST,PATCH,PUT,OPTIONS");
      response.headers.set(
        "access-control-allow-headers",
        "authorization,content-type,x-request-id",
      );
      response.headers.set("access-control-max-age", "600");
      return response;
    }

    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ status: "ok" }, 200, requestId, origin);
    }

    const identity = await verifier.verify(request);
    const now = new Date().toISOString();
    const repository =
      repositoryOverride ??
      new D1Project42Repository(env.PROJECT42_DB, env.INSTALLATION_ID);
    await repository.ensureInstallation(now);
    const ownerBootstrap =
      Boolean(env.BOOTSTRAP_OWNER_ISSUER && env.BOOTSTRAP_OWNER_SUBJECT) &&
      identity.issuer === env.BOOTSTRAP_OWNER_ISSUER &&
      identity.subject === env.BOOTSTRAP_OWNER_SUBJECT;

    if (request.method === "POST" && url.pathname === "/v1/session") {
      const account = await repository.createOrRefreshAccount(
        identity,
        ownerBootstrap,
        requestId,
        now,
      );
      return json({ account }, account.state === "pending" ? 202 : 200, requestId, origin);
    }

    const account = await repository.findAccount(identity);
    if (!account) {
      throw new ApiFailure(401, "account_not_registered", "Register this identity first.");
    }
    if (request.method === "GET" && url.pathname === "/v1/me") {
      return json({ account }, 200, requestId, origin);
    }
    if (request.method === "GET" && url.pathname === "/v1/me/progress") {
      requireApproved(account);
      return json({ progress: await repository.getProgress(account.id) }, 200, requestId, origin);
    }
    if (
      (request.method === "POST" || request.method === "PUT") &&
      url.pathname === "/v1/me/progress"
    ) {
      requireApproved(account);
      const body = await readJson<ProgressImportRequest>(request);
      if (
        !body.importId ||
        !["browser-local-v1", "project42-portable-json"].includes(body.source)
      ) {
        throw new ApiFailure(400, "invalid_progress_import", "Import ID and source are required.");
      }
      const progress = await repository.importProgress({
        account,
        request: body,
        requestId,
        now,
      });
      return json({ progress }, 200, requestId, origin);
    }

    if (url.pathname === "/v1/admin/accounts" && request.method === "GET") {
      requireOwner(account);
      const stateValue = url.searchParams.get("state");
      const state =
        stateValue && ["pending", "approved", "suspended", "revoked"].includes(stateValue)
          ? (stateValue as AccountState)
          : undefined;
      if (stateValue && !state) {
        throw new ApiFailure(400, "invalid_account_state", "Unknown account state filter.");
      }
      return json({ accounts: await repository.listAccounts(state) }, 200, requestId, origin);
    }
    const accountMatch = url.pathname.match(/^\/v1\/admin\/accounts\/([^/]+)\/state$/);
    if (accountMatch && request.method === "PATCH") {
      requireOwner(account);
      const body = await readJson<{ state: AccountState; reason: string }>(request);
      if (!["pending", "approved", "suspended", "revoked"].includes(body.state)) {
        throw new ApiFailure(400, "invalid_account_state", "Unknown account state.");
      }
      if (!body.reason || body.reason.trim().length < 5 || body.reason.length > 500) {
        throw new ApiFailure(400, "invalid_reason", "A reason between 5 and 500 characters is required.");
      }
      const updated = await repository.changeAccountState({
        actor: account,
        targetId: decodeURIComponent(accountMatch[1] ?? ""),
        to: body.state,
        reason: body.reason.trim(),
        requestId,
        now,
      });
      return json({ account: updated }, 200, requestId, origin);
    }

    if (url.pathname === "/v1/admin/domains" && request.method === "GET") {
      requireOwner(account);
      return json({ domains: await repository.listDomains() }, 200, requestId, origin);
    }
    if (url.pathname === "/v1/admin/domains" && request.method === "POST") {
      requireOwner(account);
      const body = await readJson<CreateDomainRuleRequest>(request);
      if (!body.reason || body.reason.trim().length < 5 || body.reason.length > 500) {
        throw new ApiFailure(400, "invalid_reason", "A reason between 5 and 500 characters is required.");
      }
      const domain = await repository.createDomain({
        actor: account,
        request: { ...body, reason: body.reason.trim() },
        requestId,
        now,
      });
      return json({ domain }, 201, requestId, origin);
    }
    const domainMatch = url.pathname.match(/^\/v1\/admin\/domains\/([^/]+)$/);
    if (domainMatch && request.method === "PATCH") {
      requireOwner(account);
      const body = await readJson<{ enabled: boolean; reason: string }>(request);
      if (typeof body.enabled !== "boolean") {
        throw new ApiFailure(400, "invalid_domain_state", "Enabled must be true or false.");
      }
      if (!body.reason || body.reason.trim().length < 5 || body.reason.length > 500) {
        throw new ApiFailure(400, "invalid_reason", "A reason between 5 and 500 characters is required.");
      }
      const domain = await repository.setDomainEnabled({
        actor: account,
        domainId: decodeURIComponent(domainMatch[1] ?? ""),
        enabled: body.enabled,
        reason: body.reason.trim(),
        requestId,
        now,
      });
      return json({ domain }, 200, requestId, origin);
    }
    if (url.pathname === "/v1/admin/audit" && request.method === "GET") {
      requireOwner(account);
      return json({ events: await repository.listAuditEvents() }, 200, requestId, origin);
    }

    throw new ApiFailure(404, "route_not_found", "API route was not found.");
  } catch (error) {
    const failure =
      error instanceof ApiFailure
        ? error
        : new ApiFailure(500, "internal_error", "The request could not be completed.");
    console.error(
      JSON.stringify({
        level: failure.status >= 500 ? "error" : "warn",
        requestId,
        method: request.method,
        path: new URL(request.url).pathname,
        status: failure.status,
        code: failure.code,
      }),
    );
    return json(
      { error: { code: failure.code, message: failure.message, requestId } },
      failure.status,
      requestId,
      origin,
    );
  }
}

export { D1Project42Repository, OidcJwtVerifier, handleRequest };

export default {
  fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<WorkerEnvironment>;
