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
  assert.equal(canTransitionAccount("pending", "suspended"), false);
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
    issuer,
    subject: "stable-subject",
    email: "learner@example.com",
    emailVerified: true,
    displayName: "Learner",
  });

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
});

test("API denies learner data until approval and protects owner routes", async () => {
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
  };
  const env = {
    INSTALLATION_ID: "test",
    ALLOWED_ORIGINS: "https://learn.example.test",
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
});
