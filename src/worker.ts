import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from "jose";
import {
  buildTranscript,
  createEmptyProgress,
  mergeLearnerProgress,
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
  AccountMergeConflict,
  AccountMergePreview,
  AccountMergePreviewRequest,
  AccountMergeProof,
  AccountMergeProofMethod,
  AccountMergeReceipt,
  AccountMergeResolutionChoice,
  CompleteAccountMergeRequest,
  AuditEvent,
  ConsentDecision,
  ConsentRecord,
  CreateDomainRuleRequest,
  CreateIdentityLinkTransactionRequest,
  DeleteDomainRuleRequest,
  DeletionRequest,
  DomainRule,
  GithubIdentityLinkCompletionRequest,
  GithubIdentityLinkStartRequest,
  IdentityLinkTransaction,
  LearnerProfile,
  LearnerDataExport,
  LinkedIdentity,
  LinkedIdentityStatus,
  OwnerRecoveryProofRequest,
  ProgressEnvelope,
  ProgressImportRequest,
  Project42Role,
  RollbackAccountMergeRequest,
  UpdateLearnerProfileRequest,
} from "./api-contract.js";
import {
  configureLearningRecordAdapter,
  readLearningRecordAdapterConfiguration,
  type LearningRecordAdapterConfiguration,
} from "./learning-record-adapter.js";
import {
  BROWSER_SESSION_COOKIE,
  clearHostCookie,
  createHostCookie,
  createPkceChallenge,
  normalizeReturnTarget,
  OIDC_TRANSACTION_COOKIE,
  openOidcTransaction,
  randomBase64Url,
  readBrowserOidcConfiguration,
  readCookie,
  sealOidcTransaction,
  type BrowserOidcTransaction,
} from "./browser-session.js";
import {
  AuthAbuseLimiterUnavailableError,
  CloudflareAuthAbuseLimiter,
  readCloudflareClientAddress,
  type AuthAbuseLimiter,
  type AuthAbuseRoute,
} from "./auth-abuse-limiter.js";
import {
  LearningEventEngine,
  LearningEventEngineError,
  projectLearningEvents,
  type LearningEventAccess,
  type LearningProjection,
} from "./learning-event-engine.js";
import {
  LEARNING_EVENT_CONTRACT_VERSION,
  type LearningEvent,
  type LearningProgressImportSource,
} from "./learning-events.js";
import {
  SqlLearningEventStore,
  type LearningEventDatabase,
} from "./sql-learning-event-store.js";

type WorkerEnvironment = Omit<
  Env,
  | "DOMAIN_APPROVAL_ENABLED"
  | "LEARNING_RECORD_ADAPTER"
  | "AUTH_CLIENT_RATE_LIMITER"
  | "AUTH_INSTALLATION_RATE_LIMITER"
> & {
  DOMAIN_APPROVAL_ENABLED?: string;
  LEARNING_RECORD_ADAPTER?: string;
  PROFILE_PHOTOS?: R2Bucket;
  GITHUB_LINK_CLIENT_ID?: string;
  GITHUB_LINK_CLIENT_SECRET?: string;
  GITHUB_LINK_REDIRECT_URI?: string;
  OIDC_AUTHORIZATION_ENDPOINT?: string;
  OIDC_TOKEN_ENDPOINT?: string;
  OIDC_CLIENT_ID?: string;
  OIDC_CLIENT_SECRET?: string;
  OIDC_REDIRECT_URI?: string;
  OIDC_LOGOUT_ENDPOINT?: string;
  SESSION_ENCRYPTION_KEY?: string;
  AUTH_CLIENT_RATE_LIMITER?: RateLimit;
  AUTH_INSTALLATION_RATE_LIMITER?: RateLimit;
};

interface BrowserSessionRow {
  id: string;
  user_id: string;
  identity_issuer: string;
  identity_subject: string;
  authenticated_at: number;
  expires_at: string;
  absolute_expires_at: string;
}

interface ResolvedBrowserSession {
  id: string;
  identity: VerifiedIdentity;
  expiresAt: string;
  absoluteExpiresAt: string;
}

interface TransactionalPostconditionDatabase {
  batchWithPostcondition(
    statements: D1PreparedStatement[],
    postcondition: (
      results: D1Result<unknown>[],
    ) => void | Promise<void>,
  ): Promise<D1Result<unknown>[]>;
}

interface AccountRow {
  id: string;
  installation_id: string;
  provider: string;
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

interface LinkedIdentityRow {
  id: string;
  provider: string;
  provider_login: string | null;
  display_name: string | null;
  status: LinkedIdentityStatus;
  is_primary: number;
  linked_at: string;
  last_verified_at: string;
  last_seen_at: string;
  unlinked_at: string | null;
  merge_source: number;
}

interface IdentityLinkTransactionRow {
  id: string;
  user_id: string;
  provider: string;
  state_digest: string;
  code_challenge: string;
  code_challenge_method: "S256";
  return_path: string;
  status:
    | "pending"
    | "processing"
    | "completed"
    | "cancelled"
    | "expired"
    | "failed";
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  request_id: string;
}

interface ExternalProviderIdentity {
  provider: string;
  issuer: string;
  subject: string;
  providerLogin: string | null;
  displayName: string | null;
}

interface DomainRow {
  id: string;
  domain: string;
  enabled: number;
  policy_version: number;
  created_at: string;
  updated_at: string;
}

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  bio: string | null;
  organization: string | null;
  location: string | null;
  website_url: string | null;
  photo_object_key: string | null;
  photo_content_type: string | null;
  photo_byte_length: number | null;
  photo_etag: string | null;
  photo_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ProfilePhotoMetadata {
  objectKey: string;
  contentType: string;
  byteLength: number;
  etag: string;
  updatedAt: string;
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

interface AccountMergeProofRow {
  id: string;
  user_id: string | null;
  proof_method: AccountMergeProofMethod;
  token_digest: string;
  evidence_json: string | Record<string, unknown>;
  status: "available" | "consumed" | "expired" | "cancelled";
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
}

interface AccountMergeCaseRow {
  id: string;
  source_user_id: string | null;
  survivor_user_id: string | null;
  source_proof_id: string | null;
  survivor_proof_id: string | null;
  status: "preview" | "completed" | "rolled-back" | "cancelled" | "failed";
  preview_json: string | {
    conflicts: AccountMergeConflict[];
    recordCounts: Record<string, { source: number; survivor: number }>;
    proofMethods: {
      source: AccountMergeProofMethod;
      survivor: AccountMergeProofMethod;
    };
  };
  preview_digest: string;
  resolutions_json: string | Record<string, AccountMergeResolutionChoice> | null;
  snapshot_digest: string | null;
  idempotency_key: string;
  created_at: string;
  expires_at: string;
  completed_at: string | null;
  rolled_back_at: string | null;
}

interface AccountMergeSnapshotRow {
  table_name: string;
  row_key: string;
  row_json: string | Record<string, unknown>;
  row_digest: string;
}

interface MergeSnapshotEntry {
  tableName: string;
  rowKey: string;
  row: Record<string, unknown>;
  rowDigest: string;
}

interface MergeSnapshot {
  entries: MergeSnapshotEntry[];
  digest: string;
  recordCounts: Record<string, { source: number; survivor: number }>;
}

const ACCOUNT_MERGE_SNAPSHOT_TABLES = [
  "users",
  "role_assignments",
  "user_profiles",
  "user_identities",
  "learning_progress",
  "module_progress",
  "assessment_attempts",
  "transcript_entries",
  "user_badges",
  "progress_imports",
  "consent_records",
  "deletion_requests",
] as const;

class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
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

    return this.verifyToken(token);
  }

  async verifyToken(
    token: string,
    options: {
      audience?: string;
      nonce?: string;
      requireAuthenticationTime?: boolean;
    } = {},
  ): Promise<VerifiedIdentity> {
    try {
      const requiredClaims = ["iss", "sub", "aud", "exp", "iat"];
      if (options.requireAuthenticationTime) requiredClaims.push("auth_time");
      const { payload } = await jwtVerify(token, this.keySet, {
        issuer: this.env.OIDC_ISSUER,
        audience: options.audience ?? this.env.OIDC_AUDIENCE,
        requiredClaims,
      });
      if (!payload.iss || !payload.sub) {
        throw new ApiFailure(401, "invalid_access_token", "Token identity is incomplete.");
      }
      if (options.nonce && payload.nonce !== options.nonce) {
        throw new ApiFailure(
          401,
          "invalid_identity_token",
          "The identity response could not be verified.",
        );
      }
      const expectedAudience = options.audience ?? this.env.OIDC_AUDIENCE;
      if (
        (payload.azp !== undefined && payload.azp !== expectedAudience) ||
        (Array.isArray(payload.aud) &&
          payload.aud.length > 1 &&
          payload.azp !== expectedAudience)
      ) {
        throw new ApiFailure(
          401,
          options.nonce ? "invalid_identity_token" : "invalid_access_token",
          "The token authorized party could not be verified.",
        );
      }
      if (
        options.requireAuthenticationTime &&
        (typeof payload.auth_time !== "number" ||
          !Number.isFinite(payload.auth_time) ||
          payload.auth_time > Math.floor(Date.now() / 1_000) + 60 ||
          Math.floor(Date.now() / 1_000) - payload.auth_time > 5 * 60)
      ) {
        throw new ApiFailure(
          401,
          "invalid_identity_token",
          "The identity provider did not supply fresh-authentication evidence.",
        );
      }
      const emailValue = payload[this.env.OIDC_EMAIL_CLAIM];
      const verifiedValue = payload[this.env.OIDC_EMAIL_VERIFIED_CLAIM];
      const displayNameValue = payload.name;
      return {
        provider: "oidc",
        issuer: payload.iss,
        subject: payload.sub,
        email: typeof emailValue === "string" ? emailValue.trim().toLowerCase() : null,
        emailVerified: verifiedValue === true,
        displayName:
          typeof displayNameValue === "string" && displayNameValue.trim()
            ? displayNameValue.trim()
            : null,
        ...(typeof payload.iat === "number" ? { issuedAt: payload.iat } : {}),
        ...(typeof payload.auth_time === "number"
          ? { authenticatedAt: payload.auth_time }
          : {}),
      };
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      if (error instanceof joseErrors.JOSEError) {
        throw new ApiFailure(
          401,
          options.nonce ? "invalid_identity_token" : "invalid_access_token",
          options.nonce
            ? "The identity response could not be verified."
            : "The access token is not valid.",
        );
      }
      throw error;
    }
  }
}

class BrowserOidcAdapter {
  constructor(
    private readonly env: WorkerEnvironment,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  async createAuthorization(
    transaction: BrowserOidcTransaction,
  ): Promise<{ location: string; cookie: string }> {
    const configuration = await readBrowserOidcConfiguration(this.env);
    const authorization = new URL(configuration.authorizationEndpoint);
    authorization.searchParams.set("client_id", configuration.clientId);
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("redirect_uri", configuration.redirectUri);
    authorization.searchParams.set("response_mode", "query");
    authorization.searchParams.set("scope", "openid profile email");
    authorization.searchParams.set("prompt", "login");
    authorization.searchParams.set("max_age", "0");
    authorization.searchParams.set("state", transaction.state);
    authorization.searchParams.set("nonce", transaction.nonce);
    authorization.searchParams.set(
      "code_challenge",
      await createPkceChallenge(transaction.codeVerifier),
    );
    authorization.searchParams.set("code_challenge_method", "S256");
    return {
      location: authorization.toString(),
      cookie: createHostCookie(
        OIDC_TRANSACTION_COOKIE,
        await sealOidcTransaction(
          transaction,
          configuration.encryptionKey,
        ),
        10 * 60,
      ),
    };
  }

  async readTransaction(request: Request): Promise<BrowserOidcTransaction> {
    const cookie = readCookie(request, OIDC_TRANSACTION_COOKIE);
    if (!cookie) {
      throw new ApiFailure(
        400,
        "authorization_transaction_missing",
        "The sign-in response is missing its secure transaction. Start sign-in again.",
      );
    }
    try {
      const configuration = await readBrowserOidcConfiguration(this.env);
      return await openOidcTransaction(cookie, configuration.encryptionKey);
    } catch {
      throw new ApiFailure(
        400,
        "authorization_transaction_invalid",
        "The sign-in response is invalid or expired. Start sign-in again.",
      );
    }
  }

  async exchange(
    code: string,
    transaction: BrowserOidcTransaction,
  ): Promise<{ idToken: string; clientId: string }> {
    const configuration = await readBrowserOidcConfiguration(this.env);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: configuration.clientId,
      code,
      redirect_uri: configuration.redirectUri,
      code_verifier: transaction.codeVerifier,
    });
    if (configuration.clientSecret) {
      body.set("client_secret", configuration.clientSecret);
    }
    let response: Response;
    try {
      response = await this.fetcher(configuration.tokenEndpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      });
    } catch {
      throw new ApiFailure(
        502,
        "identity_provider_unavailable",
        "Sign-in could not be completed. Try again.",
      );
    }
    const tokenBody = await readProviderJson(response);
    const idToken =
      typeof tokenBody.id_token === "string" ? tokenBody.id_token : null;
    if (!response.ok || !idToken) {
      throw new ApiFailure(
        400,
        "authorization_code_rejected",
        "Sign-in could not be completed. Start sign-in again.",
      );
    }
    return { idToken, clientId: configuration.clientId };
  }

  async createLogoutUrl(returnTo: string): Promise<string | null> {
    const configuration = await readBrowserOidcConfiguration(this.env);
    if (!configuration.logoutEndpoint) return null;
    const logout = new URL(configuration.logoutEndpoint);
    logout.searchParams.set("post_logout_redirect_uri", returnTo);
    logout.searchParams.set("client_id", configuration.clientId);
    return logout.toString();
  }
}

