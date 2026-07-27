import type { Catalog, ValidationResult } from "./schema.js";

export const CONTENT_MAINTENANCE_SCHEMA_VERSION = "1.0" as const;

export const MAINTENANCE_MODEL_STAGES = [
  "evidence-research",
  "curriculum-writing",
  "factual-verification",
  "assessment-review",
  "accessibility-review",
  "release-proposal",
] as const;

export type MaintenanceModelStage = (typeof MAINTENANCE_MODEL_STAGES)[number];

export interface PrimarySourceRegistration {
  id: string;
  urlPrefix: string;
  publisher: string;
  trustTier: "primary";
  reviewCadenceDays: number;
  owner: string;
}

export interface PrimarySourceRegistry {
  schemaVersion: "1.0";
  sources: PrimarySourceRegistration[];
}

export interface SourceObservation {
  id: string;
  sourceId: string;
  canonicalUrl: string;
  retrievedAt: string;
  previousHash: string;
  currentHash: string;
  changed: boolean;
  boundedDiff: Array<{
    section: string;
    before: string;
    after: string;
  }>;
}

export interface ClaimEvidence {
  observationId: string;
  excerpt: string;
  relation: "supports" | "contradicts";
}

export interface MaintenanceClaim {
  id: string;
  statement: string;
  volatility: "stable" | "volatile";
  verificationState: "supported" | "contradicted" | "ambiguous" | "missing";
  evidence: ClaimEvidence[];
  affectedContentIds: string[];
  affectedAssessmentIds: string[];
}

export interface ContentImpactAnalysis {
  learnModuleIds: string[];
  fieldGuideResourceIds: string[];
  assessmentQuestionIds: string[];
  instructorPackageModuleIds: string[];
}

export interface ContentChangePacket {
  schemaVersion: typeof CONTENT_MAINTENANCE_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  observations: SourceObservation[];
  claims: MaintenanceClaim[];
  impact: ContentImpactAnalysis;
  disposition: "no-change" | "ready-for-draft" | "blocked";
}

export interface ModelStageExecution {
  stage: MaintenanceModelStage;
  deploymentAlias: string;
  providerFamily: string;
  modelVersion: string;
  contractVersion: string;
  temperature: number;
  maxOutputTokens: number;
  inputEvidenceDigest: string;
  outputDigest: string;
  latencyMs: number;
  costUsd: number | null;
  status: "passed" | "failed" | "human-review";
  findings: string[];
}

export interface DeterministicGateResult {
  id: string;
  status: "passed" | "failed";
  evidenceRef: string;
}

export interface MaintenanceProposal {
  schemaVersion: typeof CONTENT_MAINTENANCE_SCHEMA_VERSION;
  id: string;
  packetId: string;
  packetDigest: string;
  targets: Array<{
    repository: string;
    pathPrefixes: string[];
  }>;
  modelStages: ModelStageExecution[];
  deterministicGates: DeterministicGateResult[];
  unresolvedConflicts: string[];
  rollbackPlan: string;
  humanDecision: {
    status: "pending" | "approved" | "rejected" | "changes-requested";
    reviewerRef: string | null;
    decidedAt: string | null;
    note: string | null;
  };
}

export interface MaintenanceProposalValidation extends ValidationResult {
  publishable: boolean;
}

export interface FoundryRoleProfile {
  schemaVersion: typeof CONTENT_MAINTENANCE_SCHEMA_VERSION;
  id: string;
  effectiveAt: string;
  stages: Array<{
    stage: MaintenanceModelStage;
    primaryDeploymentAlias: string;
    providerFamily: string;
    modelVersion: string;
    fallbackDeploymentAliases: string[];
    qualification: {
      benchmarkId: string;
      evaluatedAt: string;
      score: number;
      threshold: number;
    };
  }>;
}

const digestPattern = /^[a-f0-9]{64}$/;
const stableIdPattern = /^[a-z0-9][a-z0-9._-]{2,127}$/;

