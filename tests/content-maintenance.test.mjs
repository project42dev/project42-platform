import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  buildContentImpactAnalysis,
  starterCatalog,
  validateContentChangePacket,
  validateFoundryRoleProfile,
  validateMaintenanceProposal,
} from "../dist/index.js";

const root = new URL("../", import.meta.url);
const fixtureRoot = new URL("./fixtures/content-maintenance/", import.meta.url);
const schemaRoot = new URL("../schemas/content-maintenance/", import.meta.url);

async function json(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

const [
  registry,
  validPacket,
  invalidPacket,
  validProposal,
  invalidProposal,
  validRoleProfile,
  packetSchema,
  proposalSchema,
  roleProfileSchema,
] = await Promise.all([
  json(new URL("content/source-registry.json", root)),
  json(new URL("valid-change-packet.json", fixtureRoot)),
  json(new URL("invalid-change-packet.json", fixtureRoot)),
  json(new URL("valid-maintenance-proposal.json", fixtureRoot)),
  json(new URL("invalid-maintenance-proposal.json", fixtureRoot)),
  json(new URL("valid-foundry-role-profile.json", fixtureRoot)),
  json(new URL("content-change-packet.schema.json", schemaRoot)),
  json(new URL("maintenance-proposal.schema.json", schemaRoot)),
  json(new URL("foundry-role-profile.schema.json", schemaRoot)),
]);

test("machine-readable maintenance schemas accept complete fixtures and reject unsafe output", () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
  const validatePacketSchema = ajv.compile(packetSchema);
  const validateProposalSchema = ajv.compile(proposalSchema);
  const validateRoleProfileSchema = ajv.compile(roleProfileSchema);

  assert.equal(validatePacketSchema(validPacket), true);
  assert.equal(validateProposalSchema(validProposal), true);
  assert.equal(validateRoleProfileSchema(validRoleProfile), true);

  assert.equal(validatePacketSchema(invalidPacket), false);
  assert.ok(validatePacketSchema.errors?.some((error) => error.keyword === "additionalProperties"));
  assert.equal(validateProposalSchema(invalidProposal), false);
  assert.ok(
    validateProposalSchema.errors?.some(
      (error) => error.keyword === "additionalProperties",
    ),
  );
});

test("impact analysis maps one official source to Learn, Field Guide, assessments, and instructor packages", () => {
  const impact = buildContentImpactAnalysis(
    "google-ai-developer-docs",
    "https://ai.google.dev/gemini-api/docs/function-calling",
    starterCatalog,
    registry,
  );
  assert.deepEqual(impact, validPacket.impact);
  assert.throws(
    () =>
      buildContentImpactAnalysis(
        "google-ai-developer-docs",
        "https://untrusted.example/function-calling",
        starterCatalog,
        registry,
      ),
    /outside the registered prefix/,
  );
});

test("content-change packets fail closed on hash, evidence, disposition, and impact drift", () => {
  assert.deepEqual(
    validateContentChangePacket(validPacket, starterCatalog, registry),
    { valid: true, errors: [] },
  );

  const invalidRuntime = structuredClone(invalidPacket);
  delete invalidRuntime.modelInstruction;
  const result = validateContentChangePacket(
    invalidRuntime,
    starterCatalog,
    registry,
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /changed must match the observed hashes/);
  assert.match(result.errors.join("\n"), /impact analysis does not match/);
  assert.match(result.errors.join("\n"), /must block/);
});

test("multi-model proposal requires independent families, deterministic gates, and human approval", () => {
  const pending = validateMaintenanceProposal(validProposal);
  assert.equal(pending.valid, true);
  assert.equal(pending.publishable, false);

  const approved = structuredClone(validProposal);
  approved.humanDecision = {
    status: "approved",
    reviewerRef: "private-maintainer-ref",
    decidedAt: "2026-07-27T13:00:00.000Z",
    note: "Evidence and preview accepted.",
  };
  assert.deepEqual(validateMaintenanceProposal(approved), {
    valid: true,
    errors: [],
    publishable: true,
  });

  const oneModel = structuredClone(validProposal);
  for (const stage of oneModel.modelStages) {
    stage.deploymentAlias = "one-model-for-everything";
    stage.providerFamily = "one-provider";
  }
  oneModel.deterministicGates[0].status = "failed";
  oneModel.unresolvedConflicts.push("Primary sources disagree.");
  const blocked = validateMaintenanceProposal(oneModel);
  assert.equal(blocked.valid, false);
  assert.equal(blocked.publishable, false);
  assert.match(blocked.errors.join("\n"), /three distinct model deployments/);
  assert.match(blocked.errors.join("\n"), /different provider families/);
});

test("Foundry role profiles qualify inventory-backed primaries and fallbacks", () => {
  const inventory = [
    "foundry-research-primary",
    "foundry-research-fallback",
    "foundry-writer-primary",
    "foundry-writer-fallback",
    "foundry-verifier-primary",
    "foundry-verifier-fallback",
  ];
  assert.deepEqual(validateFoundryRoleProfile(validRoleProfile, inventory), {
    valid: true,
    errors: [],
  });

  const unqualified = structuredClone(validRoleProfile);
  unqualified.stages[1].qualification.score = 0.4;
  unqualified.stages[2].providerFamily = unqualified.stages[1].providerFamily;
  const result = validateFoundryRoleProfile(unqualified, inventory.slice(0, 3));
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /did not meet its threshold/);
  assert.match(result.errors.join("\n"), /different provider families/);
  assert.match(result.errors.join("\n"), /absent from the Foundry inventory/);
});
