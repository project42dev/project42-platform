// The 2026-09-12 durability review of ProgressProvider.
//
// Three overwrite defects had been fixed in this area in the preceding day --
// the unsynced-buffer flush (0.111.1), the account hydration replace
// (0.113.0), and the D1 CHECK that turned every save into a 500. The review
// that followed looked for the ways work could still be LOST rather than
// overwritten, and found four that hold real work plus one latent
// correctness bug:
//
//   * the 800ms save debounce against navigation and tab close, with no
//     unload flush of any kind;
//   * a failed save that buffers and then has nothing left that can re-arm it;
//   * an import or a reset silently undone by a read landing inside that same
//     debounce, because every merge here is a union and a replacement can
//     REMOVE;
//   * a rename made before the first read resolved, dropped twice over;
//   * mergeLearnerProgress's collision check comparing records by
//     `JSON.stringify` equality, which is key-order sensitive.
//
// As elsewhere in this repository there is no React toolchain (see
// tests/web-distribution.test.mjs), so the decisions live in src/progress.ts
// where they can be tested directly, and the provider is then pinned to them
// by source. The transport-level proof for the unload flush -- that a PUT
// really does leave the browser after `pagehide` -- is
// web/tests/browser/progress-unload-flush.spec.ts, which runs under Playwright
// in the portal.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";
import { D1Project42Repository, handleRequest } from "../dist/worker.js";
import {
  ACCOUNT_BACKED_PROGRESS_SOURCE,
  createEmptyProgress,
  mergeLearnerProgress,
  planAccountProgressHydration,
  planProgressSaveRetry,
  planUnsyncedProgressFlush,
  PROGRESS_SAVE_MAX_ATTEMPTS,
  recordAssessmentAttempt,
  recordModuleVisit,
  starterCatalog,
} from "../dist/index.js";

const providerSource = await readFile(
  new URL("../web/app/components/ProgressProvider.tsx", import.meta.url),
  "utf8",
);

const passed = {
  correct: 3,
  total: 3,
  scorePercent: 100,
  passed: true,
  feedback: [],
};

function completableModules(count) {
  const seen = new Set();
  const pairs = [];
  for (const path of starterCatalog.paths) {
    for (const moduleId of path.moduleIds) {
      const module = starterCatalog.modules.find((item) => item.id === moduleId);
      if (!module || module.capstone || seen.has(moduleId)) continue;
      seen.add(moduleId);
      pairs.push({ pathId: path.id, moduleId });
      if (pairs.length === count) return pairs;
    }
  }
  throw new Error(`starter catalogue has fewer than ${count} completable modules`);
}

function completeModule(progress, pair, day) {
  return recordAssessmentAttempt(progress, starterCatalog, {
    attemptId: `attempt-${pair.moduleId}`,
    pathId: pair.pathId,
    moduleId: pair.moduleId,
    completedAt: new Date(Date.UTC(2026, 8, day, 10, 0)).toISOString(),
    result: passed,
  });
}

// ---------------------------------------------------------------------------
// Item 2 -- the debounce against navigation and tab close.
// ---------------------------------------------------------------------------

