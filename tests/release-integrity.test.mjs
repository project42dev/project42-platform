import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { validateReleaseCandidate } from "../dist/release-integrity.js";

const manifest = JSON.parse(
  await readFile("self-host/compatibility.json", "utf8"),
);
const fixtureDirectory = "tests/fixtures/release-integrity";

function components() {
  return [
    manifest.components.application,
    manifest.components.schemas,
    manifest.components.content,
    manifest.components.trainingPackage,
    ...manifest.components.adapters,
  ];
}

function validEvidence() {
  return {
    schemaVersion: 1,
    release: manifest.release,
    observedAt: "2026-07-27T12:00:00Z",
    artifacts: components().map((component) => ({
      id: component.id,
      present: true,
      expectedSha256: component.digest.value,
      observedSha256: component.digest.value,
    })),
    compatibility: {
      accepted: true,
      requiredMigrations: manifest.compatibility.requiredMigrations.map(
        (migration) => migration.id,
      ),
    },
    signature: {
      present: true,
      verified: true,
      certificateIdentity: manifest.integrityPolicy.certificateIdentity,
      oidcIssuer: manifest.integrityPolicy.certificateOidcIssuer,
      validFrom: "2026-07-27T11:00:00Z",
      validUntil: "2026-07-27T13:00:00Z",
      integratedAt: "2026-07-27T12:00:00Z",
      transparencyLog: manifest.integrityPolicy.trustedTransparencyLog,
    },
    provenance: {
      present: true,
      verified: true,
      sourceRepository:
        "https://github.com/project42dev/project42-platform",
      sourceDigest: "a".repeat(40),
      sourceRef: `refs/tags/v${manifest.release}`,
      runnerEnvironment: manifest.integrityPolicy.allowedRunnerEnvironment,
    },
    releaseStatus: {
      state: "active",
    },
  };
}

function applyMutation(evidence, mutation) {
  switch (mutation) {
    case "none":
      break;
    case "tamper-content":
      evidence.artifacts.find(
        (artifact) => artifact.id === "project42-learning-content",
      ).observedSha256 = "0".repeat(64);
      break;
    case "reject-compatibility":
      evidence.compatibility.accepted = false;
      break;
    case "remove-training-package":
      evidence.artifacts = evidence.artifacts.filter(
        (artifact) => artifact.id !== "language-models-and-generation",
      );
      break;
    case "revoke-release":
      evidence.releaseStatus.state = "revoked";
      break;
    case "remove-signature":
      evidence.signature.present = false;
      evidence.signature.verified = false;
      break;
    case "expire-signature":
      evidence.signature.integratedAt = "2026-07-27T13:30:00Z";
      break;
    case "replace-certificate-identity":
      evidence.signature.certificateIdentity =
        "https://github.com/untrusted/repository/.github/workflows/release.yml";
      break;
    default:
      throw new Error(`Unknown release-integrity mutation: ${mutation}`);
  }
}

test("release integrity fixtures fail closed for unsafe candidates", async () => {
  const fixtureNames = (await readdir(fixtureDirectory))
    .filter((name) => name.endsWith(".json"))
    .sort();
  assert.deepEqual(fixtureNames, [
    "expired.json",
    "incompatible.json",
    "missing-artifact.json",
    "revoked.json",
    "tampered.json",
    "unsigned.json",
    "untrusted.json",
    "valid.json",
  ]);

  for (const fixtureName of fixtureNames) {
    const fixture = JSON.parse(
      await readFile(`${fixtureDirectory}/${fixtureName}`, "utf8"),
    );
    const evidence = validEvidence();
    applyMutation(evidence, fixture.mutation);
    const result = validateReleaseCandidate(evidence, manifest);
    assert.equal(result.valid, fixture.expectedValid, fixture.scenario);
    for (const error of fixture.expectedErrors) {
      assert.ok(
        result.errors.includes(error),
        `${fixture.scenario} must include ${error}: ${result.errors.join(", ")}`,
      );
    }
  }
});
