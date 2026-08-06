import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { starterCatalog } from "../dist/index.js";
import {
  D1Project42Repository,
  handleRequest,
} from "../dist/worker.js";

const issuer = "https://issuer.merge.example.test";
const allowedOrigin = "https://learn.merge.example.test";

function identity(subject, email) {
  return {
    provider: "oidc",
    issuer,
    subject,
    email,
    emailVerified: true,
    displayName: subject,
    issuedAt: Math.floor(Date.now() / 1_000),
    authenticatedAt: Math.floor(Date.now() / 1_000),
  };
}

function progress(displayName, scorePercent) {
  const path = starterCatalog.paths[0];
  const moduleId = path.moduleIds[0];
  return {
    schemaVersion: 1,
    displayName,
    startedPathIds: [path.id],
    completedModuleIds: scorePercent >= 80 ? [moduleId] : [],
    attempts: [
      {
        id: "shared-attempt",
        pathId: path.id,
        moduleId,
        contentVersion: starterCatalog.contentVersion,
        scorePercent,
        passed: scorePercent >= 80,
        completedAt: new Date(
          Date.now() - (100 - scorePercent) * 1_000,
        ).toISOString(),
      },
    ],
    capstoneSubmissions: [],
    badges: [
      {
        id: "shared-badge",
        name: "Shared evidence badge",
        description: "Merge fixture badge.",
        earnedAt: new Date(
          Date.now() - scorePercent * 1_000,
        ).toISOString(),
        evidenceModuleIds: [`evidence-${scorePercent}`],
      },
    ],
    updatedAt: new Date().toISOString(),
  };
}

