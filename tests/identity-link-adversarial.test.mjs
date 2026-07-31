import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { D1Project42Repository } from "../dist/worker.js";

const issuer = "https://issuer.example.test";
const installationId = "identity-link-adversarial";

async function applyD1Migrations(database) {
  const migrations = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(
      new URL(`../migrations/${migration}`, import.meta.url),
      "utf8",
    );
    await database.exec(sql.replace(/\r?\n/g, " "));
  }
}

function identity(subject) {
  const authenticatedAt = Math.floor(Date.now() / 1_000);
  return {
    provider: "oidc",
    issuer,
    subject,
    email: `${subject}@example.test`,
    emailVerified: true,
    displayName: subject,
    issuedAt: authenticatedAt,
    authenticatedAt,
  };
}

function pkce() {
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

async function fixture(t, name) {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: `project42-${name}` },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyD1Migrations(database);
  const repository = new D1Project42Repository(database, installationId);
  const now = new Date().toISOString();
  await repository.ensureInstallation(now);

  const owner = await repository.createOrRefreshAccount(
    identity("owner"),
    true,
    "owner-bootstrap",
    now,
  );
  const learners = {};
  for (const subject of ["alice", "bob"]) {
    const account = await repository.createOrRefreshAccount(
      identity(subject),
      false,
      `${subject}-registration`,
      now,
    );
    learners[subject] = await repository.changeAccountState({
      actor: owner,
      targetId: account.id,
      to: "approved",
      reason: `Approve ${subject} for the identity-link fixture.`,
      requestId: `approve-${subject}`,
      now,
    });
  }
  return { database, repository, learners, now };
}

test("another learner cannot complete an identity-link transaction they did not start", async (t) => {
  const { repository, learners, now } = await fixture(t, "link-confused-deputy");
  const { codeVerifier, codeChallenge } = pkce();

  const transaction = await repository.createIdentityLinkTransaction({
    account: learners.alice,
    request: {
      provider: "github",
      codeChallenge,
      codeChallengeMethod: "S256",
      returnPath: "/account",
    },
    requestId: "alice-link-start",
    now,
  });

  // Confused deputy: Bob holds Alice's transaction id, state, and verifier -
  // everything that travels through the browser - and completes it as himself.
  // The transaction is bound to the starting learner, so it must not resolve.
  await assert.rejects(
    () =>
      repository.beginIdentityLinkCompletion({
        account: learners.bob,
        transactionId: transaction.id,
        state: transaction.state,
        provider: "github",
        codeVerifier,
        requestId: "bob-hijack",
        now,
      }),
    (error) => error.code === "invalid_identity_link",
    "a transaction must be bound to the learner who started it",
  );

  // Alice's own transaction is untouched by the attempt.
  const claimed = await repository.beginIdentityLinkCompletion({
    account: learners.alice,
    transactionId: transaction.id,
    state: transaction.state,
    provider: "github",
    codeVerifier,
    requestId: "alice-complete",
    now,
  });
  assert.equal(claimed.id, transaction.id);
});

test("identity-link completion requires the exact state and PKCE verifier", async (t) => {
  const { repository, learners, now } = await fixture(t, "link-state-binding");

  async function start(requestId) {
    const { codeVerifier, codeChallenge } = pkce();
    const transaction = await repository.createIdentityLinkTransaction({
      account: learners.alice,
      request: {
        provider: "github",
        codeChallenge,
        codeChallengeMethod: "S256",
        returnPath: "/account",
      },
      requestId,
      now,
    });
    return { transaction, codeVerifier };
  }

  // A forged or fixated state cannot complete the transaction, so an attacker
  // who plants a state value cannot bind their identity to the learner.
  const forgedState = await start("forged-state");
  await assert.rejects(
    () =>
      repository.beginIdentityLinkCompletion({
        account: learners.alice,
        transactionId: forgedState.transaction.id,
        state: `${crypto.randomUUID()}.${crypto.randomUUID()}`,
        provider: "github",
        codeVerifier: forgedState.codeVerifier,
        requestId: "forged-state-attempt",
        now,
      }),
    (error) => error.code === "invalid_identity_link",
    "a mismatched state must not complete the transaction",
  );

  // A wrong PKCE verifier fails even with the correct state, so intercepting
  // the redirect alone is not enough.
  const wrongVerifier = await start("wrong-verifier");
  await assert.rejects(
    () =>
      repository.beginIdentityLinkCompletion({
        account: learners.alice,
        transactionId: wrongVerifier.transaction.id,
        state: wrongVerifier.transaction.state,
        provider: "github",
        codeVerifier: pkce().codeVerifier,
        requestId: "wrong-verifier-attempt",
        now,
      }),
    (error) => error.code === "invalid_identity_link",
    "a mismatched PKCE verifier must not complete the transaction",
  );

  // A provider swap cannot redirect a transaction to a different provider.
  const swapped = await start("provider-swap");
  await assert.rejects(
    () =>
      repository.beginIdentityLinkCompletion({
        account: learners.alice,
        transactionId: swapped.transaction.id,
        state: swapped.transaction.state,
        provider: "oidc",
        codeVerifier: swapped.codeVerifier,
        requestId: "provider-swap-attempt",
        now,
      }),
    (error) => error.code === "invalid_identity_link",
    "a transaction must not be completable under a different provider",
  );
});

test("concurrent and replayed identity-link completions claim the transaction once", async (t) => {
  const { repository, learners, now } = await fixture(t, "link-concurrency");
  const { codeVerifier, codeChallenge } = pkce();

  const transaction = await repository.createIdentityLinkTransaction({
    account: learners.alice,
    request: {
      provider: "github",
      codeChallenge,
      codeChallengeMethod: "S256",
      returnPath: "/account",
    },
    requestId: "concurrent-link-start",
    now,
  });

  const attempt = (requestId) =>
    repository.beginIdentityLinkCompletion({
      account: learners.alice,
      transactionId: transaction.id,
      state: transaction.state,
      provider: "github",
      codeVerifier,
      requestId,
      now,
    });

  // Two callbacks racing - a double-clicked redirect, or a replay landing
  // alongside the genuine one - must resolve to exactly one claim.
  const results = await Promise.allSettled([
    attempt("concurrent-a"),
    attempt("concurrent-b"),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");
  assert.equal(fulfilled.length, 1, "exactly one completion may claim the transaction");
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, "invalid_identity_link");

  // Replaying the same callback afterwards is refused rather than re-claimed.
  await assert.rejects(
    () => attempt("replay"),
    (error) => error.code === "invalid_identity_link",
    "an already-claimed transaction must not be replayable",
  );
});
