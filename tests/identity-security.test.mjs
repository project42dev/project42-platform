import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  canTransitionAccount,
  exactDomainMatches,
  getVerifiedEmailDomain,
  normalizeExactDomain,
} from "../dist/identity.js";
import { OidcJwtVerifier, handleRequest } from "../dist/worker.js";

test("account states enforce approval, suspension, and terminal revocation", () => {
  assert.equal(canTransitionAccount("pending", "approved"), true);
  assert.equal(canTransitionAccount("pending", "rejected"), true);
  assert.equal(canTransitionAccount("pending", "suspended"), false);
  assert.equal(canTransitionAccount("rejected", "approved"), true);
  assert.equal(canTransitionAccount("approved", "rejected"), false);
  assert.equal(canTransitionAccount("approved", "suspended"), true);
  assert.equal(canTransitionAccount("suspended", "approved"), true);
  assert.equal(canTransitionAccount("approved", "revoked"), true);
  assert.equal(canTransitionAccount("revoked", "approved"), false);
});

test("domain approval requires a verified email and an exact normalized match", () => {
  assert.equal(
    getVerifiedEmailDomain({
      email: "Learner@Example.COM",
      emailVerified: true,
    }),
    "example.com",
  );
  assert.equal(
    getVerifiedEmailDomain({
      email: "learner@example.com",
      emailVerified: false,
    }),
    null,
  );
  assert.equal(exactDomainMatches("example.com", "EXAMPLE.COM"), true);
  assert.equal(exactDomainMatches("sub.example.com", "example.com"), false);
  assert.throws(() => normalizeExactDomain("*.example.com"), /exact DNS name/);
  assert.throws(() => normalizeExactDomain("person@example.com"), /exact DNS name/);
});