export function buildContentImpactAnalysis(
  sourceId: string,
  canonicalUrl: string,
  catalog: Catalog,
  registry: PrimarySourceRegistry,
): ContentImpactAnalysis {
  const registration = registry.sources.find((source) => source.id === sourceId);
  if (!registration) throw new Error(`Unknown source registration: ${sourceId}`);
  const normalizedObservedUrl = normalizeUrl(canonicalUrl);
  if (!urlIsWithinPrefix(canonicalUrl, registration.urlPrefix)) {
    throw new Error(
      `Observed URL is outside the registered prefix for ${sourceId}.`,
    );
  }

  const learnModules = catalog.modules.filter((module) =>
    moduleSourceUrls(module).some(
      (sourceUrl) => normalizeUrl(sourceUrl) === normalizedObservedUrl,
    ),
  );
  const fieldGuideResources = catalog.resources.filter((resource) =>
    resource.sources.some(
      (source) => normalizeUrl(source.url) === normalizedObservedUrl,
    ),
  );

  return {
    learnModuleIds: sortedUnique(learnModules.map((module) => module.id)),
    fieldGuideResourceIds: sortedUnique(
      fieldGuideResources.map((resource) => resource.id),
    ),
    assessmentQuestionIds: sortedUnique(
      learnModules.flatMap((module) =>
        module.knowledgeCheck.questions.map((question) => question.id),
      ),
    ),
    instructorPackageModuleIds: sortedUnique(
      learnModules
        .filter((module) => module.instructorScript)
        .map((module) => module.id),
    ),
  };
}

export function validateContentChangePacket(
  packet: ContentChangePacket,
  catalog: Catalog,
  registry: PrimarySourceRegistry,
): ValidationResult {
  const errors: string[] = [];
  if (packet.schemaVersion !== CONTENT_MAINTENANCE_SCHEMA_VERSION) {
    errors.push("unsupported content-change packet schema version");
  }
  validateStableId(packet.id, "packet ID", errors);
  validateTimestamp(packet.createdAt, "packet createdAt", errors);
  if (packet.observations.length === 0) {
    errors.push("at least one source observation is required");
  }

  const observationIds = new Set<string>();
  let anyChanged = false;
  let expectedImpact = emptyImpact();
  for (const observation of packet.observations) {
    validateStableId(observation.id, "observation ID", errors);
    if (observationIds.has(observation.id)) {
      errors.push(`duplicate observation ID: ${observation.id}`);
    }
    observationIds.add(observation.id);
    validateTimestamp(
      observation.retrievedAt,
      `${observation.id} retrievedAt`,
      errors,
    );
    if (!digestPattern.test(observation.previousHash)) {
      errors.push(`${observation.id} previousHash must be a lowercase SHA-256 digest`);
    }
    if (!digestPattern.test(observation.currentHash)) {
      errors.push(`${observation.id} currentHash must be a lowercase SHA-256 digest`);
    }
    const hashesChanged = observation.previousHash !== observation.currentHash;
    if (observation.changed !== hashesChanged) {
      errors.push(`${observation.id} changed must match the observed hashes`);
    }
    if (observation.changed && observation.boundedDiff.length === 0) {
      errors.push(`${observation.id} changed observations require a bounded diff`);
    }
    for (const diff of observation.boundedDiff) {
      if (!diff.section.trim()) errors.push(`${observation.id} diff section is required`);
      if (diff.before.length > 2_000 || diff.after.length > 2_000) {
        errors.push(`${observation.id} diff excerpts must not exceed 2,000 characters`);
      }
    }
    try {
      expectedImpact = mergeImpact(
        expectedImpact,
        buildContentImpactAnalysis(
          observation.sourceId,
          observation.canonicalUrl,
          catalog,
          registry,
        ),
      );
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "invalid source observation");
    }
    anyChanged ||= observation.changed;
  }

  if (!sameImpact(packet.impact, expectedImpact)) {
    errors.push("impact analysis does not match canonical Learn and Field Guide consumers");
  }
  const affectedContent = new Set([
    ...packet.impact.learnModuleIds,
    ...packet.impact.fieldGuideResourceIds,
  ]);
  const affectedAssessments = new Set(packet.impact.assessmentQuestionIds);
  let blockingClaim = false;
  for (const claim of packet.claims) {
    validateStableId(claim.id, "claim ID", errors);
    if (!claim.statement.trim()) errors.push(`${claim.id} statement is required`);
    if (
      claim.volatility === "volatile" &&
      (claim.verificationState !== "supported" || claim.evidence.length === 0)
    ) {
      blockingClaim = true;
    }
    if (claim.verificationState !== "supported") blockingClaim = true;
    for (const evidence of claim.evidence) {
      if (!observationIds.has(evidence.observationId)) {
        errors.push(`${claim.id} references an unknown observation`);
      }
      if (!evidence.excerpt.trim() || evidence.excerpt.length > 1_000) {
        errors.push(`${claim.id} evidence excerpts must contain 1–1,000 characters`);
      }
    }
    for (const contentId of claim.affectedContentIds) {
      if (!affectedContent.has(contentId)) {
        errors.push(`${claim.id} references content outside the impact analysis`);
      }
    }
    for (const assessmentId of claim.affectedAssessmentIds) {
      if (!affectedAssessments.has(assessmentId)) {
        errors.push(`${claim.id} references an assessment outside the impact analysis`);
      }
    }
  }

  if (!anyChanged && packet.disposition !== "no-change") {
    errors.push("unchanged observations must use the no-change disposition");
  }
  if (anyChanged && packet.disposition === "no-change") {
    errors.push("changed observations cannot use the no-change disposition");
  }
  if (blockingClaim && packet.disposition !== "blocked") {
    errors.push("unsupported, ambiguous, missing, or contradicted claims must block");
  }
  if (
    anyChanged &&
    !blockingClaim &&
    packet.disposition !== "ready-for-draft"
  ) {
    errors.push("fully supported changed evidence must be ready-for-draft");
  }

  return { valid: errors.length === 0, errors };
}

