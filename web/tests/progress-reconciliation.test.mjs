import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyProgress,
  starterCatalog,
} from "@project42/platform";
import {
  buildProgressMigrationItems,
  buildProgressReconciliationPackage,
  createProgressImportId,
  createProgressMigrationPreview,
  parseProgressMigrationRecovery,
} from "../app/lib/progressMigration.ts";

function progressRecords() {
  const path = starterCatalog.paths[0];
  const [browserModuleId, accountModuleId] = path.moduleIds;
  const duplicateAttempt = {
    id: "shared-attempt",
    pathId: path.id,
    moduleId: browserModuleId,
    contentVersion: starterCatalog.contentVersion,
    scorePercent: 100,
    passed: true,
    completedAt: "2026-07-29T01:00:00.000Z",
  };
  const browser = {
    ...createEmptyProgress("Browser learner"),
    startedPathIds: [path.id],
    completedModuleIds: [browserModuleId],
    attempts: [
      duplicateAttempt,
      {
        ...duplicateAttempt,
        id: "browser-attempt",
        scorePercent: 80,
        completedAt: "2026-07-29T02:00:00.000Z",
      },
    ],
    updatedAt: "2026-07-29T02:00:00.000Z",
  };
  const account = {
    ...createEmptyProgress("Account learner"),
    startedPathIds: [path.id],
    completedModuleIds: [accountModuleId],
    attempts: [duplicateAttempt],
    updatedAt: "2026-07-29T01:30:00.000Z",
  };
  return { account, browser, accountModuleId, browserModuleId, path };
}

test("lists every browser record with an exact reconciliation disposition", () => {
  const { account, browser, accountModuleId, browserModuleId, path } =
    progressRecords();
  const preview = createProgressMigrationPreview(browser, account);
  const items = buildProgressMigrationItems(preview, starterCatalog);

  assert.deepEqual(
    items.map(({ kind, id, disposition }) => ({ kind, id, disposition })),
    [
      {
        kind: "started-path",
        id: path.id,
        disposition: "already-in-account",
      },
      {
        kind: "completed-module",
        id: browserModuleId,
        disposition: "will-add",
      },
      {
        kind: "assessment-attempt",
        id: "shared-attempt",
        disposition: "already-in-account",
      },
      {
        kind: "assessment-attempt",
        id: "browser-attempt",
        disposition: "will-add",
      },
    ],
  );
  assert.equal(preview.remoteOnly.completedModules, 1);
  assert.equal(preview.remoteProgress.completedModuleIds[0], accountModuleId);
});

