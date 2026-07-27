import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import {
  buildTranscript,
  createEmptyProgress,
  starterCatalog,
  type LearnerProgress,
} from "./index.js";
import {
  ACCOUNT_STATES,
  canTransitionAccount,
  getVerifiedEmailDomain,
  normalizeExactDomain,
  type AccountState,
  type IdentityVerifier,
  type VerifiedIdentity,
} from "./identity.js";
import type {
  Account,
  ConsentDecision,
  ConsentRecord,
  CreateDomainRuleRequest,
  DeletionRequest,
  DomainRule,
  LearnerDataExport,
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

interface ConsentRow {
  id: string;
  purpose: string;
  policy_version: string;
  decision: ConsentDecision;
  decided_at: string;
}

interface DeletionRequestRow {
  id: string;
  state: DeletionRequest["state"];
  requested_at: string;
  cancellation_deadline: string;
  completed_at: string | null;
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
        ...(typeof payload.iat === "number" ? { issuedAt: payload.iat } : {}),
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

  async listConsents(userId: string): Promise<ConsentRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT id, purpose, policy_version, decision, decided_at
           FROM consent_records
          WHERE installation_id = ? AND user_id = ?
          ORDER BY decided_at ASC`,
      )
      .bind(this.installationId, userId)
      .all<ConsentRow>();
    return result.results.map(mapConsent);
  }

  async recordConsent(input: {
    account: Account;
    purpose: string;
    policyVersion: string;
    decision: ConsentDecision;
    requestId: string;
    now: string;
  }): Promise<ConsentRecord> {
    const consent: ConsentRecord = {
      id: crypto.randomUUID(),
      purpose: input.purpose,
      policyVersion: input.policyVersion,
      decision: input.decision,
      decidedAt: input.now,
    };
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO consent_records (
             id, installation_id, user_id, purpose, policy_version, decision, decided_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          consent.id,
          this.installationId,
          input.account.id,
          consent.purpose,
          consent.policyVersion,
          consent.decision,
          consent.decidedAt,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "consent.record",
        targetType: "consent",
        targetId: consent.id,
        requestId: input.requestId,
        outcome: "success",
        reason: `${consent.purpose}:${consent.decision}`,
        metadata: {
          purpose: consent.purpose,
          policyVersion: consent.policyVersion,
          decision: consent.decision,
        },
        now: input.now,
      }),
    ]);
    return consent;
  }

  async listDeletionRequests(userId: string): Promise<DeletionRequest[]> {
    const result = await this.db
      .prepare(
        `SELECT id, state, requested_at, cancellation_deadline, completed_at
           FROM deletion_requests
          WHERE installation_id = ? AND user_id = ?
          ORDER BY requested_at DESC`,
      )
      .bind(this.installationId, userId)
      .all<DeletionRequestRow>();
    return result.results.map(mapDeletionRequest);
  }

  async requestDeletion(input: {
    account: Account;
    requestId: string;
    now: string;
  }): Promise<DeletionRequest> {
    const existing = await this.db
      .prepare(
        `SELECT id, state, requested_at, cancellation_deadline, completed_at
           FROM deletion_requests
          WHERE installation_id = ? AND user_id = ?
            AND state IN ('requested', 'processing')
          ORDER BY requested_at DESC
          LIMIT 1`,
      )
      .bind(this.installationId, input.account.id)
      .first<DeletionRequestRow>();
    if (existing) return mapDeletionRequest(existing);

    const deletionRequest: DeletionRequest = {
      id: crypto.randomUUID(),
      state: "requested",
      requestedAt: input.now,
      cancellationDeadline: new Date(
        Date.parse(input.now) + 7 * 24 * 60 * 60 * 1_000,
      ).toISOString(),
      completedAt: null,
    };
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO deletion_requests (
             id, installation_id, user_id, state, requested_at,
             cancellation_deadline, completed_at
           ) VALUES (?, ?, ?, 'requested', ?, ?, NULL)`,
        )
        .bind(
          deletionRequest.id,
          this.installationId,
          input.account.id,
          deletionRequest.requestedAt,
          deletionRequest.cancellationDeadline,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "deletion.request",
        targetType: "user",
        targetId: input.account.id,
        requestId: input.requestId,
        outcome: "success",
        reason: "Learner requested account and learner-data deletion.",
        metadata: {
          deletionRequestId: deletionRequest.id,
          cancellationDeadline: deletionRequest.cancellationDeadline,
        },
        now: input.now,
      }),
    ]);
    return deletionRequest;
  }

  async cancelDeletion(input: {
    account: Account;
    requestId: string;
    now: string;
  }): Promise<DeletionRequest> {
    const existing = await this.db
      .prepare(
        `SELECT id, state, requested_at, cancellation_deadline, completed_at
           FROM deletion_requests
          WHERE installation_id = ? AND user_id = ? AND state = 'requested'
          ORDER BY requested_at DESC
          LIMIT 1`,
      )
      .bind(this.installationId, input.account.id)
      .first<DeletionRequestRow>();
    if (!existing) {
      throw new ApiFailure(
        404,
        "deletion_request_not_found",
        "No cancellable deletion request was found.",
      );
    }
    if (Date.parse(input.now) >= Date.parse(existing.cancellation_deadline)) {
      throw new ApiFailure(
        409,
        "deletion_cancellation_closed",
        "The deletion cancellation period has ended.",
      );
    }
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE deletion_requests SET state = 'cancelled'
            WHERE installation_id = ? AND user_id = ? AND id = ? AND state = 'requested'`,
        )
        .bind(this.installationId, input.account.id, existing.id),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "deletion.cancel",
        targetType: "user",
        targetId: input.account.id,
        requestId: input.requestId,
        outcome: "success",
        reason: "Learner cancelled the pending deletion request.",
        metadata: { deletionRequestId: existing.id },
        now: input.now,
      }),
    ]);
    return {
      ...mapDeletionRequest(existing),
      state: "cancelled",
    };
  }

  async exportLearnerData(input: {
    account: Account;
    requestId: string;
    now: string;
  }): Promise<LearnerDataExport> {
    const [
      progress,
      moduleProgress,
      assessmentAttempts,
      transcriptEntries,
      badges,
      consents,
      deletionRequests,
      approvalDecisions,
    ] = await Promise.all([
      this.getProgress(input.account.id),
      this.db
        .prepare(
          `SELECT path_id AS pathId, module_id AS moduleId,
                  content_version AS contentVersion, status,
                  first_seen_at AS firstSeenAt, completed_at AS completedAt,
                  updated_at AS updatedAt
             FROM module_progress
            WHERE installation_id = ? AND user_id = ?
            ORDER BY updated_at ASC`,
        )
        .bind(this.installationId, input.account.id)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT id, path_id AS pathId, module_id AS moduleId,
                  content_version AS contentVersion, score_percent AS scorePercent,
                  passed, completed_at AS completedAt, recorded_at AS recordedAt
             FROM assessment_attempts
            WHERE installation_id = ? AND user_id = ?
            ORDER BY completed_at ASC`,
        )
        .bind(this.installationId, input.account.id)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT path_id AS pathId, path_title AS pathTitle,
                  completed_modules AS completedModules, total_modules AS totalModules,
                  completion_percent AS completionPercent,
                  best_score_percent AS bestScorePercent,
                  content_version AS contentVersion, updated_at AS updatedAt
             FROM transcript_entries
            WHERE installation_id = ? AND user_id = ?
            ORDER BY path_id ASC`,
        )
        .bind(this.installationId, input.account.id)
        .all<Record<string, unknown>>(),
      this.db
        .prepare(
          `SELECT badge_id AS badgeId, name, description, earned_at AS earnedAt,
                  evidence_module_ids_json AS evidenceModuleIds,
                  recorded_at AS recordedAt
             FROM user_badges
            WHERE installation_id = ? AND user_id = ?
            ORDER BY earned_at ASC`,
        )
        .bind(this.installationId, input.account.id)
        .all<Record<string, unknown>>(),
      this.listConsents(input.account.id),
      this.listDeletionRequests(input.account.id),
      this.db
        .prepare(
          `SELECT id, from_state AS fromState, to_state AS toState,
                  decision_kind AS decisionKind, reason, decided_at AS decidedAt
             FROM approval_decisions
            WHERE installation_id = ? AND user_id = ?
            ORDER BY decided_at ASC`,
        )
        .bind(this.installationId, input.account.id)
        .all<Record<string, unknown>>(),
    ]);
    await this.db.batch([
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "data.export",
        targetType: "user",
        targetId: input.account.id,
        requestId: input.requestId,
        outcome: "success",
        reason: "Learner exported their Project 42 account and learning data.",
        metadata: { schemaVersion: 1 },
        now: input.now,
      }),
    ]);
    return {
      schemaVersion: 1,
      exportedAt: input.now,
      account: input.account,
      progress,
      moduleProgress: moduleProgress.results,
      assessmentAttempts: assessmentAttempts.results.map((attempt) => ({
        ...attempt,
        passed: attempt.passed === 1,
      })),
      transcriptEntries: transcriptEntries.results,
      badges: badges.results.map((badge) => ({
        ...badge,
        evidenceModuleIds:
          typeof badge.evidenceModuleIds === "string"
            ? JSON.parse(badge.evidenceModuleIds)
            : badge.evidenceModuleIds,
      })),
      consents,
      deletionRequests,
      approvalDecisions: approvalDecisions.results,
    };
  }

  async listPendingDeletions(): Promise<unknown[]> {
    const result = await this.db
      .prepare(
        `SELECT d.id, d.user_id AS userId, d.state,
                d.requested_at AS requestedAt,
                d.cancellation_deadline AS cancellationDeadline,
                u.display_name AS displayName, u.primary_email AS primaryEmail
           FROM deletion_requests d
           JOIN users u
             ON u.installation_id = d.installation_id AND u.id = d.user_id
          WHERE d.installation_id = ? AND d.state IN ('requested', 'processing')
          ORDER BY d.requested_at ASC`,
      )
      .bind(this.installationId)
      .all<Record<string, unknown>>();
    return result.results;
  }

  async completeDeletion(input: {
    actor: Account;
    deletionRequestId: string;
    reason: string;
    requestId: string;
    now: string;
  }): Promise<{ deletionRequestId: string; completedAt: string; subjectDigest: string }> {
    const deletion = await this.db
      .prepare(
        `SELECT d.id, d.user_id, d.state, d.requested_at, d.cancellation_deadline,
                i.issuer, i.subject,
                EXISTS (
                  SELECT 1 FROM role_assignments r
                   WHERE r.installation_id = d.installation_id
                     AND r.user_id = d.user_id AND r.role = 'owner'
                ) AS is_owner
           FROM deletion_requests d
           JOIN user_identities i
             ON i.installation_id = d.installation_id AND i.user_id = d.user_id
          WHERE d.installation_id = ? AND d.id = ?
          LIMIT 1`,
      )
      .bind(this.installationId, input.deletionRequestId)
      .first<{
        id: string;
        user_id: string;
        state: DeletionRequest["state"];
        requested_at: string;
        cancellation_deadline: string;
        issuer: string;
        subject: string;
        is_owner: number;
      }>();
    if (!deletion || !["requested", "processing"].includes(deletion.state)) {
      throw new ApiFailure(
        404,
        "deletion_request_not_found",
        "An active deletion request was not found.",
      );
    }
    if (deletion.is_owner === 1) {
      throw new ApiFailure(
        409,
        "owner_transfer_required",
        "Transfer or remove the owner role before deleting this account.",
      );
    }
    if (Date.parse(input.now) < Date.parse(deletion.cancellation_deadline)) {
      throw new ApiFailure(
        409,
        "deletion_cancellation_open",
        "The deletion request is still inside its cancellation period.",
      );
    }
    const subjectDigest = await sha256(`${deletion.issuer}\n${deletion.subject}`);
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE audit_events
              SET actor_user_id = CASE
                    WHEN actor_user_id = ? THEN NULL ELSE actor_user_id
                  END,
                  actor_issuer = CASE
                    WHEN actor_user_id = ? THEN NULL ELSE actor_issuer
                  END,
                  actor_subject = CASE
                    WHEN actor_user_id = ? THEN NULL ELSE actor_subject
                  END,
                  target_id = CASE
                    WHEN target_type = 'user' AND target_id = ? THEN NULL
                    ELSE target_id
                  END
            WHERE installation_id = ?
              AND (
                actor_user_id = ? OR
                (target_type = 'user' AND target_id = ?)
              )`,
        )
        .bind(
          deletion.user_id,
          deletion.user_id,
          deletion.user_id,
          deletion.user_id,
          this.installationId,
          deletion.user_id,
          deletion.user_id,
        ),
      this.db
        .prepare(
          `INSERT INTO deletion_tombstones (
             id, installation_id, subject_digest, deletion_request_id,
             requested_at, completed_at, completed_by_user_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          this.installationId,
          subjectDigest,
          deletion.id,
          deletion.requested_at,
          input.now,
          input.actor.id,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.actor.identity,
        actorUserId: input.actor.id,
        action: "deletion.complete",
        targetType: "deletion_tombstone",
        targetId: subjectDigest,
        requestId: input.requestId,
        outcome: "success",
        reason: input.reason,
        metadata: {
          deletionRequestId: deletion.id,
          subjectDigest,
        },
        now: input.now,
      }),
      this.db
        .prepare(`DELETE FROM users WHERE installation_id = ? AND id = ?`)
        .bind(this.installationId, deletion.user_id),
    ]);
    return {
      deletionRequestId: deletion.id,
      completedAt: input.now,
      subjectDigest,
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

function mapConsent(row: ConsentRow): ConsentRecord {
  return {
    id: row.id,
    purpose: row.purpose,
    policyVersion: row.policy_version,
    decision: row.decision,
    decidedAt: row.decided_at,
  };
}

function mapDeletionRequest(row: DeletionRequestRow): DeletionRequest {
  return {
    id: row.id,
    state: row.state,
    requestedAt: row.requested_at,
    cancellationDeadline: row.cancellation_deadline,
    completedAt: row.completed_at,
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

function requireRecentAuthentication(identity: VerifiedIdentity, now: string): void {
  const issuedAt = identity.issuedAt;
  const nowSeconds = Math.floor(Date.parse(now) / 1_000);
  if (
    typeof issuedAt !== "number" ||
    !Number.isFinite(issuedAt) ||
    issuedAt > nowSeconds + 60 ||
    nowSeconds - issuedAt > 15 * 60
  ) {
    throw new ApiFailure(
      401,
      "recent_authentication_required",
      "Sign in again before exporting or deleting account data.",
    );
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
  const responseBody = status === 204 || status === 304 ? null : JSON.stringify(body);
  return new Response(responseBody, { status, headers });
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
      response.headers.set(
        "access-control-allow-methods",
        "DELETE,GET,POST,PATCH,PUT,OPTIONS",
      );
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
    if (request.method === "GET" && url.pathname === "/v1/me/consents") {
      return json(
        { consents: await repository.listConsents(account.id) },
        200,
        requestId,
        origin,
      );
    }
    if (request.method === "POST" && url.pathname === "/v1/me/consents") {
      const body = await readJson<{
        purpose: string;
        policyVersion: string;
        decision: ConsentDecision;
      }>(request);
      if (
        typeof body.purpose !== "string" ||
        !/^[a-z][a-z0-9-]{2,63}$/.test(body.purpose)
      ) {
        throw new ApiFailure(
          400,
          "invalid_consent_purpose",
          "Consent purpose must be a stable lowercase identifier.",
        );
      }
      if (
        typeof body.policyVersion !== "string" ||
        body.policyVersion.trim().length < 1 ||
        body.policyVersion.length > 64
      ) {
        throw new ApiFailure(
          400,
          "invalid_policy_version",
          "A policy version of at most 64 characters is required.",
        );
      }
      if (!["granted", "withdrawn"].includes(body.decision)) {
        throw new ApiFailure(
          400,
          "invalid_consent_decision",
          "Consent decision must be granted or withdrawn.",
        );
      }
      const consent = await repository.recordConsent({
        account,
        purpose: body.purpose,
        policyVersion: body.policyVersion.trim(),
        decision: body.decision,
        requestId,
        now,
      });
      return json({ consent }, 201, requestId, origin);
    }
    if (request.method === "GET" && url.pathname === "/v1/me/export") {
      requireRecentAuthentication(identity, now);
      const response = json(
        { export: await repository.exportLearnerData({ account, requestId, now }) },
        200,
        requestId,
        origin,
      );
      response.headers.set(
        "content-disposition",
        `attachment; filename="project42-learner-export-${now.slice(0, 10)}.json"`,
      );
      return response;
    }
    if (request.method === "GET" && url.pathname === "/v1/me/deletion") {
      return json(
        { requests: await repository.listDeletionRequests(account.id) },
        200,
        requestId,
        origin,
      );
    }
    if (request.method === "POST" && url.pathname === "/v1/me/deletion") {
      requireRecentAuthentication(identity, now);
      const body = await readJson<{ confirmation: string }>(request);
      if (body.confirmation !== "DELETE MY PROJECT 42 ACCOUNT") {
        throw new ApiFailure(
          400,
          "deletion_confirmation_required",
          "Enter the required deletion confirmation exactly.",
        );
      }
      const deletionRequest = await repository.requestDeletion({
        account,
        requestId,
        now,
      });
      return json({ deletionRequest }, 202, requestId, origin);
    }
    if (request.method === "DELETE" && url.pathname === "/v1/me/deletion") {
      requireRecentAuthentication(identity, now);
      const deletionRequest = await repository.cancelDeletion({
        account,
        requestId,
        now,
      });
      return json({ deletionRequest }, 200, requestId, origin);
    }

    if (url.pathname === "/v1/admin/accounts" && request.method === "GET") {
      requireOwner(account);
      const stateValue = url.searchParams.get("state");
      const state =
        stateValue && ACCOUNT_STATES.includes(stateValue as AccountState)
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
      if (!ACCOUNT_STATES.includes(body.state)) {
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
    if (url.pathname === "/v1/admin/deletions" && request.method === "GET") {
      requireOwner(account);
      return json(
        { requests: await repository.listPendingDeletions() },
        200,
        requestId,
        origin,
      );
    }
    const deletionMatch = url.pathname.match(
      /^\/v1\/admin\/deletions\/([^/]+)\/complete$/,
    );
    if (deletionMatch && request.method === "POST") {
      requireOwner(account);
      requireRecentAuthentication(identity, now);
      const body = await readJson<{ reason: string }>(request);
      if (!body.reason || body.reason.trim().length < 5 || body.reason.length > 500) {
        throw new ApiFailure(
          400,
          "invalid_reason",
          "A reason between 5 and 500 characters is required.",
        );
      }
      const completion = await repository.completeDeletion({
        actor: account,
        deletionRequestId: decodeURIComponent(deletionMatch[1] ?? ""),
        reason: body.reason.trim(),
        requestId,
        now,
      });
      return json({ completion }, 200, requestId, origin);
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