export function validateMaintenanceProposal(
  proposal: MaintenanceProposal,
): MaintenanceProposalValidation {
  const errors: string[] = [];
  if (proposal.schemaVersion !== CONTENT_MAINTENANCE_SCHEMA_VERSION) {
    errors.push("unsupported maintenance proposal schema version");
  }
  validateStableId(proposal.id, "proposal ID", errors);
  validateStableId(proposal.packetId, "packet ID", errors);
  if (!digestPattern.test(proposal.packetDigest)) {
    errors.push("packetDigest must be a lowercase SHA-256 digest");
  }
  if (proposal.targets.length === 0) errors.push("at least one target is required");
  for (const target of proposal.targets) {
    if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(target.repository)) {
      errors.push(`invalid target repository: ${target.repository}`);
    }
    if (target.pathPrefixes.length === 0) {
      errors.push(`${target.repository} requires at least one allowed path prefix`);
    }
    for (const prefix of target.pathPrefixes) {
      if (
        !prefix ||
        prefix.startsWith("/") ||
        prefix.includes("..") ||
        prefix.includes("*") ||
        prefix.includes("\\")
      ) {
        errors.push(`${target.repository} contains an unsafe path prefix`);
      }
    }
  }

  const executionsByStage = new Map<MaintenanceModelStage, ModelStageExecution>();
  for (const execution of proposal.modelStages) {
    if (executionsByStage.has(execution.stage)) {
      errors.push(`duplicate model stage: ${execution.stage}`);
    }
    executionsByStage.set(execution.stage, execution);
    validateStableId(execution.deploymentAlias, "deployment alias", errors);
    if (!execution.providerFamily.trim()) {
      errors.push(`${execution.stage} provider family is required`);
    }
    if (!execution.modelVersion.trim() || !execution.contractVersion.trim()) {
      errors.push(`${execution.stage} model and contract versions are required`);
    }
    if (
      execution.temperature < 0 ||
      execution.temperature > 2 ||
      execution.maxOutputTokens < 1
    ) {
      errors.push(`${execution.stage} parameters are outside the allowed range`);
    }
    if (
      !digestPattern.test(execution.inputEvidenceDigest) ||
      !digestPattern.test(execution.outputDigest)
    ) {
      errors.push(`${execution.stage} requires input and output SHA-256 digests`);
    }
    if (
      execution.latencyMs < 0 ||
      (execution.costUsd !== null && execution.costUsd < 0)
    ) {
      errors.push(`${execution.stage} latency and cost cannot be negative`);
    }
  }
  for (const stage of MAINTENANCE_MODEL_STAGES) {
    if (!executionsByStage.has(stage)) errors.push(`missing model stage: ${stage}`);
  }
  if (
    new Set(proposal.modelStages.map((stage) => stage.deploymentAlias)).size < 3
  ) {
    errors.push("at least three distinct model deployments are required");
  }
  const researcher = executionsByStage.get("evidence-research");
  const writer = executionsByStage.get("curriculum-writing");
  const verifier = executionsByStage.get("factual-verification");
  if (researcher && writer && researcher.deploymentAlias === writer.deploymentAlias) {
    errors.push("researcher and writer must use distinct deployments");
  }
  if (
    writer &&
    verifier &&
    writer.providerFamily.trim().toLowerCase() ===
      verifier.providerFamily.trim().toLowerCase()
  ) {
    errors.push("writer and factual verifier must use different provider families");
  }
  if (proposal.deterministicGates.length === 0) {
    errors.push("at least one deterministic gate is required");
  }
  for (const gate of proposal.deterministicGates) {
    validateStableId(gate.id, "gate ID", errors);
    if (!gate.evidenceRef.trim()) errors.push(`${gate.id} evidenceRef is required`);
  }
  if (!proposal.rollbackPlan.trim()) errors.push("rollbackPlan is required");
  if (proposal.humanDecision.status === "approved") {
    if (!proposal.humanDecision.reviewerRef) {
      errors.push("an approved proposal requires a human reviewer reference");
    }
    if (!proposal.humanDecision.decidedAt) {
      errors.push("an approved proposal requires a decision timestamp");
    } else {
      validateTimestamp(
        proposal.humanDecision.decidedAt,
        "human decision timestamp",
        errors,
      );
    }
  }

  const publishable =
    errors.length === 0 &&
    proposal.humanDecision.status === "approved" &&
    proposal.unresolvedConflicts.length === 0 &&
    proposal.modelStages.every((stage) => stage.status === "passed") &&
    proposal.deterministicGates.every((gate) => gate.status === "passed");
  return { valid: errors.length === 0, errors, publishable };
}

