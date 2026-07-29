import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { starterCatalog } from "../dist/index.js";
import {
  D1Project42Repository,
  GithubIdentityLinkAdapter,
  handleRequest,
} from "../dist/worker.js";

const issuer = "https://issuer.example.test";
const allowedOrigin = "https://learn.example.test";

function identity(subject, email, emailVerified = true, roles = {}) {
  return {
    issuer,
    subject,
    email,
    emailVerified,
    displayName: roles.displayName ?? subject,
    issuedAt: Math.floor(Date.now() / 1_000),
    authenticatedAt: Math.floor(Date.now() / 1_000),
  };
}

async function readBody(response) {
  return response.json();
}

async function pkceChallenge(verifier) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Buffer.from(digest).toString("hex");
}

test("account service completes lifecycle, progress, privacy, and audit journeys on D1", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-26",
    d1Databases: { PROJECT42_DB: "project42-account-e2e" },
    r2Buckets: { PROFILE_PHOTOS: "project42-profile-photos-e2e" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());

  const database = await miniflare.getD1Database("PROJECT42_DB");
  const profilePhotos = await miniflare.getR2Bucket("PROFILE_PHOTOS");
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

  const identities = new Map([
    ["owner-token", identity("owner-subject", "owner@example.test")],
    ["learner-token", identity("learner-subject", "learner@other.example")],
    ["other-token", identity("other-subject", "other@other.example")],
    ["delete-token", identity("delete-subject", "delete@trusted.example")],
    [
      "unverified-token",
      identity("unverified-subject", "unverified@trusted.example", false),
    ],
  ]);
  const verifier = {
    verify: async (request) => {
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
      const verified = token ? identities.get(token) : null;
      if (!verified) throw new Error("Test request is missing a known identity.");
      return verified;
    },
  };
  const repository = new D1Project42Repository(database, "e2e");
  const env = {
    INSTALLATION_ID: "e2e",
    ALLOWED_ORIGINS: allowedOrigin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: "owner-subject",
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    PROFILE_PHOTOS: profilePhotos,
    GITHUB_LINK_CLIENT_ID: "Iv1.1234567890abcdef",
    GITHUB_LINK_CLIENT_SECRET: "s".repeat(40),
    GITHUB_LINK_REDIRECT_URI: `${allowedOrigin}/account/github/callback/`,
  };
  const githubRequests = [];
  const githubLinkAdapter = new GithubIdentityLinkAdapter(
    env,
    async (input, init) => {
      const url = String(input);
      githubRequests.push({ url, init });
      if (url === "https://github.com/login/oauth/access_token") {
        return Response.json({
          access_token: "ephemeral-github-token",
          token_type: "bearer",
          scope: "",
        });
      }
      if (url === "https://api.github.com/user") {
        assert.equal(
          new Headers(init.headers).get("authorization"),
          "Bearer ephemeral-github-token",
        );
        return Response.json({
          id: 424242,
          login: "project42-learner",
          name: "Project 42 learner",
        });
      }
      throw new Error(`Unexpected GitHub test URL: ${url}`);
    },
  );

  async function api(token, path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("origin", allowedOrigin);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return handleRequest(
      new Request(`https://api.example.test${path}`, { ...init, headers }),
      env,
      verifier,
      repository,
      githubLinkAdapter,
    );
  }

  const ownerSession = await api("owner-token", "/v1/session", { method: "POST" });
  assert.equal(ownerSession.status, 200);
  const owner = (await readBody(ownerSession)).account;
  assert.equal(owner.state, "approved");
  assert.deepEqual(new Set(owner.roles), new Set(["learner", "owner"]));

  const initialProfileResponse = await api("owner-token", "/v1/me/profile");
  assert.equal(initialProfileResponse.status, 200);
  const initialProfile = (await readBody(initialProfileResponse)).profile;
  assert.equal(initialProfile.displayName, "owner-subject");
  assert.equal(initialProfile.bio, null);
  assert.equal(initialProfile.locale, null);
  assert.equal(initialProfile.timeZone, null);
  assert.equal(initialProfile.reducedMotion, false);
  assert.equal(initialProfile.highContrast, false);

  const updatedProfileResponse = await api("owner-token", "/v1/me/profile", {
    method: "PATCH",
    body: JSON.stringify({
      displayName: "Owner Example",
      bio: "Teaches and learns with Project 42.",
      organization: "Example learning team",
      location: "Remote",
      websiteUrl: "https://example.test/about",
      locale: "en-us",
      timeZone: "America/New_York",
      reducedMotion: true,
      highContrast: true,
    }),
  });
  assert.equal(updatedProfileResponse.status, 200);
  const updatedProfile = (await readBody(updatedProfileResponse)).profile;
  assert.equal(updatedProfile.displayName, "Owner Example");
  assert.equal(updatedProfile.websiteUrl, "https://example.test/about");
  assert.equal(updatedProfile.locale, "en-US");
  assert.equal(updatedProfile.timeZone, "America/New_York");
  assert.equal(updatedProfile.reducedMotion, true);
  assert.equal(updatedProfile.highContrast, true);

  const refreshedOwnerResponse = await api("owner-token", "/v1/me");
  assert.equal(refreshedOwnerResponse.status, 200);
  assert.equal((await readBody(refreshedOwnerResponse)).account.displayName, "Owner Example");

  const unsafeWebsiteResponse = await api("owner-token", "/v1/me/profile", {
    method: "PATCH",
    body: JSON.stringify({ websiteUrl: "http://example.test" }),
  });
  assert.equal(unsafeWebsiteResponse.status, 400);
  assert.equal((await readBody(unsafeWebsiteResponse)).error.code, "invalid_website_url");

  const pngPhoto = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const mismatchedPhotoResponse = await api(
    "owner-token",
    "/v1/me/profile/photo",
    {
      method: "PUT",
      headers: { "content-type": "image/png" },
      body: Buffer.from("This is not a PNG image."),
    },
  );
  assert.equal(mismatchedPhotoResponse.status, 400);
  assert.equal(
    (await readBody(mismatchedPhotoResponse)).error.code,
    "profile_photo_signature_mismatch",
  );
  const photoUploadResponse = await api("owner-token", "/v1/me/profile/photo", {
    method: "PUT",
    headers: { "content-type": "image/png" },
    body: pngPhoto,
  });
  assert.equal(photoUploadResponse.status, 200);
  assert.equal((await readBody(photoUploadResponse)).photo.available, true);

  const photoResponse = await api("owner-token", "/v1/me/profile/photo");
  assert.equal(photoResponse.status, 200);
  assert.equal(photoResponse.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await photoResponse.arrayBuffer()), pngPhoto);

  const profileWithPhotoResponse = await api("owner-token", "/v1/me/profile");
  assert.equal(profileWithPhotoResponse.status, 200);
  assert.equal((await readBody(profileWithPhotoResponse)).profile.photoAvailable, true);

  const photoDeleteResponse = await api("owner-token", "/v1/me/profile/photo", {
    method: "DELETE",
  });
  assert.equal(photoDeleteResponse.status, 204);
  const missingPhotoResponse = await api("owner-token", "/v1/me/profile/photo");
  assert.equal(missingPhotoResponse.status, 404);

  const learnerSession = await api("learner-token", "/v1/session", {
    method: "POST",
  });
  assert.equal(learnerSession.status, 202);
  const learner = (await readBody(learnerSession)).account;
  assert.equal(learner.state, "pending");

  const pendingProgress = await api("learner-token", "/v1/me/progress");
  assert.equal(pendingProgress.status, 403);
  assert.equal((await readBody(pendingProgress)).error.code, "account_pending");

  const pendingAdmin = await api("learner-token", "/v1/admin/accounts");
  assert.equal(pendingAdmin.status, 403);
  assert.equal((await readBody(pendingAdmin)).error.code, "owner_required");

  await database
    .prepare(
      "UPDATE users SET created_at = ? WHERE installation_id = ?",
    )
    .bind("2026-07-29T06:00:00.000Z", "e2e")
    .run();
  const accountList = await api("owner-token", "/v1/admin/accounts");
  assert.equal(accountList.status, 200);
  const accountListBody = await readBody(accountList);
  assert.equal(accountListBody.accounts.length, 2);
  assert.deepEqual(
    accountListBody.accounts.map((account) => account.id),
    accountListBody.accounts.map((account) => account.id).sort(),
  );
  assert.deepEqual(accountListBody.page, {
    pageSize: 50,
    returnedCount: 2,
    hasMore: false,
    nextCursor: null,
  });

  const firstAccountPage = await readBody(
    await api("owner-token", "/v1/admin/accounts?pageSize=1"),
  );
  assert.equal(firstAccountPage.accounts.length, 1);
  assert.equal(firstAccountPage.page.hasMore, true);
  assert.equal(typeof firstAccountPage.page.nextCursor, "string");
  const secondAccountPage = await readBody(
    await api(
      "owner-token",
      `/v1/admin/accounts?pageSize=1&cursor=${encodeURIComponent(
        firstAccountPage.page.nextCursor,
      )}`,
    ),
  );
  assert.equal(secondAccountPage.accounts.length, 1);
  assert.equal(secondAccountPage.page.hasMore, false);
  assert.equal(secondAccountPage.page.nextCursor, null);
  assert.equal(
    new Set([
      firstAccountPage.accounts[0].id,
      secondAccountPage.accounts[0].id,
    ]).size,
    2,
  );

  const tamperedAccountCursor =
    (firstAccountPage.page.nextCursor[0] === "A" ? "B" : "A") +
    firstAccountPage.page.nextCursor.slice(1);
  const tamperedAccountPage = await api(
    "owner-token",
    `/v1/admin/accounts?pageSize=1&cursor=${encodeURIComponent(
      tamperedAccountCursor,
    )}`,
  );
  assert.equal(tamperedAccountPage.status, 400);
  assert.equal(
    (await readBody(tamperedAccountPage)).error.code,
    "invalid_admin_cursor",
  );
  const filterMismatchedCursor = await api(
    "owner-token",
    `/v1/admin/accounts?pageSize=1&state=pending&cursor=${encodeURIComponent(
      firstAccountPage.page.nextCursor,
    )}`,
  );
  assert.equal(filterMismatchedCursor.status, 400);
  assert.equal(
    (await readBody(filterMismatchedCursor)).error.code,
    "invalid_admin_cursor",
  );
  for (const pageSize of ["0", "101", "1.5"]) {
    const invalidPageSize = await api(
      "owner-token",
      `/v1/admin/accounts?pageSize=${pageSize}`,
    );
    assert.equal(invalidPageSize.status, 400);
    assert.equal(
      (await readBody(invalidPageSize)).error.code,
      "invalid_admin_page_size",
    );
  }
  const unauthorizedMalformedCursor = await api(
    "learner-token",
    "/v1/admin/accounts?cursor=altered",
  );
  assert.equal(unauthorizedMalformedCursor.status, 403);
  assert.equal(
    (await readBody(unauthorizedMalformedCursor)).error.code,
    "owner_required",
  );

  const approved = await api(
    "owner-token",
    `/v1/admin/accounts/${encodeURIComponent(learner.id)}/state`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "approved",
        reason: "Approved by the end-to-end fixture.",
      }),
    },
  );
  assert.equal(approved.status, 200);
  const approvedLearner = (await readBody(approved)).account;
  assert.equal(approvedLearner.state, "approved");
  const learnerBrowserToken = "learner-browser-session-before-suspension";
  await repository.createBrowserSession({
    account: approvedLearner,
    identity: identities.get("learner-token"),
    tokenDigest: await sha256Hex(learnerBrowserToken),
    requestId: "learner-browser-session-create",
    now: new Date().toISOString(),
  });
  assert.ok(
    await repository.resolveBrowserSession(
      await sha256Hex(learnerBrowserToken),
      new Date().toISOString(),
    ),
  );

  const consent = await api("learner-token", "/v1/me/consents", {
    method: "POST",
    body: JSON.stringify({
      purpose: "learning-record",
      policyVersion: "2026-07-27",
      decision: "granted",
    }),
  });
  assert.equal(consent.status, 201);
  assert.equal((await readBody(consent)).consent.contractStatus, "current");
  for (const body of [
    {
      purpose: "unapproved-purpose",
      policyVersion: "2026-07-27",
      decision: "granted",
    },
    {
      purpose: "learning-record",
      policyVersion: "2026-07-26",
      decision: "granted",
    },
  ]) {
    const rejectedConsent = await api("learner-token", "/v1/me/consents", {
      method: "POST",
      body: JSON.stringify(body),
    });
    assert.equal(rejectedConsent.status, 400);
  }

  for (const path of [
    `/v1/me/profile?userId=${encodeURIComponent(owner.id)}`,
    `/v1/me/consents?userId=${encodeURIComponent(owner.id)}`,
    `/v1/me/export?userId=${encodeURIComponent(owner.id)}`,
    `/v1/me/deletion?userId=${encodeURIComponent(owner.id)}`,
  ]) {
    const crossAccount = await api("learner-token", path);
    assert.equal(crossAccount.status, 403);
    assert.equal(
      (await readBody(crossAccount)).error.code,
      "self_scope_selector_forbidden",
    );
  }
  assert.equal(
    (await readBody(await api("owner-token", "/v1/me/profile"))).profile
      .displayName,
    "Owner Example",
  );

  const otherRepository = new D1Project42Repository(database, "e2e-other");
  const otherEnv = { ...env, INSTALLATION_ID: "e2e-other" };
  async function otherApi(token, path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("origin", allowedOrigin);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return handleRequest(
      new Request(`https://api.example.test${path}`, { ...init, headers }),
      otherEnv,
      verifier,
      otherRepository,
      githubLinkAdapter,
    );
  }
  const otherOwner = (
    await readBody(
      await otherApi("owner-token", "/v1/session", { method: "POST" }),
    )
  ).account;
  const otherLearner = (
    await readBody(
      await otherApi("learner-token", "/v1/session", { method: "POST" }),
    )
  ).account;
  assert.equal(otherOwner.installationId, "e2e-other");
  assert.equal(otherLearner.state, "pending");
  const otherFirstAccountPage = await readBody(
    await otherApi("owner-token", "/v1/admin/accounts?pageSize=1"),
  );
  assert.equal(otherFirstAccountPage.page.hasMore, true);
  assert.ok(
    otherFirstAccountPage.accounts.every(
      (account) => account.installationId === "e2e-other",
    ),
  );
  const crossInstallationCursor = await api(
    "owner-token",
    `/v1/admin/accounts?pageSize=1&cursor=${encodeURIComponent(
      otherFirstAccountPage.page.nextCursor,
    )}`,
  );
  assert.equal(crossInstallationCursor.status, 400);
  assert.equal(
    (await readBody(crossInstallationCursor)).error.code,
    "invalid_admin_cursor",
  );
  const mainInstallationAccounts = await readBody(
    await api("owner-token", "/v1/admin/accounts?pageSize=100"),
  );
  assert.ok(
    mainInstallationAccounts.accounts.every(
      (account) => account.installationId === "e2e",
    ),
  );
  assert.equal(
    (
      await otherApi(
        "owner-token",
        `/v1/admin/accounts/${encodeURIComponent(otherLearner.id)}/state`,
        {
          method: "PATCH",
          body: JSON.stringify({
            state: "approved",
            reason: "Approve the isolated-installation fixture.",
          }),
        },
      )
    ).status,
    200,
  );
  const otherProfileUpdate = await otherApi(
    "learner-token",
    "/v1/me/profile",
    {
      method: "PATCH",
      body: JSON.stringify({
        displayName: "Other installation learner",
        locale: "fr-CA",
        timeZone: "America/Toronto",
        reducedMotion: true,
        highContrast: false,
      }),
    },
  );
  assert.equal(otherProfileUpdate.status, 200);
  assert.equal(
    (
      await otherApi("learner-token", "/v1/me/consents", {
        method: "POST",
        body: JSON.stringify({
          purpose: "learning-record",
          policyVersion: "2026-07-27",
          decision: "granted",
        }),
      })
    ).status,
    201,
  );
  const otherExport = await otherApi("learner-token", "/v1/me/export");
  assert.equal(otherExport.status, 200);
  const otherExportBody = (await readBody(otherExport)).export;
  assert.equal(otherExportBody.account.installationId, "e2e-other");
  assert.equal(otherExportBody.profile.displayName, "Other installation learner");
  assert.equal(otherExportBody.consents.length, 1);
  assert.equal(
    (await readBody(await api("learner-token", "/v1/me/profile"))).profile
      .displayName,
    "learner-subject",
  );
  assert.equal(
    (await readBody(await api("learner-token", "/v1/me/consents"))).consents
      .length,
    1,
  );
  const otherDeletionBody = await readBody(
    await otherApi("learner-token", "/v1/me/deletion", {
      method: "POST",
      body: JSON.stringify({ confirmation: "DELETE MY PROJECT 42 ACCOUNT" }),
    }),
  );
  assert.equal(
    (await readBody(await api("learner-token", "/v1/me/deletion"))).requests
      .length,
    0,
  );
  const wrongInstallationReceipt = await handleRequest(
    new Request("https://api.example.test/v1/deletion-status", {
      method: "POST",
      headers: { "content-type": "application/json", origin: allowedOrigin },
      body: JSON.stringify({
        requestId: otherDeletionBody.receipt.requestId,
        statusToken: otherDeletionBody.receipt.statusToken,
      }),
    }),
    env,
    verifier,
    repository,
  );
  assert.equal(wrongInstallationReceipt.status, 404);
  assert.equal(
    (
      await otherApi("learner-token", "/v1/me/deletion", {
        method: "DELETE",
      })
    ).status,
    200,
  );

  const path = starterCatalog.paths[0];
  const moduleId = path.moduleIds[0];
  const progress = {
    schemaVersion: 1,
    displayName: "Lifecycle learner",
    startedPathIds: [path.id],
    completedModuleIds: [moduleId],
    attempts: [
      {
        id: "attempt-e2e-1",
        pathId: path.id,
        moduleId,
        contentVersion: starterCatalog.contentVersion,
        scorePercent: 100,
        passed: true,
        completedAt: "2026-07-27T00:00:00.000Z",
      },
    ],
    badges: [
      {
        id: "badge-e2e",
        name: "E2E badge",
        description: "Evidence that the badge record survived synchronization.",
        earnedAt: "2026-07-27T00:00:00.000Z",
        evidenceModuleIds: [moduleId],
      },
    ],
    updatedAt: "2026-07-27T00:00:00.000Z",
  };
  for (let index = 0; index < 2; index += 1) {
    const imported = await api("learner-token", "/v1/me/progress", {
      method: "POST",
      body: JSON.stringify({
        importId: "browser-import-e2e-1",
        source: "browser-local-v1",
        progress,
      }),
    });
    assert.equal(imported.status, 200);
    assert.equal((await readBody(imported)).progress.revision, 1);
  }

  const synchronized = await api("learner-token", "/v1/me/progress");
  assert.equal(synchronized.status, 200);
  assert.deepEqual((await readBody(synchronized)).progress.progress, progress);

  const initialIdentitiesResponse = await api(
    "learner-token",
    "/v1/me/identities",
  );
  assert.equal(initialIdentitiesResponse.status, 200);
  const initialIdentities = (await readBody(initialIdentitiesResponse)).identities;
  assert.equal(initialIdentities.length, 1);
  assert.equal(initialIdentities[0].provider, "oidc");
  assert.equal(initialIdentities[0].primary, true);
  assert.equal(initialIdentities[0].canUnlink, false);
  assert.equal("subject" in initialIdentities[0], false);

  const primaryUnlink = await api(
    "learner-token",
    `/v1/me/identities/${encodeURIComponent(initialIdentities[0].id)}`,
    { method: "DELETE" },
  );
  assert.equal(primaryUnlink.status, 409);
  assert.equal(
    (await readBody(primaryUnlink)).error.code,
    "primary_identity_required",
  );

  const codeVerifier = "v".repeat(43);
  const linkStartResponse = await api(
    "learner-token",
    "/v1/me/identity-links/github",
    {
      method: "POST",
      body: JSON.stringify({
        codeChallenge: await pkceChallenge(codeVerifier),
        codeChallengeMethod: "S256",
        returnPath: "/account?linked=github",
      }),
    },
  );
  assert.equal(linkStartResponse.status, 201);
  const linkStart = await readBody(linkStartResponse);
  const link = linkStart.link;
  assert.equal(link.provider, "github");
  assert.equal(link.codeChallengeMethod, "S256");
  assert.equal(link.returnPath, "/account?linked=github");
  const authorizationUrl = new URL(linkStart.authorizationUrl);
  assert.equal(authorizationUrl.origin, "https://github.com");
  assert.equal(authorizationUrl.pathname, "/login/oauth/authorize");
  assert.equal(authorizationUrl.searchParams.get("state"), link.state);
  assert.equal(authorizationUrl.searchParams.has("scope"), false);
  const storedLink = await database
    .prepare(
      "SELECT state_digest, status FROM identity_link_transactions WHERE id = ?",
    )
    .bind(link.id)
    .first();
  assert.equal(storedLink.status, "pending");
  assert.notEqual(storedLink.state_digest, link.state);

  const currentLearner = await repository.findAccount(
    identities.get("learner-token"),
  );
  assert.ok(currentLearner);
  const wrongVerifier = await api(
    "learner-token",
    "/v1/me/identity-links/github/complete",
    {
      method: "POST",
      body: JSON.stringify({
        transactionId: link.id,
        state: link.state,
        code: "temporary-code",
        codeVerifier: "w".repeat(43),
      }),
    },
  );
  assert.equal(wrongVerifier.status, 400);
  assert.equal(githubRequests.length, 0);
  const linkCompleteResponse = await api(
    "learner-token",
    "/v1/me/identity-links/github/complete",
    {
      method: "POST",
      body: JSON.stringify({
        transactionId: link.id,
        state: link.state,
        code: "temporary-code",
        codeVerifier,
      }),
    },
  );
  assert.equal(linkCompleteResponse.status, 200);
  const linkCompletion = await readBody(linkCompleteResponse);
  const githubIdentity = linkCompletion.linkedIdentity;
  assert.equal(linkCompletion.returnPath, "/account?linked=github");
  assert.equal(githubRequests.length, 2);
  const tokenRequestBody = new URLSearchParams(githubRequests[0].init.body);
  assert.equal(tokenRequestBody.get("code"), "temporary-code");
  assert.equal(tokenRequestBody.get("code_verifier"), codeVerifier);
  assert.equal(tokenRequestBody.has("scope"), false);
  assert.equal(
    JSON.stringify(linkCompletion).includes("ephemeral-github-token"),
    false,
  );
  assert.equal(githubIdentity.provider, "github");
  assert.equal(githubIdentity.primary, false);
  assert.equal(githubIdentity.canUnlink, true);
  const replay = await api(
    "learner-token",
    "/v1/me/identity-links/github/complete",
    {
      method: "POST",
      body: JSON.stringify({
        transactionId: link.id,
        state: link.state,
        code: "replayed-code",
        codeVerifier,
      }),
    },
  );
  assert.equal(replay.status, 400);
  assert.equal((await readBody(replay)).error.code, "invalid_identity_link");
  assert.equal(githubRequests.length, 2);

  const otherSession = await api("other-token", "/v1/session", {
    method: "POST",
  });
  assert.equal(otherSession.status, 202);
  const otherAccount = (await readBody(otherSession)).account;
  const approveOther = await api(
    "owner-token",
    `/v1/admin/accounts/${encodeURIComponent(otherAccount.id)}/state`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "approved",
        reason: "Approve the linked-identity collision fixture.",
      }),
    },
  );
  assert.equal(approveOther.status, 200);
  const otherVerifier = "o".repeat(43);
  const otherLinkStart = await api(
    "other-token",
    "/v1/me/identity-links/github",
    {
      method: "POST",
      body: JSON.stringify({
        codeChallenge: await pkceChallenge(otherVerifier),
        codeChallengeMethod: "S256",
        returnPath: "/account?linked=github",
      }),
    },
  );
  assert.equal(otherLinkStart.status, 201);
  const otherLink = (await readBody(otherLinkStart)).link;
  const collision = await api(
    "other-token",
    "/v1/me/identity-links/github/complete",
    {
      method: "POST",
      body: JSON.stringify({
        transactionId: otherLink.id,
        state: otherLink.state,
        code: "other-temporary-code",
        codeVerifier: otherVerifier,
      }),
    },
  );
  assert.equal(collision.status, 409);
  assert.equal(
    (await readBody(collision)).error.code,
    "identity_already_linked",
  );
  assert.equal(githubRequests.length, 4);
  assert.equal(
    (
      await database
        .prepare(
          "SELECT status FROM identity_link_transactions WHERE id = ?",
        )
        .bind(otherLink.id)
        .first()
    ).status,
    "failed",
  );
  const otherIdentities = await api("other-token", "/v1/me/identities");
  assert.equal(otherIdentities.status, 200);
  assert.equal((await readBody(otherIdentities)).identities.length, 1);

  const linkedIdentitiesResponse = await api(
    "learner-token",
    "/v1/me/identities",
  );
  assert.equal(linkedIdentitiesResponse.status, 200);
  assert.equal((await readBody(linkedIdentitiesResponse)).identities.length, 2);

  const learnerExport = await api("learner-token", "/v1/me/export");
  assert.equal(learnerExport.status, 200);
  const exported = (await readBody(learnerExport)).export;
  assert.equal(exported.progress.revision, 1);
  assert.equal(exported.profile.displayName, "learner-subject");
  assert.equal(exported.assessmentAttempts.length, 1);
  assert.equal(exported.transcriptEntries.length, starterCatalog.paths.length);
  assert.equal(exported.badges.length, 1);
  assert.equal(exported.consents.length, 1);
  assert.equal(exported.linkedIdentities.length, 2);

  const unlinkGithub = await api(
    "learner-token",
    `/v1/me/identities/${encodeURIComponent(githubIdentity.id)}`,
    { method: "DELETE" },
  );
  assert.equal(unlinkGithub.status, 204);
  const activeIdentitiesAfterUnlink = await api(
    "learner-token",
    "/v1/me/identities",
  );
  assert.equal(activeIdentitiesAfterUnlink.status, 200);
  assert.equal(
    (await readBody(activeIdentitiesAfterUnlink)).identities.length,
    1,
  );
  const exportAfterUnlink = await api("learner-token", "/v1/me/export");
  assert.equal(exportAfterUnlink.status, 200);
  const exportedIdentityHistory = (await readBody(exportAfterUnlink)).export
    .linkedIdentities;
  assert.equal(exportedIdentityHistory.length, 2);
  assert.ok(
    exportedIdentityHistory.some(
      (linkedIdentity) =>
        linkedIdentity.provider === "github" &&
        linkedIdentity.status === "unlinked" &&
        linkedIdentity.unlinkedAt,
    ),
  );

  const suspended = await api(
    "owner-token",
    `/v1/admin/accounts/${encodeURIComponent(learner.id)}/state`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "suspended",
        reason: "Exercise the reversible suspension path.",
      }),
    },
  );
  assert.equal(suspended.status, 200);
  assert.equal(
    await repository.resolveBrowserSession(
      await sha256Hex(learnerBrowserToken),
      new Date().toISOString(),
    ),
    null,
  );
  const blocked = await api("learner-token", "/v1/me/progress");
  assert.equal(blocked.status, 403);
  assert.equal((await readBody(blocked)).error.code, "account_suspended");
  const blockedProfileUpdate = await api("learner-token", "/v1/me/profile", {
    method: "PATCH",
    body: JSON.stringify({ displayName: "Suspended learner" }),
  });
  assert.equal(blockedProfileUpdate.status, 403);
  assert.equal(
    (await readBody(blockedProfileUpdate)).error.code,
    "account_suspended",
  );

  const restored = await api(
    "owner-token",
    `/v1/admin/accounts/${encodeURIComponent(learner.id)}/state`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "approved",
        reason: "Restore access after the suspension fixture.",
      }),
    },
  );
  assert.equal(restored.status, 200);
  const restoredLearner = (await readBody(restored)).account;
  const restoredBrowserToken = "learner-browser-session-before-revocation";
  await repository.createBrowserSession({
    account: restoredLearner,
    identity: identities.get("learner-token"),
    tokenDigest: await sha256Hex(restoredBrowserToken),
    requestId: "learner-browser-session-restored",
    now: new Date().toISOString(),
  });

  const disabledDomain = await api("owner-token", "/v1/admin/domains", {
    method: "POST",
    body: JSON.stringify({
      domain: "trusted.example",
      enabled: true,
      reason: "Prove the verified-claim launch gate stays closed.",
    }),
  });
  assert.equal(disabledDomain.status, 409);
  assert.equal(
    (await readBody(disabledDomain)).error.code,
    "domain_approval_not_enabled",
  );

  const stagedDomainResponse = await api("owner-token", "/v1/admin/domains", {
    method: "POST",
    body: JSON.stringify({
      domain: "staged.example",
      enabled: false,
      reason: "Stage the exact domain before claim validation.",
    }),
  });
  assert.equal(stagedDomainResponse.status, 201);
  const stagedDomain = (await readBody(stagedDomainResponse)).domain;
  assert.equal(stagedDomain.enabled, false);

  const removedDomainResponse = await api(
    "owner-token",
    `/v1/admin/domains/${encodeURIComponent(stagedDomain.id)}`,
    {
      method: "DELETE",
      body: JSON.stringify({
        reason: "Remove the unused staged domain.",
      }),
    },
  );
  assert.equal(removedDomainResponse.status, 200);
  assert.equal(
    (
      await database
        .prepare("SELECT COUNT(*) AS count FROM approved_email_domains WHERE id = ?")
        .bind(stagedDomain.id)
        .first()
    ).count,
    0,
  );

  env.DOMAIN_APPROVAL_ENABLED = "true";
  const domain = await api("owner-token", "/v1/admin/domains", {
    method: "POST",
    body: JSON.stringify({
      domain: "trusted.example",
      enabled: true,
      reason: "Exercise exact verified-domain approval.",
    }),
  });
  assert.equal(domain.status, 201);

  const deletionSession = await api("delete-token", "/v1/session", {
    method: "POST",
  });
  assert.equal(deletionSession.status, 200);
  const deletionAccount = (await readBody(deletionSession)).account;
  assert.equal(deletionAccount.state, "approved");

  const unverifiedSession = await api("unverified-token", "/v1/session", {
    method: "POST",
  });
  assert.equal(unverifiedSession.status, 202);
  assert.equal((await readBody(unverifiedSession)).account.state, "pending");

  const deletion = await api("delete-token", "/v1/me/deletion", {
    method: "POST",
    body: JSON.stringify({ confirmation: "DELETE MY PROJECT 42 ACCOUNT" }),
  });
  assert.equal(deletion.status, 202);
  const deletionBody = await readBody(deletion);
  const deletionRequest = deletionBody.deletionRequest;
  const deletionReceipt = deletionBody.receipt;
  assert.equal(deletionReceipt.requestId, deletionRequest.id);
  assert.match(deletionReceipt.statusToken, /^[A-Za-z0-9_-]{64}$/);
  const storedDeletionReceipt = await database
    .prepare(
      "SELECT status_token_digest FROM deletion_requests WHERE installation_id = ? AND id = ?",
    )
    .bind("e2e", deletionRequest.id)
    .first();
  assert.match(storedDeletionReceipt.status_token_digest, /^[0-9a-f]{64}$/);
  assert.notEqual(
    storedDeletionReceipt.status_token_digest,
    deletionReceipt.statusToken,
  );
  const pendingDeletionStatus = await handleRequest(
    new Request("https://api.example.test/v1/deletion-status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: allowedOrigin,
      },
      body: JSON.stringify({
        requestId: deletionReceipt.requestId,
        statusToken: deletionReceipt.statusToken,
      }),
    }),
    env,
    verifier,
    repository,
  );
  assert.equal(pendingDeletionStatus.status, 200);
  assert.equal((await readBody(pendingDeletionStatus)).status.state, "requested");
  await database
    .prepare(
      "UPDATE deletion_requests SET cancellation_deadline = ? WHERE id = ?",
    )
    .bind("2026-07-26T00:00:00.000Z", deletionRequest.id)
    .run();

  const completedDeletion = await api(
    "owner-token",
    `/v1/admin/deletions/${encodeURIComponent(deletionRequest.id)}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: "Complete the expired end-to-end deletion fixture.",
      }),
    },
  );
  assert.equal(completedDeletion.status, 200);
  const completedDeletionStatus = await handleRequest(
    new Request("https://api.example.test/v1/deletion-status", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: allowedOrigin,
      },
      body: JSON.stringify({
        requestId: deletionReceipt.requestId,
        statusToken: deletionReceipt.statusToken,
      }),
    }),
    env,
    verifier,
    repository,
  );
  assert.equal(completedDeletionStatus.status, 200);
  assert.equal((await readBody(completedDeletionStatus)).status.state, "completed");
  assert.equal(
    (
      await database
        .prepare("SELECT COUNT(*) AS count FROM users WHERE id = ?")
        .bind(deletionAccount.id)
        .first()
    ).count,
    0,
  );
  assert.equal(
    (
      await database
        .prepare(
          "SELECT COUNT(*) AS count FROM deletion_tombstones WHERE deletion_request_id = ?",
        )
        .bind(deletionRequest.id)
        .first()
    ).count,
    1,
  );
  assert.equal(
    (
      await database
        .prepare(
          "SELECT COUNT(*) AS count FROM deleted_identity_tombstones WHERE deletion_request_id = ?",
        )
        .bind(deletionRequest.id)
        .first()
    ).count,
    1,
  );

  const revoked = await api(
    "owner-token",
    `/v1/admin/accounts/${encodeURIComponent(learner.id)}/state`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "revoked",
        reason: "Exercise terminal revocation after recovery.",
      }),
    },
  );
  assert.equal(revoked.status, 200);
  assert.equal(
    await repository.resolveBrowserSession(
      await sha256Hex(restoredBrowserToken),
      new Date().toISOString(),
    ),
    null,
  );
  const revokedProgress = await api("learner-token", "/v1/me/progress");
  assert.equal(revokedProgress.status, 403);
  assert.equal((await readBody(revokedProgress)).error.code, "account_revoked");

  const audit = await api("owner-token", "/v1/admin/audit");
  assert.equal(audit.status, 200);
  const auditBody = await readBody(audit);
  const events = auditBody.events;
  assert.equal(auditBody.page.pageSize, 50);
  assert.equal(auditBody.page.returnedCount, events.length);
  for (const action of [
    "account.register",
    "account.state.change",
    "consent.record",
    "progress.import",
    "profile.update",
    "profile.photo.update",
    "profile.photo.delete",
    "identity.link.start",
    "identity.link.complete",
    "identity.unlink",
    "domain.create",
    "domain.delete",
    "deletion.request",
    "deletion.complete",
    "authorization.owner.denied",
    "authorization.self-scope.denied",
  ]) {
    assert.ok(events.some((event) => event.action === action), `missing ${action}`);
  }
  assert.ok(
    events.some(
      (event) =>
        event.action === "authorization.owner.denied" &&
        event.outcome === "denied" &&
        event.targetType === "admin_route",
    ),
  );
  assert.equal(
    events.filter(
      (event) =>
        event.action === "authorization.self-scope.denied" &&
        event.outcome === "denied",
    ).length,
    4,
  );
  assert.ok(events.every((event) => event.requestId));

  const pagedAuditIds = [];
  let auditCursor = null;
  do {
    const page = await readBody(
      await api(
        "owner-token",
        `/v1/admin/audit?pageSize=7${
          auditCursor
            ? `&cursor=${encodeURIComponent(auditCursor)}`
            : ""
        }`,
      ),
    );
    assert.ok(page.events.length >= 1 && page.events.length <= 7);
    assert.equal(page.page.returnedCount, page.events.length);
    assert.equal(page.page.hasMore, page.page.nextCursor !== null);
    pagedAuditIds.push(...page.events.map((event) => event.id));
    auditCursor = page.page.nextCursor;
  } while (auditCursor);
  assert.equal(new Set(pagedAuditIds).size, pagedAuditIds.length);
  assert.ok(pagedAuditIds.length >= events.length);
  assert.deepEqual(
    pagedAuditIds.slice(0, events.length),
    events.map((event) => event.id),
  );

  const firstAuditPage = await readBody(
    await api("owner-token", "/v1/admin/audit?pageSize=1"),
  );
  assert.equal(firstAuditPage.page.hasMore, true);
  const tamperedAuditCursor =
    (firstAuditPage.page.nextCursor[0] === "A" ? "B" : "A") +
    firstAuditPage.page.nextCursor.slice(1);
  const tamperedAuditPage = await api(
    "owner-token",
    `/v1/admin/audit?pageSize=1&cursor=${encodeURIComponent(
      tamperedAuditCursor,
    )}`,
  );
  assert.equal(tamperedAuditPage.status, 400);
  assert.equal(
    (await readBody(tamperedAuditPage)).error.code,
    "invalid_admin_cursor",
  );
});
