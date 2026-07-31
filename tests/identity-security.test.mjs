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
  const claimContractDiagnostics = [];
  const originalConsoleInfo = console.info;
  console.info = (entry) => claimContractDiagnostics.push(JSON.parse(entry));
  t.after(() => {
    console.info = originalConsoleInfo;
  });
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
    email: "learner@example.com",
    email_verified: true,
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
      diagnosticRequestId: "b5d9f227-830c-43e8-8bb6-e31bf75e06ba",
    });
  assert.equal(browserIdentity.authenticatedAt, now);
  assert.deepEqual(claimContractDiagnostics, [
    {
      level: "info",
      requestId: "b5d9f227-830c-43e8-8bb6-e31bf75e06ba",
      action: "oidc.identity.claim_contract",
      emailClaim: "present",
      emailVerificationClaim: "verified",
    },
  ]);

  const boundaryBrowserIdentityToken = await new SignJWT({
    nonce: "expected-nonce",
    auth_time: now,
    azp: "project42-browser",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("boundary-browser-subject")
    .setAudience("project42-browser")
    .setIssuedAt(now - 300)
    .setExpirationTime(now)
    .sign(privateKey);
  const boundaryBrowserIdentity = await verifier.verifyToken(
    boundaryBrowserIdentityToken,
    {
      audience: "project42-browser",
      nonce: "expected-nonce",
      requireAuthenticationTime: true,
    },
  );
  assert.equal(boundaryBrowserIdentity.subject, "boundary-browser-subject");

  await assert.rejects(
    verifier.verifyToken(boundaryBrowserIdentityToken, {
      audience: "project42-browser",
    }),
    (error) =>
      error.code === "invalid_access_token" &&
      error.diagnostic === undefined,
  );

  const materiallyExpiredBrowserIdentityToken = await new SignJWT({
    nonce: "expected-nonce",
    auth_time: now,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("materially-expired-browser-subject")
    .setAudience("project42-browser")
    .setIssuedAt(now - 361)
    .setExpirationTime(now - 61)
    .sign(privateKey);
  await assert.rejects(
    verifier.verifyToken(materiallyExpiredBrowserIdentityToken, {
      audience: "project42-browser",
      nonce: "expected-nonce",
      requireAuthenticationTime: true,
    }),
    (error) =>
      error.code === "invalid_identity_token" &&
      error.diagnostic?.category === "jose_validation" &&
      error.diagnostic?.joseCode === "ERR_JWT_EXPIRED" &&
      error.diagnostic?.claim === "exp",
  );

  await assert.rejects(
    verifier.verifyToken(boundaryBrowserIdentityToken, {
      audience: "project42-browser",
      nonce: "wrong-nonce",
      requireAuthenticationTime: true,
    }),
    (error) =>
      error.code === "invalid_identity_token" &&
      error.diagnostic?.category === "nonce_mismatch",
  );

  const wrongIssuerBoundaryToken = await new SignJWT({
    nonce: "expected-nonce",
    auth_time: now,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer("https://wrong-issuer.example.test")
    .setSubject("wrong-issuer-browser-subject")
    .setAudience("project42-browser")
    .setIssuedAt(now - 300)
    .setExpirationTime(now)
    .sign(privateKey);
  await assert.rejects(
    verifier.verifyToken(wrongIssuerBoundaryToken, {
      audience: "project42-browser",
      nonce: "expected-nonce",
      requireAuthenticationTime: true,
    }),
    (error) =>
      error.code === "invalid_identity_token" &&
      error.diagnostic?.category === "jose_validation" &&
      error.diagnostic?.claim === "iss",
  );

  const wrongAudienceBoundaryToken = await new SignJWT({
    nonce: "expected-nonce",
    auth_time: now,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("wrong-audience-browser-subject")
    .setAudience("different-browser")
    .setIssuedAt(now - 300)
    .setExpirationTime(now)
    .sign(privateKey);
  await assert.rejects(
    verifier.verifyToken(wrongAudienceBoundaryToken, {
      audience: "project42-browser",
      nonce: "expected-nonce",
      requireAuthenticationTime: true,
    }),
    (error) =>
      error.code === "invalid_identity_token" &&
      error.diagnostic?.category === "jose_validation" &&
      error.diagnostic?.claim === "aud",
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
    (error) =>
      error.code === "invalid_identity_token" &&
      error.diagnostic?.category === "jose_validation" &&
      error.diagnostic?.joseCode === "ERR_JWT_CLAIM_VALIDATION_FAILED" &&
      error.diagnostic?.claim === "auth_time" &&
      error.diagnostic?.timing === undefined,
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
    (error) =>
      error.code === "invalid_identity_token" &&
      error.diagnostic?.category === "authorized_party_mismatch",
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
      (error) =>
        error.code === "invalid_identity_token" &&
        error.diagnostic?.category === "authentication_time_invalid",
    );
  }

  const nonBooleanVerificationToken = await new SignJWT({
    nonce: "expected-nonce",
    auth_time: now,
    email: "learner@example.com",
    email_verified: "true",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("stable-subject")
    .setAudience("project42-browser")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  const nonBooleanVerificationIdentity = await verifier.verifyToken(
    nonBooleanVerificationToken,
    {
      audience: "project42-browser",
      nonce: "expected-nonce",
      requireAuthenticationTime: true,
      diagnosticRequestId: "cc19345a-e9d1-4b5e-89ee-c46d1a695d6b",
    },
  );
  assert.equal(nonBooleanVerificationIdentity.email, "learner@example.com");
  assert.equal(nonBooleanVerificationIdentity.emailVerified, false);
  assert.deepEqual(claimContractDiagnostics.at(-1), {
    level: "info",
    requestId: "cc19345a-e9d1-4b5e-89ee-c46d1a695d6b",
    action: "oidc.identity.claim_contract",
    emailClaim: "present",
    emailVerificationClaim: "invalid_type",
  });
  const missingVerificationToken = await new SignJWT({
    nonce: "expected-nonce",
    auth_time: now,
    email: "learner@example.com",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("stable-subject")
    .setAudience("project42-browser")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);
  const missingVerificationIdentity = await verifier.verifyToken(
    missingVerificationToken,
    {
      audience: "project42-browser",
      nonce: "expected-nonce",
      requireAuthenticationTime: true,
      diagnosticRequestId: "a3b08354-84af-40b8-ac06-7093475c1ee9",
    },
  );
  assert.equal(missingVerificationIdentity.emailVerified, false);
  assert.deepEqual(claimContractDiagnostics.at(-1), {
    level: "info",
    requestId: "a3b08354-84af-40b8-ac06-7093475c1ee9",
    action: "oidc.identity.claim_contract",
    emailClaim: "present",
    emailVerificationClaim: "missing",
  });
  assert.equal(
    JSON.stringify(claimContractDiagnostics).includes("learner@example.com"),
    false,
  );

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

  const expiredBrowserIdentity = await new SignJWT({
    nonce: "diagnostic-nonce",
    auth_time: now - 600,
    email: "must-not-appear@example.com",
    name: "Must Not Appear",
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setSubject("must-not-appear")
    .setAudience("project42-browser")
    .setIssuedAt(now - 600)
    .setExpirationTime(now - 300)
    .sign(privateKey);
  await assert.rejects(
    verifier.verifyToken(expiredBrowserIdentity, {
      audience: "project42-browser",
      nonce: "diagnostic-nonce",
      requireAuthenticationTime: true,
    }),
    (error) => {
      assert.equal(error.code, "invalid_identity_token");
      assert.equal(error.diagnostic?.category, "jose_validation");
      assert.equal(error.diagnostic?.joseCode, "ERR_JWT_EXPIRED");
      assert.equal(error.diagnostic?.claim, "exp");
      assert.deepEqual(
        {
          expNumeric: error.diagnostic?.timing?.expNumeric,
          iatNumeric: error.diagnostic?.timing?.iatNumeric,
          authTimeNumeric: error.diagnostic?.timing?.authTimeNumeric,
          expMinusIatSeconds:
            error.diagnostic?.timing?.expMinusIatSeconds,
          issuerMatches: error.diagnostic?.timing?.issuerMatches,
          audienceMatches: error.diagnostic?.timing?.audienceMatches,
        },
        {
          expNumeric: true,
          iatNumeric: true,
          authTimeNumeric: true,
          expMinusIatSeconds: 300,
          issuerMatches: true,
          audienceMatches: true,
        },
      );
      assert.ok(error.diagnostic.timing.expMinusNowSeconds <= -290);
      assert.ok(error.diagnostic.timing.expMinusNowSeconds >= -320);
      assert.ok(error.diagnostic.timing.iatMinusNowSeconds <= -590);
      assert.ok(error.diagnostic.timing.iatMinusNowSeconds >= -620);
      assert.ok(error.diagnostic.timing.authTimeMinusNowSeconds <= -590);
      assert.ok(error.diagnostic.timing.authTimeMinusNowSeconds >= -620);
      for (const value of [
        error.diagnostic.timing.expMinusNowSeconds,
        error.diagnostic.timing.iatMinusNowSeconds,
        error.diagnostic.timing.expMinusIatSeconds,
        error.diagnostic.timing.authTimeMinusNowSeconds,
      ]) {
        assert.equal(Math.abs(value % 10), 0);
      }
      const serialized = JSON.stringify(error.diagnostic);
      for (const forbidden of [
        "must-not-appear",
        "must-not-appear@example.com",
        "diagnostic-nonce",
        issuer,
        expiredBrowserIdentity,
      ]) {
        assert.equal(serialized.includes(forbidden), false);
      }
      return true;
    },
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

test("JWKS key-resolution failures are classified as unavailable, not an invalid token (AB#6514)", async (t) => {
  const { publicKey, privateKey } = await generateKeyPair("RS256");
  let jwksResponse = { status: 200, body: null };
  const server = createServer((request, response) => {
    if (request.url !== "/jwks") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(jwksResponse.status, {
      "content-type": "application/json",
    });
    response.end(jwksResponse.body);
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
  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: "current-key" })
    .setIssuer(issuer)
    .setSubject("stable-subject")
    .setAudience("project42-tests")
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .sign(privateKey);

  // A JWKS response with no key matching the token's kid (e.g. serving a
  // stale cache mid key-rotation) must not be reported as an invalid token.
  jwksResponse = {
    status: 200,
    body: JSON.stringify({
      keys: [
        {
          ...(await exportJWK(publicKey)),
          kid: "a-different-key",
          use: "sig",
          alg: "RS256",
        },
      ],
    }),
  };
  const diagnostics = [];
  const originalConsoleError = console.error;
  console.error = (entry) => diagnostics.push(JSON.parse(entry));
  t.after(() => {
    console.error = originalConsoleError;
  });
  await assert.rejects(
    new OidcJwtVerifier(env).verify(
      new Request("https://api.example.test/v1/me", {
        headers: { authorization: `Bearer ${token}` },
      }),
    ),
    (error) =>
      error.status === 503 &&
      error.code === "identity_verification_unavailable",
  );
  assert.equal(diagnostics.length, 1);
  assert.equal(diagnostics[0].code, "identity_verification_unavailable");
  assert.equal(diagnostics[0].joseCode, "ERR_JWKS_NO_MATCHING_KEY");
  assert.doesNotMatch(JSON.stringify(diagnostics[0]), /stable-subject/);

  // A malformed JWKS response (upstream hiccup, not a real invalid token)
  // must also be reported as unavailable, not as a bad token.
  jwksResponse = { status: 200, body: "not valid json" };
  await assert.rejects(
    new OidcJwtVerifier(env).verify(
      new Request("https://api.example.test/v1/me", {
        headers: { authorization: `Bearer ${token}` },
      }),
    ),
    (error) =>
      error.status === 503 &&
      error.code === "identity_verification_unavailable",
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
        contractStatus: "current",
      };
    },
    exportLearnerData: async (input) => {
      calls.push(["export", input]);
      return { schemaVersion: 1, exportedAt: input.now };
    },
    exportLearnerTranscriptCsv: async (input) => {
      calls.push(["transcript", input]);
      return '"schema_version","record_authority"\r\n"1.0","durable-account-record"\r\n';
    },
    listDeletionRequests: async () => [],
    requestDeletion: async (input) => {
      calls.push(["request-deletion", input]);
      return {
        deletionRequest: {
          id: "deletion-1",
          state: "requested",
          requestedAt: input.now,
          cancellationDeadline: new Date(
            Date.parse(input.now) + 86_400_000,
          ).toISOString(),
          completedAt: null,
        },
        receipt: {
          requestId: "deletion-1",
          statusToken: "a".repeat(64),
          issuedAt: input.now,
        },
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
        purpose: "learning-record",
        policyVersion: "2026-07-27",
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

  const transcript = await handleRequest(
    new Request("https://api.example.test/v1/me/transcript.csv"),
    env,
    verifier,
    repository,
  );
  assert.equal(transcript.status, 200);
  assert.equal(transcript.headers.get("content-type"), "text/csv; charset=utf-8");
  assert.equal(transcript.headers.get("cache-control"), "private, no-store");
  assert.equal(transcript.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    transcript.headers.get("content-disposition"),
    /project42-account-transcript/,
  );
  assert.match(await transcript.text(), /durable-account-record/);

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
    ["consent", "export", "transcript", "request-deletion"],
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
  const staleTranscript = await handleRequest(
    new Request("https://api.example.test/v1/me/transcript.csv"),
    env,
    staleVerifier,
    repository,
  );
  assert.equal(staleTranscript.status, 401);
  assert.equal(
    (await staleTranscript.json()).error.code,
    "recent_authentication_required",
  );
});