test("the provider flushes the pending save on pagehide and on visibility hidden", () => {
  // The save is debounced 800ms and an ordinary fetch dies with the document.
  // Answer the last question of a module and close the tab, hit reload, or
  // follow a link off the site, and the PUT was never sent. Nothing said so.
  //
  // `beforeunload` is deliberately absent and must stay absent: it is unreliable
  // on Safari and on mobile, and registering one disqualifies the page from the
  // back/forward cache for every learner. `visibilitychange` to hidden is the
  // pair that matters on iOS, where a tab is routinely killed with no unload
  // event at all.
  assert.match(
    providerSource,
    /window\.addEventListener\("pagehide", onPageHide\)/,
    "ProgressProvider must flush the pending save on pagehide.",
  );
  assert.match(
    providerSource,
    /document\.addEventListener\("visibilitychange", onVisibility\)/,
    "ProgressProvider must flush on visibilitychange, which is what fires on iOS.",
  );
  assert.match(
    providerSource,
    /document\.visibilityState === "hidden"/,
    "The visibilitychange handler must act only on the hidden transition.",
  );
  assert.doesNotMatch(
    providerSource,
    /addEventListener\(\s*"beforeunload"/,
    "beforeunload must not be used: unreliable on Safari and mobile, and it disables the back/forward cache.",
  );
});

test("the unload flush uses a transport that survives the document", () => {
  // A plain fetch issued from a pagehide handler is cancelled when the document
  // goes away, so registering the listener without this changes nothing at all.
  assert.match(
    providerSource,
    /sendProgress\(record, \{ keepalive: true \}\)/,
    "The unload flush must send with keepalive, or the request dies with the document.",
  );
  assert.match(
    providerSource,
    /keepalive: options\.keepalive/,
    "sendProgress must pass keepalive through to apiFetch's RequestInit.",
  );
});

test("the record owed to the API is published before the debounce, not after", () => {
  // The window being closed is the 800ms in which no request exists yet, so
  // `pendingWrite` has to be set as soon as the record is known to differ from
  // the account -- not inside the timer, which is the thing that never runs.
  const syncEffect = providerSource.slice(
    providerSource.indexOf("const serialized = JSON.stringify(progress);"),
  );
  const publishAt = syncEffect.indexOf("pendingWrite.current = progress;");
  const debounceAt = syncEffect.indexOf("window.setTimeout(");
  assert.ok(publishAt > 0, "the sync effect must publish the owed record for the unload flush");
  assert.ok(
    publishAt < debounceAt,
    "pendingWrite must be set before the debounce timer is armed, not inside it.",
  );
});

test("a record already on the account is not left pending, so a tab close does not re-PUT it", () => {
  assert.match(
    providerSource,
    /if \(serialized === lastSynchronized\.current\) \{\s*(?:\/\/[^\n]*\n\s*)*pendingWrite\.current = null;/,
    "Reaching the already-synchronized short-circuit must clear the pending record.",
  );
  assert.match(
    providerSource,
    /pendingWrite\.current = null;\s*(?:\/\/[^\n]*\n\s*)*pendingReplacement\.current = false;/,
    "A save the API accepted must clear the pending record.",
  );
});

// ---------------------------------------------------------------------------
// Item 3 -- a failed save with nothing left to re-arm it.
// ---------------------------------------------------------------------------

test("a save that failed on the network is retried, with the hydration backoff", () => {
  // `status: null` is a request that produced no response at all: offline, DNS,
  // TLS, an aborted socket. The common case, and the retryable one.
  const delays = [];
  for (let attempt = 1; attempt <= 7; attempt += 1) {
    delays.push(planProgressSaveRetry({ status: null, attempt }));
  }
  assert.deepEqual(
    delays.slice(0, 5).map((plan) => plan.delayMs),
    [1000, 2000, 4000, 8000, 16000],
    "the save backoff must match the hydration backoff: 1s, 2s, 4s, 8s, 16s",
  );
  assert.equal(delays[5].action, "give-up");
  assert.equal(delays[5].reason, "attempts-exhausted");
  assert.equal(PROGRESS_SAVE_MAX_ATTEMPTS, 6);
});

test("a save the server rejected on its content is NOT retried", () => {
  // The sync effect throws on !response.ok, so a 400 and a dropped connection
  // arrive at the same catch. Retrying a 400 re-sends the identical body the
  // server has already refused, every 30 seconds, for as long as the tab is
  // open -- and tells the learner nothing new each time.
  for (const status of [400, 401, 403, 404, 409, 413, 422]) {
    const plan = planProgressSaveRetry({ status, attempt: 1 });
    assert.equal(
      plan.action,
      "give-up",
      `HTTP ${status} is the payload's or the session's problem; waiting does not change it`,
    );
    assert.equal(plan.reason, "not-retryable");
  }
});

test("the two 4xx that do mean 'later', and every 5xx, are retried", () => {
  for (const status of [408, 429, 500, 502, 503, 504]) {
    const plan = planProgressSaveRetry({ status, attempt: 1 });
    assert.equal(plan.action, "retry", `HTTP ${status} must be retried`);
  }
});

test("the provider re-arms the save on a timer and on reconnect", () => {
  // Before this, the catch set syncStatus to "error" and every way out was
  // closed: the reconnect effect fires only on a syncStatus transition and acts
  // only on "synced", and the sync effect re-runs only when `progress` changes.
  // Close the tab and the work was gone.
  assert.match(
    providerSource,
    /planProgressSaveRetry\(\{\s*status: caught instanceof ProgressSaveError \? caught\.status : null,/,
    "The save catch must classify the failure by HTTP status before retrying.",
  );
  assert.match(
    providerSource,
    /saveRetryTimer\.current = window\.setTimeout\(\(\) => \{[\s\S]{0,120}?setSaveRetry\(\(value\) => value \+ 1\)/,
    "A retryable failure must arm a timer that re-runs the save.",
  );
  assert.match(
    providerSource,
    /window\.addEventListener\("online", onOnline\)/,
    "The save must also be re-armed when the browser reports the network is back.",
  );
  assert.match(
    providerSource,
    /\}, \[account, hydrated, progress, saveRetry, sendProgress\]\);/,
    "saveRetry must be in the sync effect's deps, or bumping it re-arms nothing.",
  );
});

test("a rejected save carries its status out of the fetch handler", () => {
  // Without this the classification above has nothing to classify.
  assert.match(
    providerSource,
    /class ProgressSaveError extends Error \{[\s\S]{0,400}?readonly status: number;/,
    "A non-ok save must throw an error carrying the HTTP status.",
  );
});

// ---------------------------------------------------------------------------
// Item 6 -- an import must not be silently undone by a concurrent read.
// ---------------------------------------------------------------------------

test("an import that removes a module is not resurrected by a read landing inside the debounce", () => {
  // replaceProgress sets lastSynchronized to "" and waits out the 800ms
  // debounce. A re-hydration inside that window -- which a session renewal
  // provokes at any moment -- used to union the pre-import account record back
  // in, and the module the learner deliberately dropped came straight back.
  //
  // The server replaces rather than merges on write (a progress.imported event
  // resets the projection), so the removal is real once written and this is the
  // only thing standing in its way.
  const [kept, removed] = completableModules(2);
  let account = completeModule(createEmptyProgress(), kept, 1);
  account = completeModule(account, removed, 2);
  assert.ok(account.completedModuleIds.includes(removed.moduleId));

  const imported = completeModule(createEmptyProgress(), kept, 1);
  assert.ok(!imported.completedModuleIds.includes(removed.moduleId));

  const withoutIntent = planAccountProgressHydration(account)(imported);
  assert.ok(
    withoutIntent.completedModuleIds.includes(removed.moduleId),
    "sanity: an unguarded hydration is exactly what resurrects the removal",
  );

  const withIntent = planAccountProgressHydration(account, {
    pendingReplacement: true,
  })(imported);
  assert.ok(
    !withIntent.completedModuleIds.includes(removed.moduleId),
    "a pending import must not have its removals unioned back in by a concurrent read",
  );
  assert.deepEqual(withIntent, imported, "the replacement must survive the read unchanged");
});

test("a reset is not silently undone by a read landing inside the debounce", () => {
  // Worse than the import case: an empty record holds no evidence, so the
  // no-evidence short-circuit did not even merge -- it adopted the account
  // record outright and the reset simply never happened. No error, no second
  // confirm, and no way for the learner to tell which record the account kept.
  const [module] = completableModules(1);
  const account = completeModule(createEmptyProgress(), module, 1);
  const afterReset = createEmptyProgress();

  const withoutIntent = planAccountProgressHydration(account)(afterReset);
  assert.equal(
    withoutIntent,
    account,
    "sanity: unguarded, the short-circuit hands the account record straight back",
  );

  const withIntent = planAccountProgressHydration(account, {
    pendingReplacement: true,
  })(afterReset);
  assert.deepEqual(
    withIntent.completedModuleIds,
    [],
    "a pending reset must survive a concurrent read",
  );
});

test("the buffered-progress flush does not union a replacement's removals back either", () => {
  // The buffer is a union source too. Anything captured before the replacement
  // is what the learner asked to discard; anything captured after it is already
  // a subset of what is in state.
  const [kept, removed] = completableModules(2);
  let stale = completeModule(createEmptyProgress(), kept, 1);
  stale = completeModule(stale, removed, 2);

  const plan = planUnsyncedProgressFlush({
    writable: true,
    flushInFlight: false,
    unsynced: stale,
    lastSynchronized: "",
    pendingReplacement: true,
  });
  assert.equal(plan.action, "discard");

  const unguarded = planUnsyncedProgressFlush({
    writable: true,
    flushInFlight: false,
    unsynced: stale,
    lastSynchronized: "",
  });
  assert.equal(unguarded.action, "merge", "sanity: without the flag this flush is a union");
});

test("the provider marks both an import and a reset as a pending replacement, and clears it on the save that lands", () => {
  assert.match(
    providerSource,
    /pendingReplacement\.current = true;\s*lastSynchronized\.current = "";\s*setProgress\(next\);/,
    "replaceProgress must declare the replacement intent.",
  );
  assert.match(
    providerSource,
    /const reset = useCallback\(\(\) => \{\s*if \(account\?\.state === "approved"\) \{\s*pendingReplacement\.current = true;/,
    "reset must declare the replacement intent too; an empty record holds no evidence to protect it.",
  );
  assert.match(
    providerSource,
    /pendingReplacement: pendingReplacement\.current,\s*pendingDisplayName: pendingDisplayName\.current,/,
    "The hydration handler must be told about a pending replacement.",
  );
});

// ---------------------------------------------------------------------------
// Item 4 -- a rename made before the read resolves.
// ---------------------------------------------------------------------------

test("a rename made before the read resolves survives hydration", () => {
  // The account record is the survivor and its displayName wins, which is right
  // for a name set on an earlier visit and wrong for one set ninety seconds
  // ago. A rename is not hasLearningEvidence -- correctly, it is not learning --
  // so on a fresh session the short-circuit adopted the account record outright
  // and the new name vanished from the field the learner had just typed it into.
  //
  // It is worth carrying because the server keeps it: GET /v1/me/progress
  // returns the displayName from the last PUT snapshot, not the account's
  // users.display_name.
  const account = { ...createEmptyProgress("Old Name"), displayName: "Old Name" };
  const renamedLocally = { ...createEmptyProgress(), displayName: "New Name" };

  const lost = planAccountProgressHydration(account)(renamedLocally);
  assert.equal(lost.displayName, "Old Name", "sanity: unguarded, the rename is dropped");

  const carried = planAccountProgressHydration(account, {
    pendingDisplayName: "New Name",
  })(renamedLocally);
  assert.equal(carried.displayName, "New Name");
});

test("a rename survives the merge path too, without disturbing the merge", () => {
  const [accountModule, sessionModule] = completableModules(2);
  const account = {
    ...completeModule(createEmptyProgress(), accountModule, 1),
    displayName: "Old Name",
  };
  const local = {
    ...completeModule(createEmptyProgress(), sessionModule, 2),
    displayName: "New Name",
  };

  const merged = planAccountProgressHydration(account, {
    pendingDisplayName: "New Name",
  })(local);
  assert.equal(merged.displayName, "New Name");
  assert.ok(merged.completedModuleIds.includes(accountModule.moduleId), "the account's history is kept");
  assert.ok(merged.completedModuleIds.includes(sessionModule.moduleId), "the session's work is kept");
});

test("no pending rename leaves the short-circuit returning the account record by identity", () => {
  // The asymmetry the hydration plan depends on: with nothing of the learner's
  // to carry, the updater returns the account record ITSELF, so the caller's
  // lastSynchronized still matches and no write is provoked. Adding the rename
  // option must not cost a write on every ordinary re-hydration.
  const account = { ...createEmptyProgress("Explorer"), displayName: "Explorer" };
  assert.equal(planAccountProgressHydration(account)(createEmptyProgress()), account);
  assert.equal(
    planAccountProgressHydration(account, { pendingDisplayName: null })(createEmptyProgress()),
    account,
  );
  assert.equal(
    planAccountProgressHydration(account, { pendingDisplayName: "Explorer" })(createEmptyProgress()),
    account,
    "a pending rename that matches the account record must still provoke no write",
  );
});

test("the provider remembers the rename until a save confirms it", () => {
  assert.match(
    providerSource,
    /pendingDisplayName\.current = nextName;/,
    "rename must record the pending name.",
  );
  assert.match(
    providerSource,
    /pendingDisplayName\.current = null;/,
    "The save that lands must clear the pending name.",
  );
});

// ---------------------------------------------------------------------------
// Item 7 -- the key-order-sensitive collision check.
// ---------------------------------------------------------------------------

test("an identical attempt whose keys are in a different order is not duplicated", () => {
  // The collision check asks "is this the SAME record, or a different one
  // wearing the same id?" -- a question about content. JSON.stringify equality
  // answered a question about key order instead, so a record that had been
  // round-tripped through the API and rebuilt by the worker's projection, which
  // assembles its fields in its own order, would compare unequal to the local
  // copy and BOTH would be kept: the learner sees the same knowledge check
  // twice in their history, and every later merge carries the duplicate on.
  const [module] = completableModules(1);
  const account = completeModule(createEmptyProgress(), module, 1);
  const [attempt] = account.attempts;
  assert.ok(attempt, "fixture must produce an attempt");

  // The same attempt, same values, keys written in reverse order.
  const reordered = {};
  for (const key of Object.keys(attempt).reverse()) reordered[key] = attempt[key];
  assert.notEqual(
    JSON.stringify(reordered),
    JSON.stringify(attempt),
    "fixture must actually differ by key order, or this test proves nothing",
  );
  assert.deepEqual(reordered, attempt, "fixture must be the same record by content");

  const local = { ...account, attempts: [reordered] };
  const merged = mergeLearnerProgress(account, local, {
    displayName: account.displayName,
    sourceRecordPrefix: "unsynced",
  });

  assert.equal(
    merged.attempts.length,
    1,
    "a key-reordered copy of the same attempt must not be kept as a second attempt",
  );
  assert.ok(
    !merged.attempts.some((candidate) => candidate.id.startsWith("unsynced:")),
    "a key-reordered copy of the same attempt must not be prefixed as a collision",
  );
});

test("a genuinely different attempt sharing an id is still kept under the prefix", () => {
  // The order-insensitive comparison must not become a blanket 'same id means
  // same record' -- that would drop the learner's work, which is the defect
  // the prefix exists to prevent.
  const [module] = completableModules(1);
  const account = completeModule(createEmptyProgress(), module, 1);
  const [attempt] = account.attempts;
  const different = { ...attempt, scorePercent: 50, passed: false };

  const merged = mergeLearnerProgress(
    account,
    { ...account, attempts: [different] },
    { displayName: account.displayName, sourceRecordPrefix: "unsynced" },
  );
  assert.equal(merged.attempts.length, 2);
  assert.ok(merged.attempts.some((candidate) => candidate.id === `unsynced:${attempt.id}`));
});

// ---------------------------------------------------------------------------
// Item 1 -- the first-mount recovery contract.
// ---------------------------------------------------------------------------

test("the first-mount window is covered by the hydration merge, not by effect ordering", () => {
  // The review asked for the undeclared contract to be made explicit. The
  // honest answer is that it is no longer a contract: since
  // planAccountProgressHydration the read handler cannot discard in-session
  // evidence whatever order the effects ran in, so the buffer is a backstop for
  // the case the merge cannot reach -- a read that FAILED, leaving no account
  // record to merge into. This pins that claim rather than the ordering.
  const [module] = completableModules(1);
  const account = createEmptyProgress();
  const beforeRead = recordModuleVisit(createEmptyProgress(), starterCatalog, {
    pathId: module.pathId,
    moduleId: module.moduleId,
    visitedAt: new Date(Date.UTC(2026, 8, 12, 9, 0)).toISOString(),
  });

  // No buffer, no reconnect flush, no effect order: the read handler alone.
  const hydrated = planAccountProgressHydration(account)(beforeRead);
  assert.equal(hydrated.recentModule?.moduleId, module.moduleId);
  assert.ok(hydrated.startedPathIds.includes(module.pathId));

  assert.match(
    providerSource,
    /the effect ordering is no longer load-bearing/,
    "The buffer's role must be stated where the buffer is declared.",
  );
});

// ---------------------------------------------------------------------------
// The premise item 6 rests on.
// ---------------------------------------------------------------------------

test("a PUT that REMOVES progress is honoured by the API, so suppressing the client merge is worth doing", async (t) => {
  // Everything above about imports and resets assumes the server replaces
  // rather than merges -- that if the client stops unioning the old record back
  // in, the removal actually sticks. That assumption was load-bearing and
  // untested: tests/authoritative-progress-api.test.mjs round-trips an import,
  // but its fixture is all-empty arrays, so it never drops a populated
  // completedModuleIds or attempts and could not have caught a server-side
  // union.
  //
  // It is not obvious from reading the code either. GET /v1/me/progress
  // builds its answer by UNIONING the event projection's enrollments, completed
  // modules and attempts into the stored snapshot. What makes a removal survive
  // is that a `progress.imported` event RESETS that projection rather than
  // appending to it, so the union is against nothing. That is a property of the
  // event engine, two files away from the route, and nothing here would notice
  // it changing.
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-28",
    d1Databases: { PROJECT42_DB: "project42-progress-removal" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  const migrations = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(new URL(`../migrations/${migration}`, import.meta.url), "utf8");
    await database.exec(sql.replace(/\r?\n/g, " "));
  }

  const issuer = "https://issuer.example.test";
  const origin = "https://learn.example.test";
  const repository = new D1Project42Repository(database, "progress-removal");
  const identity = {
    issuer,
    subject: "owner-subject",
    email: "owner@example.test",
    emailVerified: true,
    displayName: "Owner",
    issuedAt: Math.floor(Date.now() / 1_000),
  };
  const env = {
    PROJECT42_DB: database,
    INSTALLATION_ID: "progress-removal",
    ALLOWED_ORIGINS: origin,
    BOOTSTRAP_OWNER_ISSUER: issuer,
    BOOTSTRAP_OWNER_SUBJECT: identity.subject,
    DOMAIN_APPROVAL_ENABLED: "false",
    LEARNING_RECORD_ADAPTER: "cloudflare-d1",
  };
  const api = (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", "Bearer owner");
    headers.set("origin", origin);
    if (init.body) headers.set("content-type", "application/json");
    return handleRequest(
      new Request(`https://api.example.test${path}`, { ...init, headers }),
      env,
      { verify: async () => identity },
      repository,
    );
  };

  const session = await api("/v1/session", { method: "POST" });
  assert.equal(session.status, 200);

  const put = async (importId, record) => {
    const response = await api("/v1/me/progress", {
      method: "PUT",
      body: JSON.stringify({
        importId,
        source: ACCOUNT_BACKED_PROGRESS_SOURCE,
        progress: record,
      }),
    });
    assert.equal(response.status, 200, `PUT ${importId} must be accepted`);
    return (await response.json()).progress.progress;
  };
  const get = async () => {
    const response = await api("/v1/me/progress");
    assert.equal(response.status, 200);
    return (await response.json()).progress.progress;
  };

  // Two modules completed, then an import that deliberately drops the second.
  const [kept, removed] = completableModules(2);
  let full = completeModule(createEmptyProgress(), kept, 1);
  full = completeModule(full, removed, 2);
  await put("removal-seed", full);

  const seeded = await get();
  assert.ok(seeded.completedModuleIds.includes(removed.moduleId));
  assert.equal(seeded.attempts.length, 2);

  const reduced = completeModule(createEmptyProgress(), kept, 1);
  await put("removal-import", reduced);

  const afterImport = await get();
  assert.ok(
    !afterImport.completedModuleIds.includes(removed.moduleId),
    "a module dropped by an import must not be returned by the next read",
  );
  assert.equal(
    afterImport.attempts.length,
    1,
    "an attempt dropped by an import must not be unioned back in by the projection",
  );
  assert.ok(afterImport.completedModuleIds.includes(kept.moduleId), "the rest is kept");

  // And the reset case: an empty record really does empty the account.
  await put("removal-reset", createEmptyProgress());
  const afterReset = await get();
  assert.deepEqual(afterReset.completedModuleIds, []);
  assert.deepEqual(afterReset.attempts, []);
  assert.deepEqual(afterReset.startedPathIds, []);

  // The displayName a save carries is what comes back -- not the account's
  // users.display_name ("Owner" here). This is why carrying a pre-hydration
  // rename (item 4) is worth doing rather than cosmetic.
  const named = { ...createEmptyProgress(), displayName: "Renamed In Session" };
  await put("removal-rename", named);
  assert.equal((await get()).displayName, "Renamed In Session");
});