test("builds a portable report with replace risk and projected transcript", () => {
  const { account, browser } = progressRecords();
  const preview = createProgressMigrationPreview(browser, account);
  const report = buildProgressReconciliationPackage(preview, starterCatalog, {
    generatedAt: "2026-07-29T03:00:00.000Z",
    importId: "browser-local-v1-report",
    state: "preview",
  });

  assert.equal(report.format, "project42/progress-reconciliation");
  assert.equal(report.mergeBehavior.replaceAvailable, false);
  assert.equal(report.mergeBehavior.replaceWouldRemove.completedModules, 1);
  assert.equal(report.records.browser.learner.attempts.length, 2);
  assert.equal(report.records.account.learner.attempts.length, 1);
  assert.equal(report.records.proposedMerge.learner.attempts.length, 2);
  assert.ok(
    report.transcriptProjection.some(
      (entry) => entry.pathId === starterCatalog.paths[0].id,
    ),
  );
  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "accessToken",
    "primaryEmail",
    "issuer",
    "subject",
    "tenantId",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("accepts only cryptographically bound, chronological, strict retained backups", async () => {
  const { account, browser } = progressRecords();
  const preview = createProgressMigrationPreview(browser, account);
  const recovery = {
    schemaVersion: 1,
    importId: await createProgressImportId(browser),
    localProgress: browser,
    remoteProgress: account,
    mergedProgress: preview.mergedProgress,
    createdAt: "2026-07-29T02:59:00.000Z",
    completedAt: "2026-07-29T03:00:00.000Z",
    state: "completed",
    verifiedExportAt: "2026-07-29T03:05:00.000Z",
    verifiedRevision: 3,
  };

  assert.deepEqual(
    await parseProgressMigrationRecovery(recovery, starterCatalog),
    recovery,
  );
  assert.equal(
    await parseProgressMigrationRecovery(
      {
        ...recovery,
        mergedProgress: account,
      },
      starterCatalog,
    ),
    null,
  );
  assert.equal(
    await parseProgressMigrationRecovery(
      {
        ...recovery,
        verifiedRevision: undefined,
      },
      starterCatalog,
    ),
    null,
  );
  assert.equal(
    await parseProgressMigrationRecovery(
      {
        ...recovery,
        importId: `browser-local-v1-${"0".repeat(64)}`,
      },
      starterCatalog,
    ),
    null,
  );
  assert.equal(
    await parseProgressMigrationRecovery(
      {
        ...recovery,
        completedAt: "2026-07-29T02:58:00.000Z",
      },
      starterCatalog,
    ),
    null,
  );
  assert.equal(
    await parseProgressMigrationRecovery(
      {
        ...recovery,
        verifiedExportAt: "2026-07-29T02:59:30.000Z",
      },
      starterCatalog,
    ),
    null,
  );
  assert.equal(
    await parseProgressMigrationRecovery(
      {
        ...recovery,
        unsupportedTenantHint: "must-not-load",
      },
      starterCatalog,
    ),
    null,
  );
});

test("an interrupted import leaves both the local and durable records recoverable", async () => {
  const { account, browser } = progressRecords();
  const preview = createProgressMigrationPreview(browser, account);
  // The import id is content-addressed on the local record (see
  // parseProgressMigrationRecovery), which is what makes a retry idempotent.
  const importId = await createProgressImportId(browser);

  // ProgressProvider writes this envelope to localStorage BEFORE POSTing
  // /v1/me/progress, so a network failure, tab close, or crash mid-import
  // cannot lose either side of the merge. Reconstruct that pending envelope
  // and prove it is still fully recoverable.
  const interrupted = {
    schemaVersion: 1,
    importId,
    localProgress: browser,
    remoteProgress: account,
    mergedProgress: preview.mergedProgress,
    createdAt: "2026-07-29T03:00:00.000Z",
    state: "pending",
  };

  const recovered = await parseProgressMigrationRecovery(
    interrupted,
    starterCatalog,
  );
  assert.ok(recovered, "a pending envelope must survive an interrupted import");
  assert.equal(recovered.state, "pending");

  // Both originals are retained verbatim, so the learner can retry or walk away
  // without losing the browser record or the server record.
  assert.deepEqual(recovered.localProgress, browser);
  assert.deepEqual(recovered.remoteProgress, account);

  // Retrying is safe: the same inputs derive the same content-addressed import
  // id, so the server rejects a replay rather than double-applying it.
  assert.equal(await createProgressImportId(recovered.localProgress), importId);

  // A tampered or partially written envelope must be rejected outright rather
  // than trusted, otherwise recovery could silently apply the wrong merge.
  assert.equal(
    await parseProgressMigrationRecovery(
      { ...interrupted, mergedProgress: browser },
      starterCatalog,
    ),
    null,
    "a merge that does not match the recorded inputs must not be recoverable",
  );
  assert.equal(
    await parseProgressMigrationRecovery(
      { ...interrupted, importId: `browser-local-v1-${"0".repeat(64)}` },
      starterCatalog,
    ),
    null,
    "an import id that does not address the local record must not be recoverable",
  );
  const truncated = { ...interrupted };
  delete truncated.mergedProgress;
  assert.equal(
    await parseProgressMigrationRecovery(truncated, starterCatalog),
    null,
    "a partially written envelope must not be recoverable",
  );
});