export function validateFoundryRoleProfile(
  profile: FoundryRoleProfile,
  deployedAliases: readonly string[] = [],
): ValidationResult {
  const errors: string[] = [];
  if (profile.schemaVersion !== CONTENT_MAINTENANCE_SCHEMA_VERSION) {
    errors.push("unsupported Foundry role-profile schema version");
  }
  validateStableId(profile.id, "role-profile ID", errors);
  validateTimestamp(profile.effectiveAt, "role-profile effectiveAt", errors);
  const deployed = new Set(deployedAliases);
  const stages = new Map<MaintenanceModelStage, FoundryRoleProfile["stages"][number]>();
  for (const profileStage of profile.stages) {
    if (stages.has(profileStage.stage)) {
      errors.push(`duplicate role-profile stage: ${profileStage.stage}`);
    }
    stages.set(profileStage.stage, profileStage);
    validateStableId(
      profileStage.primaryDeploymentAlias,
      `${profileStage.stage} primary deployment alias`,
      errors,
    );
    if (deployed.size > 0 && !deployed.has(profileStage.primaryDeploymentAlias)) {
      errors.push(
        `${profileStage.stage} primary deployment is absent from the Foundry inventory`,
      );
    }
    if (!profileStage.providerFamily.trim() || !profileStage.modelVersion.trim()) {
      errors.push(`${profileStage.stage} provider family and model version are required`);
    }
    if (
      profileStage.qualification.score < 0 ||
      profileStage.qualification.score > 1 ||
      profileStage.qualification.threshold < 0 ||
      profileStage.qualification.threshold > 1
    ) {
      errors.push(`${profileStage.stage} qualification scores must be between 0 and 1`);
    }
    if (profileStage.qualification.score < profileStage.qualification.threshold) {
      errors.push(`${profileStage.stage} primary deployment did not meet its threshold`);
    }
    validateStableId(
      profileStage.qualification.benchmarkId,
      `${profileStage.stage} benchmark ID`,
      errors,
    );
    validateTimestamp(
      profileStage.qualification.evaluatedAt,
      `${profileStage.stage} qualification timestamp`,
      errors,
    );
    for (const fallback of profileStage.fallbackDeploymentAliases) {
      validateStableId(fallback, `${profileStage.stage} fallback alias`, errors);
      if (fallback === profileStage.primaryDeploymentAlias) {
        errors.push(`${profileStage.stage} fallback cannot repeat its primary deployment`);
      }
      if (deployed.size > 0 && !deployed.has(fallback)) {
        errors.push(`${profileStage.stage} fallback is absent from the Foundry inventory`);
      }
    }
  }
  for (const stage of MAINTENANCE_MODEL_STAGES) {
    if (!stages.has(stage)) errors.push(`missing role-profile stage: ${stage}`);
  }
  if (
    new Set(profile.stages.map((stage) => stage.primaryDeploymentAlias)).size < 3
  ) {
    errors.push("role profile requires at least three distinct primary deployments");
  }
  const researcher = stages.get("evidence-research");
  const writer = stages.get("curriculum-writing");
  const verifier = stages.get("factual-verification");
  if (
    researcher &&
    writer &&
    researcher.primaryDeploymentAlias === writer.primaryDeploymentAlias
  ) {
    errors.push("role-profile researcher and writer must use distinct deployments");
  }
  if (
    writer &&
    verifier &&
    writer.providerFamily.trim().toLowerCase() ===
      verifier.providerFamily.trim().toLowerCase()
  ) {
    errors.push(
      "role-profile writer and factual verifier must use different provider families",
    );
  }
  return { valid: errors.length === 0, errors };
}