class GithubIdentityLinkAdapter {
  constructor(
    private readonly env: WorkerEnvironment,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  createAuthorizationUrl(link: IdentityLinkTransaction): string {
    const configuration = requireGithubLinkConfiguration(this.env);
    const authorizationUrl = new URL("https://github.com/login/oauth/authorize");
    authorizationUrl.searchParams.set("client_id", configuration.clientId);
    authorizationUrl.searchParams.set("redirect_uri", configuration.redirectUri);
    authorizationUrl.searchParams.set("state", link.state);
    authorizationUrl.searchParams.set("code_challenge", link.codeChallenge);
    authorizationUrl.searchParams.set(
      "code_challenge_method",
      link.codeChallengeMethod,
    );
    return authorizationUrl.toString();
  }

  async verify(input: {
    code: string;
    codeVerifier: string;
  }): Promise<ExternalProviderIdentity> {
    try {
      const configuration = requireGithubLinkConfiguration(this.env);
      const tokenResponse = await this.fetcher(
        "https://github.com/login/oauth/access_token",
        {
        method: "POST",
        redirect: "error",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
          "user-agent": "project42-account-service",
        },
        body: new URLSearchParams({
          client_id: configuration.clientId,
          client_secret: configuration.clientSecret,
          code: input.code,
          redirect_uri: configuration.redirectUri,
          code_verifier: input.codeVerifier,
        }),
        },
      );
      const tokenBody = await readProviderJson(tokenResponse);
      const accessToken =
        tokenBody && typeof tokenBody.access_token === "string"
          ? tokenBody.access_token
          : null;
      if (
        !tokenResponse.ok ||
        !accessToken ||
        typeof tokenBody.token_type !== "string" ||
        tokenBody.token_type.toLowerCase() !== "bearer"
      ) {
        throw new ApiFailure(
          502,
          "github_authorization_failed",
          "GitHub did not confirm this identity-link request.",
        );
      }
      const userResponse = await this.fetcher("https://api.github.com/user", {
        method: "GET",
        redirect: "error",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${accessToken}`,
          "user-agent": "project42-account-service",
          "x-github-api-version": "2022-11-28",
        },
      });
      const user = await readProviderJson(userResponse);
      const subject =
        typeof user.id === "number" &&
        Number.isSafeInteger(user.id) &&
        user.id > 0
          ? String(user.id)
          : null;
      const providerLogin =
        typeof user.login === "string" && user.login.trim()
          ? user.login.trim().slice(0, 100)
          : null;
      const displayName =
        typeof user.name === "string" && user.name.trim()
          ? user.name.trim().slice(0, 255)
          : providerLogin;
      if (!userResponse.ok || !subject || !providerLogin) {
        throw new ApiFailure(
          502,
          "github_identity_unavailable",
          "GitHub did not return a stable user identity.",
        );
      }
      return {
        provider: "github",
        issuer: "https://github.com",
        subject,
        providerLogin,
        displayName,
      };
    } catch (error) {
      if (error instanceof ApiFailure) throw error;
      throw new ApiFailure(
        502,
        "github_provider_unavailable",
        "GitHub account linking is temporarily unavailable.",
      );
    }
  }
}

class D1Project42Repository {
  private readonly learningEvents: SqlLearningEventStore;

  constructor(
    private readonly db: D1Database,
    private readonly installationId: string,
    learningEvents?: SqlLearningEventStore,
  ) {
    this.learningEvents =
      learningEvents ??
      new SqlLearningEventStore(
        db as unknown as LearningEventDatabase,
      );
  }

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

  async createOidcAuthorizationTransaction(input: {
    transaction: BrowserOidcTransaction;
    stateDigest: string;
    nonceDigest: string;
    requestId: string;
    now: string;
  }): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `DELETE FROM oidc_authorization_transactions
            WHERE installation_id = ?
              AND (expires_at <= ? OR consumed_at IS NOT NULL)`,
        )
        .bind(this.installationId, input.now),
      this.db
        .prepare(
          `DELETE FROM browser_sessions
            WHERE installation_id = ?
              AND (
                absolute_expires_at <= ?
                OR (revoked_at IS NOT NULL AND revoked_at <= ?)
              )`,
        )
        .bind(
          this.installationId,
          subtractSeconds(input.now, 30 * 24 * 60 * 60),
          subtractSeconds(input.now, 30 * 24 * 60 * 60),
        ),
      this.db
        .prepare(
          `INSERT INTO oidc_authorization_transactions (
             id, installation_id, state_digest, nonce_digest, request_id,
             created_at, expires_at, consumed_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
        )
        .bind(
          input.transaction.id,
          this.installationId,
          input.stateDigest,
          input.nonceDigest,
          input.requestId,
          input.now,
          input.transaction.expiresAt,
        ),
    ]);
  }

  async consumeOidcAuthorizationTransaction(input: {
    transactionId: string;
    stateDigest: string;
    nonceDigest: string;
    now: string;
  }): Promise<void> {
    const result = await this.db
      .prepare(
        `UPDATE oidc_authorization_transactions
            SET consumed_at = ?
          WHERE id = ? AND installation_id = ?
            AND state_digest = ? AND nonce_digest = ?
            AND consumed_at IS NULL AND expires_at > ?`,
      )
      .bind(
        input.now,
        input.transactionId,
        this.installationId,
        input.stateDigest,
        input.nonceDigest,
        input.now,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) {
      throw new ApiFailure(
        400,
        "invalid_authorization_transaction",
        "The sign-in response is invalid or expired. Start sign-in again.",
      );
    }
  }

  async createBrowserSession(input: {
    account: Account;
    identity: VerifiedIdentity;
    tokenDigest: string;
    requestId: string;
    now: string;
    priorSession?: ResolvedBrowserSession | null;
  }): Promise<{ id: string; expiresAt: string; absoluteExpiresAt: string }> {
    const id = crypto.randomUUID();
    const expiresAt = addSeconds(input.now, 8 * 60 * 60);
    const absoluteExpiresAt = addSeconds(input.now, 24 * 60 * 60);
    const authenticatedAt = input.identity.authenticatedAt;
    if (
      typeof authenticatedAt !== "number" ||
      !Number.isFinite(authenticatedAt)
    ) {
      throw new ApiFailure(
        401,
        "recent_authentication_required",
        "Complete a fresh sign-in before creating a browser session.",
      );
    }
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `INSERT INTO browser_sessions (
             id, installation_id, user_id, token_digest, identity_issuer,
             identity_subject, authenticated_at, created_at, last_seen_at,
             expires_at, absolute_expires_at, revoked_at, replaced_by_session_id
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
        )
        .bind(
          id,
          this.installationId,
          input.account.id,
          input.tokenDigest,
          input.identity.issuer,
          input.identity.subject,
          authenticatedAt,
          input.now,
          input.now,
          expiresAt,
          absoluteExpiresAt,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.identity,
        actorUserId: input.account.id,
        action: "session.create",
        targetType: "browser-session",
        targetId: id,
        requestId: input.requestId,
        outcome: "success",
        reason: "OIDC authorization code and nonce validation completed.",
        metadata: {
          expiresAt,
          absoluteExpiresAt,
        },
        now: input.now,
      }),
    ];
    if (input.priorSession) {
      statements.splice(
        1,
        0,
        this.db
          .prepare(
            `UPDATE browser_sessions
                SET revoked_at = ?, replaced_by_session_id = ?
              WHERE id = ? AND installation_id = ? AND revoked_at IS NULL`,
          )
          .bind(
            input.now,
            id,
            input.priorSession.id,
            this.installationId,
          ),
      );
    }
    await this.db.batch(statements);
    return { id, expiresAt, absoluteExpiresAt };
  }

  async resolveBrowserSession(
    tokenDigest: string,
    now: string,
  ): Promise<ResolvedBrowserSession | null> {
    const row = await this.db
      .prepare(
        `SELECT id, user_id, identity_issuer, identity_subject,
                authenticated_at, expires_at, absolute_expires_at
           FROM browser_sessions
          WHERE installation_id = ? AND token_digest = ?
            AND revoked_at IS NULL AND expires_at > ? AND absolute_expires_at > ?
          LIMIT 1`,
      )
      .bind(this.installationId, tokenDigest, now, now)
      .first<BrowserSessionRow>();
    if (!row) return null;
    await this.db
      .prepare(
        `UPDATE browser_sessions
            SET last_seen_at = ?
          WHERE id = ? AND installation_id = ? AND revoked_at IS NULL
            AND last_seen_at < ?`,
      )
      .bind(now, row.id, this.installationId, subtractSeconds(now, 5 * 60))
      .run();
    return {
      id: row.id,
      identity: {
        provider: "oidc",
        issuer: row.identity_issuer,
        subject: row.identity_subject,
        email: null,
        emailVerified: false,
        displayName: null,
        authenticatedAt: row.authenticated_at,
      },
      expiresAt: row.expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
    };
  }

  async rotateBrowserSession(input: {
    session: ResolvedBrowserSession;
    account: Account;
    tokenDigest: string;
    requestId: string;
    now: string;
  }): Promise<{ id: string; expiresAt: string; absoluteExpiresAt: string }> {
    if (Date.parse(input.session.absoluteExpiresAt) <= Date.parse(input.now)) {
      throw new ApiFailure(
        401,
        "session_expired",
        "Your session has expired. Sign in again.",
      );
    }
    const id = crypto.randomUUID();
    const expiresAt = new Date(
      Math.min(
        Date.parse(input.session.absoluteExpiresAt),
        Date.parse(input.now) + 8 * 60 * 60 * 1000,
      ),
    ).toISOString();
    const inserted = this.db
      .prepare(
        `INSERT INTO browser_sessions (
           id, installation_id, user_id, token_digest, identity_issuer,
           identity_subject, authenticated_at, created_at, last_seen_at,
           expires_at, absolute_expires_at, revoked_at, replaced_by_session_id
         )
         SELECT ?, installation_id, user_id, ?, identity_issuer,
                identity_subject, authenticated_at, ?, ?, ?, absolute_expires_at,
                NULL, NULL
           FROM browser_sessions
          WHERE id = ? AND installation_id = ? AND revoked_at IS NULL`,
      )
      .bind(
        id,
        input.tokenDigest,
        input.now,
        input.now,
        expiresAt,
        input.session.id,
        this.installationId,
      );
    const revoked = this.db
      .prepare(
        `UPDATE browser_sessions
            SET revoked_at = ?, replaced_by_session_id = ?
          WHERE id = ? AND installation_id = ? AND revoked_at IS NULL`,
      )
      .bind(input.now, id, input.session.id, this.installationId);
    const audit = this.db
      .prepare(
        `INSERT INTO audit_events (
           id, installation_id, actor_user_id, actor_issuer, actor_subject,
           action, target_type, target_id, request_id, outcome, reason,
           metadata_json, occurred_at
         )
         SELECT ?, ?, ?, ?, ?, 'session.rotate', 'browser-session', ?, ?,
                'success', ?, ?, ?
          WHERE EXISTS (
            SELECT 1
              FROM browser_sessions
             WHERE id = ? AND installation_id = ?
               AND replaced_by_session_id = ? AND revoked_at = ?
          )`,
      )
      .bind(
        crypto.randomUUID(),
        this.installationId,
        input.account.id,
        input.session.identity.issuer,
        input.session.identity.subject,
        id,
        input.requestId,
        "The browser session identifier was rotated.",
        JSON.stringify({
          priorSessionId: input.session.id,
          expiresAt,
        }),
        input.now,
        input.session.id,
        this.installationId,
        id,
        input.now,
      );
    const statements = [inserted, revoked, audit];
    const validateRotation = (results: D1Result<unknown>[]) => {
      if (
        (results[0]?.meta.changes ?? 0) !== 1 ||
        (results[1]?.meta.changes ?? 0) !== 1 ||
        (results[2]?.meta.changes ?? 0) !== 1
      ) {
        throw new ApiFailure(
          409,
          "session_rotation_conflict",
          "Your session changed. Sign in again.",
        );
      }
    };
    if (supportsTransactionalPostcondition(this.db)) {
      await this.db.batchWithPostcondition(statements, validateRotation);
    } else {
      validateRotation(await this.db.batch(statements));
    }
    return {
      id,
      expiresAt,
      absoluteExpiresAt: input.session.absoluteExpiresAt,
    };
  }

  async revokeBrowserSession(input: {
    session: ResolvedBrowserSession;
    account: Account;
    requestId: string;
    now: string;
  }): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE browser_sessions
              SET revoked_at = ?
            WHERE id = ? AND installation_id = ? AND revoked_at IS NULL`,
        )
        .bind(input.now, input.session.id, this.installationId),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.session.identity,
        actorUserId: input.account.id,
        action: "session.revoke",
        targetType: "browser-session",
        targetId: input.session.id,
        requestId: input.requestId,
        outcome: "success",
        reason: "The learner signed out.",
        metadata: {},
        now: input.now,
      }),
    ]);
  }

  async findAccount(identity: VerifiedIdentity): Promise<Account | null> {
    const provider = normalizeProviderId(identity.provider ?? "oidc");
    const row = await this.db
      .prepare(
        `SELECT u.id, u.installation_id, i.provider, i.issuer, i.subject,
                u.display_name,
                u.primary_email, u.email_verified, u.account_state, u.created_at,
                u.updated_at, r.roles
           FROM user_identities i
           LEFT JOIN account_merge_aliases m
             ON m.installation_id = i.installation_id
            AND m.source_user_id = i.user_id
           JOIN users u
             ON u.installation_id = i.installation_id
            AND u.id = COALESCE(m.survivor_user_id, i.user_id)
           LEFT JOIN (
             SELECT installation_id, user_id, GROUP_CONCAT(role) AS roles
               FROM role_assignments
              GROUP BY installation_id, user_id
           ) r
             ON r.installation_id = u.installation_id AND r.user_id = u.id
          WHERE i.installation_id = ? AND i.provider = ?
            AND i.issuer = ? AND i.subject = ? AND i.status = 'active'`,
      )
      .bind(this.installationId, provider, identity.issuer, identity.subject)
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
      const provider = normalizeProviderId(identity.provider ?? "oidc");
      const identityOwner = await this.db
        .prepare(
          `SELECT user_id
             FROM user_identities
            WHERE installation_id = ? AND provider = ?
              AND issuer = ? AND subject = ? AND status = 'active'`,
        )
        .bind(
          this.installationId,
          provider,
          identity.issuer,
          identity.subject,
        )
        .first<{ user_id: string }>();
      const statements = [
        this.db
          .prepare(
            `UPDATE user_identities
                SET last_seen_at = ?, last_verified_at = ?
              WHERE installation_id = ? AND provider = ?
                AND issuer = ? AND subject = ? AND status = 'active'`,
          )
          .bind(
            now,
            now,
            this.installationId,
            provider,
            identity.issuer,
            identity.subject,
          ),
      ];
      if (identityOwner?.user_id === existing.id) {
        statements.unshift(
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
        );
      }
      await this.db.batch(statements);
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
             id, installation_id, provider, issuer, subject, user_id,
             provider_login, display_name, status, is_primary, link_method,
             linked_at, last_verified_at, last_seen_at, unlinked_at
           ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, 'active', 1, 'registration',
                     ?, ?, ?, NULL)`,
        )
        .bind(
          crypto.randomUUID(),
          this.installationId,
          normalizeProviderId(identity.provider ?? "oidc"),
          identity.issuer,
          identity.subject,
          userId,
          identity.displayName,
          now,
          now,
          now,
        ),
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
      `SELECT u.id, u.installation_id, i.provider, i.issuer, i.subject,
              u.display_name,
              u.primary_email, u.email_verified, u.account_state, u.created_at,
              u.updated_at, r.roles
         FROM users u
         JOIN user_identities i
           ON i.installation_id = u.installation_id AND i.user_id = u.id
          AND i.status = 'active' AND i.is_primary = 1
         LEFT JOIN (
           SELECT installation_id, user_id, GROUP_CONCAT(role) AS roles
             FROM role_assignments
            GROUP BY installation_id, user_id
         ) r
           ON r.installation_id = u.installation_id AND r.user_id = u.id
        WHERE u.installation_id = ? ${condition}
          AND NOT EXISTS (
            SELECT 1
              FROM account_merge_aliases m
             WHERE m.installation_id = u.installation_id
               AND m.source_user_id = u.id
          )
        ORDER BY u.created_at ASC
        LIMIT 500`,
    );
    const result = state
      ? await statement.bind(this.installationId, state).all<AccountRow>()
      : await statement.bind(this.installationId).all<AccountRow>();
    return result.results.map(mapAccount);
  }

  async getAccountById(userId: string): Promise<Account | null> {
    const row = await this.db
      .prepare(
        `SELECT u.id, u.installation_id, i.provider, i.issuer, i.subject,
                u.display_name, u.primary_email, u.email_verified,
                u.account_state, u.created_at, u.updated_at, r.roles
           FROM users u
           JOIN user_identities i
             ON i.installation_id = u.installation_id AND i.user_id = u.id
            AND i.status = 'active' AND i.is_primary = 1
           LEFT JOIN (
             SELECT installation_id, user_id, GROUP_CONCAT(role) AS roles
               FROM role_assignments
              GROUP BY installation_id, user_id
           ) r
             ON r.installation_id = u.installation_id AND r.user_id = u.id
          WHERE u.installation_id = ? AND u.id = ?
          LIMIT 1`,
      )
      .bind(this.installationId, userId)
      .first<AccountRow>();
    return row ? mapAccount(row) : null;
  }

  async createRecentAccountMergeProof(input: {
    account: Account;
    requestId: string;
    now: string;
  }): Promise<AccountMergeProof> {
    return this.createAccountMergeProof({
      actor: input.account,
      targetUserId: input.account.id,
      method: "recent-authentication",
      evidence: { kind: "recent-authenticated-session" },
      requestId: input.requestId,
      now: input.now,
    });
  }

  async createOwnerRecoveryProof(input: {
    actor: Account;
    request: OwnerRecoveryProofRequest;
    requestId: string;
    now: string;
  }): Promise<AccountMergeProof> {
    const target = await this.getAccountById(input.request.userId);
    if (!target) {
      throw new ApiFailure(
        404,
        "account_not_found",
        "The recovery account was not found.",
      );
    }
    if (target.state === "revoked") {
      throw new ApiFailure(
        409,
        "revoked_account_cannot_merge",
        "A revoked account cannot enter account recovery.",
      );
    }
    return this.createAccountMergeProof({
      actor: input.actor,
      targetUserId: target.id,
      method: "owner-assisted-recovery",
      evidence: {
        methods: input.request.methods,
        referenceId: input.request.referenceId,
        summary: input.request.summary,
      },
      requestId: input.requestId,
      now: input.now,
    });
  }

  async createAccountMergePreview(input: {
    actor: Account;
    request: AccountMergePreviewRequest;
    requestId: string;
    now: string;
  }): Promise<AccountMergePreview> {
    const existing = await this.db
      .prepare(
        `SELECT id, source_user_id, survivor_user_id, source_proof_id,
                survivor_proof_id, status, preview_json, preview_digest,
                resolutions_json, snapshot_digest, idempotency_key, created_at,
                expires_at, completed_at, rolled_back_at
           FROM account_merge_cases
          WHERE installation_id = ? AND idempotency_key = ?`,
      )
      .bind(this.installationId, input.request.idempotencyKey)
      .first<AccountMergeCaseRow>();
    if (existing) {
      if (
        existing.source_user_id !== input.request.sourceUserId ||
        existing.survivor_user_id !== input.request.survivorUserId
      ) {
        throw new ApiFailure(
          409,
          "merge_idempotency_conflict",
          "The idempotency key is already assigned to a different merge.",
        );
      }
      return this.mapAccountMergePreview(existing);
    }
    if (input.request.sourceUserId === input.request.survivorUserId) {
      throw new ApiFailure(
        400,
        "merge_accounts_must_differ",
        "Source and survivor accounts must be different.",
      );
    }
    const [source, survivor] = await Promise.all([
      this.getAccountById(input.request.sourceUserId),
      this.getAccountById(input.request.survivorUserId),
    ]);
    if (!source || !survivor) {
      throw new ApiFailure(
        404,
        "account_not_found",
        "Both merge accounts must exist in this installation.",
      );
    }
    if (source.state === "revoked" || survivor.state === "revoked") {
      throw new ApiFailure(
        409,
        "revoked_account_cannot_merge",
        "Revoked accounts cannot be merged or restored.",
      );
    }
    if (
      (source.roles.includes("owner") || survivor.roles.includes("owner")) &&
      input.actor.id !== source.id &&
      input.actor.id !== survivor.id
    ) {
      throw new ApiFailure(
        403,
        "owner_merge_self_control_required",
        "A merge involving an owner requires that owner to control one of the accounts.",
      );
    }
    const mergeAlias = await this.db
      .prepare(
        `SELECT source_user_id
           FROM account_merge_aliases
          WHERE installation_id = ?
            AND (
              source_user_id IN (?, ?) OR survivor_user_id = ?
            )
          LIMIT 1`,
      )
      .bind(
        this.installationId,
        source.id,
        survivor.id,
        source.id,
      )
      .first<{ source_user_id: string }>();
    if (mergeAlias) {
      throw new ApiFailure(
        409,
        "account_already_merged",
        "Merged accounts must be rolled back before another merge.",
      );
    }
    const activeDeletion = await this.db
      .prepare(
        `SELECT id
           FROM deletion_requests
          WHERE installation_id = ? AND user_id IN (?, ?)
            AND state IN ('requested', 'processing')
          LIMIT 1`,
      )
      .bind(this.installationId, source.id, survivor.id)
      .first<{ id: string }>();
    if (activeDeletion) {
      throw new ApiFailure(
        409,
        "active_deletion_blocks_merge",
        "Cancel or complete active deletion requests before merging accounts.",
      );
    }
    const activeIdentityLink = await this.db
      .prepare(
        `SELECT id
           FROM identity_link_transactions
          WHERE installation_id = ? AND user_id IN (?, ?)
            AND status IN ('pending', 'processing')
          LIMIT 1`,
      )
      .bind(this.installationId, source.id, survivor.id)
      .first<{ id: string }>();
    if (activeIdentityLink) {
      throw new ApiFailure(
        409,
        "active_identity_link_blocks_merge",
        "Finish or cancel active identity-link requests before merging accounts.",
      );
    }
    const [sourceProof, survivorProof] = await Promise.all([
      this.requireAvailableMergeProof(
        input.request.sourceProofToken,
        source.id,
        input.now,
      ),
      this.requireAvailableMergeProof(
        input.request.survivorProofToken,
        survivor.id,
        input.now,
      ),
    ]);
    if (sourceProof.id === survivorProof.id) {
      throw new ApiFailure(
        400,
        "distinct_merge_proofs_required",
        "Each account requires its own recovery proof.",
      );
    }
    const snapshot = await this.captureMergeSnapshot(source.id, survivor.id);
    const conflicts = await buildAccountMergeConflicts(
      snapshot,
      source.id,
      survivor.id,
    );
    const id = crypto.randomUUID();
    const expiresAt = new Date(
      Date.parse(input.now) + 30 * 60 * 1_000,
    ).toISOString();
    const previewRecord = {
      conflicts,
      recordCounts: snapshot.recordCounts,
      proofMethods: {
        source: sourceProof.proof_method,
        survivor: survivorProof.proof_method,
      },
    };
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE account_merge_cases
              SET status = 'cancelled'
            WHERE installation_id = ? AND source_user_id = ?
              AND status = 'preview' AND id <> ?`,
        )
        .bind(this.installationId, source.id, id),
      this.db
        .prepare(
          `INSERT INTO account_merge_cases (
             id, installation_id, source_user_id, survivor_user_id,
             source_proof_id, survivor_proof_id, created_by_user_id, status,
             preview_json, preview_digest, resolutions_json, snapshot_digest,
             idempotency_key, request_id, created_at, expires_at, completed_at,
             rolled_back_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'preview', ?, ?, NULL, NULL, ?, ?,
                     ?, ?, NULL, NULL)`,
        )
        .bind(
          id,
          this.installationId,
          source.id,
          survivor.id,
          sourceProof.id,
          survivorProof.id,
          input.actor.id,
          JSON.stringify(previewRecord),
          snapshot.digest,
          input.request.idempotencyKey,
          input.requestId,
          input.now,
          expiresAt,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.actor.identity,
        actorUserId: input.actor.id,
        action: "account.merge.preview",
        targetType: "account_merge_case",
        targetId: id,
        requestId: input.requestId,
        outcome: "success",
        reason: "Owner reviewed a proof-bound duplicate-account merge preview.",
        metadata: {
          sourceProofMethod: sourceProof.proof_method,
          survivorProofMethod: survivorProof.proof_method,
          conflictCount: conflicts.length,
          snapshotDigest: snapshot.digest,
        },
        now: input.now,
      }),
    ]);
    return this.mapAccountMergePreview({
      id,
      source_user_id: source.id,
      survivor_user_id: survivor.id,
      source_proof_id: sourceProof.id,
      survivor_proof_id: survivorProof.id,
      status: "preview",
      preview_json: previewRecord,
      preview_digest: snapshot.digest,
      resolutions_json: null,
      snapshot_digest: null,
      idempotency_key: input.request.idempotencyKey,
      created_at: input.now,
      expires_at: expiresAt,
      completed_at: null,
      rolled_back_at: null,
    });
  }

  async getAccountMergePreview(mergeCaseId: string): Promise<AccountMergePreview> {
    const mergeCase = await this.getAccountMergeCase(mergeCaseId);
    if (!mergeCase) {
      throw new ApiFailure(
        404,
        "account_merge_not_found",
        "The account merge was not found.",
      );
    }
    return this.mapAccountMergePreview(mergeCase);
  }

  async completeAccountMerge(input: {
    actor: Account;
    mergeCaseId: string;
    request: CompleteAccountMergeRequest;
    requestId: string;
    now: string;
  }): Promise<AccountMergeReceipt> {
    const mergeCase = await this.getAccountMergeCase(input.mergeCaseId);
    if (!mergeCase) {
      throw new ApiFailure(
        404,
        "account_merge_not_found",
        "The account merge was not found.",
      );
    }
    if (mergeCase.idempotency_key !== input.request.idempotencyKey) {
      throw new ApiFailure(
        409,
        "merge_idempotency_conflict",
        "The completion key does not match this merge preview.",
      );
    }
    if (mergeCase.status === "completed") {
      if (mergeCase.survivor_user_id) {
        await this.promoteCurrentLegacyProgress({
          userId: mergeCase.survivor_user_id,
          importId: `account-merge-${mergeCase.id}`,
          actorUserId: input.actor.id,
          now: input.now,
        });
      }
      return this.getAccountMergeReceipt(mergeCase.id);
    }
    if (mergeCase.status !== "preview") {
      throw new ApiFailure(
        409,
        "account_merge_not_completable",
        "This account merge cannot be completed in its current state.",
      );
    }
    if (
      !mergeCase.source_user_id ||
      !mergeCase.survivor_user_id ||
      !mergeCase.source_proof_id ||
      !mergeCase.survivor_proof_id
    ) {
      throw new ApiFailure(
        409,
        "account_merge_evidence_unavailable",
        "The merge evidence is no longer available.",
      );
    }
    if (Date.parse(input.now) >= Date.parse(mergeCase.expires_at)) {
      throw new ApiFailure(
        409,
        "account_merge_expired",
        "Create a new merge preview with fresh account proofs.",
      );
    }
    const requiredConfirmation =
      `MERGE ${mergeCase.source_user_id} INTO ${mergeCase.survivor_user_id}`;
    if (input.request.confirmation !== requiredConfirmation) {
      throw new ApiFailure(
        400,
        "account_merge_confirmation_required",
        "Enter the exact source-to-survivor merge confirmation.",
      );
    }
    const previewData = parseMergePreviewRecord(mergeCase.preview_json);
    validateMergeResolutions(previewData.conflicts, input.request.resolutions);
    const proofResult = await this.db
      .prepare(
        `SELECT id, user_id, proof_method, token_digest, evidence_json, status,
                created_at, expires_at, consumed_at
           FROM account_merge_proofs
          WHERE installation_id = ? AND id IN (?, ?)
          ORDER BY id`,
      )
      .bind(
        this.installationId,
        mergeCase.source_proof_id,
        mergeCase.survivor_proof_id,
      )
      .all<AccountMergeProofRow>();
    const proofs = new Map(proofResult.results.map((proof) => [proof.id, proof]));
    const sourceProof = proofs.get(mergeCase.source_proof_id);
    const survivorProof = proofs.get(mergeCase.survivor_proof_id);
    if (
      !sourceProof ||
      !survivorProof ||
      sourceProof.user_id !== mergeCase.source_user_id ||
      survivorProof.user_id !== mergeCase.survivor_user_id ||
      sourceProof.status !== "available" ||
      survivorProof.status !== "available" ||
      Date.parse(input.now) >= Date.parse(sourceProof.expires_at) ||
      Date.parse(input.now) >= Date.parse(survivorProof.expires_at)
    ) {
      throw new ApiFailure(
        409,
        "account_merge_proof_unavailable",
        "Both account proofs must be unused and unexpired.",
      );
    }
    const snapshot = await this.captureMergeSnapshot(
      mergeCase.source_user_id,
      mergeCase.survivor_user_id,
    );
    if (snapshot.digest !== mergeCase.preview_digest) {
      throw new ApiFailure(
        409,
        "account_merge_preview_stale",
        "Account data changed after preview. Create and review a new merge.",
      );
    }
    const rows = (tableName: string, userId: string) =>
      snapshot.entries
        .filter(
          (entry) =>
            entry.tableName === tableName &&
            mergeRowUserId(entry.tableName, entry.row) === userId,
        )
        .map((entry) => entry.row);
    const sourceUser = rows("users", mergeCase.source_user_id)[0];
    const survivorUser = rows("users", mergeCase.survivor_user_id)[0];
    if (!sourceUser || !survivorUser) {
      throw new ApiFailure(
        409,
        "account_merge_preview_stale",
        "Both accounts must still exist at completion time.",
      );
    }
    const sourceProfile = rows("user_profiles", mergeCase.source_user_id)[0];
    const survivorProfile = rows("user_profiles", mergeCase.survivor_user_id)[0];
    const selectedDisplayName = selectMergeValue(
      "account.displayName",
      sourceUser.display_name,
      survivorUser.display_name,
      input.request.resolutions,
    );
    const selectedEmail = selectMergeValue(
      "account.primaryEmail",
      sourceUser.primary_email,
      survivorUser.primary_email,
      input.request.resolutions,
    );
    const selectedEmailVerified =
      selectedEmail === sourceUser.primary_email &&
      selectedEmail === survivorUser.primary_email
        ? Math.max(
            Number(sourceUser.email_verified ?? 0),
            Number(survivorUser.email_verified ?? 0),
          )
        : selectedEmail === sourceUser.primary_email
          ? Number(sourceUser.email_verified ?? 0)
          : Number(survivorUser.email_verified ?? 0);
    const profileFields = [
      ["profile.bio", "bio"],
      ["profile.organization", "organization"],
      ["profile.location", "location"],
      ["profile.websiteUrl", "website_url"],
    ] as const;
    const selectedProfile: Record<string, unknown> = {};
    for (const [conflictKey, column] of profileFields) {
      selectedProfile[column] = selectMergeValue(
        conflictKey,
        sourceProfile?.[column] ?? null,
        survivorProfile?.[column] ?? null,
        input.request.resolutions,
      );
    }
    const photoChoice =
      input.request.resolutions["profile.photo"] ??
      (survivorProfile?.photo_object_key ? "survivor" : "source");
    const photoProfile =
      photoChoice === "source" ? sourceProfile : survivorProfile;
    for (const column of [
      "photo_object_key",
      "photo_content_type",
      "photo_byte_length",
      "photo_etag",
      "photo_updated_at",
    ]) {
      selectedProfile[column] = photoProfile?.[column] ?? null;
    }
    const sourceRoles = new Set(
      rows("role_assignments", mergeCase.source_user_id).map((row) =>
        String(row.role),
      ),
    );
    const survivorRoles = new Set(
      rows("role_assignments", mergeCase.survivor_user_id).map((row) =>
        String(row.role),
      ),
    );
    const finalRoles = new Set<string>(["learner"]);
    const ownerChoice = input.request.resolutions["roles.owner"];
    const selectedOwner =
      sourceRoles.has("owner") === survivorRoles.has("owner")
        ? sourceRoles.has("owner")
        : ownerChoice === "source"
          ? sourceRoles.has("owner")
          : survivorRoles.has("owner");
    if (selectedOwner) finalRoles.add("owner");
    if (!selectedOwner && (sourceRoles.has("owner") || survivorRoles.has("owner"))) {
      const otherOwner = await this.db
        .prepare(
          `SELECT user_id
             FROM role_assignments
            WHERE installation_id = ? AND role = 'owner'
              AND user_id NOT IN (?, ?)
            LIMIT 1`,
        )
        .bind(
          this.installationId,
          mergeCase.source_user_id,
          mergeCase.survivor_user_id,
        )
        .first<{ user_id: string }>();
      if (!otherOwner) {
        throw new ApiFailure(
          409,
          "last_owner_required",
          "The merge cannot remove the installation's last owner.",
        );
      }
    }
    const sourceProgress = rows(
      "learning_progress",
      mergeCase.source_user_id,
    )[0];
    const survivorProgress = rows(
      "learning_progress",
      mergeCase.survivor_user_id,
    )[0];
    const sourceProgressValue = sourceProgress
      ? parseJsonRecord<LearnerProgress>(sourceProgress.progress_json)
      : createEmptyProgress(String(sourceUser.display_name ?? "Explorer"));
    const survivorProgressValue = survivorProgress
      ? parseJsonRecord<LearnerProgress>(survivorProgress.progress_json)
      : createEmptyProgress(String(survivorUser.display_name ?? "Explorer"));
    const mergedProgress = mergeLearnerProgress(
      survivorProgressValue,
      sourceProgressValue,
      {
        displayName: String(selectedDisplayName ?? "Explorer"),
        sourceRecordPrefix: mergeCase.source_user_id,
      },
    );
    mergedProgress.updatedAt = input.now;
    const snapshotRows = await chunkMergeSnapshot(snapshot.entries);
    const statements: D1PreparedStatement[] = snapshotRows.map((snapshotRow) =>
      this.db
        .prepare(
          `INSERT INTO account_merge_snapshot_rows (
             merge_case_id, table_name, row_key, row_json, row_digest, created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          mergeCase.id,
          snapshotRow.tableName,
          snapshotRow.rowKey,
          JSON.stringify(snapshotRow.rows),
          snapshotRow.rowDigest,
          input.now,
        ),
    );
    statements.push(
      this.db
        .prepare(
          `UPDATE users
              SET display_name = ?, primary_email = ?, email_verified = ?,
                  updated_at = ?
            WHERE installation_id = ? AND id = ?`,
        )
        .bind(
          selectedDisplayName,
          selectedEmail,
          selectedEmailVerified,
          input.now,
          this.installationId,
          mergeCase.survivor_user_id,
        ),
      this.db
        .prepare(
          `INSERT INTO user_profiles (
             installation_id, user_id, bio, organization, location, website_url,
             photo_object_key, photo_content_type, photo_byte_length, photo_etag,
             photo_updated_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (installation_id, user_id) DO UPDATE SET
             bio = excluded.bio,
             organization = excluded.organization,
             location = excluded.location,
             website_url = excluded.website_url,
             photo_object_key = excluded.photo_object_key,
             photo_content_type = excluded.photo_content_type,
             photo_byte_length = excluded.photo_byte_length,
             photo_etag = excluded.photo_etag,
             photo_updated_at = excluded.photo_updated_at,
             updated_at = excluded.updated_at`,
        )
        .bind(
          this.installationId,
          mergeCase.survivor_user_id,
          selectedProfile.bio,
          selectedProfile.organization,
          selectedProfile.location,
          selectedProfile.website_url,
          selectedProfile.photo_object_key,
          selectedProfile.photo_content_type,
          selectedProfile.photo_byte_length,
          selectedProfile.photo_etag,
          selectedProfile.photo_updated_at,
          String(
            survivorProfile?.created_at ??
              sourceProfile?.created_at ??
              input.now,
          ),
          input.now,
        ),
      this.db
        .prepare(
          `DELETE FROM user_profiles
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(this.installationId, mergeCase.source_user_id),
      this.db
        .prepare(
          `DELETE FROM role_assignments
            WHERE installation_id = ? AND user_id IN (?, ?)`,
        )
        .bind(
          this.installationId,
          mergeCase.source_user_id,
          mergeCase.survivor_user_id,
        ),
    );
    for (const role of finalRoles) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO role_assignments (
               installation_id, user_id, role, assigned_by_user_id, assigned_at
             ) VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            this.installationId,
            mergeCase.survivor_user_id,
            role,
            input.actor.id,
            input.now,
          ),
      );
    }
    statements.push(
      this.db
        .prepare(
          `INSERT INTO learning_progress (
             installation_id, user_id, schema_version, revision, progress_json,
             updated_at
           ) VALUES (?, ?, 1, ?, ?, ?)
           ON CONFLICT (installation_id, user_id) DO UPDATE SET
             schema_version = excluded.schema_version,
             revision = excluded.revision,
             progress_json = excluded.progress_json,
             updated_at = excluded.updated_at`,
        )
        .bind(
          this.installationId,
          mergeCase.survivor_user_id,
          Math.max(
            Number(sourceProgress?.revision ?? 0),
            Number(survivorProgress?.revision ?? 0),
          ) + 1,
          JSON.stringify(mergedProgress),
          input.now,
        ),
      this.db
        .prepare(
          `DELETE FROM learning_progress
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(this.installationId, mergeCase.source_user_id),
    );
    statements.push(
      ...this.buildStructuredMergeStatements({
        sourceUserId: mergeCase.source_user_id,
        survivorUserId: mergeCase.survivor_user_id,
        snapshot,
      }),
    );
    const receiptId = crypto.randomUUID();
    const totalCounts = Object.fromEntries(
      Object.entries(snapshot.recordCounts).map(([table, counts]) => [
        table,
        counts.source + counts.survivor,
      ]),
    );
    const receiptPayload = {
      schemaVersion: 1,
      mergeCaseId: mergeCase.id,
      snapshotDigest: snapshot.digest,
      recordCounts: totalCounts,
      proofMethods: previewData.proofMethods,
      conflictKeys: previewData.conflicts.map((conflict) => conflict.key),
      mergedAt: input.now,
    };
    const receiptDigest = await sha256(canonicalJson(receiptPayload));
    statements.push(
      this.db
        .prepare(
          `UPDATE browser_sessions
              SET revoked_at = ?
            WHERE installation_id = ? AND user_id IN (?, ?)
              AND revoked_at IS NULL`,
        )
        .bind(
          input.now,
          this.installationId,
          mergeCase.source_user_id,
          mergeCase.survivor_user_id,
        ),
      this.db
        .prepare(
          `INSERT INTO account_merge_aliases (
             installation_id, source_user_id, survivor_user_id, merge_case_id,
             created_at
           ) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          this.installationId,
          mergeCase.source_user_id,
          mergeCase.survivor_user_id,
          mergeCase.id,
          input.now,
        ),
      this.db
        .prepare(
          `UPDATE account_merge_proofs
              SET status = 'consumed', consumed_at = ?
            WHERE installation_id = ? AND id IN (?, ?)
              AND status = 'available'`,
        )
        .bind(
          input.now,
          this.installationId,
          mergeCase.source_proof_id,
          mergeCase.survivor_proof_id,
        ),
      this.db
        .prepare(
          `UPDATE account_merge_cases
              SET status = 'completed', resolutions_json = ?,
                  snapshot_digest = ?, completed_at = ?
            WHERE installation_id = ? AND id = ? AND status = 'preview'`,
        )
        .bind(
          JSON.stringify(input.request.resolutions),
          snapshot.digest,
          input.now,
          this.installationId,
          mergeCase.id,
        ),
      this.db
        .prepare(
          `INSERT INTO account_merge_receipts (
             id, installation_id, merge_case_id, receipt_json, receipt_digest,
             created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          receiptId,
          this.installationId,
          mergeCase.id,
          JSON.stringify(receiptPayload),
          receiptDigest,
          input.now,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.actor.identity,
        actorUserId: input.actor.id,
        action: "account.merge.complete",
        targetType: "account_merge_receipt",
        targetId: receiptId,
        requestId: input.requestId,
        outcome: "success",
        reason: "Owner completed a proof-bound, recoverable account merge.",
        metadata: {
          mergeCaseId: mergeCase.id,
          snapshotDigest: snapshot.digest,
          receiptDigest,
          recordCounts: totalCounts,
        },
        now: input.now,
      }),
    );
    try {
      await this.db.batch(statements);
    } catch (error) {
      const completed = await this.getAccountMergeCase(mergeCase.id);
      if (completed?.status === "completed") {
        await this.promoteCurrentLegacyProgress({
          userId: mergeCase.survivor_user_id,
          importId: `account-merge-${mergeCase.id}`,
          actorUserId: input.actor.id,
          now: input.now,
        });
        return this.getAccountMergeReceipt(mergeCase.id);
      }
      throw error;
    }
    await this.promoteCurrentLegacyProgress({
      userId: mergeCase.survivor_user_id,
      importId: `account-merge-${mergeCase.id}`,
      actorUserId: input.actor.id,
      now: input.now,
    });
    return {
      id: receiptId,
      mergeCaseId: mergeCase.id,
      receiptDigest,
      snapshotDigest: snapshot.digest,
      mergedAt: input.now,
      recordCounts: totalCounts,
      status: "completed",
    };
  }

  async getAccountMergeReceipt(mergeCaseId: string): Promise<AccountMergeReceipt> {
    const row = await this.db
      .prepare(
        `SELECT r.id, r.merge_case_id, r.receipt_json, r.receipt_digest,
                r.created_at, c.snapshot_digest, c.status
           FROM account_merge_receipts r
           JOIN account_merge_cases c
             ON c.installation_id = r.installation_id
            AND c.id = r.merge_case_id
          WHERE r.installation_id = ? AND r.merge_case_id = ?`,
      )
      .bind(this.installationId, mergeCaseId)
      .first<{
        id: string;
        merge_case_id: string;
        receipt_json:
          | string
          | { recordCounts?: Record<string, number> };
        receipt_digest: string;
        created_at: string;
        snapshot_digest: string;
        status: "completed" | "rolled-back";
      }>();
    if (!row) {
      throw new ApiFailure(
        404,
        "account_merge_receipt_not_found",
        "The account merge receipt was not found.",
      );
    }
    const payload =
      typeof row.receipt_json === "string"
        ? (JSON.parse(row.receipt_json) as { recordCounts?: Record<string, number> })
        : row.receipt_json;
    return {
      id: row.id,
      mergeCaseId: row.merge_case_id,
      receiptDigest: row.receipt_digest,
      snapshotDigest: row.snapshot_digest,
      mergedAt: row.created_at,
      recordCounts: payload.recordCounts ?? {},
      status: row.status,
    };
  }

  async rollbackAccountMerge(input: {
    actor: Account;
    mergeCaseId: string;
    request: RollbackAccountMergeRequest;
    requestId: string;
    now: string;
  }): Promise<AccountMergeReceipt> {
    const mergeCase = await this.getAccountMergeCase(input.mergeCaseId);
    if (!mergeCase) {
      throw new ApiFailure(
        404,
        "account_merge_not_found",
        "The account merge was not found.",
      );
    }
    if (mergeCase.status === "rolled-back") {
      for (const userId of [
        mergeCase.source_user_id,
        mergeCase.survivor_user_id,
      ]) {
        if (userId) {
          await this.promoteCurrentLegacyProgress({
            userId,
            importId: `account-merge-rollback-${mergeCase.id}-${userId}`,
            actorUserId: input.actor.id,
            now: input.now,
          });
        }
      }
      return this.getAccountMergeReceipt(mergeCase.id);
    }
    if (
      mergeCase.status !== "completed" ||
      !mergeCase.completed_at ||
      !mergeCase.source_user_id ||
      !mergeCase.survivor_user_id ||
      !mergeCase.snapshot_digest
    ) {
      throw new ApiFailure(
        409,
        "account_merge_not_recoverable",
        "Only a completed merge with retained recovery evidence can be rolled back.",
      );
    }
    if (input.request.confirmation !== `ROLL BACK ${mergeCase.id}`) {
      throw new ApiFailure(
        400,
        "account_merge_rollback_confirmation_required",
        "Enter the exact merge rollback confirmation.",
      );
    }
    const changed = await this.accountMergeHasPostCompletionChanges(
      mergeCase.survivor_user_id,
      mergeCase.completed_at,
    );
    if (changed) {
      throw new ApiFailure(
        409,
        "account_merge_rollback_conflict",
        "The survivor account changed after merge. Use a reviewed recovery plan instead of destructive rollback.",
      );
    }
    const snapshot = await this.loadStoredMergeSnapshot(mergeCase);
    const statements: D1PreparedStatement[] = [
      this.db
        .prepare(
          `DELETE FROM account_merge_aliases
            WHERE installation_id = ? AND merge_case_id = ?`,
        )
        .bind(this.installationId, mergeCase.id),
      this.db
        .prepare(
          `UPDATE browser_sessions
              SET revoked_at = ?
            WHERE installation_id = ? AND user_id IN (?, ?)
              AND revoked_at IS NULL`,
        )
        .bind(
          input.now,
          this.installationId,
          mergeCase.source_user_id,
          mergeCase.survivor_user_id,
        ),
    ];
    const restoreTables = ACCOUNT_MERGE_SNAPSHOT_TABLES.filter(
      (tableName) => !["users", "user_identities"].includes(tableName),
    );
    const restoreTableSet = new Set<string>(restoreTables);
    for (const tableName of restoreTables) {
      statements.push(
        this.db
          .prepare(
            `DELETE FROM ${tableName}
              WHERE installation_id = ? AND user_id IN (?, ?)`,
          )
          .bind(
            this.installationId,
            mergeCase.source_user_id,
            mergeCase.survivor_user_id,
          ),
      );
    }
    const userRows = snapshot.entries.filter(
      (entry) => entry.tableName === "users",
    );
    for (const entry of userRows) {
      statements.push(
        this.db
          .prepare(
            `UPDATE users
                SET display_name = ?, primary_email = ?, email_verified = ?,
                    account_state = ?, created_at = ?, updated_at = ?
              WHERE installation_id = ? AND id = ?`,
          )
          .bind(
            entry.row.display_name ?? null,
            entry.row.primary_email ?? null,
            entry.row.email_verified,
            entry.row.account_state,
            entry.row.created_at,
            entry.row.updated_at,
            this.installationId,
            entry.row.id,
          ),
      );
    }
    for (const entry of snapshot.entries) {
      if (!restoreTableSet.has(entry.tableName)) continue;
      statements.push(this.restoreSnapshotRowStatement(entry));
    }
    const recoveryReceiptId = crypto.randomUUID();
    const recoveryPayload = {
      schemaVersion: 1,
      mergeCaseId: mergeCase.id,
      snapshotDigest: snapshot.digest,
      reasonDigest: await sha256(input.request.reason),
      rolledBackAt: input.now,
    };
    const recoveryDigest = await sha256(canonicalJson(recoveryPayload));
    statements.push(
      this.db
        .prepare(
          `DELETE FROM account_merge_snapshot_rows
            WHERE merge_case_id = ?`,
        )
        .bind(mergeCase.id),
      this.db
        .prepare(
          `UPDATE account_merge_cases
              SET status = 'rolled-back', rolled_back_at = ?
            WHERE installation_id = ? AND id = ? AND status = 'completed'`,
        )
        .bind(input.now, this.installationId, mergeCase.id),
      this.db
        .prepare(
          `INSERT INTO account_merge_recovery_receipts (
             id, installation_id, merge_case_id, receipt_json, receipt_digest,
             created_at
           ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          recoveryReceiptId,
          this.installationId,
          mergeCase.id,
          JSON.stringify(recoveryPayload),
          recoveryDigest,
          input.now,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.actor.identity,
        actorUserId: input.actor.id,
        action: "account.merge.rollback",
        targetType: "account_merge_recovery_receipt",
        targetId: recoveryReceiptId,
        requestId: input.requestId,
        outcome: "success",
        reason: input.request.reason,
        metadata: {
          mergeCaseId: mergeCase.id,
          snapshotDigest: snapshot.digest,
          recoveryDigest,
        },
        now: input.now,
      }),
    );
    await this.db.batch(statements);
    for (const userId of [
      mergeCase.source_user_id,
      mergeCase.survivor_user_id,
    ]) {
      await this.promoteCurrentLegacyProgress({
        userId,
        importId: `account-merge-rollback-${mergeCase.id}-${userId}`,
        actorUserId: input.actor.id,
        now: input.now,
      });
    }
    const receipt = await this.getAccountMergeReceipt(mergeCase.id);
    return { ...receipt, status: "rolled-back" };
  }

  async listLinkedIdentities(
    userId: string,
    includeUnlinked = false,
  ): Promise<LinkedIdentity[]> {
    const statusClause = includeUnlinked ? "" : "AND status = 'active'";
    const result = await this.db
      .prepare(
        `SELECT id, provider, provider_login, display_name, status,
                CASE WHEN user_id = ? THEN is_primary ELSE 0 END AS is_primary,
                linked_at, last_verified_at, last_seen_at, unlinked_at,
                CASE WHEN user_id = ? THEN 0 ELSE 1 END AS merge_source
           FROM user_identities
          WHERE installation_id = ?
            AND (
              user_id = ? OR user_id IN (
                SELECT source_user_id
                  FROM account_merge_aliases
                 WHERE installation_id = ? AND survivor_user_id = ?
              )
            ) ${statusClause}
          ORDER BY is_primary DESC, linked_at ASC, id ASC`,
      )
      .bind(
        userId,
        userId,
        this.installationId,
        userId,
        this.installationId,
        userId,
      )
      .all<LinkedIdentityRow>();
    const activeCount = result.results.filter(
      (identity) => identity.status === "active",
    ).length;
    return result.results.map((identity) => mapLinkedIdentity(identity, activeCount));
  }

  async createIdentityLinkTransaction(input: {
    account: Account;
    request: CreateIdentityLinkTransactionRequest;
    requestId: string;
    now: string;
  }): Promise<IdentityLinkTransaction> {
    const provider = normalizeProviderId(input.request.provider);
    const expiresAt = new Date(Date.parse(input.now) + 10 * 60 * 1_000).toISOString();
    await this.db
      .prepare(
        `UPDATE identity_link_transactions
            SET status = 'expired'
          WHERE installation_id = ? AND user_id = ? AND status = 'pending'
            AND expires_at <= ?`,
      )
      .bind(this.installationId, input.account.id, input.now)
      .run();
    const pending = await this.db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM identity_link_transactions
          WHERE installation_id = ? AND user_id = ? AND status = 'pending'`,
      )
      .bind(this.installationId, input.account.id)
      .first<{ count: number }>();
    if ((pending?.count ?? 0) >= 5) {
      throw new ApiFailure(
        429,
        "too_many_identity_link_attempts",
        "Cancel an existing identity-link attempt or wait for it to expire.",
      );
    }
    const id = crypto.randomUUID();
    const state = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
    const stateDigest = await sha256(state);
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO identity_link_transactions (
             id, installation_id, user_id, provider, state_digest,
             code_challenge, code_challenge_method, return_path, status,
             created_at, expires_at, completed_at, request_id
           ) VALUES (?, ?, ?, ?, ?, ?, 'S256', ?, 'pending', ?, ?, NULL, ?)`,
        )
        .bind(
          id,
          this.installationId,
          input.account.id,
          provider,
          stateDigest,
          input.request.codeChallenge,
          input.request.returnPath,
          input.now,
          expiresAt,
          input.requestId,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "identity.link.start",
        targetType: "identity_link_transaction",
        targetId: id,
        requestId: input.requestId,
        outcome: "success",
        reason: "Learner started a recent-authentication identity-link transaction.",
        metadata: { provider, expiresAt },
        now: input.now,
      }),
    ]);
    return {
      id,
      provider,
      state,
      codeChallenge: input.request.codeChallenge,
      codeChallengeMethod: "S256",
      returnPath: input.request.returnPath,
      expiresAt,
    };
  }

  async cancelIdentityLinkTransaction(input: {
    account: Account;
    transactionId: string;
    requestId: string;
    now: string;
  }): Promise<void> {
    const transaction = await this.db
      .prepare(
        `SELECT id
           FROM identity_link_transactions
          WHERE installation_id = ? AND user_id = ? AND id = ?
            AND status = 'pending'`,
      )
      .bind(this.installationId, input.account.id, input.transactionId)
      .first<{ id: string }>();
    if (!transaction) {
      throw new ApiFailure(
        404,
        "identity_link_not_found",
        "A pending identity-link transaction was not found.",
      );
    }
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE identity_link_transactions
              SET status = 'cancelled', completed_at = ?
            WHERE installation_id = ? AND user_id = ? AND id = ?
              AND status = 'pending'`,
        )
        .bind(
          input.now,
          this.installationId,
          input.account.id,
          input.transactionId,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "identity.link.cancel",
        targetType: "identity_link_transaction",
        targetId: input.transactionId,
        requestId: input.requestId,
        outcome: "success",
        reason: "Learner cancelled a pending identity-link transaction.",
        metadata: {},
        now: input.now,
      }),
    ]);
  }

  async beginIdentityLinkCompletion(input: {
    account: Account;
    transactionId: string;
    state: string;
    provider: string;
    codeVerifier: string;
    requestId: string;
    now: string;
  }): Promise<{ id: string; returnPath: string }> {
    const provider = normalizeProviderId(input.provider);
    const codeVerifier = normalizePkceCodeVerifier(input.codeVerifier);
    const [stateDigest, codeChallenge] = await Promise.all([
      sha256(input.state),
      sha256Base64Url(codeVerifier),
    ]);
    const transaction = await this.db
      .prepare(
        `SELECT id, user_id, provider, state_digest, code_challenge,
                code_challenge_method, return_path, status, created_at,
                expires_at, completed_at, request_id
           FROM identity_link_transactions
          WHERE installation_id = ? AND id = ? AND user_id = ?`,
      )
      .bind(this.installationId, input.transactionId, input.account.id)
      .first<IdentityLinkTransactionRow>();
    if (
      !transaction ||
      transaction.status !== "pending" ||
      transaction.provider !== provider ||
      transaction.state_digest !== stateDigest ||
      transaction.code_challenge !== codeChallenge
    ) {
      throw new ApiFailure(
        400,
        "invalid_identity_link",
        "The identity-link transaction is invalid or has already been used.",
      );
    }
    if (Date.parse(input.now) >= Date.parse(transaction.expires_at)) {
      await this.db
        .prepare(
          `UPDATE identity_link_transactions
              SET status = 'expired', completed_at = ?
            WHERE installation_id = ? AND id = ? AND status = 'pending'`,
        )
        .bind(input.now, this.installationId, transaction.id)
        .run();
      throw new ApiFailure(
        400,
        "identity_link_expired",
        "The identity-link transaction has expired.",
      );
    }
    const claim = await this.db
      .prepare(
        `UPDATE identity_link_transactions
            SET status = 'processing'
          WHERE installation_id = ? AND id = ? AND user_id = ?
            AND status = 'pending'`,
      )
      .bind(this.installationId, transaction.id, input.account.id)
      .run();
    if ((claim.meta.changes ?? 0) !== 1) {
      throw new ApiFailure(
        400,
        "invalid_identity_link",
        "The identity-link transaction is invalid or has already been used.",
      );
    }
    return { id: transaction.id, returnPath: transaction.return_path };
  }

  async completeIdentityLink(input: {
    account: Account;
    transactionId: string;
    providerIdentity: ExternalProviderIdentity;
    requestId: string;
    now: string;
  }): Promise<LinkedIdentity> {
    const provider = normalizeProviderId(input.providerIdentity.provider);
    const transaction = await this.db
      .prepare(
        `SELECT id, provider, status
           FROM identity_link_transactions
          WHERE installation_id = ? AND id = ? AND user_id = ?`,
      )
      .bind(this.installationId, input.transactionId, input.account.id)
      .first<Pick<IdentityLinkTransactionRow, "id" | "provider" | "status">>();
    if (
      !transaction ||
      transaction.status !== "processing" ||
      transaction.provider !== provider
    ) {
      throw new ApiFailure(
        400,
        "invalid_identity_link",
        "The identity-link transaction is invalid or has already been used.",
      );
    }
    const existing = await this.db
      .prepare(
        `SELECT id, user_id, status
           FROM user_identities
          WHERE installation_id = ? AND provider = ? AND issuer = ? AND subject = ?`,
      )
      .bind(
        this.installationId,
        provider,
        input.providerIdentity.issuer,
        input.providerIdentity.subject,
      )
      .first<{ id: string; user_id: string; status: LinkedIdentityStatus }>();
    if (existing && existing.user_id !== input.account.id) {
      throw new ApiFailure(
        409,
        "identity_already_linked",
        "This external identity is already linked to another Project 42 account.",
      );
    }
    const identityId = existing?.id ?? crypto.randomUUID();
    const identityStatement = existing
      ? this.db
          .prepare(
            `UPDATE user_identities
                SET provider_login = ?, display_name = ?, status = 'active',
                    link_method = 'self-service', linked_at = ?,
                    last_verified_at = ?, last_seen_at = ?, unlinked_at = NULL
              WHERE installation_id = ? AND id = ? AND user_id = ?`,
          )
          .bind(
            input.providerIdentity.providerLogin,
            input.providerIdentity.displayName,
            input.now,
            input.now,
            input.now,
            this.installationId,
            identityId,
            input.account.id,
          )
      : this.db
          .prepare(
            `INSERT INTO user_identities (
               id, installation_id, provider, issuer, subject, user_id,
               provider_login, display_name, status, is_primary, link_method,
               linked_at, last_verified_at, last_seen_at, unlinked_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 'self-service',
                       ?, ?, ?, NULL)`,
          )
          .bind(
            identityId,
            this.installationId,
            provider,
            input.providerIdentity.issuer,
            input.providerIdentity.subject,
            input.account.id,
            input.providerIdentity.providerLogin,
            input.providerIdentity.displayName,
            input.now,
            input.now,
            input.now,
          );
    try {
      await this.db.batch([
        identityStatement,
        this.db
          .prepare(
            `UPDATE identity_link_transactions
                SET status = 'completed', completed_at = ?
              WHERE installation_id = ? AND id = ? AND status = 'processing'`,
          )
          .bind(input.now, this.installationId, transaction.id),
        this.auditStatement({
          id: crypto.randomUUID(),
          actor: input.account.identity,
          actorUserId: input.account.id,
          action: "identity.link.complete",
          targetType: "user_identity",
          targetId: identityId,
          requestId: input.requestId,
          outcome: "success",
          reason: "Learner linked a freshly verified external identity.",
          metadata: { provider },
          now: input.now,
        }),
      ]);
    } catch (error) {
      const collision = await this.db
        .prepare(
          `SELECT user_id
             FROM user_identities
            WHERE installation_id = ? AND provider = ?
              AND issuer = ? AND subject = ?`,
        )
        .bind(
          this.installationId,
          provider,
          input.providerIdentity.issuer,
          input.providerIdentity.subject,
        )
        .first<{ user_id: string }>();
      if (collision?.user_id && collision.user_id !== input.account.id) {
        throw new ApiFailure(
          409,
          "identity_already_linked",
          "This external identity is already linked to another Project 42 account.",
        );
      }
      throw error;
    }
    const identities = await this.listLinkedIdentities(input.account.id);
    const linked = identities.find((identity) => identity.id === identityId);
    if (!linked) throw new Error("Linked identity was not returned after completion.");
    return linked;
  }

  async failIdentityLinkCompletion(input: {
    account: Account;
    transactionId: string;
    requestId: string;
    reasonCode: string;
    now: string;
  }): Promise<void> {
    const result = await this.db
      .prepare(
        `UPDATE identity_link_transactions
            SET status = 'failed', completed_at = ?
          WHERE installation_id = ? AND id = ? AND user_id = ?
            AND status = 'processing'`,
      )
      .bind(
        input.now,
        this.installationId,
        input.transactionId,
        input.account.id,
      )
      .run();
    if ((result.meta.changes ?? 0) !== 1) return;
    await this.db.batch([
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "identity.link.complete",
        targetType: "identity_link_transaction",
        targetId: input.transactionId,
        requestId: input.requestId,
        outcome: "failed",
        reason: "A verified external identity link did not complete.",
        metadata: { reasonCode: input.reasonCode },
        now: input.now,
      }),
    ]);
  }

  async unlinkIdentity(input: {
    account: Account;
    identityId: string;
    requestId: string;
    now: string;
  }): Promise<void> {
    const identity = await this.db
      .prepare(
        `SELECT id, provider, is_primary
           FROM user_identities
          WHERE installation_id = ? AND user_id = ? AND id = ?
            AND status = 'active'`,
      )
      .bind(this.installationId, input.account.id, input.identityId)
      .first<{ id: string; provider: string; is_primary: number }>();
    if (!identity) {
      throw new ApiFailure(
        404,
        "linked_identity_not_found",
        "An active linked identity was not found.",
      );
    }
    if (identity.is_primary === 1) {
      throw new ApiFailure(
        409,
        "primary_identity_required",
        "The primary sign-in identity cannot be unlinked without an accepted recovery path.",
      );
    }
    const active = await this.db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM user_identities
          WHERE installation_id = ? AND user_id = ? AND status = 'active'`,
      )
      .bind(this.installationId, input.account.id)
      .first<{ count: number }>();
    if ((active?.count ?? 0) <= 1) {
      throw new ApiFailure(
        409,
        "last_identity_required",
        "The last usable sign-in identity cannot be unlinked.",
      );
    }
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE user_identities
              SET status = 'unlinked', unlinked_at = ?
            WHERE installation_id = ? AND user_id = ? AND id = ?
              AND status = 'active' AND is_primary = 0`,
        )
        .bind(
          input.now,
          this.installationId,
          input.account.id,
          input.identityId,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "identity.unlink",
        targetType: "user_identity",
        targetId: input.identityId,
        requestId: input.requestId,
        outcome: "success",
        reason: "Learner unlinked a non-primary external identity.",
        metadata: { provider: identity.provider },
        now: input.now,
      }),
    ]);
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
      ...(input.to === "suspended" || input.to === "revoked"
        ? [
            this.db
              .prepare(
                `UPDATE browser_sessions
                    SET revoked_at = ?
                  WHERE installation_id = ? AND user_id = ?
                    AND revoked_at IS NULL`,
              )
              .bind(input.now, this.installationId, input.targetId),
          ]
        : []),
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

  async deleteDomain(input: {
    actor: Account;
    domainId: string;
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
    if (!existing) {
      throw new ApiFailure(404, "domain_not_found", "Domain rule was not found.");
    }
    if (existing.enabled === 1) {
      throw new ApiFailure(
        409,
        "domain_must_be_disabled",
        "Disable this domain rule before removing it.",
      );
    }
    await this.db.batch([
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.actor.identity,
        actorUserId: input.actor.id,
        action: "domain.delete",
        targetType: "approved_email_domain",
        targetId: input.domainId,
        requestId: input.requestId,
        outcome: "success",
        reason: input.reason,
        metadata: {
          domain: existing.domain,
          enabled: false,
          policyVersion: existing.policy_version,
        },
        now: input.now,
      }),
      this.db
        .prepare(
          `DELETE FROM approved_email_domains
            WHERE installation_id = ? AND id = ? AND enabled = 0`,
        )
        .bind(this.installationId, input.domainId),
    ]);
    return mapDomain(existing);
  }

  async getProfile(account: Account, now: string): Promise<LearnerProfile> {
    const row = await this.db
      .prepare(
        `SELECT u.id AS user_id, u.display_name, p.bio, p.organization,
                p.location, p.website_url, p.photo_object_key,
                p.photo_content_type, p.photo_byte_length, p.photo_etag,
                p.photo_updated_at,
                COALESCE(p.created_at, u.created_at) AS created_at,
                COALESCE(p.updated_at, u.updated_at) AS updated_at
           FROM users u
           LEFT JOIN user_profiles p
             ON p.installation_id = u.installation_id AND p.user_id = u.id
          WHERE u.installation_id = ? AND u.id = ?`,
      )
      .bind(this.installationId, account.id)
      .first<ProfileRow>();
    if (!row) {
      throw new ApiFailure(404, "account_not_found", "Account was not found.");
    }
    return mapProfile(row, now);
  }

  async updateProfile(input: {
    account: Account;
    request: UpdateLearnerProfileRequest;
    fields: Array<keyof UpdateLearnerProfileRequest>;
    requestId: string;
    now: string;
  }): Promise<LearnerProfile> {
    const current = await this.getProfile(input.account, input.now);
    const next = {
      displayName:
        input.request.displayName === undefined
          ? current.displayName
          : input.request.displayName,
      bio: input.request.bio === undefined ? current.bio : input.request.bio,
      organization:
        input.request.organization === undefined
          ? current.organization
          : input.request.organization,
      location:
        input.request.location === undefined
          ? current.location
          : input.request.location,
      websiteUrl:
        input.request.websiteUrl === undefined
          ? current.websiteUrl
          : input.request.websiteUrl,
    };
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE users SET display_name = ?, updated_at = ?
            WHERE installation_id = ? AND id = ?`,
        )
        .bind(next.displayName, input.now, this.installationId, input.account.id),
      this.db
        .prepare(
          `INSERT INTO user_profiles (
             installation_id, user_id, bio, organization, location, website_url,
             created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (installation_id, user_id) DO UPDATE SET
             bio = excluded.bio,
             organization = excluded.organization,
             location = excluded.location,
             website_url = excluded.website_url,
             updated_at = excluded.updated_at`,
        )
        .bind(
          this.installationId,
          input.account.id,
          next.bio,
          next.organization,
          next.location,
          next.websiteUrl,
          input.now,
          input.now,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "profile.update",
        targetType: "user_profile",
        targetId: input.account.id,
        requestId: input.requestId,
        outcome: "success",
        reason: "Learner updated profile fields.",
        metadata: { fields: input.fields },
        now: input.now,
      }),
    ]);
    return {
      userId: input.account.id,
      ...next,
      photoAvailable: current.photoAvailable,
      photoUpdatedAt: current.photoUpdatedAt,
      createdAt: current.createdAt,
      updatedAt: input.now,
    };
  }

  async getProfilePhotoMetadata(userId: string): Promise<ProfilePhotoMetadata | null> {
    const row = await this.db
      .prepare(
        `SELECT photo_object_key, photo_content_type, photo_byte_length,
                photo_etag, photo_updated_at
           FROM user_profiles
          WHERE installation_id = ? AND user_id = ?`,
      )
      .bind(this.installationId, userId)
      .first<{
        photo_object_key: string | null;
        photo_content_type: string | null;
        photo_byte_length: number | null;
        photo_etag: string | null;
        photo_updated_at: string | null;
      }>();
    if (
      !row?.photo_object_key ||
      !row.photo_content_type ||
      !row.photo_byte_length ||
      !row.photo_etag ||
      !row.photo_updated_at
    ) {
      return null;
    }
    return {
      objectKey: row.photo_object_key,
      contentType: row.photo_content_type,
      byteLength: row.photo_byte_length,
      etag: row.photo_etag,
      updatedAt: row.photo_updated_at,
    };
  }

  async setProfilePhotoMetadata(input: {
    account: Account;
    metadata: ProfilePhotoMetadata;
    requestId: string;
    now: string;
  }): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO user_profiles (
             installation_id, user_id, photo_object_key, photo_content_type,
             photo_byte_length, photo_etag, photo_updated_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (installation_id, user_id) DO UPDATE SET
             photo_object_key = excluded.photo_object_key,
             photo_content_type = excluded.photo_content_type,
             photo_byte_length = excluded.photo_byte_length,
             photo_etag = excluded.photo_etag,
             photo_updated_at = excluded.photo_updated_at,
             updated_at = excluded.updated_at`,
        )
        .bind(
          this.installationId,
          input.account.id,
          input.metadata.objectKey,
          input.metadata.contentType,
          input.metadata.byteLength,
          input.metadata.etag,
          input.metadata.updatedAt,
          input.now,
          input.now,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "profile.photo.update",
        targetType: "user_profile",
        targetId: input.account.id,
        requestId: input.requestId,
        outcome: "success",
        reason: "Learner replaced their private profile photo.",
        metadata: {
          contentType: input.metadata.contentType,
          byteLength: input.metadata.byteLength,
        },
        now: input.now,
      }),
    ]);
  }

  async clearProfilePhotoMetadata(input: {
    account: Account;
    requestId: string;
    now: string;
  }): Promise<void> {
    await this.db.batch([
      this.db
        .prepare(
          `UPDATE user_profiles
              SET photo_object_key = NULL, photo_content_type = NULL,
                  photo_byte_length = NULL, photo_etag = NULL,
                  photo_updated_at = NULL, updated_at = ?
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(input.now, this.installationId, input.account.id),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.account.identity,
        actorUserId: input.account.id,
        action: "profile.photo.delete",
        targetType: "user_profile",
        targetId: input.account.id,
        requestId: input.requestId,
        outcome: "success",
        reason: "Learner removed their private profile photo.",
        metadata: {},
        now: input.now,
      }),
    ]);
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
    const legacy = await this.db
      .prepare(
        `SELECT revision, progress_json, updated_at
           FROM learning_progress
          WHERE installation_id = ? AND user_id = ?`,
      )
      .bind(this.installationId, userId)
      .first<{ revision: number; progress_json: string; updated_at: string }>();
    let events = await this.learningEvents.list(this.installationId, userId);
    let projection = await new LearningEventEngine(
      this.learningEvents,
    ).rebuild(
      this.installationId,
      userId,
      {
        installationId: this.installationId,
        actorType: "learner",
        actorUserId: userId,
        permissions: ["learning:read:self"],
      },
    );
    if (legacy) {
      const legacyProgress = JSON.parse(
        legacy.progress_json,
      ) as LearnerProgress;
      validateProgress(legacyProgress);
      const checksum = await sha256(canonicalJson(legacyProgress));
      const lastImport = events
        .filter(
          (
            event,
          ): event is Extract<LearningEvent, { type: "progress.imported" }> =>
            event.type === "progress.imported",
        )
        .at(-1);
      const shouldMigrate =
        events.length === 0 ||
        Boolean(
          lastImport &&
            lastImport.payload.sourceChecksum !== checksum &&
            Date.parse(legacy.updated_at) >=
              Date.parse(lastImport.payload.synchronizedAt),
        );
      if (shouldMigrate) {
        const recordedAt = new Date().toISOString();
        const synchronizedAt =
          validUtcTimestamp(legacy.updated_at) &&
          Date.parse(legacy.updated_at) <= Date.parse(recordedAt)
            ? legacy.updated_at
            : recordedAt;
        projection = (
          await this.executeProgressImport({
            userId,
            importId: `legacy-${legacy.revision}-${checksum}`,
            source: "legacy-hosted-v1",
            progress: legacyProgress,
            checksum,
            synchronizedAt,
            recordedAt,
            actorType: "system",
          })
        ).projection;
        events = await this.learningEvents.list(this.installationId, userId);
      }
    }
    const displayName = await this.db
      .prepare(
        `SELECT display_name FROM users
          WHERE installation_id = ? AND id = ?`,
      )
      .bind(this.installationId, userId)
      .first<{ display_name: string | null }>();
    return progressEnvelopeFromProjection(
      projection,
      events,
      displayName?.display_name ?? "Explorer",
    );
  }

  async importProgress(input: {
    account: Account;
    request: ProgressImportRequest;
    requestId: string;
    now: string;
  }): Promise<ProgressEnvelope> {
    validateProgress(input.request.progress);
    const progressJson = JSON.stringify(input.request.progress);
    const checksum = await sha256(canonicalJson(input.request.progress));
    let commandResult;
    try {
      commandResult = await this.executeProgressImport({
        userId: input.account.id,
        importId: input.request.importId,
        source: input.request.source,
        progress: input.request.progress,
        checksum,
        synchronizedAt: input.now,
        recordedAt: input.now,
        actorType: "learner",
      });
    } catch (error) {
      if (
        error instanceof LearningEventEngineError &&
        error.code === "idempotency-conflict"
      ) {
        throw new ApiFailure(
          409,
          "progress_import_conflict",
          "The import ID is already bound to different progress.",
        );
      }
      if (
        error instanceof LearningEventEngineError &&
        error.code === "concurrency-conflict"
      ) {
        throw new ApiFailure(
          409,
          "progress_revision_conflict",
          "Progress changed concurrently; retry the import.",
        );
      }
      throw error;
    }
    const revision = commandResult.projection.revision;
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
           ) VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (installation_id, user_id, id) DO UPDATE SET
             source = excluded.source,
             source_checksum = excluded.source_checksum,
             imported_revision = excluded.imported_revision,
             imported_at = excluded.imported_at`,
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
    if (!commandResult.replayed) {
      statements.push(
        this.auditStatement({
          id: crypto.randomUUID(),
          actor: input.account.identity,
          actorUserId: input.account.id,
          action: "progress.import",
          targetType: "learning_event_stream",
          targetId: input.account.id,
          requestId: input.requestId,
          outcome: "success",
          reason: input.request.source,
          metadata: {
            revision,
            checksum,
            learningEventId: commandResult.event.id,
          },
          now: input.now,
        }),
      );
    }
    await this.db.batch(statements);
    const events = await this.learningEvents.list(
      this.installationId,
      input.account.id,
    );
    return progressEnvelopeFromProjection(
      commandResult.projection,
      events,
      input.request.progress.displayName,
    );
  }

  private async executeProgressImport(input: {
    userId: string;
    importId: string;
    source: LearningProgressImportSource;
    progress: LearnerProgress;
    checksum: string;
    synchronizedAt: string;
    recordedAt: string;
    actorType: "learner" | "owner" | "system";
    actorUserId?: string;
  }) {
    const actor =
      input.actorType === "system"
        ? ({ type: "system", userId: null } as const)
        : ({
            type: input.actorType,
            userId: input.actorUserId ?? input.userId,
          } as const);
    const access: LearningEventAccess = {
      installationId: this.installationId,
      actorType: actor.type,
      actorUserId: actor.userId,
      permissions:
        input.actorType === "system" || input.actorType === "owner"
          ? ["learning:write:any", "learning:read:any"]
          : ["learning:write:self", "learning:read:self"],
    };
    const idempotencyDigest = await sha256(
      `${this.installationId}\u0000${input.userId}\u0000${input.importId}`,
    );
    const idempotencyKey = `progress-import-${idempotencyDigest.slice(0, 48)}`;
    const currentEvents = await this.learningEvents.list(
      this.installationId,
      input.userId,
    );
    if (input.source === "legacy-hosted-v1") {
      const latestImport = currentEvents
        .filter(
          (
            event,
          ): event is Extract<LearningEvent, { type: "progress.imported" }> =>
            event.type === "progress.imported",
        )
        .at(-1);
      if (
        latestImport &&
        Date.parse(latestImport.payload.synchronizedAt) >=
          Date.parse(input.synchronizedAt)
      ) {
        return {
          event: latestImport,
          replayed: true,
          projection: projectLearningEvents(
            currentEvents,
            this.installationId,
            input.userId,
          ),
        };
      }
    }
    const existing = currentEvents.find(
      (event) => event.idempotencyKey === idempotencyKey,
    );
    if (existing) {
      if (
        existing.type !== "progress.imported" ||
        existing.payload.source !== input.source ||
        existing.payload.sourceChecksum !== input.checksum
      ) {
        throw new LearningEventEngineError(
          "idempotency-conflict",
          "The progress import ID is already bound to another snapshot.",
        );
      }
      return {
        event: existing,
        replayed: true,
        projection: projectLearningEvents(
          currentEvents,
          this.installationId,
          input.userId,
        ),
      };
    }
    return new LearningEventEngine(this.learningEvents, {
      now: () => input.recordedAt,
    }).execute(
      {
        schemaVersion: LEARNING_EVENT_CONTRACT_VERSION,
        type: "progress.import",
        installationId: this.installationId,
        learnerId: input.userId,
        idempotencyKey,
        contentVersion: starterCatalog.contentVersion,
        occurredAt: input.synchronizedAt,
        actor,
        payload: {
          source: input.source,
          sourceChecksum: input.checksum,
          synchronizedAt: input.synchronizedAt,
          progress: structuredClone(input.progress),
        },
      },
      access,
    );
  }

  private async promoteCurrentLegacyProgress(input: {
    userId: string;
    importId: string;
    actorUserId: string;
    now: string;
  }): Promise<void> {
    const row = await this.db
      .prepare(
        `SELECT progress_json
           FROM learning_progress
          WHERE installation_id = ? AND user_id = ?`,
      )
      .bind(this.installationId, input.userId)
      .first<{ progress_json: string }>();
    if (!row) return;
    const progress = JSON.parse(row.progress_json) as LearnerProgress;
    validateProgress(progress);
    await this.executeProgressImport({
      userId: input.userId,
      importId: input.importId,
      source: "account-merge-v1",
      progress,
      checksum: await sha256(canonicalJson(progress)),
      synchronizedAt: input.now,
      recordedAt: input.now,
      actorType: "owner",
      actorUserId: input.actorUserId,
    });
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
      profile,
      linkedIdentities,
      progress,
      moduleProgress,
      assessmentAttempts,
      transcriptEntries,
      badges,
      consents,
      deletionRequests,
      approvalDecisions,
    ] = await Promise.all([
      this.getProfile(input.account, input.now),
      this.listLinkedIdentities(input.account.id, true),
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
      profile,
      linkedIdentities,
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

  async recordOwnerAuthorizationDenied(input: {
    account: Account;
    method: string;
    path: string;
    requestId: string;
    now: string;
  }): Promise<void> {
    await this.auditStatement({
      id: crypto.randomUUID(),
      actor: input.account.identity,
      actorUserId: input.account.id,
      action: "authorization.owner.denied",
      targetType: "admin_route",
      targetId: input.path,
      requestId: input.requestId,
      outcome: "denied",
      reason: "An approved owner role is required.",
      metadata: {
        method: input.method,
        accountState: input.account.state,
      },
      now: input.now,
    }).run();
  }

  async completeDeletion(input: {
    actor: Account;
    deletionRequestId: string;
    reason: string;
    requestId: string;
    now: string;
  }): Promise<{
    deletionRequestId: string;
    completedAt: string;
    subjectDigest: string;
    profilePhotoObjectKeys: string[];
  }> {
    const deletion = await this.db
      .prepare(
        `SELECT d.id, d.user_id, d.state, d.requested_at, d.cancellation_deadline,
                i.issuer, i.subject, p.photo_object_key,
                EXISTS (
                  SELECT 1 FROM role_assignments r
                   WHERE r.installation_id = d.installation_id
                     AND r.user_id = d.user_id AND r.role = 'owner'
                ) AS is_owner
           FROM deletion_requests d
           JOIN user_identities i
             ON i.installation_id = d.installation_id AND i.user_id = d.user_id
            AND i.status = 'active' AND i.is_primary = 1
           LEFT JOIN user_profiles p
             ON p.installation_id = d.installation_id AND p.user_id = d.user_id
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
        photo_object_key: string | null;
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
    const aliases = await this.db
      .prepare(
        `SELECT source_user_id, merge_case_id
           FROM account_merge_aliases
          WHERE installation_id = ? AND survivor_user_id = ?
          ORDER BY created_at`,
      )
      .bind(this.installationId, deletion.user_id)
      .all<{ source_user_id: string; merge_case_id: string }>();
    const mergedUserIds = [
      ...aliases.results.map((alias) => alias.source_user_id),
      deletion.user_id,
    ];
    const placeholders = mergedUserIds.map(() => "?").join(", ");
    const relatedCases = await this.db
      .prepare(
        `SELECT id
           FROM account_merge_cases
          WHERE installation_id = ?
            AND (
              source_user_id IN (${placeholders}) OR
              survivor_user_id IN (${placeholders})
            )`,
      )
      .bind(this.installationId, ...mergedUserIds, ...mergedUserIds)
      .all<{ id: string }>();
    const identities = await this.db
      .prepare(
        `SELECT provider, issuer, subject
           FROM user_identities
          WHERE installation_id = ? AND user_id IN (${placeholders})
          ORDER BY is_primary DESC, linked_at ASC`,
      )
      .bind(this.installationId, ...mergedUserIds)
      .all<{ provider: string; issuer: string; subject: string }>();
    const identityDigests = await Promise.all(
      identities.results.map(async (identity) => ({
        provider: identity.provider,
        issuerDigest: await sha256(identity.issuer),
        subjectDigest: await sha256(`${identity.issuer}\n${identity.subject}`),
      })),
    );
    const subjectDigest =
      identityDigests[0]?.subjectDigest ??
      (await sha256(`${deletion.issuer}\n${deletion.subject}`));
    const profilePhotoObjectKeys = new Set<string>();
    if (deletion.photo_object_key) {
      profilePhotoObjectKeys.add(deletion.photo_object_key);
    }
    if (relatedCases.results.length > 0) {
      const casePlaceholders = relatedCases.results.map(() => "?").join(", ");
      const snapshotRows = await this.db
        .prepare(
          `SELECT row_json
             FROM account_merge_snapshot_rows
            WHERE merge_case_id IN (${casePlaceholders})
              AND table_name = 'user_profiles'`,
        )
        .bind(...relatedCases.results.map((mergeCase) => mergeCase.id))
        .all<{ row_json: string | Record<string, unknown>[] }>();
      for (const chunk of snapshotRows.results) {
        const rows = parseJsonRecord<unknown>(chunk.row_json);
        if (!Array.isArray(rows)) continue;
        for (const value of rows) {
          if (
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            typeof (value as Record<string, unknown>).photo_object_key ===
              "string"
          ) {
            profilePhotoObjectKeys.add(
              String((value as Record<string, unknown>).photo_object_key),
            );
          }
        }
      }
    }
    const statements: D1PreparedStatement[] = [];
    for (const userId of mergedUserIds) {
      statements.push(
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
            userId,
            userId,
            userId,
            userId,
            this.installationId,
            userId,
            userId,
          ),
      );
    }
    statements.push(
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
          identityCount: identityDigests.length,
        },
        now: input.now,
      }),
    );
    statements.splice(
      statements.length - 1,
      0,
      ...identityDigests.map((identity) =>
        this.db
          .prepare(
            `INSERT INTO deleted_identity_tombstones (
               id, installation_id, provider, issuer_digest, subject_digest,
               deletion_request_id, completed_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            crypto.randomUUID(),
            this.installationId,
            identity.provider,
            identity.issuerDigest,
            identity.subjectDigest,
            deletion.id,
            input.now,
          ),
      ),
    );
    if (relatedCases.results.length > 0) {
      for (const mergeCase of relatedCases.results) {
        statements.push(
          this.db
            .prepare(
              `DELETE FROM account_merge_snapshot_rows
                WHERE merge_case_id = ?`,
            )
            .bind(mergeCase.id),
        );
      }
    }
    statements.push(
      this.db
        .prepare(
          `DELETE FROM account_merge_proofs
            WHERE installation_id = ? AND user_id IN (${placeholders})`,
        )
        .bind(this.installationId, ...mergedUserIds),
      this.db
        .prepare(
          `DELETE FROM account_merge_aliases
            WHERE installation_id = ? AND survivor_user_id = ?`,
        )
        .bind(this.installationId, deletion.user_id),
    );
    for (const sourceUserId of aliases.results.map(
      (alias) => alias.source_user_id,
    )) {
      statements.push(
        this.db
          .prepare(`DELETE FROM users WHERE installation_id = ? AND id = ?`)
          .bind(this.installationId, sourceUserId),
      );
    }
    statements.push(
      this.db
        .prepare(`DELETE FROM users WHERE installation_id = ? AND id = ?`)
        .bind(this.installationId, deletion.user_id),
    );
    await this.db.batch(statements);
    return {
      deletionRequestId: deletion.id,
      completedAt: input.now,
      subjectDigest,
      profilePhotoObjectKeys: [...profilePhotoObjectKeys],
    };
  }

  async listAuditEvents(): Promise<AuditEvent[]> {
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
      id: String(event.id),
      actorUserId:
        typeof event.actor_user_id === "string" ? event.actor_user_id : null,
      action: String(event.action),
      targetType: String(event.target_type),
      targetId: typeof event.target_id === "string" ? event.target_id : null,
      requestId: String(event.request_id),
      outcome: event.outcome as AuditEvent["outcome"],
      reason: String(event.reason),
      metadata:
        typeof event.metadata_json === "string"
          ? (JSON.parse(event.metadata_json) as Record<string, unknown>)
          : (event.metadata_json as Record<string, unknown>),
      occurredAt: String(event.occurred_at),
    }));
  }

  private async createAccountMergeProof(input: {
    actor: Account;
    targetUserId: string;
    method: AccountMergeProofMethod;
    evidence: Record<string, unknown>;
    requestId: string;
    now: string;
  }): Promise<AccountMergeProof> {
    await this.db
      .prepare(
        `UPDATE account_merge_proofs
            SET status = 'expired'
          WHERE installation_id = ? AND user_id = ? AND status = 'available'
            AND expires_at <= ?`,
      )
      .bind(this.installationId, input.targetUserId, input.now)
      .run();
    const available = await this.db
      .prepare(
        `SELECT COUNT(*) AS count
           FROM account_merge_proofs
          WHERE installation_id = ? AND user_id = ? AND status = 'available'`,
      )
      .bind(this.installationId, input.targetUserId)
      .first<{ count: number | string }>();
    if (Number(available?.count ?? 0) >= 5) {
      throw new ApiFailure(
        429,
        "too_many_account_merge_proofs",
        "Wait for an existing account recovery proof to expire.",
      );
    }
    const id = crypto.randomUUID();
    const token = `${crypto.randomUUID()}.${crypto.randomUUID()}`;
    const tokenDigest = await sha256(token);
    const expiresAt = new Date(
      Date.parse(input.now) + 15 * 60 * 1_000,
    ).toISOString();
    await this.db.batch([
      this.db
        .prepare(
          `INSERT INTO account_merge_proofs (
             id, installation_id, user_id, proof_method, token_digest,
             evidence_json, status, created_by_user_id, created_at, expires_at,
             consumed_at, request_id
           ) VALUES (?, ?, ?, ?, ?, ?, 'available', ?, ?, ?, NULL, ?)`,
        )
        .bind(
          id,
          this.installationId,
          input.targetUserId,
          input.method,
          tokenDigest,
          JSON.stringify(input.evidence),
          input.actor.id,
          input.now,
          expiresAt,
          input.requestId,
        ),
      this.auditStatement({
        id: crypto.randomUUID(),
        actor: input.actor.identity,
        actorUserId: input.actor.id,
        action: "account.merge.proof.create",
        targetType: "account_merge_proof",
        targetId: id,
        requestId: input.requestId,
        outcome: "success",
        reason:
          input.method === "recent-authentication"
            ? "Learner created a one-time recent-authentication merge proof."
            : "Owner recorded a governed account-recovery proof.",
        metadata: {
          proofMethod: input.method,
          expiresAt,
          targetUserDigest: await sha256(input.targetUserId),
        },
        now: input.now,
      }),
    ]);
    return {
      token,
      userId: input.targetUserId,
      method: input.method,
      expiresAt,
    };
  }

  private async requireAvailableMergeProof(
    token: string,
    expectedUserId: string,
    now: string,
  ): Promise<AccountMergeProofRow> {
    const tokenDigest = await sha256(token);
    const proof = await this.db
      .prepare(
        `SELECT id, user_id, proof_method, token_digest, evidence_json, status,
                created_at, expires_at, consumed_at
           FROM account_merge_proofs
          WHERE installation_id = ? AND token_digest = ?`,
      )
      .bind(this.installationId, tokenDigest)
      .first<AccountMergeProofRow>();
    if (
      !proof ||
      proof.user_id !== expectedUserId ||
      proof.status !== "available"
    ) {
      throw new ApiFailure(
        400,
        "invalid_account_merge_proof",
        "The account recovery proof is invalid or has already been used.",
      );
    }
    if (Date.parse(now) >= Date.parse(proof.expires_at)) {
      await this.db
        .prepare(
          `UPDATE account_merge_proofs
              SET status = 'expired'
            WHERE installation_id = ? AND id = ? AND status = 'available'`,
        )
        .bind(this.installationId, proof.id)
        .run();
      throw new ApiFailure(
        400,
        "account_merge_proof_expired",
        "Create a fresh account recovery proof.",
      );
    }
    return proof;
  }

  private async getAccountMergeCase(
    mergeCaseId: string,
  ): Promise<AccountMergeCaseRow | null> {
    return this.db
      .prepare(
        `SELECT id, source_user_id, survivor_user_id, source_proof_id,
                survivor_proof_id, status, preview_json, preview_digest,
                resolutions_json, snapshot_digest, idempotency_key, created_at,
                expires_at, completed_at, rolled_back_at
           FROM account_merge_cases
          WHERE installation_id = ? AND id = ?`,
      )
      .bind(this.installationId, mergeCaseId)
      .first<AccountMergeCaseRow>();
  }

  private async mapAccountMergePreview(
    mergeCase: AccountMergeCaseRow,
  ): Promise<AccountMergePreview> {
    if (!mergeCase.source_user_id || !mergeCase.survivor_user_id) {
      throw new ApiFailure(
        410,
        "account_merge_personal_data_deleted",
        "The merge record remains, but its account data has been deleted.",
      );
    }
    const [source, survivor] = await Promise.all([
      this.getAccountById(mergeCase.source_user_id),
      this.getAccountById(mergeCase.survivor_user_id),
    ]);
    if (!source || !survivor) {
      throw new ApiFailure(
        410,
        "account_merge_personal_data_deleted",
        "The merge record remains, but its account data has been deleted.",
      );
    }
    const preview = parseMergePreviewRecord(mergeCase.preview_json);
    return {
      id: mergeCase.id,
      status:
        mergeCase.status === "rolled-back"
          ? "rolled-back"
          : mergeCase.status === "completed"
            ? "completed"
            : "preview",
      sourceUserId: source.id,
      survivorUserId: survivor.id,
      sourceDisplayName: source.displayName,
      survivorDisplayName: survivor.displayName,
      sourcePrimaryEmail: source.primaryEmail,
      survivorPrimaryEmail: survivor.primaryEmail,
      proofMethods: preview.proofMethods,
      conflicts: preview.conflicts,
      recordCounts: preview.recordCounts,
      expiresAt: mergeCase.expires_at,
    };
  }

  private async captureMergeSnapshot(
    sourceUserId: string,
    survivorUserId: string,
  ): Promise<MergeSnapshot> {
    const entries: MergeSnapshotEntry[] = [];
    const recordCounts: Record<
      string,
      { source: number; survivor: number }
    > = {};
    for (const tableName of ACCOUNT_MERGE_SNAPSHOT_TABLES) {
      const userColumn = tableName === "users" ? "id" : "user_id";
      const result = await this.db
        .prepare(
          `SELECT *
             FROM ${tableName}
            WHERE installation_id = ? AND ${userColumn} IN (?, ?)`,
        )
        .bind(this.installationId, sourceUserId, survivorUserId)
        .all<Record<string, unknown>>();
      const tableCounts = { source: 0, survivor: 0 };
      for (const row of result.results) {
        const ownerId = mergeRowUserId(tableName, row);
        if (ownerId === sourceUserId) tableCounts.source += 1;
        if (ownerId === survivorUserId) tableCounts.survivor += 1;
        const rowKey = mergeSnapshotRowKey(tableName, row);
        entries.push({
          tableName,
          rowKey,
          row,
          rowDigest: await sha256(canonicalJson(row)),
        });
      }
      recordCounts[tableName] = tableCounts;
    }
    entries.sort((left, right) =>
      `${left.tableName}\u0000${left.rowKey}`.localeCompare(
        `${right.tableName}\u0000${right.rowKey}`,
      ),
    );
    return {
      entries,
      digest: await sha256(
        canonicalJson(
          entries.map((entry) => ({
            tableName: entry.tableName,
            rowKey: entry.rowKey,
            rowDigest: entry.rowDigest,
          })),
        ),
      ),
      recordCounts,
    };
  }

  private buildStructuredMergeStatements(input: {
    sourceUserId: string;
    survivorUserId: string;
    snapshot: MergeSnapshot;
  }): D1PreparedStatement[] {
    const statements: D1PreparedStatement[] = [];
    statements.push(
      this.db
        .prepare(
          `INSERT INTO module_progress (
             installation_id, user_id, path_id, module_id, content_version,
             status, first_seen_at, completed_at, updated_at
           )
           SELECT installation_id, ?, path_id, module_id, content_version,
                  status, first_seen_at, completed_at, updated_at
             FROM module_progress
            WHERE installation_id = ? AND user_id = ?
           ON CONFLICT (
             installation_id, user_id, path_id, module_id, content_version
           ) DO UPDATE SET
             status = CASE
               WHEN module_progress.status = 'completed'
                 OR excluded.status = 'completed' THEN 'completed'
               ELSE 'visited'
             END,
             first_seen_at = CASE
               WHEN module_progress.first_seen_at <= excluded.first_seen_at
                 THEN module_progress.first_seen_at
               ELSE excluded.first_seen_at
             END,
             completed_at = CASE
               WHEN module_progress.completed_at IS NULL
                 THEN excluded.completed_at
               WHEN excluded.completed_at IS NULL
                 THEN module_progress.completed_at
               WHEN module_progress.completed_at <= excluded.completed_at
                 THEN module_progress.completed_at
               ELSE excluded.completed_at
             END,
             updated_at = CASE
               WHEN module_progress.updated_at >= excluded.updated_at
                 THEN module_progress.updated_at
               ELSE excluded.updated_at
             END`,
        )
        .bind(
          input.survivorUserId,
          this.installationId,
          input.sourceUserId,
        ),
      this.db
        .prepare(
          `DELETE FROM module_progress
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(this.installationId, input.sourceUserId),
    );
    const rows = (tableName: string, userId: string) =>
      input.snapshot.entries
        .filter(
          (entry) =>
            entry.tableName === tableName &&
            mergeRowUserId(entry.tableName, entry.row) === userId,
        )
        .map((entry) => entry.row);
    const survivorAttempts = new Set(
      rows("assessment_attempts", input.survivorUserId).map((row) =>
        String(row.id),
      ),
    );
    for (const sourceAttempt of rows(
      "assessment_attempts",
      input.sourceUserId,
    )) {
      const id = String(sourceAttempt.id);
      if (!survivorAttempts.has(id)) continue;
      statements.push(
        this.db
          .prepare(
            `UPDATE assessment_attempts
                SET id = ?
              WHERE installation_id = ? AND user_id = ? AND id = ?`,
          )
          .bind(
            `${input.sourceUserId}:${id}`,
            this.installationId,
            input.sourceUserId,
            id,
          ),
      );
    }
    statements.push(
      this.db
        .prepare(
          `UPDATE assessment_attempts
              SET user_id = ?
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(
          input.survivorUserId,
          this.installationId,
          input.sourceUserId,
        ),
      this.db
        .prepare(
          `INSERT INTO transcript_entries (
             installation_id, user_id, path_id, path_title, completed_modules,
             total_modules, completion_percent, best_score_percent,
             content_version, updated_at
           )
           SELECT installation_id, ?, path_id, path_title, completed_modules,
                  total_modules, completion_percent, best_score_percent,
                  content_version, updated_at
             FROM transcript_entries
            WHERE installation_id = ? AND user_id = ?
           ON CONFLICT (
             installation_id, user_id, path_id, content_version
           ) DO UPDATE SET
             path_title = excluded.path_title,
             completed_modules = CASE
               WHEN transcript_entries.completed_modules >= excluded.completed_modules
                 THEN transcript_entries.completed_modules
               ELSE excluded.completed_modules
             END,
             total_modules = CASE
               WHEN transcript_entries.total_modules >= excluded.total_modules
                 THEN transcript_entries.total_modules
               ELSE excluded.total_modules
             END,
             completion_percent = CASE
               WHEN transcript_entries.completion_percent >= excluded.completion_percent
                 THEN transcript_entries.completion_percent
               ELSE excluded.completion_percent
             END,
             best_score_percent = CASE
               WHEN transcript_entries.best_score_percent IS NULL
                 THEN excluded.best_score_percent
               WHEN excluded.best_score_percent IS NULL
                 THEN transcript_entries.best_score_percent
               WHEN transcript_entries.best_score_percent >= excluded.best_score_percent
                 THEN transcript_entries.best_score_percent
               ELSE excluded.best_score_percent
             END,
             updated_at = CASE
               WHEN transcript_entries.updated_at >= excluded.updated_at
                 THEN transcript_entries.updated_at
               ELSE excluded.updated_at
             END`,
        )
        .bind(
          input.survivorUserId,
          this.installationId,
          input.sourceUserId,
        ),
      this.db
        .prepare(
          `DELETE FROM transcript_entries
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(this.installationId, input.sourceUserId),
    );
    const survivorBadges = new Map(
      rows("user_badges", input.survivorUserId).map((row) => [
        String(row.badge_id),
        row,
      ]),
    );
    for (const sourceBadge of rows("user_badges", input.sourceUserId)) {
      const badgeId = String(sourceBadge.badge_id);
      const survivorBadge = survivorBadges.get(badgeId);
      if (!survivorBadge) continue;
      const evidence = [
        ...new Set([
          ...parseJsonArray(survivorBadge.evidence_module_ids_json),
          ...parseJsonArray(sourceBadge.evidence_module_ids_json),
        ]),
      ];
      const earnedAt =
        String(survivorBadge.earned_at).localeCompare(
          String(sourceBadge.earned_at),
        ) <= 0
          ? survivorBadge.earned_at
          : sourceBadge.earned_at;
      const recordedAt =
        String(survivorBadge.recorded_at).localeCompare(
          String(sourceBadge.recorded_at),
        ) >= 0
          ? survivorBadge.recorded_at
          : sourceBadge.recorded_at;
      statements.push(
        this.db
          .prepare(
            `UPDATE user_badges
                SET earned_at = ?, evidence_module_ids_json = ?, recorded_at = ?
              WHERE installation_id = ? AND user_id = ? AND badge_id = ?`,
          )
          .bind(
            earnedAt,
            JSON.stringify(evidence),
            recordedAt,
            this.installationId,
            input.survivorUserId,
            badgeId,
          ),
      );
    }
    statements.push(
      this.db
        .prepare(
          `INSERT INTO user_badges (
             installation_id, user_id, badge_id, name, description, earned_at,
             evidence_module_ids_json, recorded_at
           )
           SELECT s.installation_id, ?, s.badge_id, s.name, s.description,
                  s.earned_at, s.evidence_module_ids_json, s.recorded_at
             FROM user_badges s
            WHERE s.installation_id = ? AND s.user_id = ?
              AND NOT EXISTS (
                SELECT 1 FROM user_badges d
                 WHERE d.installation_id = s.installation_id
                   AND d.user_id = ? AND d.badge_id = s.badge_id
              )`,
        )
        .bind(
          input.survivorUserId,
          this.installationId,
          input.sourceUserId,
          input.survivorUserId,
        ),
      this.db
        .prepare(
          `DELETE FROM user_badges
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(this.installationId, input.sourceUserId),
    );
    const survivorImports = new Set(
      rows("progress_imports", input.survivorUserId).map((row) =>
        String(row.id),
      ),
    );
    for (const sourceImport of rows("progress_imports", input.sourceUserId)) {
      const id = String(sourceImport.id);
      if (!survivorImports.has(id)) continue;
      statements.push(
        this.db
          .prepare(
            `UPDATE progress_imports
                SET id = ?
              WHERE installation_id = ? AND user_id = ? AND id = ?`,
          )
          .bind(
            `${input.sourceUserId}:${id}`,
            this.installationId,
            input.sourceUserId,
            id,
          ),
      );
    }
    statements.push(
      this.db
        .prepare(
          `UPDATE progress_imports
              SET user_id = ?
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(
          input.survivorUserId,
          this.installationId,
          input.sourceUserId,
        ),
      this.db
        .prepare(
          `UPDATE consent_records
              SET user_id = ?
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(
          input.survivorUserId,
          this.installationId,
          input.sourceUserId,
        ),
      this.db
        .prepare(
          `UPDATE deletion_requests
              SET user_id = ?
            WHERE installation_id = ? AND user_id = ?`,
        )
        .bind(
          input.survivorUserId,
          this.installationId,
          input.sourceUserId,
        ),
    );
    return statements;
  }

  private async accountMergeHasPostCompletionChanges(
    survivorUserId: string,
    completedAt: string,
  ): Promise<boolean> {
    const checks = [
      ["users", "updated_at"],
      ["role_assignments", "assigned_at"],
      ["user_profiles", "updated_at"],
      ["learning_progress", "updated_at"],
      ["module_progress", "updated_at"],
      ["assessment_attempts", "recorded_at"],
      ["transcript_entries", "updated_at"],
      ["user_badges", "recorded_at"],
      ["progress_imports", "imported_at"],
      ["consent_records", "decided_at"],
      ["deletion_requests", "requested_at"],
      ["user_identities", "linked_at"],
    ] as const;
    for (const [tableName, timestampColumn] of checks) {
      const row = await this.db
        .prepare(
          `SELECT 1 AS changed
             FROM ${tableName}
            WHERE installation_id = ? AND ${
              tableName === "users" ? "id" : "user_id"
            } = ? AND ${timestampColumn} > ?
            LIMIT 1`,
        )
        .bind(this.installationId, survivorUserId, completedAt)
        .first<{ changed: number }>();
      if (row) return true;
    }
    const unlinkedIdentity = await this.db
      .prepare(
        `SELECT 1 AS changed
           FROM user_identities
          WHERE installation_id = ? AND user_id = ?
            AND unlinked_at > ?
          LIMIT 1`,
      )
      .bind(this.installationId, survivorUserId, completedAt)
      .first<{ changed: number }>();
    if (unlinkedIdentity) return true;
    return false;
  }

  private async loadStoredMergeSnapshot(
    mergeCase: AccountMergeCaseRow,
  ): Promise<MergeSnapshot> {
    const result = await this.db
      .prepare(
        `SELECT table_name, row_key, row_json, row_digest
           FROM account_merge_snapshot_rows
          WHERE merge_case_id = ?
          ORDER BY table_name, row_key`,
      )
      .bind(mergeCase.id)
      .all<AccountMergeSnapshotRow>();
    const entries: MergeSnapshotEntry[] = [];
    const recordCounts: Record<
      string,
      { source: number; survivor: number }
    > = {};
    for (const chunk of result.results) {
      if (
        !ACCOUNT_MERGE_SNAPSHOT_TABLES.includes(
          chunk.table_name as (typeof ACCOUNT_MERGE_SNAPSHOT_TABLES)[number],
        )
      ) {
        throw new ApiFailure(
          500,
          "account_merge_snapshot_invalid",
          "The account merge recovery snapshot contains an unsupported table.",
        );
      }
      const rows = parseJsonRecord<unknown>(chunk.row_json);
      if (!Array.isArray(rows)) {
        throw new ApiFailure(
          500,
          "account_merge_snapshot_invalid",
          "The account merge recovery snapshot is invalid.",
        );
      }
      const digests: string[] = [];
      for (const value of rows) {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new ApiFailure(
            500,
            "account_merge_snapshot_invalid",
            "The account merge recovery snapshot is invalid.",
          );
        }
        const row = value as Record<string, unknown>;
        const rowDigest = await sha256(canonicalJson(row));
        digests.push(rowDigest);
        entries.push({
          tableName: chunk.table_name,
          rowKey: mergeSnapshotRowKey(chunk.table_name, row),
          row,
          rowDigest,
        });
      }
      const chunkDigest = await sha256(canonicalJson(digests));
      if (chunkDigest !== chunk.row_digest) {
        throw new ApiFailure(
          500,
          "account_merge_snapshot_invalid",
          "The account merge recovery snapshot failed integrity validation.",
        );
      }
    }
    entries.sort((left, right) =>
      `${left.tableName}\u0000${left.rowKey}`.localeCompare(
        `${right.tableName}\u0000${right.rowKey}`,
      ),
    );
    for (const tableName of ACCOUNT_MERGE_SNAPSHOT_TABLES) {
      recordCounts[tableName] = { source: 0, survivor: 0 };
    }
    if (!mergeCase.source_user_id || !mergeCase.survivor_user_id) {
      throw new ApiFailure(
        410,
        "account_merge_personal_data_deleted",
        "The merge recovery data has been deleted.",
      );
    }
    for (const entry of entries) {
      const ownerId = mergeRowUserId(entry.tableName, entry.row);
      const counts = recordCounts[entry.tableName] ?? {
        source: 0,
        survivor: 0,
      };
      if (ownerId === mergeCase.source_user_id) counts.source += 1;
      if (ownerId === mergeCase.survivor_user_id) counts.survivor += 1;
      recordCounts[entry.tableName] = counts;
    }
    const digest = await sha256(
      canonicalJson(
        entries.map((entry) => ({
          tableName: entry.tableName,
          rowKey: entry.rowKey,
          rowDigest: entry.rowDigest,
        })),
      ),
    );
    if (digest !== mergeCase.snapshot_digest) {
      throw new ApiFailure(
        500,
        "account_merge_snapshot_invalid",
        "The account merge recovery snapshot failed integrity validation.",
      );
    }
    return { entries, digest, recordCounts };
  }

  private restoreSnapshotRowStatement(
    entry: MergeSnapshotEntry,
  ): D1PreparedStatement {
    const columns = Object.keys(entry.row);
    if (
      columns.length === 0 ||
      columns.some((column) => !/^[a-z][a-z0-9_]*$/.test(column))
    ) {
      throw new Error("Account merge snapshot has invalid columns.");
    }
    const values = columns.map((column) => {
      const value = entry.row[column];
      if (value instanceof Date) return value.toISOString();
      return value && typeof value === "object"
        ? JSON.stringify(value)
        : (value as null | string | number | boolean);
    });
    return this.db
      .prepare(
        `INSERT INTO ${entry.tableName} (${columns.join(", ")})
         VALUES (${columns.map(() => "?").join(", ")})`,
      )
      .bind(...values);
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

function canonicalJson(value: unknown): string {
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function parseJsonRecord<T>(value: unknown): T {
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function parseJsonArray(value: unknown): string[] {
  const parsed = parseJsonRecord<unknown>(value);
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === "string")
    : [];
}

function mergeRowUserId(
  tableName: string,
  row: Record<string, unknown>,
): string {
  return String(tableName === "users" ? row.id : row.user_id);
}

function mergeSnapshotRowKey(
  tableName: string,
  row: Record<string, unknown>,
): string {
  switch (tableName) {
    case "users":
    case "user_profiles":
    case "learning_progress":
      return mergeRowUserId(tableName, row);
    case "role_assignments":
      return `${row.user_id}:${row.role}`;
    case "user_identities":
    case "consent_records":
    case "deletion_requests":
      return String(row.id);
    case "module_progress":
      return `${row.user_id}:${row.path_id}:${row.module_id}:${row.content_version}`;
    case "assessment_attempts":
    case "progress_imports":
      return `${row.user_id}:${row.id}`;
    case "transcript_entries":
      return `${row.user_id}:${row.path_id}:${row.content_version}`;
    case "user_badges":
      return `${row.user_id}:${row.badge_id}`;
    default:
      throw new Error(`Unsupported account merge snapshot table: ${tableName}`);
  }
}

async function buildAccountMergeConflicts(
  snapshot: MergeSnapshot,
  sourceUserId: string,
  survivorUserId: string,
): Promise<AccountMergeConflict[]> {
  const source = snapshot.entries.find(
    (entry) => entry.tableName === "users" && entry.row.id === sourceUserId,
  )?.row;
  const survivor = snapshot.entries.find(
    (entry) => entry.tableName === "users" && entry.row.id === survivorUserId,
  )?.row;
  if (!source || !survivor) return [];
  const rowFor = (tableName: string, userId: string) =>
    snapshot.entries.find(
      (entry) =>
        entry.tableName === tableName &&
        mergeRowUserId(entry.tableName, entry.row) === userId,
    )?.row;
  const conflicts: AccountMergeConflict[] = [];
  const displayValue = (
    field: AccountMergeConflict["field"],
    value: unknown,
  ): string | boolean | null => {
    if (value === null || value === undefined || value === "") return null;
    if (field === "photo") return true;
    if (typeof value === "boolean") return value;
    return String(value);
  };
  const addValueConflict = (
    key: string,
    field: AccountMergeConflict["field"],
    sourceValue: unknown,
    survivorValue: unknown,
    description: string,
  ) => {
    const sourcePresent =
      sourceValue !== null && sourceValue !== undefined && sourceValue !== "";
    const survivorPresent =
      survivorValue !== null &&
      survivorValue !== undefined &&
      survivorValue !== "";
    if (
      sourcePresent &&
      survivorPresent &&
      canonicalJson(sourceValue) !== canonicalJson(survivorValue)
    ) {
      conflicts.push({
        key,
        field,
        sourcePresent,
        survivorPresent,
        sourceValue: displayValue(field, sourceValue),
        survivorValue: displayValue(field, survivorValue),
        required: true,
        description,
      });
    }
  };
  addValueConflict(
    "account.displayName",
    "displayName",
    source.display_name,
    survivor.display_name,
    "Choose the display name retained by the survivor account.",
  );
  addValueConflict(
    "account.primaryEmail",
    "primaryEmail",
    source.primary_email,
    survivor.primary_email,
    "Choose the verified primary email retained by the survivor account.",
  );
  const sourceProfile = rowFor("user_profiles", sourceUserId);
  const survivorProfile = rowFor("user_profiles", survivorUserId);
  for (const [key, field, column, description] of [
    [
      "profile.bio",
      "bio",
      "bio",
      "Choose the learner biography retained after merge.",
    ],
    [
      "profile.organization",
      "organization",
      "organization",
      "Choose the organization retained after merge.",
    ],
    [
      "profile.location",
      "location",
      "location",
      "Choose the profile location retained after merge.",
    ],
    [
      "profile.websiteUrl",
      "websiteUrl",
      "website_url",
      "Choose the profile website retained after merge.",
    ],
  ] as const) {
    addValueConflict(
      key,
      field,
      sourceProfile?.[column],
      survivorProfile?.[column],
      description,
    );
  }
  addValueConflict(
    "profile.photo",
    "photo",
    sourceProfile?.photo_object_key,
    survivorProfile?.photo_object_key,
    "Choose the private profile photo retained after merge.",
  );
  const hasRole = (userId: string, role: string) =>
    snapshot.entries.some(
      (entry) =>
        entry.tableName === "role_assignments" &&
        mergeRowUserId(entry.tableName, entry.row) === userId &&
        entry.row.role === role,
    );
  if (hasRole(sourceUserId, "owner") !== hasRole(survivorUserId, "owner")) {
    conflicts.push({
      key: "roles.owner",
      field: "ownerRole",
      sourcePresent: hasRole(sourceUserId, "owner"),
      survivorPresent: hasRole(survivorUserId, "owner"),
      sourceValue: hasRole(sourceUserId, "owner"),
      survivorValue: hasRole(survivorUserId, "owner"),
      required: true,
      description:
        "Choose which account's owner-role state survives; the last owner cannot be removed.",
    });
  }
  return conflicts.sort((left, right) => left.key.localeCompare(right.key));
}

function parseMergePreviewRecord(
  value: AccountMergeCaseRow["preview_json"],
): {
  conflicts: AccountMergeConflict[];
  recordCounts: Record<string, { source: number; survivor: number }>;
  proofMethods: {
    source: AccountMergeProofMethod;
    survivor: AccountMergeProofMethod;
  };
} {
  const parsed =
    typeof value === "string"
      ? (JSON.parse(value) as Record<string, unknown>)
      : (value as Record<string, unknown>);
  if (
    !Array.isArray(parsed.conflicts) ||
    !parsed.recordCounts ||
    typeof parsed.recordCounts !== "object" ||
    !parsed.proofMethods ||
    typeof parsed.proofMethods !== "object"
  ) {
    throw new Error("Stored account merge preview is invalid.");
  }
  return parsed as {
    conflicts: AccountMergeConflict[];
    recordCounts: Record<string, { source: number; survivor: number }>;
    proofMethods: {
      source: AccountMergeProofMethod;
      survivor: AccountMergeProofMethod;
    };
  };
}

function validateMergeResolutions(
  conflicts: AccountMergeConflict[],
  resolutions: Record<string, AccountMergeResolutionChoice>,
): void {
  if (
    !resolutions ||
    typeof resolutions !== "object" ||
    Array.isArray(resolutions)
  ) {
    throw new ApiFailure(
      400,
      "invalid_merge_resolutions",
      "Merge resolutions must be a JSON object.",
    );
  }
  const conflictKeys = new Set(conflicts.map((conflict) => conflict.key));
  for (const conflict of conflicts) {
    if (!["source", "survivor"].includes(resolutions[conflict.key] ?? "")) {
      throw new ApiFailure(
        400,
        "merge_resolution_required",
        `Choose source or survivor for ${conflict.key}.`,
      );
    }
  }
  const unknown = Object.keys(resolutions).find((key) => !conflictKeys.has(key));
  if (unknown) {
    throw new ApiFailure(
      400,
      "invalid_merge_resolution",
      `Unknown merge conflict resolution: ${unknown}.`,
    );
  }
}

function selectMergeValue(
  conflictKey: string,
  sourceValue: unknown,
  survivorValue: unknown,
  resolutions: Record<string, AccountMergeResolutionChoice>,
): unknown {
  const sourcePresent =
    sourceValue !== null && sourceValue !== undefined && sourceValue !== "";
  const survivorPresent =
    survivorValue !== null &&
    survivorValue !== undefined &&
    survivorValue !== "";
  if (!sourcePresent) return survivorValue ?? null;
  if (!survivorPresent) return sourceValue;
  if (canonicalJson(sourceValue) === canonicalJson(survivorValue)) {
    return survivorValue;
  }
  return resolutions[conflictKey] === "source" ? sourceValue : survivorValue;
}

async function chunkMergeSnapshot(
  entries: MergeSnapshotEntry[],
): Promise<Array<{
  tableName: string;
  rowKey: string;
  rows: Record<string, unknown>[];
  rowDigest: string;
}>> {
  const result: Array<{
    tableName: string;
    rowKey: string;
    rows: Record<string, unknown>[];
    rowDigest: string;
  }> = [];
  const byTable = new Map<string, MergeSnapshotEntry[]>();
  for (const entry of entries) {
    const tableEntries = byTable.get(entry.tableName) ?? [];
    tableEntries.push(entry);
    byTable.set(entry.tableName, tableEntries);
  }
  for (const [tableName, tableEntries] of byTable) {
    for (let index = 0; index < tableEntries.length; index += 100) {
      const rows = tableEntries
        .slice(index, index + 100)
        .map((entry) => entry.row);
      const rowKey = String(index / 100).padStart(6, "0");
      result.push({
        tableName,
        rowKey,
        rows,
        rowDigest: await sha256(
          canonicalJson(
            tableEntries
              .slice(index, index + 100)
              .map((entry) => entry.rowDigest),
          ),
        ),
      });
    }
  }
  return result;
}

function mapAccount(row: AccountRow): Account {
  return {
    id: row.id,
    installationId: row.installation_id,
    identity: {
      provider: row.provider,
      issuer: row.issuer,
      subject: row.subject,
    },
    displayName: row.display_name,
    primaryEmail: row.primary_email,
    emailVerified: row.email_verified === 1,
    state: row.account_state,
    roles: (row.roles?.split(",").filter(Boolean) ?? []) as Project42Role[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapLinkedIdentity(
  row: LinkedIdentityRow,
  activeCount: number,
): LinkedIdentity {
  return {
    id: row.id,
    provider: row.provider,
    providerLogin: row.provider_login,
    displayName: row.display_name,
    status: row.status,
    primary: row.is_primary === 1,
    linkedAt: row.linked_at,
    lastVerifiedAt: row.last_verified_at,
    lastSeenAt: row.last_seen_at,
    unlinkedAt: row.unlinked_at,
    canUnlink:
      row.status === "active" &&
      row.is_primary !== 1 &&
      row.merge_source !== 1 &&
      activeCount > 1,
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

function mapProfile(row: ProfileRow, fallbackTimestamp: string): LearnerProfile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    bio: row.bio,
    organization: row.organization,
    location: row.location,
    websiteUrl: row.website_url,
    photoAvailable: Boolean(row.photo_object_key),
    photoUpdatedAt: row.photo_updated_at,
    createdAt: row.created_at || fallbackTimestamp,
    updatedAt: row.updated_at || fallbackTimestamp,
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

function progressEnvelopeFromProjection(
  projection: LearningProjection,
  events: LearningEvent[],
  displayName: string,
): ProgressEnvelope {
  const progress = projection.progressSnapshot
    ? structuredClone(projection.progressSnapshot)
    : createEmptyProgress(displayName);
  const afterSnapshot = events.filter(
    (event) => event.sequence > projection.progressSnapshotSequence,
  );
  progress.startedPathIds = [
    ...new Set([
      ...progress.startedPathIds,
      ...projection.enrollments.map((enrollment) => enrollment.pathId),
    ]),
  ];
  progress.completedModuleIds = [
    ...new Set([
      ...progress.completedModuleIds,
      ...projection.modules
        .filter((module) => module.status === "completed")
        .map((module) => module.moduleId),
    ]),
  ];
  const attempts = new Map(
    progress.attempts.map((attempt) => [attempt.id, attempt]),
  );
  for (const attempt of projection.attempts) {
    attempts.set(attempt.attemptId, {
      id: attempt.attemptId,
      pathId: attempt.pathId,
      moduleId: attempt.moduleId,
      contentVersion: attempt.contentVersion,
      scorePercent: attempt.effectiveScorePercent,
      passed: attempt.effectivePassed,
      completedAt: attempt.completedAt,
    });
  }
  progress.attempts = [...attempts.values()].sort((left, right) =>
    left.completedAt.localeCompare(right.completedAt),
  );
  const badges = new Map(
    progress.badges.map((badge) => [badge.id, badge]),
  );
  for (const badge of projection.badges) {
    badges.set(badge.id, {
      id: badge.id,
      name: badge.name,
      description: badge.description,
      earnedAt: badge.earnedAt,
      evidenceModuleIds: [...badge.evidenceModuleIds],
    });
  }
  progress.badges = [...badges.values()].sort((left, right) =>
    left.earnedAt.localeCompare(right.earnedAt),
  );
  const latestVisit = afterSnapshot
    .filter(
      (
        event,
      ): event is Extract<LearningEvent, { type: "module.visited" }> =>
        event.type === "module.visited",
    )
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
  if (latestVisit) {
    progress.recentModule = {
      pathId: latestVisit.payload.pathId,
      moduleId: latestVisit.payload.moduleId,
      visitedAt: latestVisit.occurredAt,
    };
  }
  const latestChange = afterSnapshot
    .map((event) => event.occurredAt)
    .sort()
    .at(-1);
  if (latestChange && latestChange.localeCompare(progress.updatedAt) > 0) {
    progress.updatedAt = latestChange;
  }
  return {
    revision: projection.revision,
    progress,
    synchronizedAt:
      projection.progressSynchronizedAt ??
      events.at(-1)?.recordedAt ??
      new Date(0).toISOString(),
  };
}

function validUtcTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
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

function supportsTransactionalPostcondition(
  database: D1Database,
): database is D1Database & TransactionalPostconditionDatabase {
  return (
    "batchWithPostcondition" in database &&
    typeof database.batchWithPostcondition === "function"
  );
}

function addSeconds(value: string, seconds: number): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !Number.isSafeInteger(seconds) || seconds < 0) {
    throw new Error("Session timestamp or lifetime is invalid.");
  }
  return new Date(parsed + seconds * 1000).toISOString();
}

function subtractSeconds(value: string, seconds: number): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || !Number.isSafeInteger(seconds) || seconds < 0) {
    throw new Error("Session timestamp or lifetime is invalid.");
  }
  return new Date(parsed - seconds * 1000).toISOString();
}

function secondsUntil(now: string, future: string): number {
  const seconds = Math.floor((Date.parse(future) - Date.parse(now)) / 1000);
  if (!Number.isSafeInteger(seconds) || seconds < 1) {
    throw new ApiFailure(
      401,
      "session_expired",
      "Your session has expired. Sign in again.",
    );
  }
  return seconds;
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const binary = String.fromCharCode(...new Uint8Array(digest));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function readProviderJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // The caller maps malformed provider responses to a bounded upstream failure.
  }
  throw new ApiFailure(
    502,
    "identity_provider_response_invalid",
    "The external identity provider returned an invalid response.",
  );
}

function requireGithubLinkConfiguration(env: WorkerEnvironment): {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
} {
  const clientId = env.GITHUB_LINK_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GITHUB_LINK_CLIENT_SECRET?.trim() ?? "";
  const redirectUri = env.GITHUB_LINK_REDIRECT_URI?.trim() ?? "";
  if (
    !/^[A-Za-z0-9._-]{10,255}$/.test(clientId) ||
    clientSecret.length < 20 ||
    clientSecret.length > 500
  ) {
    throw new ApiFailure(
      503,
      "github_link_not_configured",
      "GitHub account linking is not configured for this installation.",
    );
  }
  let redirect: URL;
  try {
    redirect = new URL(redirectUri);
  } catch {
    throw new ApiFailure(
      503,
      "github_link_not_configured",
      "GitHub account linking is not configured for this installation.",
    );
  }
  const localHttp =
    redirect.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(redirect.hostname);
  const allowedOrigins = env.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    (redirect.protocol !== "https:" && !localHttp) ||
    redirect.username ||
    redirect.password ||
    redirect.hash ||
    !allowedOrigins.includes(redirect.origin)
  ) {
    throw new ApiFailure(
      503,
      "github_link_not_configured",
      "GitHub account linking is not configured for this installation.",
    );
  }
  return { clientId, clientSecret, redirectUri: redirect.toString() };
}

function normalizePkceCodeVerifier(value: string): string {
  const codeVerifier = value.trim();
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(codeVerifier)) {
    throw new ApiFailure(
      400,
      "invalid_code_verifier",
      "The PKCE code verifier must use 43–128 base64url characters.",
    );
  }
  return codeVerifier;
}

function normalizeProviderId(value: string): string {
  const provider = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/.test(provider)) {
    throw new ApiFailure(
      400,
      "invalid_identity_provider",
      "Identity provider IDs use 1–50 lowercase letters, numbers, or internal hyphens.",
    );
  }
  return provider;
}

function normalizeIdentityLinkRequest(
  value: unknown,
): CreateIdentityLinkTransactionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiFailure(
      400,
      "invalid_identity_link_request",
      "Identity-link settings must be a JSON object.",
    );
  }
  const record = value as Record<string, unknown>;
  const allowed = [
    "provider",
    "codeChallenge",
    "codeChallengeMethod",
    "returnPath",
  ];
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ApiFailure(
      400,
      "invalid_identity_link_request",
      `Unknown identity-link field: ${unknown[0]}.`,
    );
  }
  if (
    typeof record.provider !== "string" ||
    typeof record.codeChallenge !== "string" ||
    record.codeChallengeMethod !== "S256" ||
    typeof record.returnPath !== "string"
  ) {
    throw new ApiFailure(
      400,
      "invalid_identity_link_request",
      "Provider, S256 code challenge, and return path are required.",
    );
  }
  const codeChallenge = record.codeChallenge.trim();
  if (!/^[A-Za-z0-9_-]{43}$/.test(codeChallenge)) {
    throw new ApiFailure(
      400,
      "invalid_code_challenge",
      "The S256 PKCE code challenge must use 43 base64url characters.",
    );
  }
  const returnPath = record.returnPath.trim();
  if (
    !returnPath.startsWith("/") ||
    returnPath.startsWith("//") ||
    returnPath.includes("\\") ||
    returnPath.length > 512 ||
    /[\u0000-\u001f\u007f]/.test(returnPath)
  ) {
    throw new ApiFailure(
      400,
      "invalid_return_path",
      "The return path must be a local absolute path.",
    );
  }
  return {
    provider: normalizeProviderId(record.provider),
    codeChallenge,
    codeChallengeMethod: "S256",
    returnPath,
  };
}

function normalizeGithubLinkStartRequest(
  value: unknown,
): GithubIdentityLinkStartRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiFailure(
      400,
      "invalid_identity_link_request",
      "GitHub identity-link settings must be a JSON object.",
    );
  }
  const record = value as Record<string, unknown>;
  const allowed = ["codeChallenge", "codeChallengeMethod", "returnPath"];
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ApiFailure(
      400,
      "invalid_identity_link_request",
      `Unknown GitHub identity-link field: ${unknown[0]}.`,
    );
  }
  const normalized = normalizeIdentityLinkRequest({
    provider: "github",
    ...record,
  });
  return {
    codeChallenge: normalized.codeChallenge,
    codeChallengeMethod: normalized.codeChallengeMethod,
    returnPath: normalized.returnPath,
  };
}

function normalizeGithubLinkCompletionRequest(
  value: unknown,
): GithubIdentityLinkCompletionRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiFailure(
      400,
      "invalid_identity_link_completion",
      "GitHub identity-link completion must be a JSON object.",
    );
  }
  const record = value as Record<string, unknown>;
  const allowed = ["transactionId", "state", "code", "codeVerifier"];
  const unknown = Object.keys(record).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new ApiFailure(
      400,
      "invalid_identity_link_completion",
      `Unknown GitHub identity-link completion field: ${unknown[0]}.`,
    );
  }
  if (
    typeof record.transactionId !== "string" ||
    typeof record.state !== "string" ||
    typeof record.code !== "string" ||
    typeof record.codeVerifier !== "string"
  ) {
    throw new ApiFailure(
      400,
      "invalid_identity_link_completion",
      "Transaction, state, authorization code, and PKCE verifier are required.",
    );
  }
  const transactionId = record.transactionId.trim();
  const state = record.state.trim();
  const code = record.code.trim();
  if (
    !/^[0-9a-f-]{36}$/i.test(transactionId) ||
    state.length < 32 ||
    state.length > 200 ||
    code.length < 1 ||
    code.length > 2_048 ||
    /[\u0000-\u001f\u007f]/.test(state) ||
    /[\u0000-\u001f\u007f]/.test(code)
  ) {
    throw new ApiFailure(
      400,
      "invalid_identity_link_completion",
      "GitHub identity-link completion values are invalid.",
    );
  }
  return {
    transactionId,
    state,
    code,
    codeVerifier: normalizePkceCodeVerifier(record.codeVerifier),
  };
}

function normalizeOwnerRecoveryProofRequest(
  value: unknown,
): OwnerRecoveryProofRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiFailure(
      400,
      "invalid_owner_recovery_proof",
      "Owner recovery evidence must be a JSON object.",
    );
  }
  const record = value as Record<string, unknown>;
  const allowed = ["userId", "methods", "referenceId", "summary"];
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) {
    throw new ApiFailure(
      400,
      "invalid_owner_recovery_proof",
      `Unknown owner recovery field: ${unknown}.`,
    );
  }
  const methodsAllowed = new Set([
    "identity-provider-recovery",
    "support-video-verification",
    "signed-owner-attestation",
    "legacy-account-evidence",
  ]);
  const methods = Array.isArray(record.methods)
    ? record.methods.filter(
        (method): method is OwnerRecoveryProofRequest["methods"][number] =>
          typeof method === "string" && methodsAllowed.has(method),
      )
    : [];
  if (
    typeof record.userId !== "string" ||
    !isUuid(record.userId) ||
    !Array.isArray(record.methods) ||
    methods.length !== record.methods.length ||
    new Set(methods).size < 2 ||
    typeof record.referenceId !== "string" ||
    record.referenceId.trim().length < 8 ||
    record.referenceId.length > 200 ||
    typeof record.summary !== "string" ||
    record.summary.trim().length < 20 ||
    record.summary.length > 500
  ) {
    throw new ApiFailure(
      400,
      "invalid_owner_recovery_proof",
      "Owner recovery requires an account, two independent non-email methods, a reference, and a substantive summary.",
    );
  }
  return {
    userId: record.userId,
    methods: [...new Set(methods)],
    referenceId: record.referenceId.trim(),
    summary: record.summary.trim(),
  };
}

function normalizeAccountMergePreviewRequest(
  value: unknown,
): AccountMergePreviewRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiFailure(
      400,
      "invalid_account_merge_preview",
      "Account merge preview settings must be a JSON object.",
    );
  }
  const record = value as Record<string, unknown>;
  const allowed = [
    "sourceUserId",
    "survivorUserId",
    "sourceProofToken",
    "survivorProofToken",
    "idempotencyKey",
  ];
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown) {
    throw new ApiFailure(
      400,
      "invalid_account_merge_preview",
      `Unknown account merge preview field: ${unknown}.`,
    );
  }
  if (
    typeof record.sourceUserId !== "string" ||
    !isUuid(record.sourceUserId) ||
    typeof record.survivorUserId !== "string" ||
    !isUuid(record.survivorUserId) ||
    typeof record.sourceProofToken !== "string" ||
    !isMergeProofToken(record.sourceProofToken) ||
    typeof record.survivorProofToken !== "string" ||
    !isMergeProofToken(record.survivorProofToken) ||
    typeof record.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(record.idempotencyKey)
  ) {
    throw new ApiFailure(
      400,
      "invalid_account_merge_preview",
      "Two account IDs, two one-time proofs, and a 16–128 character idempotency key are required.",
    );
  }
  return {
    sourceUserId: record.sourceUserId,
    survivorUserId: record.survivorUserId,
    sourceProofToken: record.sourceProofToken,
    survivorProofToken: record.survivorProofToken,
    idempotencyKey: record.idempotencyKey,
  };
}

function normalizeCompleteAccountMergeRequest(
  value: unknown,
): CompleteAccountMergeRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiFailure(
      400,
      "invalid_account_merge_completion",
      "Account merge completion must be a JSON object.",
    );
  }
  const record = value as Record<string, unknown>;
  const allowed = ["confirmation", "idempotencyKey", "resolutions"];
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (
    unknown ||
    typeof record.confirmation !== "string" ||
    record.confirmation.length > 200 ||
    typeof record.idempotencyKey !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/.test(record.idempotencyKey) ||
    !record.resolutions ||
    typeof record.resolutions !== "object" ||
    Array.isArray(record.resolutions)
  ) {
    throw new ApiFailure(
      400,
      "invalid_account_merge_completion",
      "Exact confirmation, idempotency key, and conflict resolutions are required.",
    );
  }
  const resolutions = record.resolutions as Record<string, unknown>;
  if (
    Object.values(resolutions).some(
      (choice) => choice !== "source" && choice !== "survivor",
    )
  ) {
    throw new ApiFailure(
      400,
      "invalid_merge_resolution",
      "Every merge resolution must choose source or survivor.",
    );
  }
  return {
    confirmation: record.confirmation,
    idempotencyKey: record.idempotencyKey,
    resolutions: resolutions as Record<string, AccountMergeResolutionChoice>,
  };
}

function normalizeRollbackAccountMergeRequest(
  value: unknown,
): RollbackAccountMergeRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiFailure(
      400,
      "invalid_account_merge_rollback",
      "Account merge rollback must be a JSON object.",
    );
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).some(
      (key) => !["confirmation", "reason"].includes(key),
    ) ||
    typeof record.confirmation !== "string" ||
    record.confirmation.length > 200 ||
    typeof record.reason !== "string" ||
    record.reason.trim().length < 10 ||
    record.reason.length > 500
  ) {
    throw new ApiFailure(
      400,
      "invalid_account_merge_rollback",
      "Exact rollback confirmation and a 10–500 character reason are required.",
    );
  }
  return {
    confirmation: record.confirmation,
    reason: record.reason.trim(),
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function isMergeProofToken(value: string): boolean {
  return /^[0-9a-f-]{36}\.[0-9a-f-]{36}$/i.test(value);
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

function requireProfileAccess(account: Account): void {
  if (account.state === "suspended" || account.state === "revoked") {
    throw new ApiFailure(
      403,
      `account_${account.state}`,
      `This account is ${account.state} and cannot change its profile.`,
    );
  }
}

async function requireOwner(
  account: Account,
  repository: D1Project42Repository,
  request: Request,
  requestId: string,
  now: string,
): Promise<void> {
  if (!isOwner(account)) {
    await repository.recordOwnerAuthorizationDenied({
      account,
      method: request.method,
      path: new URL(request.url).pathname,
      requestId,
      now,
    });
    throw new ApiFailure(403, "owner_required", "An approved owner account is required.");
  }
}

function requireRecentAuthentication(identity: VerifiedIdentity, now: string): void {
  const authenticatedAt = identity.authenticatedAt;
  const nowSeconds = Math.floor(Date.parse(now) / 1_000);
  if (
    typeof authenticatedAt !== "number" ||
    !Number.isFinite(authenticatedAt) ||
    authenticatedAt > nowSeconds + 60 ||
    nowSeconds - authenticatedAt > 15 * 60
  ) {
    throw new ApiFailure(
      401,
      "recent_authentication_required",
      "Sign in again before exporting or deleting account data.",
    );
  }
}

function requireCookieMutationOrigin(origin: string | null): void {
  if (!origin) {
    throw new ApiFailure(
      403,
      "origin_required",
      "Browser session changes require an approved Origin header.",
    );
  }
}

function requireDomainApprovalEnabled(env: WorkerEnvironment): void {
  if (env.DOMAIN_APPROVAL_ENABLED !== "true") {
    throw new ApiFailure(
      409,
      "domain_approval_not_enabled",
      "Exact-domain automatic approval is unavailable until the deployment validates its verified-email token contract.",
    );
  }
}

function normalizeProfileRequest(
  value: unknown,
): {
  request: UpdateLearnerProfileRequest;
  fields: Array<keyof UpdateLearnerProfileRequest>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiFailure(400, "invalid_profile", "Profile changes must be a JSON object.");
  }
  const record = value as Record<string, unknown>;
  const allowed = [
    "displayName",
    "bio",
    "organization",
    "location",
    "websiteUrl",
  ] as const;
  const unknown = Object.keys(record).filter(
    (key) => !allowed.includes(key as (typeof allowed)[number]),
  );
  if (unknown.length > 0) {
    throw new ApiFailure(
      400,
      "invalid_profile_field",
      `Unknown profile field: ${unknown[0]}.`,
    );
  }
  const fields = allowed.filter((field) => field in record);
  if (fields.length === 0) {
    throw new ApiFailure(400, "empty_profile_update", "At least one profile field is required.");
  }
  const limits: Record<(typeof allowed)[number], number> = {
    displayName: 80,
    bio: 500,
    organization: 120,
    location: 120,
    websiteUrl: 2_048,
  };
  const request: UpdateLearnerProfileRequest = {};
  for (const field of fields) {
    const raw = record[field];
    if (raw !== null && typeof raw !== "string") {
      throw new ApiFailure(
        400,
        "invalid_profile_field",
        `${field} must be text or null.`,
      );
    }
    const normalized = typeof raw === "string" ? raw.trim() || null : null;
    if (normalized && normalized.length > limits[field]) {
      throw new ApiFailure(
        400,
        "profile_field_too_long",
        `${field} exceeds its ${limits[field]} character limit.`,
      );
    }
    if (
      normalized &&
      field !== "bio" &&
      /[\u0000-\u001f\u007f]/.test(normalized)
    ) {
      throw new ApiFailure(
        400,
        "invalid_profile_field",
        `${field} contains unsupported control characters.`,
      );
    }
    request[field] = normalized;
  }
  if (request.websiteUrl) {
    let website: URL;
    try {
      website = new URL(request.websiteUrl);
    } catch {
      throw new ApiFailure(
        400,
        "invalid_website_url",
        "Website URL must be a valid HTTPS URL.",
      );
    }
    if (website.protocol !== "https:" || website.username || website.password) {
      throw new ApiFailure(
        400,
        "invalid_website_url",
        "Website URL must use HTTPS and cannot contain credentials.",
      );
    }
    request.websiteUrl = website.toString();
  }
  return { request, fields: [...fields] };
}

async function readProfilePhoto(request: Request): Promise<{
  bytes: ArrayBuffer;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
}> {
  const maximumBytes = 2 * 1024 * 1024;
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ApiFailure(
      413,
      "profile_photo_too_large",
      "Profile photos must be 2 MB or smaller.",
    );
  }
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType ?? "")) {
    throw new ApiFailure(
      415,
      "unsupported_profile_photo",
      "Profile photos must be JPEG, PNG, or WebP.",
    );
  }
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength < 12 || bytes.byteLength > maximumBytes) {
    throw new ApiFailure(
      bytes.byteLength > maximumBytes ? 413 : 400,
      bytes.byteLength > maximumBytes
        ? "profile_photo_too_large"
        : "invalid_profile_photo",
      bytes.byteLength > maximumBytes
        ? "Profile photos must be 2 MB or smaller."
        : "Profile photo data is incomplete.",
    );
  }
  const value = new Uint8Array(bytes);
  const isJpeg = value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff;
  const isPng =
    value[0] === 0x89 &&
    value[1] === 0x50 &&
    value[2] === 0x4e &&
    value[3] === 0x47 &&
    value[4] === 0x0d &&
    value[5] === 0x0a &&
    value[6] === 0x1a &&
    value[7] === 0x0a;
  const isWebp =
    value[0] === 0x52 &&
    value[1] === 0x49 &&
    value[2] === 0x46 &&
    value[3] === 0x46 &&
    value[8] === 0x57 &&
    value[9] === 0x45 &&
    value[10] === 0x42 &&
    value[11] === 0x50;
  const signatureMatches =
    (contentType === "image/jpeg" && isJpeg) ||
    (contentType === "image/png" && isPng) ||
    (contentType === "image/webp" && isWebp);
  if (!signatureMatches) {
    throw new ApiFailure(
      400,
      "profile_photo_signature_mismatch",
      "Profile photo data does not match its declared image type.",
    );
  }
  return {
    bytes,
    contentType: contentType as "image/jpeg" | "image/png" | "image/webp",
    extension:
      contentType === "image/jpeg"
        ? "jpg"
        : contentType === "image/png"
          ? "png"
          : "webp",
  };
}

function requireProfilePhotoStorage(env: WorkerEnvironment): R2Bucket {
  if (!env.PROFILE_PHOTOS) {
    throw new ApiFailure(
      503,
      "profile_photo_storage_unavailable",
      "Profile photo storage is not configured for this deployment.",
    );
  }
  return env.PROFILE_PHOTOS;
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
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
  }
  const responseBody = status === 204 || status === 304 ? null : JSON.stringify(body);
  return new Response(responseBody, { status, headers });
}

function redirect(
  location: string,
  cookies: string[],
  requestId: string,
  origin: string | null,
): Response {
  const headers = new Headers({
    location,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-request-id": requestId,
  });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
  }
  return new Response(null, { status: 302, headers });
}

function profilePhotoResponse(
  object: R2ObjectBody,
  metadata: ProfilePhotoMetadata,
  requestId: string,
  origin: string | null,
): Response {
  const headers = new Headers({
    "content-type": metadata.contentType,
    "content-length": String(metadata.byteLength),
    "cache-control": "private, no-store",
    etag: metadata.etag,
    "last-modified": new Date(metadata.updatedAt).toUTCString(),
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; sandbox",
    "referrer-policy": "no-referrer",
    "x-request-id": requestId,
  });
  if (origin) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
    headers.set("vary", "Origin");
  }
  return new Response(object.body, { status: 200, headers });
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
  githubLinkAdapter: GithubIdentityLinkAdapter = new GithubIdentityLinkAdapter(env),
  learningRecordConfigurationOverride?: LearningRecordAdapterConfiguration,
  browserOidcAdapter: BrowserOidcAdapter = new BrowserOidcAdapter(env),
  authAbuseLimiter: AuthAbuseLimiter = new CloudflareAuthAbuseLimiter({
    ...(env.AUTH_CLIENT_RATE_LIMITER
      ? { perClient: env.AUTH_CLIENT_RATE_LIMITER }
      : {}),
    ...(env.AUTH_INSTALLATION_RATE_LIMITER
      ? { perInstallation: env.AUTH_INSTALLATION_RATE_LIMITER }
      : {}),
  }),
  authClientAddressResolver: (request: Request) => string =
    readCloudflareClientAddress,
): Promise<Response> {
  const requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
  let origin: string | null = null;
  try {
    const learningRecordConfiguration =
      learningRecordConfigurationOverride ??
      readLearningRecordAdapterConfiguration(env, "cloudflare-worker");
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
      return json(
        {
          status: "ok",
          learningRecords: {
            adapter: learningRecordConfiguration.adapter,
            contractVersion: learningRecordConfiguration.contractVersion,
            semanticFingerprint: learningRecordConfiguration.semanticFingerprint,
          },
        },
        200,
        requestId,
        origin,
      );
    }

    if (
      request.method === "GET" &&
      (url.pathname === "/v1/auth/start" ||
        url.pathname === "/v1/auth/callback")
    ) {
      await enforceAuthAbuseLimit(
        request,
        env,
        url.pathname === "/v1/auth/start" ? "start" : "callback",
        authAbuseLimiter,
        authClientAddressResolver,
      );
    }

    const now = new Date().toISOString();
    const configuredLearningRecords = !repositoryOverride
      ? configureLearningRecordAdapter(
        env.PROJECT42_DB as unknown as LearningEventDatabase,
        learningRecordConfiguration,
      )
      : null;
    const repository =
      repositoryOverride ??
      new D1Project42Repository(
        env.PROJECT42_DB,
        env.INSTALLATION_ID,
        configuredLearningRecords!.store,
      );
    await repository.ensureInstallation(now);
    if (request.method === "GET" && url.pathname === "/v1/auth/start") {
      const transaction: BrowserOidcTransaction = {
        id: crypto.randomUUID(),
        state: randomBase64Url(),
        nonce: randomBase64Url(),
        codeVerifier: randomBase64Url(48),
        returnTo: normalizeReturnTarget(
          url.searchParams.get("return_to"),
          env.ALLOWED_ORIGINS,
        ),
        expiresAt: addSeconds(now, 10 * 60),
      };
      await repository.createOidcAuthorizationTransaction({
        transaction,
        stateDigest: await sha256(transaction.state),
        nonceDigest: await sha256(transaction.nonce),
        requestId,
        now,
      });
      const authorization =
        await browserOidcAdapter.createAuthorization(transaction);
      return redirect(
        authorization.location,
        [authorization.cookie],
        requestId,
        origin,
      );
    }

    if (request.method === "GET" && url.pathname === "/v1/auth/callback") {
      const transaction = await browserOidcAdapter.readTransaction(request);
      const state = url.searchParams.get("state");
      if (!state || state !== transaction.state) {
        throw new ApiFailure(
          400,
          "authorization_state_mismatch",
          "The sign-in response could not be verified. Start sign-in again.",
        );
      }
      await repository.consumeOidcAuthorizationTransaction({
        transactionId: transaction.id,
        stateDigest: await sha256(state),
        nonceDigest: await sha256(transaction.nonce),
        now,
      });
      const returnTarget = new URL(transaction.returnTo);
      const providerError = url.searchParams.get("error");
      if (providerError) {
        returnTarget.searchParams.set("auth", "error");
        return redirect(
          returnTarget.toString(),
          [clearHostCookie(OIDC_TRANSACTION_COOKIE)],
          requestId,
          origin,
        );
      }
      const code = url.searchParams.get("code");
      if (!code || code.length > 4096) {
        throw new ApiFailure(
          400,
          "authorization_code_missing",
          "The sign-in response is incomplete. Start sign-in again.",
        );
      }
      const exchanged = await browserOidcAdapter.exchange(code, transaction);
      const tokenVerifier = verifier as IdentityVerifier & {
        verifyToken?: (
          token: string,
          options?: {
            audience?: string;
            nonce?: string;
            requireAuthenticationTime?: boolean;
          },
        ) => Promise<VerifiedIdentity>;
      };
      if (!tokenVerifier.verifyToken) {
        throw new ApiFailure(
          503,
          "identity_token_verifier_unavailable",
          "Secure sign-in is temporarily unavailable.",
        );
      }
      const identity = await tokenVerifier.verifyToken(exchanged.idToken, {
        audience: exchanged.clientId,
        nonce: transaction.nonce,
        requireAuthenticationTime: true,
      });
      const ownerBootstrap =
        Boolean(env.BOOTSTRAP_OWNER_ISSUER && env.BOOTSTRAP_OWNER_SUBJECT) &&
        identity.issuer === env.BOOTSTRAP_OWNER_ISSUER &&
        identity.subject === env.BOOTSTRAP_OWNER_SUBJECT;
      const account = await repository.createOrRefreshAccount(
        identity,
        ownerBootstrap,
        requestId,
        now,
      );
      const sessionToken = randomBase64Url(48);
      const priorSessionToken = readCookie(request, BROWSER_SESSION_COOKIE);
      const priorSession = priorSessionToken
        ? await repository.resolveBrowserSession(
            await sha256(priorSessionToken),
            now,
          )
        : null;
      const session = await repository.createBrowserSession({
        account,
        identity,
        tokenDigest: await sha256(sessionToken),
        requestId,
        now,
        priorSession,
      });
      returnTarget.searchParams.set("auth", "success");
      return redirect(
        returnTarget.toString(),
        [
          createHostCookie(
            BROWSER_SESSION_COOKIE,
            sessionToken,
            secondsUntil(now, session.expiresAt),
          ),
          clearHostCookie(OIDC_TRANSACTION_COOKIE),
        ],
        requestId,
        origin,
      );
    }

    let browserSession: ResolvedBrowserSession | null = null;
    let identity: VerifiedIdentity;
    const sessionToken = readCookie(request, BROWSER_SESSION_COOKIE);
    if (sessionToken) {
      browserSession = await repository.resolveBrowserSession(
        await sha256(sessionToken),
        now,
      );
      if (!browserSession) {
        if (request.method === "POST" && url.pathname === "/v1/auth/signout") {
          requireCookieMutationOrigin(origin);
          const returnTo = normalizeReturnTarget(
            url.searchParams.get("return_to"),
            env.ALLOWED_ORIGINS,
          );
          const response = json(
            {
              signedOut: true,
              logoutUrl: await browserOidcAdapter.createLogoutUrl(returnTo),
            },
            200,
            requestId,
            origin,
          );
          response.headers.append(
            "set-cookie",
            clearHostCookie(BROWSER_SESSION_COOKIE),
          );
          return response;
        }
        throw new ApiFailure(
          401,
          "session_expired",
          "Your session has expired. Sign in again.",
        );
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
        requireCookieMutationOrigin(origin);
      }
      identity = browserSession.identity;
    } else {
      identity = await verifier.verify(request);
    }
    const ownerBootstrap =
      Boolean(env.BOOTSTRAP_OWNER_ISSUER && env.BOOTSTRAP_OWNER_SUBJECT) &&
      identity.issuer === env.BOOTSTRAP_OWNER_ISSUER &&
      identity.subject === env.BOOTSTRAP_OWNER_SUBJECT;

    if (request.method === "POST" && url.pathname === "/v1/session") {
      if (browserSession) {
        throw new ApiFailure(
          400,
          "bearer_session_endpoint_required",
          "Use the browser session endpoints for an HttpOnly browser session.",
        );
      }
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
    if (request.method === "GET" && url.pathname === "/v1/auth/session") {
      return json(
        {
          account,
          session: browserSession
            ? {
                expiresAt: browserSession.expiresAt,
                absoluteExpiresAt: browserSession.absoluteExpiresAt,
              }
            : null,
        },
        200,
        requestId,
        origin,
      );
    }
    if (request.method === "POST" && url.pathname === "/v1/auth/renew") {
      if (!browserSession) {
        throw new ApiFailure(
          400,
          "browser_session_required",
          "Sign in with a browser session before renewing.",
        );
      }
      requireApproved(account);
      const replacementToken = randomBase64Url(48);
      const replacement = await repository.rotateBrowserSession({
        session: browserSession,
        account,
        tokenDigest: await sha256(replacementToken),
        requestId,
        now,
      });
      const response = json(
        {
          session: {
            expiresAt: replacement.expiresAt,
            absoluteExpiresAt: replacement.absoluteExpiresAt,
          },
        },
        200,
        requestId,
        origin,
      );
      response.headers.append(
        "set-cookie",
        createHostCookie(
          BROWSER_SESSION_COOKIE,
          replacementToken,
          secondsUntil(now, replacement.expiresAt),
        ),
      );
      return response;
    }
    if (request.method === "POST" && url.pathname === "/v1/auth/signout") {
      if (browserSession) {
        await repository.revokeBrowserSession({
          session: browserSession,
          account,
          requestId,
          now,
        });
      }
      const returnTo = normalizeReturnTarget(
        url.searchParams.get("return_to"),
        env.ALLOWED_ORIGINS,
      );
      const response = json(
        {
          signedOut: true,
          logoutUrl: await browserOidcAdapter.createLogoutUrl(returnTo),
        },
        200,
        requestId,
        origin,
      );
      response.headers.append(
        "set-cookie",
        clearHostCookie(BROWSER_SESSION_COOKIE),
      );
      return response;
    }
    if (request.method === "GET" && url.pathname === "/v1/me") {
      return json({ account }, 200, requestId, origin);
    }
    if (request.method === "GET" && url.pathname === "/v1/me/profile") {
      return json(
        { profile: await repository.getProfile(account, now) },
        200,
        requestId,
        origin,
      );
    }
    if (request.method === "GET" && url.pathname === "/v1/me/identities") {
      requireApproved(account);
      return json(
        { identities: await repository.listLinkedIdentities(account.id) },
        200,
        requestId,
        origin,
      );
    }
    if (
      request.method === "POST" &&
      url.pathname === "/v1/me/identity-links/github"
    ) {
      requireApproved(account);
      requireRecentAuthentication(identity, now);
      requireGithubLinkConfiguration(env);
      const requestBody = normalizeGithubLinkStartRequest(
        await readJson<unknown>(request),
      );
      const link = await repository.createIdentityLinkTransaction({
        account,
        request: { provider: "github", ...requestBody },
        requestId,
        now,
      });
      return json(
        {
          link,
          authorizationUrl: githubLinkAdapter.createAuthorizationUrl(link),
        },
        201,
        requestId,
        origin,
      );
    }
    if (
      request.method === "POST" &&
      url.pathname === "/v1/me/identity-links/github/complete"
    ) {
      requireApproved(account);
      requireRecentAuthentication(identity, now);
      const completion = normalizeGithubLinkCompletionRequest(
        await readJson<unknown>(request),
      );
      const claimed = await repository.beginIdentityLinkCompletion({
        account,
        transactionId: completion.transactionId,
        state: completion.state,
        provider: "github",
        codeVerifier: completion.codeVerifier,
        requestId,
        now,
      });
      try {
        const providerIdentity = await githubLinkAdapter.verify({
          code: completion.code,
          codeVerifier: completion.codeVerifier,
        });
        const linkedIdentity = await repository.completeIdentityLink({
          account,
          transactionId: claimed.id,
          providerIdentity,
          requestId,
          now,
        });
        return json(
          { linkedIdentity, returnPath: claimed.returnPath },
          200,
          requestId,
          origin,
        );
      } catch (error) {
        await repository.failIdentityLinkCompletion({
          account,
          transactionId: claimed.id,
          requestId,
          reasonCode:
            error instanceof ApiFailure ? error.code : "provider_failure",
          now,
        });
        throw error;
      }
    }
    if (request.method === "POST" && url.pathname === "/v1/me/identity-links") {
      requireApproved(account);
      requireRecentAuthentication(identity, now);
      const link = await repository.createIdentityLinkTransaction({
        account,
        request: normalizeIdentityLinkRequest(await readJson<unknown>(request)),
        requestId,
        now,
      });
      return json({ link }, 201, requestId, origin);
    }
    const linkTransactionMatch = url.pathname.match(
      /^\/v1\/me\/identity-links\/([^/]+)$/,
    );
    if (request.method === "DELETE" && linkTransactionMatch) {
      requireApproved(account);
      requireRecentAuthentication(identity, now);
      await repository.cancelIdentityLinkTransaction({
        account,
        transactionId: decodeURIComponent(linkTransactionMatch[1]!),
        requestId,
        now,
      });
      return json({}, 204, requestId, origin);
    }
    const linkedIdentityMatch = url.pathname.match(
      /^\/v1\/me\/identities\/([^/]+)$/,
    );
    if (request.method === "DELETE" && linkedIdentityMatch) {
      requireApproved(account);
      requireRecentAuthentication(identity, now);
      await repository.unlinkIdentity({
        account,
        identityId: decodeURIComponent(linkedIdentityMatch[1]!),
        requestId,
        now,
      });
      return json({}, 204, requestId, origin);
    }
    if (request.method === "PATCH" && url.pathname === "/v1/me/profile") {
      requireProfileAccess(account);
      const normalized = normalizeProfileRequest(await readJson<unknown>(request));
      const profile = await repository.updateProfile({
        account,
        ...normalized,
        requestId,
        now,
      });
      return json({ profile }, 200, requestId, origin);
    }
    if (request.method === "GET" && url.pathname === "/v1/me/profile/photo") {
      requireProfileAccess(account);
      const metadata = await repository.getProfilePhotoMetadata(account.id);
      if (!metadata) {
        throw new ApiFailure(404, "profile_photo_not_found", "No profile photo is set.");
      }
      const object = await requireProfilePhotoStorage(env).get(metadata.objectKey);
      if (!object) {
        throw new ApiFailure(
          404,
          "profile_photo_not_found",
          "The profile photo object could not be found.",
        );
      }
      return profilePhotoResponse(object, metadata, requestId, origin);
    }
    if (request.method === "PUT" && url.pathname === "/v1/me/profile/photo") {
      requireProfileAccess(account);
      const storage = requireProfilePhotoStorage(env);
      const photo = await readProfilePhoto(request);
      const previous = await repository.getProfilePhotoMetadata(account.id);
      const installationDigest = (await sha256(env.INSTALLATION_ID)).slice(0, 16);
      const objectKey =
        `profiles/${installationDigest}/${account.id}/${crypto.randomUUID()}.${photo.extension}`;
      const uploaded = await storage.put(objectKey, photo.bytes, {
        httpMetadata: {
          contentType: photo.contentType,
          cacheControl: "private, no-store",
        },
      });
      const metadata: ProfilePhotoMetadata = {
        objectKey,
        contentType: photo.contentType,
        byteLength: photo.bytes.byteLength,
        etag: uploaded.etag,
        updatedAt: now,
      };
      try {
        await repository.setProfilePhotoMetadata({
          account,
          metadata,
          requestId,
          now,
        });
      } catch (error) {
        await storage.delete(objectKey).catch(() => undefined);
        throw error;
      }
      if (previous && previous.objectKey !== objectKey) {
        await storage.delete(previous.objectKey).catch((error) => {
          console.error(
            JSON.stringify({
              level: "error",
              requestId,
              action: "profile.photo.previous.delete",
              code: "profile_photo_orphan_cleanup_failed",
              message: error instanceof Error ? error.message : String(error),
            }),
          );
        });
      }
      return json(
        {
          photo: {
            available: true,
            contentType: metadata.contentType,
            byteLength: metadata.byteLength,
            updatedAt: metadata.updatedAt,
          },
        },
        200,
        requestId,
        origin,
      );
    }
    if (request.method === "DELETE" && url.pathname === "/v1/me/profile/photo") {
      requireProfileAccess(account);
      const metadata = await repository.getProfilePhotoMetadata(account.id);
      if (!metadata) return json({}, 204, requestId, origin);
      const storage = requireProfilePhotoStorage(env);
      await storage.delete(metadata.objectKey);
      await repository.clearProfilePhotoMetadata({ account, requestId, now });
      return json({}, 204, requestId, origin);
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

    if (
      request.method === "POST" &&
      url.pathname === "/v1/me/account-merge-proof"
    ) {
      requireApproved(account);
      requireRecentAuthentication(identity, now);
      const proof = await repository.createRecentAccountMergeProof({
        account,
        requestId,
        now,
      });
      return json({ proof }, 201, requestId, origin);
    }

    if (
      request.method === "POST" &&
      url.pathname === "/v1/admin/account-merges/recovery-proofs"
    ) {
      await requireOwner(account, repository, request, requestId, now);
      requireRecentAuthentication(identity, now);
      const proof = await repository.createOwnerRecoveryProof({
        actor: account,
        request: normalizeOwnerRecoveryProofRequest(
          await readJson<unknown>(request),
        ),
        requestId,
        now,
      });
      return json({ proof }, 201, requestId, origin);
    }
    if (
      request.method === "POST" &&
      url.pathname === "/v1/admin/account-merges/preview"
    ) {
      await requireOwner(account, repository, request, requestId, now);
      requireRecentAuthentication(identity, now);
      const merge = await repository.createAccountMergePreview({
        actor: account,
        request: normalizeAccountMergePreviewRequest(
          await readJson<unknown>(request),
        ),
        requestId,
        now,
      });
      return json({ merge }, 201, requestId, origin);
    }
    const accountMergeMatch = url.pathname.match(
      /^\/v1\/admin\/account-merges\/([^/]+)$/,
    );
    if (request.method === "GET" && accountMergeMatch) {
      await requireOwner(account, repository, request, requestId, now);
      const merge = await repository.getAccountMergePreview(
        decodeURIComponent(accountMergeMatch[1] ?? ""),
      );
      return json({ merge }, 200, requestId, origin);
    }
    const accountMergeCompleteMatch = url.pathname.match(
      /^\/v1\/admin\/account-merges\/([^/]+)\/complete$/,
    );
    if (request.method === "POST" && accountMergeCompleteMatch) {
      await requireOwner(account, repository, request, requestId, now);
      requireRecentAuthentication(identity, now);
      const receipt = await repository.completeAccountMerge({
        actor: account,
        mergeCaseId: decodeURIComponent(
          accountMergeCompleteMatch[1] ?? "",
        ),
        request: normalizeCompleteAccountMergeRequest(
          await readJson<unknown>(request),
        ),
        requestId,
        now,
      });
      return json({ receipt }, 200, requestId, origin);
    }
    const accountMergeReceiptMatch = url.pathname.match(
      /^\/v1\/admin\/account-merges\/([^/]+)\/receipt$/,
    );
    if (request.method === "GET" && accountMergeReceiptMatch) {
      await requireOwner(account, repository, request, requestId, now);
      const receipt = await repository.getAccountMergeReceipt(
        decodeURIComponent(accountMergeReceiptMatch[1] ?? ""),
      );
      return json({ receipt }, 200, requestId, origin);
    }
    const accountMergeRollbackMatch = url.pathname.match(
      /^\/v1\/admin\/account-merges\/([^/]+)\/rollback$/,
    );
    if (request.method === "POST" && accountMergeRollbackMatch) {
      await requireOwner(account, repository, request, requestId, now);
      requireRecentAuthentication(identity, now);
      const receipt = await repository.rollbackAccountMerge({
        actor: account,
        mergeCaseId: decodeURIComponent(
          accountMergeRollbackMatch[1] ?? "",
        ),
        request: normalizeRollbackAccountMergeRequest(
          await readJson<unknown>(request),
        ),
        requestId,
        now,
      });
      return json({ receipt }, 200, requestId, origin);
    }

    if (url.pathname === "/v1/admin/accounts" && request.method === "GET") {
      await requireOwner(account, repository, request, requestId, now);
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
      await requireOwner(account, repository, request, requestId, now);
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
      await requireOwner(account, repository, request, requestId, now);
      return json(
        {
          domains: await repository.listDomains(),
          automaticApprovalEnabled: env.DOMAIN_APPROVAL_ENABLED === "true",
        },
        200,
        requestId,
        origin,
      );
    }
    if (url.pathname === "/v1/admin/domains" && request.method === "POST") {
      await requireOwner(account, repository, request, requestId, now);
      const body = await readJson<CreateDomainRuleRequest>(request);
      if (!body.reason || body.reason.trim().length < 5 || body.reason.length > 500) {
        throw new ApiFailure(400, "invalid_reason", "A reason between 5 and 500 characters is required.");
      }
      if (body.enabled !== false) requireDomainApprovalEnabled(env);
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
      await requireOwner(account, repository, request, requestId, now);
      const body = await readJson<{ enabled: boolean; reason: string }>(request);
      if (typeof body.enabled !== "boolean") {
        throw new ApiFailure(400, "invalid_domain_state", "Enabled must be true or false.");
      }
      if (!body.reason || body.reason.trim().length < 5 || body.reason.length > 500) {
        throw new ApiFailure(400, "invalid_reason", "A reason between 5 and 500 characters is required.");
      }
      if (body.enabled) requireDomainApprovalEnabled(env);
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
    if (domainMatch && request.method === "DELETE") {
      await requireOwner(account, repository, request, requestId, now);
      const body = await readJson<DeleteDomainRuleRequest>(request);
      if (!body.reason || body.reason.trim().length < 5 || body.reason.length > 500) {
        throw new ApiFailure(400, "invalid_reason", "A reason between 5 and 500 characters is required.");
      }
      const domain = await repository.deleteDomain({
        actor: account,
        domainId: decodeURIComponent(domainMatch[1] ?? ""),
        reason: body.reason.trim(),
        requestId,
        now,
      });
      return json({ domain }, 200, requestId, origin);
    }
    if (url.pathname === "/v1/admin/audit" && request.method === "GET") {
      await requireOwner(account, repository, request, requestId, now);
      return json({ events: await repository.listAuditEvents() }, 200, requestId, origin);
    }
    if (url.pathname === "/v1/admin/deletions" && request.method === "GET") {
      await requireOwner(account, repository, request, requestId, now);
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
      await requireOwner(account, repository, request, requestId, now);
      requireRecentAuthentication(identity, now);
      const body = await readJson<{ reason: string }>(request);
      if (!body.reason || body.reason.trim().length < 5 || body.reason.length > 500) {
        throw new ApiFailure(
          400,
          "invalid_reason",
          "A reason between 5 and 500 characters is required.",
        );
      }
      const completionResult = await repository.completeDeletion({
        actor: account,
        deletionRequestId: decodeURIComponent(deletionMatch[1] ?? ""),
        reason: body.reason.trim(),
        requestId,
        now,
      });
      const { profilePhotoObjectKeys, ...completion } = completionResult;
      for (const profilePhotoObjectKey of profilePhotoObjectKeys) {
        if (env.PROFILE_PHOTOS) {
          await env.PROFILE_PHOTOS.delete(profilePhotoObjectKey).catch((error) => {
            console.error(
              JSON.stringify({
                level: "error",
                requestId,
                action: "profile.photo.account-deletion.cleanup",
                code: "profile_photo_orphan_cleanup_failed",
                message: error instanceof Error ? error.message : String(error),
              }),
            );
          });
        } else {
          console.error(
            JSON.stringify({
              level: "error",
              requestId,
              action: "profile.photo.account-deletion.cleanup",
              code: "profile_photo_storage_unavailable",
            }),
          );
        }
      }
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
    const response = json(
      { error: { code: failure.code, message: failure.message, requestId } },
      failure.status,
      requestId,
      origin,
    );
    if (
      failure.code === "session_expired" &&
      readCookie(request, BROWSER_SESSION_COOKIE)
    ) {
      response.headers.append(
        "set-cookie",
        clearHostCookie(BROWSER_SESSION_COOKIE),
      );
    }
    if (failure.code === "authentication_rate_limited") {
      response.headers.set(
        "retry-after",
        String(failure.retryAfterSeconds ?? 60),
      );
    }
    return response;
  }
}

async function enforceAuthAbuseLimit(
  request: Request,
  env: WorkerEnvironment,
  route: AuthAbuseRoute,
  limiter: AuthAbuseLimiter,
  clientAddressResolver: (request: Request) => string,
): Promise<void> {
  try {
    const decision = await limiter.check({
      installationId: env.INSTALLATION_ID,
      route,
      clientAddress: clientAddressResolver(request),
    });
    if (!decision.allowed) {
      throw new ApiFailure(
        429,
        "authentication_rate_limited",
        "Too many sign-in attempts. Wait before trying again.",
        decision.retryAfterSeconds,
      );
    }
  } catch (error) {
    if (error instanceof ApiFailure) throw error;
    if (error instanceof AuthAbuseLimiterUnavailableError) {
      throw new ApiFailure(
        503,
        "authentication_protection_unavailable",
        "Secure sign-in is temporarily unavailable.",
      );
    }
    throw new ApiFailure(
      503,
      "authentication_protection_unavailable",
      "Secure sign-in is temporarily unavailable.",
    );
  }
}

export {
  BrowserOidcAdapter,
  D1Project42Repository,
  GithubIdentityLinkAdapter,
  OidcJwtVerifier,
  handleRequest,
};

export default {
  fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies ExportedHandler<WorkerEnvironment>;