test("OIDC verifier accepts only correctly signed issuer and audience tokens", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  const server = createServer((request, response) => {
    if (request.url !== "/jwks") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ keys: [{ ...jwk, kid: "test-key", use: "sig", alg: "RS256" }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const issuer = "https://issuer.example.test";
  const env = {
    OIDC_ISSUER: issuer,
    OIDC_AUDIENCE: "project42-tests",
    OIDC_JWKS_URL: `http://127.0.0.1:${address.port}/jwks`,
    OIDC_EMAIL_CLAIM: "email",
    OIDC_EMAIL_VERIFIED_CLAIM: "email_verified",
  };
  const verifier = new OidcJwtVerifier(env);
  const now = Math.floor(Date.now() / 1000);
  const valid = await new SignJWT({
    email: "learner@example.com",
    email_verified: true,
    name: "Learner",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("stable-subject")
    .setAudience("project42-tests")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  const identity = await verifier.verify(
    new Request("https://api.example.test/v1/me", {
      headers: { authorization: `Bearer ${valid}` },
    }),
  );
  assert.deepEqual(identity, {
    provider: "oidc",
    issuer,
    subject: "stable-subject",
    email: "learner@example.com",
    emailVerified: true,
    displayName: "Learner",
    issuedAt: now,
  });

  const browserIdentityToken = await new SignJWT({
    nonce: "expected-nonce",
    auth_time: now,
    azp: "project42-browser",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("stable-subject")
    .setAudience(["project42-browser", "project42-secondary"])
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  const browserIdentity = await verifier.verifyToken(browserIdentityToken, {
    audience: "project42-browser",
    nonce: "expected-nonce",
    requireAuthenticationTime: true,
  });
  assert.equal(browserIdentity.authenticatedAt, now);
  await assert.rejects(
    verifier.verifyToken(browserIdentityToken, {
      audience: "project42-browser",
      nonce: "wrong-nonce",
      requireAuthenticationTime: true,
    }),
    (error) => error.code === "invalid_identity_token",
  );

  const missingAuthenticationTime = await new SignJWT({
    nonce: "expected-nonce",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("stable-subject")
    .setAudience("project42-browser")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  await assert.rejects(
    verifier.verifyToken(missingAuthenticationTime, {
      audience: "project42-browser",
      nonce: "expected-nonce",
      requireAuthenticationTime: true,
    }),
    (error) => error.code === "invalid_identity_token",
  );

  const wrongAuthorizedParty = await new SignJWT({
    nonce: "expected-nonce",
    auth_time: now,
    azp: "different-browser",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("stable-subject")
    .setAudience("project42-browser")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  await assert.rejects(
    verifier.verifyToken(wrongAuthorizedParty, {
      audience: "project42-browser",
      nonce: "expected-nonce",
      requireAuthenticationTime: true,
    }),
    (error) => error.code === "invalid_identity_token",
  );

  for (const invalidAuthenticationTime of [now - 3_600, now + 3_600]) {
    const invalidAuthenticationToken = await new SignJWT({
      nonce: "expected-nonce",
      auth_time: invalidAuthenticationTime,
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(issuer)
      .setSubject("stable-subject")
      .setAudience("project42-browser")
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey);
    await assert.rejects(
      verifier.verifyToken(invalidAuthenticationToken, {
        audience: "project42-browser",
        nonce: "expected-nonce",
        requireAuthenticationTime: true,
      }),
      (error) => error.code === "invalid_identity_token",
    );
  }

  const wrongAudience = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("stable-subject")
    .setAudience("different-api")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  await assert.rejects(
    verifier.verify(
      new Request("https://api.example.test/v1/me", {
        headers: { authorization: `Bearer ${wrongAudience}` },
      }),
    ),
    (error) => error.code === "invalid_access_token",
  );

  const expired = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("stable-subject")
    .setAudience("project42-tests")
    .setIssuedAt(now - 600)
    .setExpirationTime(now - 300)
    .sign(privateKey);
  await assert.rejects(
    verifier.verify(
      new Request("https://api.example.test/v1/me", {
        headers: { authorization: `Bearer ${expired}` },
      }),
    ),
    (error) => error.code === "invalid_access_token",
  );

  const { privateKey: attackerKey } = await generateKeyPair("RS256");
  const forged = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("stable-subject")
    .setAudience("project42-tests")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(attackerKey);
  await assert.rejects(
    verifier.verify(
      new Request("https://api.example.test/v1/me", {
        headers: { authorization: `Bearer ${forged}` },
      }),
    ),
    (error) => error.code === "invalid_access_token",
  );
});

test("CORS preflight succeeds only for configured origins", async () => {
  const env = {
    ALLOWED_ORIGINS: "https://learn.example.test",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
  };
  const verifier = {
    verify: async () => {
      throw new Error("preflight must not invoke identity verification");
    },
  };

  const allowed = await handleRequest(
    new Request("https://api.example.test/v1/me", {
      method: "OPTIONS",
      headers: {
        origin: "https://learn.example.test",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization,content-type",
      },
    }),
    env,
    verifier,
  );
  assert.equal(allowed.status, 204);
  assert.equal(await allowed.text(), "");
  assert.equal(
    allowed.headers.get("access-control-allow-origin"),
    "https://learn.example.test",
  );
  assert.match(
    allowed.headers.get("access-control-allow-methods") ?? "",
    /GET/,
  );
  assert.match(
    allowed.headers.get("access-control-allow-headers") ?? "",
    /authorization/,
  );
  assert.equal(allowed.headers.get("access-control-max-age"), "600");

  const denied = await handleRequest(
    new Request("https://api.example.test/v1/me", {
      method: "OPTIONS",
      headers: {
        origin: "https://untrusted.example",
        "access-control-request-method": "GET",
      },
    }),
    env,
    verifier,
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  assert.equal((await denied.json()).error.code, "origin_not_allowed");
});

test("API denies learner data until approval and protects owner routes", async () => {
  const ownerDenials = [];
  const identity = {
    issuer: "https://issuer.example.test",
    subject: "subject-1",
    email: "learner@example.com",
    emailVerified: true,
    displayName: "Learner",
  };
  const pending = {
    id: "user-1",
    installationId: "test",
    identity: { issuer: identity.issuer, subject: identity.subject },
    displayName: "Learner",
    primaryEmail: identity.email,
    emailVerified: true,
    state: "pending",
    roles: ["learner"],
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
  };
  const verifier = { verify: async () => identity };
  const repository = {
    ensureInstallation: async () => {},
    createOrRefreshAccount: async () => pending,
    findAccount: async () => pending,
    getProgress: async () => {
      throw new Error("pending account must not reach storage");
    },
    listAccounts: async () => {
      throw new Error("learner must not reach owner storage");
    },
    recordOwnerAuthorizationDenied: async (input) => ownerDenials.push(input),
  };
  const env = {
    INSTALLATION_ID: "test",
    ALLOWED_ORIGINS: "https://learn.example.test",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    BOOTSTRAP_OWNER_ISSUER: "",
    BOOTSTRAP_OWNER_SUBJECT: "",
  };

  const session = await handleRequest(
    new Request("https://api.example.test/v1/session", { method: "POST" }),
    env,
    verifier,
    repository,
  );
  assert.equal(session.status, 202);

  const progress = await handleRequest(
    new Request("https://api.example.test/v1/me/progress"),
    env,
    verifier,
    repository,
  );
  assert.equal(progress.status, 403);
  assert.equal((await progress.json()).error.code, "account_pending");

  const admin = await handleRequest(
    new Request("https://api.example.test/v1/admin/accounts"),
    env,
    verifier,
    repository,
  );
  assert.equal(admin.status, 403);
  assert.equal((await admin.json()).error.code, "owner_required");
  assert.equal(ownerDenials.length, 1);
  assert.equal(ownerDenials[0].account.id, pending.id);
  assert.equal(ownerDenials[0].method, "GET");
  assert.equal(ownerDenials[0].path, "/v1/admin/accounts");
  assert.ok(ownerDenials[0].requestId);
});

test("suspension and revocation disable existing learner and owner access", async () => {
  const identity = {
    issuer: "https://issuer.example.test",
    subject: "previously-approved-subject",
    email: "owner@example.com",
    emailVerified: true,
    displayName: "Previous owner",
  };
  const verifier = { verify: async () => identity };
  const env = {
    INSTALLATION_ID: "test",
    ALLOWED_ORIGINS: "https://learn.example.test",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    BOOTSTRAP_OWNER_ISSUER: "",
    BOOTSTRAP_OWNER_SUBJECT: "",
  };

  for (const state of ["suspended", "revoked"]) {
    const ownerDenials = [];
    const account = {
      id: "user-previously-approved",
      installationId: "test",
      identity: { issuer: identity.issuer, subject: identity.subject },
      displayName: identity.displayName,
      primaryEmail: identity.email,
      emailVerified: true,
      state,
      roles: ["learner", "owner"],
      createdAt: "2026-07-26T00:00:00.000Z",
      updatedAt: "2026-07-27T00:00:00.000Z",
    };
    const repository = {
      ensureInstallation: async () => {},
      findAccount: async () => account,
      getProgress: async () => {
        throw new Error(`${state} account must not reach learner storage`);
      },
      listAccounts: async () => {
        throw new Error(`${state} owner must not reach administrative storage`);
      },
      recordOwnerAuthorizationDenied: async (input) => ownerDenials.push(input),
    };

    const progress = await handleRequest(
      new Request("https://api.example.test/v1/me/progress"),
      env,
      verifier,
      repository,
    );
    assert.equal(progress.status, 403);
    assert.equal((await progress.json()).error.code, `account_${state}`);

    const admin = await handleRequest(
      new Request("https://api.example.test/v1/admin/accounts"),
      env,
      verifier,
      repository,
    );
    assert.equal(admin.status, 403);
    assert.equal((await admin.json()).error.code, "owner_required");
    assert.equal(ownerDenials.length, 1);
    assert.equal(ownerDenials[0].account.state, state);
  }
});

test("data-rights routes require recent authentication and explicit deletion confirmation", async () => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const identity = {
    issuer: "https://issuer.example.test",
    subject: "subject-2",
    email: "approved@example.com",
    emailVerified: true,
    displayName: "Approved learner",
    issuedAt,
    authenticatedAt: issuedAt,
  };
  const approved = {
    id: "user-2",
    installationId: "test",
    identity: { issuer: identity.issuer, subject: identity.subject },
    displayName: identity.displayName,
    primaryEmail: identity.email,
    emailVerified: true,
    state: "approved",
    roles: ["learner"],
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
  };
  const calls = [];
  const verifier = { verify: async () => identity };
  const repository = {
    ensureInstallation: async () => {},
    findAccount: async () => approved,
    listConsents: async () => [],
    recordConsent: async (input) => {
      calls.push(["consent", input]);
      return {
        id: "consent-1",
        purpose: input.purpose,
        policyVersion: input.policyVersion,
        decision: input.decision,
        decidedAt: input.now,
      };
    },
    exportLearnerData: async (input) => {
      calls.push(["export", input]);
      return { schemaVersion: 1, exportedAt: input.now };
    },
    listDeletionRequests: async () => [],
    requestDeletion: async (input) => {
      calls.push(["request-deletion", input]);
      return {
        id: "deletion-1",
        state: "requested",
        requestedAt: input.now,
        cancellationDeadline: new Date(Date.parse(input.now) + 86_400_000).toISOString(),
        completedAt: null,
      };
    },
  };
  const env = {
    INSTALLATION_ID: "test",
    ALLOWED_ORIGINS: "https://learn.example.test",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    BOOTSTRAP_OWNER_ISSUER: "",
    BOOTSTRAP_OWNER_SUBJECT: "",
  };

  const consent = await handleRequest(
    new Request("https://api.example.test/v1/me/consents", {
      method: "POST",
      body: JSON.stringify({
        purpose: "learner-records",
        policyVersion: "2026-07-26",
        decision: "granted",
      }),
    }),
    env,
    verifier,
    repository,
  );
  assert.equal(consent.status, 201);

  const learnerExport = await handleRequest(
    new Request("https://api.example.test/v1/me/export"),
    env,
    verifier,
    repository,
  );
  assert.equal(learnerExport.status, 200);
  assert.match(learnerExport.headers.get("content-disposition"), /project42-learner-export/);

  const missingConfirmation = await handleRequest(
    new Request("https://api.example.test/v1/me/deletion", {
      method: "POST",
      body: JSON.stringify({ confirmation: "delete" }),
    }),
    env,
    verifier,
    repository,
  );
  assert.equal(missingConfirmation.status, 400);
  assert.equal(
    (await missingConfirmation.json()).error.code,
    "deletion_confirmation_required",
  );

  const deletion = await handleRequest(
    new Request("https://api.example.test/v1/me/deletion", {
      method: "POST",
      body: JSON.stringify({ confirmation: "DELETE MY PROJECT 42 ACCOUNT" }),
    }),
    env,
    verifier,
    repository,
  );
  assert.equal(deletion.status, 202);
  assert.deepEqual(
    calls.map(([name]) => name),
    ["consent", "export", "request-deletion"],
  );

  const staleVerifier = {
    verify: async () => ({
      ...identity,
      authenticatedAt: issuedAt - 3_600,
    }),
  };
  const staleExport = await handleRequest(
    new Request("https://api.example.test/v1/me/export"),
    env,
    staleVerifier,
    repository,
  );
  assert.equal(staleExport.status, 401);
  assert.equal(
    (await staleExport.json()).error.code,
    "recent_authentication_required",
  );
});
