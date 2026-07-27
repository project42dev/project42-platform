import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

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
      "INSERT INTO users VALUES ('u1','test','Learner','learner@example.com',1,'pending','2026-07-26','2026-07-26');",
      "INSERT INTO user_identities VALUES ('test','https://issuer.example','sub-1','u1','2026-07-26');",
      "INSERT INTO role_assignments VALUES ('test','u1','learner',NULL,'2026-07-26');",
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
      "learning_progress",
      "assessment_attempts",
      "transcript_entries",
      "user_badges",
      "approval_decisions",
      "approved_email_domains",
      "audit_events",
    ]) {
      assert.match(tables, new RegExp(`\\b${table}\\b`));
    }

    const invalidTransition = runWrangler(
      [
        "d1",
        "execute",
        "PROJECT42_DB",
        ...common,
        "--command",
        "UPDATE users SET account_state='suspended' WHERE id='u1';",
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

    const recovered = runWrangler([
      "d1",
      "execute",
      "PROJECT42_DB",
      ...common,
      "--command",
      "SELECT id, account_state FROM users WHERE id='u1';",
    ]);
    assert.match(recovered, /u1/);
    assert.match(recovered, /pending/);
  } finally {
    rmSync(persistence, { recursive: true, force: true });
  }
});