test("account merge is proof-bound, lossless, idempotent, and recoverable", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-26",
    d1Databases: { PROJECT42_DB: "project42-account-merge" },
    r2Buckets: { PROFILE_PHOTOS: "project42-account-merge-photos" },
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
    ["owner-token", identity("merge-owner", "owner@example.test")],
    ["source-token", identity("merge-source", "source@example.test")],
    ["survivor-token", identity("merge-survivor", "survivor@example.test")],
    ["attacker-token", identity("merge-attacker", "attacker@example.test")],
  ]);
  const verifier = {
    verify: async (request) => {
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
      const verified = token ? identities.get(token) : null;
      if (!verified) throw new Error("Unknown merge test identity.");
      return {
        ...verified,
        issuedAt: Math.floor(Date.now() / 1_000),
        authenticatedAt: Math.floor(Date.now() / 1_000),
      };
    },
  };
  const repository = new D1Project42Repository(database, "merge-e2e");
  const env = {
    INSTALLATION_ID: "merge-e2e",
    ALLOWED_ORIGINS: allowedOrigin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: "merge-owner",
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    PROFILE_PHOTOS: profilePhotos,
  };
  async function api(token, path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("origin", allowedOrigin);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return handleRequest(
      new Request(`https://api.merge.example.test${path}`, {
        ...init,
        headers,
      }),
      env,
      verifier,
      repository,
    );
  }
  async function json(response) {
    return response.json();
  }

  const owner = (await json(
    await api("owner-token", "/v1/session", { method: "POST" }),
  )).account;
  for (const token of ["source-token", "survivor-token", "attacker-token"]) {
    const response = await api(token, "/v1/session", { method: "POST" });
    assert.equal(response.status, 202);
    assert.deepEqual((await json(response)).account, { state: "pending" });
  }
  const source = await repository.findAccount(identities.get("source-token"));
  const survivor = await repository.findAccount(identities.get("survivor-token"));
  const attacker = await repository.findAccount(identities.get("attacker-token"));
  assert.ok(source);
  assert.ok(survivor);
  assert.ok(attacker);
  for (const account of [source, survivor, attacker]) {
    const approval = await api(
      "owner-token",
      `/v1/admin/accounts/${account.id}/state`,
      {
        method: "PATCH",
        body: JSON.stringify({
          state: "approved",
          reason: "Approve the deterministic account merge fixture.",
        }),
      },
    );
    assert.equal(approval.status, 200);
  }

  for (const [token, account, bio, organization, score] of [
    ["source-token", source, "Source biography", "Source organization", 92],
    [
      "survivor-token",
      survivor,
      "Survivor biography",
      "Survivor organization",
      65,
    ],
  ]) {
    assert.equal(
      (
        await api(token, "/v1/me/profile", {
          method: "PATCH",
          body: JSON.stringify({
            bio,
            organization,
            locale: token === "source-token" ? "en-US" : "fr-CA",
            timeZone:
              token === "source-token" ? "America/New_York" : "America/Toronto",
            reducedMotion: token === "source-token",
            highContrast: token !== "source-token",
          }),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(token, "/v1/me/progress", {
          method: "POST",
          body: JSON.stringify({
            importId: `merge-import-${account.id}`,
            source: "project42-portable-json",
            progress: progress(account.displayName, score),
          }),
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await api(token, "/v1/me/consents", {
          method: "POST",
          body: JSON.stringify({
            purpose: "product-improvement",
            policyVersion: "2026-07-27",
            decision: "granted",
          }),
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await api(token, "/v1/me/consents", {
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
  }
  const pngPhoto = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  for (const token of ["source-token", "survivor-token"]) {
    assert.equal(
      (
        await api(token, "/v1/me/profile/photo", {
          method: "PUT",
          headers: { "content-type": "image/png" },
          body: pngPhoto,
        })
      ).status,
      200,
    );
  }
  const photoObjectKeys = (await profilePhotos.list()).objects.map(
    (object) => object.key,
  );
  assert.equal(photoObjectKeys.length, 2);

  const sourceProofBeforeSuspension = (
    await json(
      await api("source-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;
  const survivorProofBeforeSuspension = (
    await json(
      await api("survivor-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;
  assert.equal(
    (
      await api(
        "owner-token",
        `/v1/admin/accounts/${source.id}/state`,
        {
          method: "PATCH",
          body: JSON.stringify({
            state: "suspended",
            reason: "Exercise the suspended-account merge boundary.",
          }),
        },
      )
    ).status,
    200,
  );
  const suspendedPreview = await api(
    "owner-token",
    "/v1/admin/account-merges/preview",
    {
      method: "POST",
      body: JSON.stringify({
        sourceUserId: source.id,
        survivorUserId: survivor.id,
        sourceProofToken: sourceProofBeforeSuspension.token,
        survivorProofToken: survivorProofBeforeSuspension.token,
        idempotencyKey: "merge-suspended-preview-0001",
      }),
    },
  );
  assert.equal(suspendedPreview.status, 409);
  assert.equal(
    (await json(suspendedPreview)).error.code,
    "suspended_account_cannot_merge",
  );
  assert.equal(
    (
      await api(
        "owner-token",
        `/v1/admin/accounts/${source.id}/state`,
        {
          method: "PATCH",
          body: JSON.stringify({
            state: "approved",
            reason: "Resolve suspension before merge preview.",
          }),
        },
      )
    ).status,
    200,
  );
  const previewBeforeSuspension = (
    await json(
      await api("owner-token", "/v1/admin/account-merges/preview", {
        method: "POST",
        body: JSON.stringify({
          sourceUserId: source.id,
          survivorUserId: survivor.id,
          sourceProofToken: sourceProofBeforeSuspension.token,
          survivorProofToken: survivorProofBeforeSuspension.token,
          idempotencyKey: "merge-suspended-completion-0001",
        }),
      }),
    )
  ).merge;
  assert.equal(
    (
      await api(
        "owner-token",
        `/v1/admin/accounts/${survivor.id}/state`,
        {
          method: "PATCH",
          body: JSON.stringify({
            state: "suspended",
            reason: "Exercise the suspended-account completion boundary.",
          }),
        },
      )
    ).status,
    200,
  );
  const suspendedCompletion = await api(
    "owner-token",
    `/v1/admin/account-merges/${previewBeforeSuspension.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `MERGE ${source.id} INTO ${survivor.id}`,
        idempotencyKey: "merge-suspended-completion-0001",
        resolutions: Object.fromEntries(
          previewBeforeSuspension.conflicts.map((conflict) => [
            conflict.key,
            "survivor",
          ]),
        ),
      }),
    },
  );
  assert.equal(suspendedCompletion.status, 409);
  assert.equal(
    (await json(suspendedCompletion)).error.code,
    "suspended_account_cannot_merge",
  );
  assert.equal(
    (
      await api(
        "owner-token",
        `/v1/admin/accounts/${survivor.id}/state`,
        {
          method: "PATCH",
          body: JSON.stringify({
            state: "approved",
            reason: "Resolve suspension before further merge tests.",
          }),
        },
      )
    ).status,
    200,
  );

  const missingConsentAccountProof = (
    await json(
      await api("attacker-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;
  const missingConsentPreview = (
    await json(
      await api("owner-token", "/v1/admin/account-merges/preview", {
        method: "POST",
        body: JSON.stringify({
          sourceUserId: attacker.id,
          survivorUserId: survivor.id,
          sourceProofToken: missingConsentAccountProof.token,
          survivorProofToken: survivorProofBeforeSuspension.token,
          idempotencyKey: "merge-required-consent-missing-0001",
        }),
      }),
    )
  ).merge;
  assert.deepEqual(missingConsentPreview.policyBlocks, [
    {
      kind: "required-consent",
      account: "source",
      policyKey: "learning-record",
      policyVersion: "2026-07-27",
      reasonCode: "required-consent-missing",
    },
  ]);

  // Grant learning-record consent to source so the merge can proceed.
  assert.equal(
    (
      await api("source-token", "/v1/me/consents", {
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

  // Withdraw learning-record consent for survivor to exercise the
  // required-consent-withdrawn denial path.
  assert.equal(
    (
      await api("survivor-token", "/v1/me/consents", {
        method: "POST",
        body: JSON.stringify({
          purpose: "learning-record",
          policyVersion: "2026-07-27",
          decision: "withdrawn",
        }),
      })
    ).status,
    201,
  );
  const requiredConsentPreview = (
    await json(
      await api("owner-token", "/v1/admin/account-merges/preview", {
        method: "POST",
        body: JSON.stringify({
          sourceUserId: source.id,
          survivorUserId: survivor.id,
          sourceProofToken: sourceProofBeforeSuspension.token,
          survivorProofToken: survivorProofBeforeSuspension.token,
          idempotencyKey: "merge-required-consent-0001",
        }),
      }),
    )
  ).merge;
  assert.deepEqual(requiredConsentPreview.policyBlocks, [
    {
      kind: "required-consent",
      account: "survivor",
      policyKey: "learning-record",
      policyVersion: "2026-07-27",
      reasonCode: "required-consent-withdrawn",
    },
  ]);
  const requiredConsentCompletion = await api(
    "owner-token",
    `/v1/admin/account-merges/${requiredConsentPreview.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `MERGE ${source.id} INTO ${survivor.id}`,
        idempotencyKey: "merge-required-consent-0001",
        resolutions: Object.fromEntries(
          requiredConsentPreview.conflicts.map((conflict) => [
            conflict.key,
            "survivor",
          ]),
        ),
      }),
    },
  );
  assert.equal(requiredConsentCompletion.status, 409);
  assert.equal(
    (await json(requiredConsentCompletion)).error.code,
    "account_merge_policy_blocked",
  );
  // Grant learning-record consent to survivor so subsequent merges succeed.
  assert.equal(
    (
      await api("survivor-token", "/v1/me/consents", {
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

  await database
    .prepare(
      `INSERT INTO account_merge_governance_constraints (
         id, installation_id, user_id, constraint_kind, policy_key,
         policy_version, reference_digest, state, created_by_user_id,
         created_at, updated_at, released_by_user_id, released_at
       ) VALUES (?, ?, ?, 'retention-policy', ?, ?, ?, 'active', ?, ?, ?,
                 NULL, NULL)`,
    )
    .bind(
      "retention-merge-fixture",
      "merge-e2e",
      source.id,
      "learning-record-retention",
      "2026-07-27",
      "a".repeat(64),
      owner.id,
      "2026-07-28T12:00:00.000Z",
      "2026-07-28T12:00:00.000Z",
    )
    .run();
  const retentionPreview = (
    await json(
      await api("owner-token", "/v1/admin/account-merges/preview", {
        method: "POST",
        body: JSON.stringify({
          sourceUserId: source.id,
          survivorUserId: survivor.id,
          sourceProofToken: sourceProofBeforeSuspension.token,
          survivorProofToken: survivorProofBeforeSuspension.token,
          idempotencyKey: "merge-retention-policy-0001",
        }),
      }),
    )
  ).merge;
  assert.deepEqual(retentionPreview.policyBlocks, [
    {
      kind: "retention-policy",
      account: "source",
      policyKey: "learning-record-retention",
      policyVersion: "2026-07-27",
      reasonCode: "retention-policy-active",
    },
  ]);
  assert.equal(
    JSON.stringify(retentionPreview).includes("a".repeat(64)),
    false,
  );
  const retentionCompletion = await api(
    "owner-token",
    `/v1/admin/account-merges/${retentionPreview.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `MERGE ${source.id} INTO ${survivor.id}`,
        idempotencyKey: "merge-retention-policy-0001",
        resolutions: Object.fromEntries(
          retentionPreview.conflicts.map((conflict) => [
            conflict.key,
            "survivor",
          ]),
        ),
      }),
    },
  );
  assert.equal(retentionCompletion.status, 409);
  assert.equal(
    (await json(retentionCompletion)).error.code,
    "account_merge_policy_blocked",
  );
  await database
    .prepare(
      `UPDATE account_merge_governance_constraints
          SET state = 'released', released_by_user_id = ?,
              released_at = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      owner.id,
      "2026-07-28T12:05:00.000Z",
      "2026-07-28T12:05:00.000Z",
      "retention-merge-fixture",
    )
    .run();

  const cleanPolicyPreview = (
    await json(
      await api("owner-token", "/v1/admin/account-merges/preview", {
        method: "POST",
        body: JSON.stringify({
          sourceUserId: source.id,
          survivorUserId: survivor.id,
          sourceProofToken: sourceProofBeforeSuspension.token,
          survivorProofToken: survivorProofBeforeSuspension.token,
          idempotencyKey: "merge-legal-hold-race-0001",
        }),
      }),
    )
  ).merge;
  assert.deepEqual(cleanPolicyPreview.policyBlocks, []);
  await database
    .prepare(
      `INSERT INTO account_merge_governance_constraints (
         id, installation_id, user_id, constraint_kind, policy_key,
         policy_version, reference_digest, state, created_by_user_id,
         created_at, updated_at, released_by_user_id, released_at
       ) VALUES (?, ?, ?, 'legal-hold', ?, ?, ?, 'active', ?, ?, ?, NULL, NULL)`,
    )
    .bind(
      "legal-hold-merge-fixture",
      "merge-e2e",
      survivor.id,
      "legal-preservation",
      "1",
      "b".repeat(64),
      owner.id,
      "2026-07-28T12:10:00.000Z",
      "2026-07-28T12:10:00.000Z",
    )
    .run();
  const legalHoldCompletion = await api(
    "owner-token",
    `/v1/admin/account-merges/${cleanPolicyPreview.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `MERGE ${source.id} INTO ${survivor.id}`,
        idempotencyKey: "merge-legal-hold-race-0001",
        resolutions: Object.fromEntries(
          cleanPolicyPreview.conflicts.map((conflict) => [
            conflict.key,
            "survivor",
          ]),
        ),
      }),
    },
  );
  assert.equal(legalHoldCompletion.status, 409);
  assert.equal(
    (await json(legalHoldCompletion)).error.code,
    "account_merge_policy_blocked",
  );
  const legalHoldPreview = (
    await json(
      await api("owner-token", "/v1/admin/account-merges/preview", {
        method: "POST",
        body: JSON.stringify({
          sourceUserId: source.id,
          survivorUserId: survivor.id,
          sourceProofToken: sourceProofBeforeSuspension.token,
          survivorProofToken: survivorProofBeforeSuspension.token,
          idempotencyKey: "merge-legal-hold-preview-0001",
        }),
      }),
    )
  ).merge;
  assert.deepEqual(legalHoldPreview.policyBlocks, [
    {
      kind: "legal-hold",
      account: "survivor",
      policyKey: "legal-preservation",
      policyVersion: "1",
      reasonCode: "legal-hold-active",
    },
  ]);
  await database
    .prepare(
      `UPDATE account_merge_governance_constraints
          SET state = 'released', released_by_user_id = ?,
              released_at = ?, updated_at = ?
        WHERE id = ?`,
    )
    .bind(
      owner.id,
      "2026-07-28T12:15:00.000Z",
      "2026-07-28T12:15:00.000Z",
      "legal-hold-merge-fixture",
    )
    .run();

  const deletion = await api("source-token", "/v1/me/deletion", {
    method: "POST",
    body: JSON.stringify({ confirmation: "DELETE MY PROJECT 42 ACCOUNT" }),
  });
  assert.equal(deletion.status, 202);
  const sourceProofBeforeDeletion = (
    await json(
      await api("source-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;
  const survivorProofBeforeDeletion = (
    await json(
      await api("survivor-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;
  const deletionBlocked = await api(
    "owner-token",
    "/v1/admin/account-merges/preview",
    {
      method: "POST",
      body: JSON.stringify({
        sourceUserId: source.id,
        survivorUserId: survivor.id,
        sourceProofToken: sourceProofBeforeDeletion.token,
        survivorProofToken: survivorProofBeforeDeletion.token,
        idempotencyKey: "merge-deletion-block-0001",
      }),
    },
  );
  assert.equal(deletionBlocked.status, 409);
  assert.equal(
    (await json(deletionBlocked)).error.code,
    "active_deletion_blocks_merge",
  );
  assert.equal(
    (
      await api("source-token", "/v1/me/deletion", {
        method: "DELETE",
      })
    ).status,
    200,
  );
  const stalePreview = (
    await json(
      await api("owner-token", "/v1/admin/account-merges/preview", {
        method: "POST",
        body: JSON.stringify({
          sourceUserId: source.id,
          survivorUserId: survivor.id,
          sourceProofToken: sourceProofBeforeDeletion.token,
          survivorProofToken: survivorProofBeforeDeletion.token,
          idempotencyKey: "merge-stale-preview-0001",
        }),
      }),
    )
  ).merge;
  assert.equal(
    (
      await api("source-token", "/v1/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ bio: "Changed after merge preview." }),
      })
    ).status,
    200,
  );
  const staleCompletion = await api(
    "owner-token",
    `/v1/admin/account-merges/${stalePreview.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `MERGE ${source.id} INTO ${survivor.id}`,
        idempotencyKey: "merge-stale-preview-0001",
        resolutions: Object.fromEntries(
          stalePreview.conflicts.map((conflict) => [
            conflict.key,
            "survivor",
          ]),
        ),
      }),
    },
  );
  assert.equal(staleCompletion.status, 409);
  assert.equal(
    (await json(staleCompletion)).error.code,
    "account_merge_preview_stale",
  );
  assert.equal(
    (
      await api("source-token", "/v1/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ bio: "Source biography" }),
      })
    ).status,
    200,
  );

  const insufficientRecovery = await api(
    "owner-token",
    "/v1/admin/account-merges/recovery-proofs",
    {
      method: "POST",
      body: JSON.stringify({
        userId: source.id,
        methods: ["signed-owner-attestation"],
        referenceId: "recovery-case-42",
        summary: "The owner reviewed only one source of evidence.",
      }),
    },
  );
  assert.equal(insufficientRecovery.status, 400);
  const governedRecovery = await api(
    "owner-token",
    "/v1/admin/account-merges/recovery-proofs",
    {
      method: "POST",
      body: JSON.stringify({
        userId: source.id,
        methods: [
          "identity-provider-recovery",
          "signed-owner-attestation",
        ],
        referenceId: "recovery-case-42",
        summary:
          "The owner independently verified provider recovery and recorded a signed decision.",
      }),
    },
  );
  assert.equal(governedRecovery.status, 201);
  assert.equal((await json(governedRecovery)).proof.token.includes("@"), false);

  const sourceProof = (
    await json(
      await api("source-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;
  const survivorProof = (
    await json(
      await api("survivor-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;
  const attackerProof = (
    await json(
      await api("attacker-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;

  const takeover = await api(
    "owner-token",
    "/v1/admin/account-merges/preview",
    {
      method: "POST",
      body: JSON.stringify({
        sourceUserId: source.id,
        survivorUserId: survivor.id,
        sourceProofToken: attackerProof.token,
        survivorProofToken: survivorProof.token,
        idempotencyKey: "merge-takeover-denial-0001",
      }),
    },
  );
  assert.equal(takeover.status, 400);
  assert.equal(
    (await json(takeover)).error.code,
    "invalid_account_merge_proof",
  );

  const previewResponse = await api(
    "owner-token",
    "/v1/admin/account-merges/preview",
    {
      method: "POST",
      body: JSON.stringify({
        sourceUserId: source.id,
        survivorUserId: survivor.id,
        sourceProofToken: sourceProof.token,
        survivorProofToken: survivorProof.token,
        idempotencyKey: "merge-complete-retry-0001",
      }),
    },
  );
  assert.equal(previewResponse.status, 201);
  const preview = (await json(previewResponse)).merge;
  assert.equal(preview.sourceUserId, source.id);
  assert.equal(preview.survivorUserId, survivor.id);
  assert.deepEqual(preview.policyBlocks, []);
  assert.ok(preview.conflicts.some((conflict) => conflict.key === "profile.bio"));
  const biographyConflict = preview.conflicts.find(
    (conflict) => conflict.key === "profile.bio",
  );
  assert.equal(biographyConflict.sourceValue, "Source biography");
  assert.equal(biographyConflict.survivorValue, "Survivor biography");
  const photoConflict = preview.conflicts.find(
    (conflict) => conflict.key === "profile.photo",
  );
  assert.equal(photoConflict.sourceValue, true);
  assert.equal(photoConflict.survivorValue, true);
  for (const objectKey of photoObjectKeys) {
    assert.equal(JSON.stringify(preview).includes(objectKey), false);
  }
  assert.equal(
    JSON.stringify(preview).includes(sourceProof.token),
    false,
  );

  const incomplete = await api(
    "owner-token",
    `/v1/admin/account-merges/${preview.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `MERGE ${source.id} INTO ${survivor.id}`,
        idempotencyKey: "merge-complete-retry-0001",
        resolutions: {},
      }),
    },
  );
  assert.equal(incomplete.status, 400);
  assert.equal((await json(incomplete)).error.code, "merge_resolution_required");

  const resolutions = Object.fromEntries(
    preview.conflicts.map((conflict) => [
      conflict.key,
      conflict.key === "profile.bio" ? "source" : "survivor",
    ]),
  );
  const completeRequest = {
    confirmation: `MERGE ${source.id} INTO ${survivor.id}`,
    idempotencyKey: "merge-complete-retry-0001",
    resolutions,
  };
  const completeResponse = await api(
    "owner-token",
    `/v1/admin/account-merges/${preview.id}/complete`,
    { method: "POST", body: JSON.stringify(completeRequest) },
  );
  assert.equal(completeResponse.status, 200);
  const receipt = (await json(completeResponse)).receipt;
  assert.equal(receipt.status, "completed");
  assert.match(receipt.receiptDigest, /^[0-9a-f]{64}$/);
  assert.match(receipt.snapshotDigest, /^[0-9a-f]{64}$/);

  const retry = await api(
    "owner-token",
    `/v1/admin/account-merges/${preview.id}/complete`,
    { method: "POST", body: JSON.stringify(completeRequest) },
  );
  assert.equal(retry.status, 200);
  assert.equal((await json(retry)).receipt.id, receipt.id);

  const sourceAfterMerge = (
    await json(await api("source-token", "/v1/me"))
  ).account;
  assert.equal(sourceAfterMerge.id, survivor.id);
  const mergedProfile = (
    await json(await api("source-token", "/v1/me/profile"))
  ).profile;
  assert.equal(mergedProfile.bio, "Source biography");
  assert.equal(mergedProfile.organization, "Survivor organization");
  assert.equal(mergedProfile.locale, "fr-CA");
  assert.equal(mergedProfile.timeZone, "America/Toronto");
  assert.equal(mergedProfile.reducedMotion, false);
  assert.equal(mergedProfile.highContrast, true);
  const mergedProgress = (
    await json(await api("survivor-token", "/v1/me/progress"))
  ).progress.progress;
  assert.equal(mergedProgress.attempts.length, 2);
  assert.equal(new Set(mergedProgress.attempts.map((item) => item.id)).size, 2);
  const mergedProgressEvent = await database
    .prepare(
      `SELECT event_type, actor_type, payload_json
         FROM learning_events
        WHERE installation_id = ? AND user_id = ?
        ORDER BY sequence DESC
        LIMIT 1`,
    )
    .bind("merge-e2e", survivor.id)
    .first();
  assert.equal(mergedProgressEvent.event_type, "progress.imported");
  assert.equal(mergedProgressEvent.actor_type, "owner");
  assert.equal(
    JSON.parse(mergedProgressEvent.payload_json).source,
    "account-merge-v1",
  );
  const mergedConsents = (
    await json(await api("survivor-token", "/v1/me/consents"))
  ).consents;
  assert.equal(mergedConsents.length, 2);
  assert.equal(
    mergedConsents.filter((consent) => consent.decision === "granted")
      .length,
    1,
  );
  const mergedIdentities = (
    await json(await api("survivor-token", "/v1/me/identities"))
  ).identities;
  assert.equal(mergedIdentities.length, 2);
  assert.equal(
    mergedIdentities.filter((item) => item.canUnlink).length,
    0,
  );
  assert.equal(
    (
      await database
        .prepare(
          "SELECT COUNT(*) AS count FROM assessment_attempts WHERE installation_id = ? AND user_id = ?",
        )
        .bind("merge-e2e", survivor.id)
        .first()
    ).count,
    2,
  );
  const mergedPolicyConstraints = await database
    .prepare(
      `SELECT id, user_id, state
         FROM account_merge_governance_constraints
        WHERE installation_id = ?
        ORDER BY id`,
    )
    .bind("merge-e2e")
    .all();
  assert.equal(mergedPolicyConstraints.results.length, 2);
  assert.ok(
    mergedPolicyConstraints.results.every(
      (constraint) =>
        constraint.user_id === survivor.id && constraint.state === "released",
    ),
  );

  await assert.rejects(
    database
      .prepare(
        "UPDATE account_merge_receipts SET receipt_digest = 'changed' WHERE id = ?",
      )
      .bind(receipt.id)
      .run(),
    /account merge receipts are immutable/,
  );

  const rollbackResponse = await api(
    "owner-token",
    `/v1/admin/account-merges/${preview.id}/rollback`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `ROLL BACK ${preview.id}`,
        reason: "Exercise deterministic recovery before learner activity resumes.",
      }),
    },
  );
  assert.equal(rollbackResponse.status, 200);
  assert.equal((await json(rollbackResponse)).receipt.status, "rolled-back");
  assert.equal(
    (await json(await api("source-token", "/v1/me"))).account.id,
    source.id,
  );
  assert.equal(
    (await json(await api("survivor-token", "/v1/me"))).account.id,
    survivor.id,
  );
  assert.equal(
    (
      await json(await api("source-token", "/v1/me/progress"))
    ).progress.progress.attempts.length,
    1,
  );
  assert.equal(
    (
      await json(await api("survivor-token", "/v1/me/progress"))
    ).progress.progress.attempts.length,
    1,
  );
  for (const userId of [source.id, survivor.id]) {
    const rollbackProgressEvent = await database
      .prepare(
        `SELECT payload_json
           FROM learning_events
          WHERE installation_id = ? AND user_id = ?
          ORDER BY sequence DESC
          LIMIT 1`,
      )
      .bind("merge-e2e", userId)
      .first();
    assert.equal(
      JSON.parse(rollbackProgressEvent.payload_json).source,
      "account-merge-v1",
    );
  }
  assert.equal(
    (
      await json(await api("survivor-token", "/v1/me/profile"))
    ).profile.bio,
    "Survivor biography",
  );
  assert.equal(
    (
      await database
        .prepare(
          "SELECT COUNT(*) AS count FROM account_merge_snapshot_rows WHERE merge_case_id = ?",
        )
        .bind(preview.id)
        .first()
    ).count,
    0,
  );
  const restoredPolicyConstraints = await database
    .prepare(
      `SELECT id, user_id, state
         FROM account_merge_governance_constraints
        WHERE installation_id = ?
        ORDER BY id`,
    )
    .bind("merge-e2e")
    .all();
  assert.deepEqual(
    restoredPolicyConstraints.results.map((constraint) => [
      constraint.id,
      constraint.user_id,
      constraint.state,
    ]),
    [
      ["legal-hold-merge-fixture", survivor.id, "released"],
      ["retention-merge-fixture", source.id, "released"],
    ],
  );

  const replayedProofs = await api(
    "owner-token",
    "/v1/admin/account-merges/preview",
    {
      method: "POST",
      body: JSON.stringify({
        sourceUserId: source.id,
        survivorUserId: survivor.id,
        sourceProofToken: sourceProof.token,
        survivorProofToken: survivorProof.token,
        idempotencyKey: "merge-proof-replay-0001",
      }),
    },
  );
  assert.equal(replayedProofs.status, 400);
  assert.equal(
    (await json(replayedProofs)).error.code,
    "invalid_account_merge_proof",
  );

  const secondSourceProof = (
    await json(
      await api("source-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;
  const secondSurvivorProof = (
    await json(
      await api("survivor-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;
  const secondPreview = (
    await json(
      await api("owner-token", "/v1/admin/account-merges/preview", {
        method: "POST",
        body: JSON.stringify({
          sourceUserId: source.id,
          survivorUserId: survivor.id,
          sourceProofToken: secondSourceProof.token,
          survivorProofToken: secondSurvivorProof.token,
          idempotencyKey: "merge-delete-recovery-0001",
        }),
      }),
    )
  ).merge;
  const secondResolutions = Object.fromEntries(
    secondPreview.conflicts.map((conflict) => [conflict.key, "survivor"]),
  );
  const secondCompletion = await api(
    "owner-token",
    `/v1/admin/account-merges/${secondPreview.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `MERGE ${source.id} INTO ${survivor.id}`,
        idempotencyKey: "merge-delete-recovery-0001",
        resolutions: secondResolutions,
      }),
    },
  );
  assert.equal(secondCompletion.status, 200);
  assert.equal(
    (
      await api("survivor-token", "/v1/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ bio: "Post-merge learner activity." }),
      })
    ).status,
    200,
  );
  const unsafeRollback = await api(
    "owner-token",
    `/v1/admin/account-merges/${secondPreview.id}/rollback`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `ROLL BACK ${secondPreview.id}`,
        reason: "This rollback must refuse to discard post-merge activity.",
      }),
    },
  );
  assert.equal(unsafeRollback.status, 409);
  assert.equal(
    (await json(unsafeRollback)).error.code,
    "account_merge_rollback_conflict",
  );

  const mergedDeletion = (
    await json(
      await api("source-token", "/v1/me/deletion", {
        method: "POST",
        body: JSON.stringify({
          confirmation: "DELETE MY PROJECT 42 ACCOUNT",
        }),
      }),
    )
  ).deletionRequest;
  await database
    .prepare(
      "UPDATE deletion_requests SET cancellation_deadline = ? WHERE id = ?",
    )
    .bind(new Date(Date.now() - 60_000).toISOString(), mergedDeletion.id)
    .run();
  const deletionCompletion = await api(
    "owner-token",
    `/v1/admin/deletions/${mergedDeletion.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        reason:
          "Complete the governed merged-account deletion after the test waiting period.",
      }),
    },
  );
  assert.equal(deletionCompletion.status, 200);
  for (const token of ["source-token", "survivor-token"]) {
    const deletedSession = await api(token, "/v1/me");
    assert.equal(deletedSession.status, 401);
    assert.equal(
      (await json(deletedSession)).error.code,
      "account_not_registered",
    );
  }
  const redactedCase = await database
    .prepare(
      "SELECT source_user_id, survivor_user_id FROM account_merge_cases WHERE id = ?",
    )
    .bind(secondPreview.id)
    .first();
  assert.equal(redactedCase.source_user_id, null);
  assert.equal(redactedCase.survivor_user_id, null);
  assert.equal(
    (
      await database
        .prepare(
          "SELECT COUNT(*) AS count FROM account_merge_snapshot_rows WHERE merge_case_id = ?",
        )
        .bind(secondPreview.id)
        .first()
    ).count,
    0,
  );
  assert.equal(
    (
      await database
        .prepare(
          "SELECT COUNT(*) AS count FROM deleted_identity_tombstones WHERE deletion_request_id = ?",
        )
        .bind(mergedDeletion.id)
        .first()
    ).count,
    2,
  );

  const audit = await json(
    await api("owner-token", "/v1/admin/audit"),
  );
  assert.ok(
    audit.events.some(
      (event) =>
        event.action === "account.merge.complete" &&
        event.requestId &&
        event.metadata.receiptDigest === receipt.receiptDigest,
    ),
  );
  assert.ok(
    audit.events.some((event) => event.action === "account.merge.rollback"),
  );
  assert.ok(
    audit.events.some(
      (event) =>
        event.action === "account.merge.complete" &&
        event.outcome === "denied" &&
        event.metadata.policyBlocks.some(
          (block) => block.reasonCode === "required-consent-withdrawn",
        ),
    ),
  );
  assert.ok(
    audit.events.some(
      (event) =>
        event.action === "account.merge.complete" &&
        event.outcome === "denied" &&
        event.metadata.policyBlocks.some(
          (block) => block.reasonCode === "legal-hold-active",
        ),
    ),
  );
  assert.equal(owner.roles.includes("owner"), true);
});

test("a learner can complete, fetch the receipt for, and roll back their own reconciliation without owner involvement AB#6849", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-26",
    d1Databases: { PROJECT42_DB: "project42-account-merge-self-service" },
    r2Buckets: { PROFILE_PHOTOS: "project42-account-merge-self-service-photos" },
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
    ["owner-token", identity("self-merge-owner", "owner@self.example.test")],
    ["source-token", identity("self-merge-source", "source@self.example.test")],
    [
      "survivor-token",
      identity("self-merge-survivor", "survivor@self.example.test"),
    ],
    [
      "attacker-token",
      identity("self-merge-attacker", "attacker@self.example.test"),
    ],
  ]);
  const verifier = {
    verify: async (request) => {
      const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
      const verified = token ? identities.get(token) : null;
      if (!verified) throw new Error("Unknown merge test identity.");
      return {
        ...verified,
        issuedAt: Math.floor(Date.now() / 1_000),
        authenticatedAt: Math.floor(Date.now() / 1_000),
      };
    },
  };
  const repository = new D1Project42Repository(database, "merge-self-service");
  const env = {
    INSTALLATION_ID: "merge-self-service",
    ALLOWED_ORIGINS: allowedOrigin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: "self-merge-owner",
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
    PROFILE_PHOTOS: profilePhotos,
  };
  async function api(token, path, init = {}) {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("origin", allowedOrigin);
    if (init.body && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return handleRequest(
      new Request(`https://api.merge.example.test${path}`, {
        ...init,
        headers,
      }),
      env,
      verifier,
      repository,
    );
  }
  async function json(response) {
    return response.json();
  }

  await api("owner-token", "/v1/session", { method: "POST" });
  for (const token of ["source-token", "survivor-token", "attacker-token"]) {
    await api(token, "/v1/session", { method: "POST" });
  }
  const source = await repository.findAccount(identities.get("source-token"));
  const survivor = await repository.findAccount(identities.get("survivor-token"));
  const attacker = await repository.findAccount(identities.get("attacker-token"));
  for (const account of [source, survivor, attacker]) {
    assert.equal(
      (
        await api("owner-token", `/v1/admin/accounts/${account.id}/state`, {
          method: "PATCH",
          body: JSON.stringify({
            state: "approved",
            reason: "Approve the self-service merge fixture.",
          }),
        })
      ).status,
      200,
    );
  }

  for (const token of ["source-token", "survivor-token"]) {
    assert.equal(
      (
        await api(token, "/v1/me/consents", {
          method: "POST",
          body: JSON.stringify({
            purpose: "product-improvement",
            policyVersion: "2026-07-27",
            decision: "granted",
          }),
        })
      ).status,
      201,
    );
    assert.equal(
      (
        await api(token, "/v1/me/consents", {
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
  }

  const sourceProof = (
    await json(
      await api("source-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;
  const survivorProof = (
    await json(
      await api("survivor-token", "/v1/me/account-merge-proof", {
        method: "POST",
      }),
    )
  ).proof;

  // AB#6848: each side authenticates itself and mints its own proof; no
  // second OIDC client or owner attestation is involved. AB#6231's
  // self-participation guard on preview already covers this - the assertion
  // here is that the same guard also protects complete/receipt/rollback.
  const previewResponse = await api("survivor-token", "/v1/me/account-merges/preview", {
    method: "POST",
    body: JSON.stringify({
      sourceUserId: source.id,
      survivorUserId: survivor.id,
      sourceProofToken: sourceProof.token,
      survivorProofToken: survivorProof.token,
      idempotencyKey: "self-merge-preview-0001",
    }),
  });
  assert.equal(previewResponse.status, 201);
  const preview = (await json(previewResponse)).merge;

  const outsiderPreviewAttempt = await api(
    "attacker-token",
    "/v1/me/account-merges/preview",
    {
      method: "POST",
      body: JSON.stringify({
        sourceUserId: source.id,
        survivorUserId: survivor.id,
        sourceProofToken: sourceProof.token,
        survivorProofToken: survivorProof.token,
        idempotencyKey: "self-merge-preview-outsider-0001",
      }),
    },
  );
  assert.equal(outsiderPreviewAttempt.status, 403);
  assert.equal(
    (await json(outsiderPreviewAttempt)).error.code,
    "merge_self_participation_required",
  );

  const outsiderComplete = await api(
    "attacker-token",
    `/v1/me/account-merges/${preview.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `MERGE ${source.id} INTO ${survivor.id}`,
        idempotencyKey: "self-merge-preview-0001",
        resolutions: Object.fromEntries(
          preview.conflicts.map((conflict) => [conflict.key, "survivor"]),
        ),
      }),
    },
  );
  assert.equal(outsiderComplete.status, 403);
  assert.equal(
    (await json(outsiderComplete)).error.code,
    "merge_self_participation_required",
  );
  const outsiderReceipt = await api(
    "attacker-token",
    `/v1/me/account-merges/${preview.id}/receipt`,
  );
  assert.equal(outsiderReceipt.status, 403);
  const outsiderRollback = await api(
    "attacker-token",
    `/v1/me/account-merges/${preview.id}/rollback`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `ROLL BACK ${preview.id}`,
        reason: "An outsider must never roll back a reconciliation.",
      }),
    },
  );
  assert.equal(outsiderRollback.status, 403);

  const completeResponse = await api(
    "source-token",
    `/v1/me/account-merges/${preview.id}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `MERGE ${source.id} INTO ${survivor.id}`,
        idempotencyKey: "self-merge-preview-0001",
        resolutions: Object.fromEntries(
          preview.conflicts.map((conflict) => [conflict.key, "survivor"]),
        ),
      }),
    },
  );
  assert.equal(completeResponse.status, 200);
  const receipt = (await json(completeResponse)).receipt;
  assert.equal(receipt.status, "completed");

  const survivorReceiptFetch = await api(
    "survivor-token",
    `/v1/me/account-merges/${preview.id}/receipt`,
  );
  assert.equal(survivorReceiptFetch.status, 200);
  assert.equal((await json(survivorReceiptFetch)).receipt.id, receipt.id);

  const rollbackResponse = await api(
    "survivor-token",
    `/v1/me/account-merges/${preview.id}/rollback`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `ROLL BACK ${preview.id}`,
        reason: "The learner changed their mind before the window closed.",
      }),
    },
  );
  assert.equal(rollbackResponse.status, 200);
  assert.equal((await json(rollbackResponse)).receipt.status, "rolled-back");

  const postRollbackOutsider = await api(
    "attacker-token",
    `/v1/me/account-merges/${preview.id}/rollback`,
    {
      method: "POST",
      body: JSON.stringify({
        confirmation: `ROLL BACK ${preview.id}`,
        reason: "An outsider must never roll back a reconciliation.",
      }),
    },
  );
  assert.equal(postRollbackOutsider.status, 403);
});
