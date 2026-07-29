import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Miniflare } from "miniflare";

const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");

function runWrangler(args, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, CI: "true" },
  });
  assert.equal(
    result.status,
    expectedStatus,
    `wrangler ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
  );
  return `${result.stdout}\n${result.stderr}`;
}

test("D1 migrations are replayable and enforce authorization/audit guards", () => {
  const persistence = mkdtempSync(join(tmpdir(), "project42-d1-test-"));
  try {
    const common = ["--local", "--persist-to", persistence];
    runWrangler(["d1", "migrations", "apply", "PROJECT42_DB", ...common]);
    const secondApply = runWrangler([
      "d1",
      "migrations",
      "apply",
      "PROJECT42_DB",
      ...common,
    ]);
    assert.match(secondApply, /No migrations to apply/);

    const seed = [
      "INSERT INTO installations VALUES ('test','Test','2026-07-26','2026-07-26');",
      "INSERT INTO users (id,installation_id,display_name,primary_email,email_verified,account_state,created_at,updated_at) VALUES ('u1','test','Learner','learner@example.com',1,'pending','2026-07-26','2026-07-26');",
      "INSERT INTO user_identities (id,installation_id,provider,issuer,subject,user_id,provider_login,display_name,status,is_primary,link_method,linked_at,last_verified_at,last_seen_at,unlinked_at) VALUES ('i1','test','oidc','https://issuer.example','sub-1','u1',NULL,'Learner','active',1,'registration','2026-07-26','2026-07-26','2026-07-26',NULL);",
      "INSERT INTO role_assignments VALUES ('test','u1','learner',NULL,'2026-07-26');",
      "INSERT INTO approved_email_domains (id,installation_id,domain,enabled,created_by_user_id,created_at,updated_at,policy_version) VALUES ('d1','test','example.com',1,'u1','2026-07-26','2026-07-26',1);",
      "INSERT INTO audit_events (id,installation_id,actor_user_id,actor_issuer,actor_subject,action,target_type,target_id,request_id,outcome,reason,metadata_json,occurred_at) VALUES ('a1','test','u1','https://issuer.example','sub-1','test.seed','user','u1','r1','success','seed','{}','2026-07-26');",
    ].join(" ");
    runWrangler(["d1", "execute", "PROJECT42_DB", ...common, "--command", seed]);

    const tables = runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name;",
    ]);
    for (const table of [
      "users",
      "user_identities",
      "identity_link_transactions",
      "deleted_identity_tombstones",
      "account_merge_proofs",
      "account_merge_cases",
      "account_merge_snapshot_rows",
      "account_merge_aliases",
      "account_merge_receipts",
      "account_merge_recovery_receipts",
      "account_merge_governance_constraints",
      "learning_progress",
      "learning_event_streams",
      "learning_events",
      "learning_record_deletion_receipts",
      "learning_record_deletion_replays",
      "assessment_attempts",
      "transcript_entries",
      "user_badges",
      "approval_decisions",
      "approved_email_domains",
      "audit_events",
      "consent_records",
      "deletion_requests",
      "deletion_tombstones",
      "oidc_authorization_transactions",
      "browser_sessions",
      "registration_requests",
    ]) {
      assert.match(tables, new RegExp(`\\b${table}\\b`));
    }

    runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "INSERT INTO learning_event_streams (installation_id,user_id,revision,write_token,updated_at) VALUES ('test','u1',1,'write-1','2026-07-28T00:00:00.000Z'); INSERT INTO learning_events (id,installation_id,user_id,idempotency_key,event_type,content_version,command_digest,occurred_at,recorded_at,actor_type,actor_user_id,payload_json,append_token) VALUES ('event-1','test','u1','learning-event-migration-key-1','path.enrolled','1.0.0','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','2026-07-28T00:00:00.000Z','2026-07-28T00:00:00.000Z','learner','u1','{}','write-1');",
    ]);
    const mutableLearningEvent = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "UPDATE learning_events SET content_version='2.0.0' WHERE id='event-1';",
      ],
      1,
    );
    assert.match(mutableLearningEvent, /learning events are immutable/);

    runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "UPDATE users SET account_state='rejected' WHERE id='u1'; UPDATE users SET account_state='approved' WHERE id='u1';",
    ]);

    const invalidTransition = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "UPDATE users SET account_state='rejected' WHERE id='u1';",
      ],
      1,
    );
    assert.match(invalidTransition, /invalid account state transition/);

    const mutableAudit = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "UPDATE audit_events SET outcome='failed' WHERE id='a1';",
      ],
      1,
    );
    assert.match(mutableAudit, /audit events are immutable/);

    runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "UPDATE audit_events SET actor_user_id=NULL, actor_issuer=NULL, actor_subject=NULL, target_id=NULL WHERE id='a1';",
    ]);

    const foreignKeyGuard = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "INSERT INTO role_assignments VALUES ('test','missing-user','owner',NULL,'2026-07-26');",
      ],
      1,
    );
    assert.match(foreignKeyGuard, /FOREIGN KEY constraint failed/);

    runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "INSERT INTO browser_sessions (id,installation_id,user_id,token_digest,identity_issuer,identity_subject,authenticated_at,created_at,last_seen_at,expires_at,absolute_expires_at,revoked_at,replaced_by_session_id) VALUES ('session-1','test','u1','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','https://issuer.example','sub-1',1785196800,'2026-07-28T00:00:00.000Z','2026-07-28T00:00:00.000Z','2026-07-28T08:00:00.000Z','2026-07-29T00:00:00.000Z',NULL,NULL);",
    ]);
    const mutableSession = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "UPDATE browser_sessions SET token_digest='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' WHERE id='session-1';",
      ],
      1,
    );
    assert.match(mutableSession, /browser session token digest is immutable/);

    const invalidChronology = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "INSERT INTO browser_sessions (id,installation_id,user_id,token_digest,identity_issuer,identity_subject,authenticated_at,created_at,last_seen_at,expires_at,absolute_expires_at,revoked_at,replaced_by_session_id) VALUES ('session-invalid','test','u1','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','https://issuer.example','sub-1',1785196800,'2026-07-28T08:00:00.000Z','2026-07-28T08:00:00.000Z','2026-07-28T07:00:00.000Z','2026-07-29T00:00:00.000Z',NULL,NULL);",
      ],
      1,
    );
    assert.match(invalidChronology, /CHECK constraint failed/);

    runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "INSERT INTO installations VALUES ('other','Other','2026-07-26','2026-07-26'); INSERT INTO users (id,installation_id,display_name,primary_email,email_verified,account_state,created_at,updated_at) VALUES ('u2','other','Other learner','other@example.com',1,'approved','2026-07-26','2026-07-26');",
    ]);
    const crossInstallationSession = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "INSERT INTO browser_sessions (id,installation_id,user_id,token_digest,identity_issuer,identity_subject,authenticated_at,created_at,last_seen_at,expires_at,absolute_expires_at,revoked_at,replaced_by_session_id) VALUES ('session-cross','test','u2','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','https://issuer.example','sub-2',1785196800,'2026-07-28T00:00:00.000Z','2026-07-28T00:00:00.000Z','2026-07-28T08:00:00.000Z','2026-07-29T00:00:00.000Z',NULL,NULL);",
      ],
      1,
    );
    assert.match(
      crossInstallationSession,
      /browser session user belongs to another installation/,
    );
    const crossInstallationConstraint = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "INSERT INTO account_merge_governance_constraints (id,installation_id,user_id,constraint_kind,policy_key,policy_version,reference_digest,state,created_at,updated_at) VALUES ('constraint-cross','test','u2','retention-policy','retention','1','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','active','2026-07-28','2026-07-28');",
      ],
      1,
    );
    assert.match(
      crossInstallationConstraint,
      /account merge constraint user belongs to another installation/,
    );
    const crossInstallationConstraintAuthority = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "INSERT INTO account_merge_governance_constraints (id,installation_id,user_id,constraint_kind,policy_key,policy_version,reference_digest,state,created_by_user_id,created_at,updated_at) VALUES ('constraint-authority-cross','test','u1','retention-policy','retention','1','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','active','u2','2026-07-28','2026-07-28');",
      ],
      1,
    );
    assert.match(
      crossInstallationConstraintAuthority,
      /account merge constraint authority belongs to another installation/,
    );

    const recovered = runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "SELECT id, account_state FROM users WHERE id='u1';",
    ]);
    assert.match(recovered, /u1/);
    assert.match(recovered, /approved/);

    runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "INSERT INTO account_merge_governance_constraints (id,installation_id,user_id,constraint_kind,policy_key,policy_version,reference_digest,state,created_by_user_id,created_at,updated_at,released_by_user_id,released_at) VALUES ('constraint-1','test','u1','legal-hold','legal-preservation','1','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','active','u1','2026-07-28','2026-07-28',NULL,NULL);",
    ]);
    const mutableConstraint = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "UPDATE account_merge_governance_constraints SET reference_digest='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' WHERE id='constraint-1';",
      ],
      1,
    );
    assert.match(
      mutableConstraint,
      /account merge constraint evidence is immutable/,
    );
    runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "UPDATE account_merge_governance_constraints SET state='released',released_by_user_id='u1',released_at='2026-07-28',updated_at='2026-07-28' WHERE id='constraint-1';",
    ]);
    const reactivatedConstraint = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "UPDATE account_merge_governance_constraints SET state='active',released_by_user_id=NULL,released_at=NULL WHERE id='constraint-1';",
      ],
      1,
    );
    assert.match(
      reactivatedConstraint,
      /account merge constraint release is terminal/,
    );

    runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "INSERT INTO user_identities (id,installation_id,provider,issuer,subject,user_id,provider_login,display_name,status,is_primary,link_method,linked_at,last_verified_at,last_seen_at,unlinked_at) VALUES ('i2','test','github','https://github.com','42','u1','learner','Learner','active',0,'self-service','2026-07-27','2026-07-27','2026-07-27',NULL);",
    ]);
    const multipleIdentities = runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "SELECT provider, is_primary FROM user_identities WHERE user_id='u1' ORDER BY provider;",
    ]);
    assert.match(multipleIdentities, /github/);
    assert.match(multipleIdentities, /oidc/);

    const duplicateProviderIdentity = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "INSERT INTO user_identities (id,installation_id,provider,issuer,subject,user_id,status,is_primary,link_method,linked_at,last_verified_at,last_seen_at) VALUES ('i3','test','github','https://github.com','42','u1','active',0,'self-service','2026-07-27','2026-07-27','2026-07-27');",
      ],
      1,
    );
    assert.match(duplicateProviderIdentity, /UNIQUE constraint failed/);

    const secondPrimary = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "UPDATE user_identities SET is_primary=1 WHERE id='i2';",
      ],
      1,
    );
    assert.match(secondPrimary, /UNIQUE constraint failed/);

    runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "INSERT INTO account_merge_proofs (id,installation_id,user_id,proof_method,token_digest,evidence_json,status,created_by_user_id,created_at,expires_at,consumed_at,request_id) VALUES ('proof-1','test','u1','recent-authentication','digest-1','{}','available','u1','2026-07-27','2026-07-28',NULL,'request-1'); INSERT INTO account_merge_cases (id,installation_id,source_user_id,survivor_user_id,source_proof_id,survivor_proof_id,created_by_user_id,status,preview_json,preview_digest,resolutions_json,snapshot_digest,idempotency_key,request_id,created_at,expires_at,completed_at,rolled_back_at) VALUES ('merge-1','test','u1',NULL,'proof-1',NULL,'u1','completed','{\"conflicts\":[],\"recordCounts\":{},\"proofMethods\":{\"source\":\"recent-authentication\",\"survivor\":\"recent-authentication\"}}','preview-digest','{}','snapshot-digest','merge-idempotency-1','request-1','2026-07-27','2026-07-28','2026-07-27',NULL); INSERT INTO account_merge_receipts (id,installation_id,merge_case_id,receipt_json,receipt_digest,created_at) VALUES ('receipt-1','test','merge-1','{}','receipt-digest','2026-07-27');",
    ]);
    const mutableMergeReceipt = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "UPDATE account_merge_receipts SET receipt_digest='changed' WHERE id='receipt-1';",
      ],
      1,
    );
    assert.match(mutableMergeReceipt, /account merge receipts are immutable/);

    runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "DELETE FROM users WHERE id='u1';",
    ]);
    const retainedDomain = runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "SELECT id, created_by_user_id FROM approved_email_domains WHERE id='d1';",
    ]);
    assert.match(retainedDomain, /d1/);
    assert.doesNotMatch(retainedDomain, /u1/);
  } finally {
    rmSync(persistence, { recursive: true, force: true });
  }
});

test("profile and consent migration preserves legacy history and constrains new decisions", async (t) => {
  const miniflare = new Miniflare({
    compatibilityDate: "2026-07-26",
    d1Databases: { PROJECT42_DB: "project42-profile-consent-migration" },
    d1Persist: false,
    modules: true,
    script: "export default { fetch() { return new Response('fixture'); } };",
  });
  t.after(() => miniflare.dispose());
  const database = await miniflare.getD1Database("PROJECT42_DB");
  const migrations = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations.filter((name) => name < "0013_")) {
    const sql = await readFile(
      new URL(`../migrations/${migration}`, import.meta.url),
      "utf8",
    );
    await database.exec(sql.replace(/\r?\n/g, " "));
  }
  await database.exec(
    [
      "INSERT INTO installations VALUES ('legacy','Legacy','2026-07-26','2026-07-26');",
      "INSERT INTO users (id,installation_id,display_name,primary_email,email_verified,account_state,created_at,updated_at) VALUES ('u1','legacy','Learner',NULL,0,'approved','2026-07-26','2026-07-26');",
      "INSERT INTO consent_records (id,installation_id,user_id,purpose,policy_version,decision,decided_at) VALUES ('legacy-consent','legacy','u1','legacy-purpose','2026-06-01','granted','2026-07-26');",
    ].join(" "),
  );
  const migration = await readFile(
    new URL("../migrations/0013_profile_consent_and_deletion_receipts.sql", import.meta.url),
    "utf8",
  );
  await database.exec(migration.replace(/\r?\n/g, " "));
  const legacy = await database
    .prepare(
      "SELECT purpose, policy_version, contract_status FROM consent_records WHERE id = 'legacy-consent'",
    )
    .first();
  assert.deepEqual(legacy, {
    purpose: "legacy-purpose",
    policy_version: "2026-06-01",
    contract_status: "legacy",
  });
  await database.exec(
    "INSERT INTO consent_records (id,installation_id,user_id,purpose,policy_version,decision,decided_at,contract_status) VALUES ('current-consent','legacy','u1','learning-record','2026-07-27','granted','2026-07-27','current');",
  );
  await assert.rejects(
    database.exec(
      "INSERT INTO consent_records (id,installation_id,user_id,purpose,policy_version,decision,decided_at,contract_status) VALUES ('invalid-consent','legacy','u1','arbitrary','2026-07-27','granted','2026-07-27','current');",
    ),
    /current accepted purpose and policy version/,
  );
  const profileColumns = await database
    .prepare("PRAGMA table_info(user_profiles)")
    .all();
  for (const column of [
    "locale",
    "time_zone",
    "reduced_motion",
    "high_contrast",
  ]) {
    assert.ok(
      profileColumns.results.some((entry) => entry.name === column),
      `missing ${column}`,
    );
  }
});
