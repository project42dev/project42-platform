import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { D1Project42Repository, handleRequest } from "../dist/worker.js";

// RR-03 / T18 (profile photo becomes public or survives account deletion):
// the admin deletion-completion route in worker.ts deletes every profile
// photo object key returned by completeDeletion() from R2, but nothing in
// the test suite proved the object was actually gone afterward - only that
// the metadata row was cleared. This closes that gap end to end: upload a
// real photo object, request and complete deletion through the real HTTP
// routes, and assert the R2 object is unreachable both by direct get() and
// through the authenticated read route.

const issuer = "https://issuer.example.test";
const allowedOrigin = "https://learn.example.test";

function identity(subject, email) {
  return {
    issuer,
    subject,
    email,
    emailVerified: true,
    displayName: subject,
    issuedAt: Math.floor(Date.now() / 1_000),
    authenticatedAt: Math.floor(Date.now() / 1_000),
  };
}

async function readBody(response) {
  return response.json();
}

test("completing account deletion removes the learner's profile photo object from storage", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-deletion-photo-cleanup" },
    r2Buckets: { PROFILE_PHOTOS: "project42-deletion-photo-cleanup-photos" },
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
    ["learner-token", identity("departing-learner", "departing@example.test")],
  ]);
  const verifier = {
    verify: async (request) => {
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
      const verified = token ? identities.get(token) : null;
      if (!verified) throw new Error("Test request is missing a known identity.");
      return verified;
    },
  };
  const repository = new D1Project42Repository(database, "photo-cleanup");
  const env = {
    INSTALLATION_ID: "photo-cleanup",
    ALLOWED_ORIGINS: allowedOrigin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: "owner-subject",
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    PROFILE_PHOTOS: profilePhotos,
  };

  async function api(token, path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("origin", allowedOrigin);
    if (init.body && !headers.has("content-type") && typeof init.body === "string") {
      headers.set("content-type", "application/json");
    }
    return handleRequest(
      new Request(`https://api.example.test${path}`, { ...init, headers }),
      env,
      verifier,
      repository,
    );
  }

  const ownerSession = await api("owner-token", "/v1/session", { method: "POST" });
  assert.equal(ownerSession.status, 200);
  const owner = (await readBody(ownerSession)).account;

  const learnerSession = await api("learner-token", "/v1/session", { method: "POST" });
  assert.equal(learnerSession.status, 202, "the learner starts out pending approval");
  const learner = await repository.findAccount(identities.get("learner-token"));
  assert.ok(learner);

  const approve = await api(
    "owner-token",
    `/v1/admin/accounts/${encodeURIComponent(learner.id)}/state`,
    {
      method: "PATCH",
      body: JSON.stringify({
        state: "approved",
        reason: "Approve the departing learner for the deletion/photo fixture.",
      }),
    },
  );
  assert.equal(approve.status, 200);

  const pngPhoto = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  const upload = await api("learner-token", "/v1/me/profile/photo", {
    method: "PUT",
    headers: { "content-type": "image/png" },
    body: pngPhoto,
  });
  assert.equal(upload.status, 200);
  assert.equal((await readBody(upload)).photo.available, true);

  const photoMetadata = await repository.getProfilePhotoMetadata(learner.id);
  assert.ok(photoMetadata, "the uploaded photo must have a stored object key");
  assert.ok(
    await profilePhotos.get(photoMetadata.objectKey),
    "the photo object must exist in storage before deletion",
  );

  const readBeforeDeletion = await api("learner-token", "/v1/me/profile/photo");
  assert.equal(readBeforeDeletion.status, 200);

  const deletion = await api("learner-token", "/v1/me/deletion", {
    method: "POST",
    body: JSON.stringify({ confirmation: "DELETE MY PROJECT 42 ACCOUNT" }),
  });
  assert.equal(deletion.status, 202);
  const deletionRequest = (await readBody(deletion)).deletionRequest;

  // Fast-forward past the seven-day cancellation window without waiting real
  // time, matching the pattern used by tests/account-service-e2e.test.mjs.
  await database
    .prepare("UPDATE deletion_requests SET cancellation_deadline = ? WHERE id = ?")
    .bind("2020-01-01T00:00:00.000Z", deletionRequest.id)
    .run();

  const completion = await api(
    "owner-token",
    `/v1/admin/deletions/${encodeURIComponent(deletionRequest.id)}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        reason: "Complete the deletion/photo-object cleanup fixture.",
      }),
    },
  );
  assert.equal(completion.status, 200);

  assert.equal(
    await profilePhotos.get(photoMetadata.objectKey),
    null,
    "the profile photo object must be removed from storage once deletion completes",
  );

  const readAfterDeletion = await api("learner-token", "/v1/me/profile/photo");
  assert.equal(
    readAfterDeletion.status,
    401,
    "the deleted account's identity no longer resolves to a registered user",
  );

  const photoMetadataAfterDeletion = await repository.getProfilePhotoMetadata(
    learner.id,
  );
  assert.equal(
    photoMetadataAfterDeletion,
    null,
    "the profile row (and its photo metadata) must not survive account deletion",
  );
});
