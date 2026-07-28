import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  buildContributorCreditView,
  buildPublicContributorCreditExport,
  validateContributorCreditPackage,
} from "../dist/index.js";

const fixtureRoot = new URL("./fixtures/contributors/", import.meta.url);
const schemaUrl = new URL(
  "../schemas/contributors/contributor-credit-package.schema.json",
  import.meta.url,
);

async function json(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

const [
  schema,
  aiAssisted,
  multipleReviewers,
  revokedConsent,
  deletedAccount,
  invalidPrivateEmail,
] = await Promise.all([
  json(schemaUrl),
  json(new URL("ai-assisted-production.json", fixtureRoot)),
  json(new URL("multiple-reviewers.json", fixtureRoot)),
  json(new URL("revoked-consent.json", fixtureRoot)),
  json(new URL("deleted-account.json", fixtureRoot)),
  json(new URL("invalid-private-email.json", fixtureRoot)),
]);

test("contributor-credit schema accepts lifecycle fixtures and rejects private email", () => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
  });
  const validate = ajv.compile(schema);

  for (const fixture of [
    aiAssisted,
    multipleReviewers,
    revokedConsent,
    deletedAccount,
  ]) {
    assert.equal(validate(fixture), true, JSON.stringify(validate.errors));
    assert.deepEqual(validateContributorCreditPackage(fixture), {
      valid: true,
      errors: [],
    });
  }

  assert.equal(validate(invalidPrivateEmail), false);
  assert.ok(
    validate.errors?.some(
      (error) =>
        error.keyword === "additionalProperties" &&
        error.params.additionalProperty === "privateEmail",
    ),
  );
  assert.match(
    validateContributorCreditPackage(invalidPrivateEmail).errors.join("\n"),
    /cannot contain email fields/,
  );

  const leakedEmail = structuredClone(aiAssisted);
  leakedEmail.credits[0].contributionSummary =
    "Contact private-address@example.test for details.";
  assert.equal(validate(leakedEmail), false);
  assert.ok(validate.errors?.some((error) => error.keyword === "not"));
});

test("stable provider evidence survives username and public-profile changes", () => {
  const renamed = structuredClone(aiAssisted);
  const originalIdentity = structuredClone(renamed.credits[0].contributor);
  renamed.credits[0].publicProfile.displayName = "Renamed contributor";
  renamed.credits[0].publicProfile.profileUrl =
    "https://github.com/renamed-contributor";

  assert.deepEqual(validateContributorCreditPackage(renamed), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(renamed.credits[0].contributor, originalIdentity);
  assert.equal(
    buildPublicContributorCreditExport(renamed).contributors[0].displayName,
    "Renamed contributor",
  );
});

test("public export is consented, data-minimized, evidence-backed, and email-free", () => {
  const exported = buildPublicContributorCreditExport(aiAssisted);

  assert.equal(exported.content.acceptedVersion, "1.4.0");
  assert.equal(exported.acceptedChange.pullRequestId, "91");
  assert.equal(
    exported.acceptedChange.acceptedCommitSha,
    "2222222222222222222222222222222222222222",
  );
  assert.equal(exported.contributors[0].role, "author");
  assert.match(
    exported.contributors[0].aiAssistanceDisclosure,
    /AI assisted drafting/,
  );

  const serialized = JSON.stringify(exported);
  assert.doesNotMatch(
    serialized,
    /providerAccountRef|identityProofDigest|contributorRef/i,
  );
  assert.doesNotMatch(serialized, /email|@/i);
});

test("revoked consent and account deletion retain evidence but suppress identity", () => {
  for (const fixture of [revokedConsent, deletedAccount]) {
    const exported = buildPublicContributorCreditExport(fixture);
    assert.equal(exported.contributors[0].displayName, "Anonymous contributor");
    assert.equal(exported.contributors[0].profileUrl, null);
    assert.ok(exported.contributors[0].contributionSummary.length > 0);
    assert.match(exported.acceptedChange.pullRequestUrl, /^https:/);
  }

  const invalidDeletion = structuredClone(deletedAccount);
  invalidDeletion.credits[0].contributor.providerAccountRef =
    "retained-provider-account";
  assert.match(
    validateContributorCreditPackage(invalidDeletion).errors.join("\n"),
    /must tombstone the provider account reference/,
  );
});

test("Learn and Field Guide receive equivalent accessible renderer contracts", () => {
  const learn = buildContributorCreditView(multipleReviewers, "learn");
  const guide = buildContributorCreditView(
    multipleReviewers,
    "field-guide",
  );

  assert.deepEqual(learn.semantics, {
    containerElement: "section",
    containerAriaLabel: "Content contributors",
    listElement: "ul",
    itemElement: "li",
  });
  assert.equal(learn.heading, "Contributors");
  assert.equal(learn.entries.length, 4);
  assert.ok(
    learn.entries.every(
      (entry) =>
        entry.accessibleSummary.includes(entry.displayName) &&
        entry.evidenceLabel.includes("92"),
    ),
  );

  const { surface: _learnSurface, ...learnContract } = learn;
  const { surface: _guideSurface, ...guideContract } = guide;
  assert.deepEqual(learnContract, guideContract);
});

test("runtime validation fails closed on incomplete evidence and unsafe consent", () => {
  const unsafe = structuredClone(aiAssisted);
  unsafe.createdAt = "2026-07-28T12:00:00.000Z";
  unsafe.acceptedChange.pullRequestUrl =
    "https://github.com/unrelated/repository/pull/91";
  unsafe.acceptedChange.acceptedCommitSha = "short";
  unsafe.credits[0].contributor.usernameAtAcceptance = "mutable-name";
  unsafe.credits[0].consent.status = "revoked";
  unsafe.credits[0].consent.revokedAt = null;
  unsafe.credits[0].publicProfile = {
    displayName: "Must not render",
    profileUrl: null,
  };
  unsafe.credits[0].contributionSummary =
    "Contact private-address@example.test for details.";

  const result = validateContributorCreditPackage(unsafe);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /cannot be created before/);
  assert.match(result.errors.join("\n"), /must belong to the evidence repository/);
  assert.match(result.errors.join("\n"), /accepted commit/);
  assert.match(result.errors.join("\n"), /unsupported field: usernameAtAcceptance/);
  assert.match(result.errors.join("\n"), /requires revokedAt/);
  assert.match(result.errors.join("\n"), /cannot retain a public profile/);
  assert.match(result.errors.join("\n"), /cannot contain an email address/);
  assert.throws(
    () => buildPublicContributorCreditExport(unsafe),
    /Invalid contributor-credit package/,
  );
});