function moduleSourceUrls(module: Catalog["modules"][number]): string[] {
  return [
    ...module.sources.map((source) => source.url),
    ...(module.comparisonMatrix?.dimensions.flatMap((dimension) =>
      Object.values(dimension.providers).flatMap((provider) => provider.sourceUrls),
    ) ?? []),
  ];
}

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function urlIsWithinPrefix(value: string, prefixValue: string): boolean {
  const valueUrl = new URL(value);
  const prefixUrl = new URL(prefixValue);
  if (valueUrl.protocol !== "https:" || valueUrl.origin !== prefixUrl.origin) {
    return false;
  }
  const prefixPath = prefixUrl.pathname.replace(/\/+$/, "");
  const valuePath = valueUrl.pathname.replace(/\/+$/, "");
  return valuePath === prefixPath || valuePath.startsWith(`${prefixPath}/`);
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function emptyImpact(): ContentImpactAnalysis {
  return {
    learnModuleIds: [],
    fieldGuideResourceIds: [],
    assessmentQuestionIds: [],
    instructorPackageModuleIds: [],
  };
}

function mergeImpact(
  left: ContentImpactAnalysis,
  right: ContentImpactAnalysis,
): ContentImpactAnalysis {
  return {
    learnModuleIds: sortedUnique([...left.learnModuleIds, ...right.learnModuleIds]),
    fieldGuideResourceIds: sortedUnique([
      ...left.fieldGuideResourceIds,
      ...right.fieldGuideResourceIds,
    ]),
    assessmentQuestionIds: sortedUnique([
      ...left.assessmentQuestionIds,
      ...right.assessmentQuestionIds,
    ]),
    instructorPackageModuleIds: sortedUnique([
      ...left.instructorPackageModuleIds,
      ...right.instructorPackageModuleIds,
    ]),
  };
}

function sameImpact(
  left: ContentImpactAnalysis,
  right: ContentImpactAnalysis,
): boolean {
  return (
    JSON.stringify({
      learnModuleIds: sortedUnique(left.learnModuleIds),
      fieldGuideResourceIds: sortedUnique(left.fieldGuideResourceIds),
      assessmentQuestionIds: sortedUnique(left.assessmentQuestionIds),
      instructorPackageModuleIds: sortedUnique(left.instructorPackageModuleIds),
    }) === JSON.stringify(right)
  );
}

function validateStableId(value: string, label: string, errors: string[]): void {
  if (!stableIdPattern.test(value)) errors.push(`${label} is invalid`);
}

function validateTimestamp(
  value: string,
  label: string,
  errors: string[],
): void {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) ||
    Number.isNaN(Date.parse(value))
  ) {
    errors.push(`${label} must be an ISO 8601 UTC timestamp`);
  }
}
