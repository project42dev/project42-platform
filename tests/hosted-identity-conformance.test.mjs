// AB#5418 acceptance criteria: "OIDC code flow with PKCE completes against the
// hosted test provider and the reference self-host provider."
//
// The self-host leg is exercised directly by the self-host-smoke and
// secure-self-host-smoke CI jobs. The hosted leg cannot run without a real
// hosted test identity, so it is credential-gated. That gate is exactly what
// makes it prone to silently rotting: a mocked or deleted hosted leg would look
// identical to a skipped one from the outside.
//
// These tests keep the hosted leg honest without needing credentials. They
// assert that the conformance script still exists, is still wired into CI, and
// still makes the specific assertions that give it its value — in particular
// that it proves S256 PKCE against a real issuer rather than a stub.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const scriptPath = join(
  repositoryRoot,
  "scripts",
  "smoke-hosted-browser-session.mjs",
);
const workflowPath = join(repositoryRoot, ".github", "workflows", "ci.yml");

const script = readFileSync(scriptPath, "utf8");
const workflow = readFileSync(workflowPath, "utf8").replaceAll("\r\n", "\n");

test("the hosted provider leg proves an S256 PKCE authorization code flow", () => {
  assert.match(
    script,
    /searchParams\.get\("response_type"\),\s*\n?\s*"code"/,
    "The hosted leg must assert the authorization code response type.",
  );
  assert.match(
    script,
    /searchParams\.get\("code_challenge_method"\),\s*\n?\s*"S256"/,
    "The hosted leg must assert S256 PKCE, not plain.",
  );
  assert.match(
    script,
    /searchParams\.get\("code_challenge"\)/,
    "The hosted leg must assert a PKCE code challenge is present.",
  );
  for (const parameter of ["state", "nonce"]) {
    assert.match(
      script,
      new RegExp(`"${parameter}"`),
      `The hosted leg must assert the ${parameter} parameter is present.`,
    );
  }
});

test("the hosted provider leg runs against a real issuer, not a stub", () => {
  assert.match(
    script,
    /authorization\.host,\s*\n?\s*issuerHost/,
    "The hosted leg must assert the authorization request reached the configured issuer.",
  );
  assert.match(
    script,
    /identity\.issuer,\s*\n?\s*issuer/,
    "The hosted leg must assert the session resolved against the hosted issuer.",
  );
  assert.match(
    script,
    /chromium\.launch/,
    "The hosted leg must drive a real browser.",
  );

  // A stubbed or self-hosted-only leg would defeat the point of this job.
  for (const forbidden of [
    /example\.test/,
    /localhost/,
    /127\.0\.0\.1/,
    /createLocalJWKSet/,
    /nock/,
  ]) {
    assert.doesNotMatch(
      script,
      forbidden,
      `The hosted leg must not fall back to a stub or local provider (${forbidden}).`,
    );
  }
});

test("the hosted provider leg asserts the same session guarantees as the self-host leg", () => {
  assert.match(script, /__Secure-project42_session/);
  assert.match(script, /sessionCookie\.secure, true/);
  assert.match(script, /sessionCookie\.httpOnly, true/);
  assert.match(script, /sessionCookie\.sameSite, "Lax"/);
  assert.match(
    script,
    /__Host-project42_oidc/,
    "The hosted leg must assert the one-time OIDC transaction cookie is cleared.",
  );
  assert.match(
    script,
    /afterSignOut\.status,\s*\n?\s*401/,
    "The hosted leg must assert the session is invalidated on sign-out.",
  );

  // The browser must be launched sandboxed, matching the self-host smoke legs.
  assert.match(script, /chromiumSandbox: true/);
  assert.doesNotMatch(script, /ignoreHTTPSErrors/);
  assert.doesNotMatch(script, /--no-sandbox/);
});

test("the hosted provider leg is wired into CI behind an explicit configuration gate", () => {
  assert.match(
    workflow,
    /^  hosted-identity-smoke:$/m,
    "CI must define the hosted identity conformance job.",
  );

  const jobIndex = workflow.indexOf("\n  hosted-identity-smoke:\n");
  assert.ok(jobIndex > 0);
  const job = workflow.slice(jobIndex);

  assert.match(
    job,
    /^    if: vars\.PROJECT42_HOSTED_IDENTITY_ENABLED == 'true'$/m,
    "The hosted job must be gated so it does not fail forks and unconfigured clones.",
  );
  assert.match(
    job,
    /node scripts\/smoke-hosted-browser-session\.mjs/,
    "The hosted job must run the conformance script.",
  );

  // Credentials belong in secrets; origins and issuer are not sensitive.
  for (const secretName of [
    "PROJECT42_HOSTED_SMOKE_EMAIL",
    "PROJECT42_HOSTED_SMOKE_PASSWORD",
  ]) {
    assert.match(
      job,
      new RegExp(`${secretName}: \\$\\{\\{ secrets\\.${secretName} \\}\\}`),
      `${secretName} must come from an Actions secret.`,
    );
  }
});
