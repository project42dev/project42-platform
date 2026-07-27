export interface ReleaseArtifactEvidence {
  id: string;
  present: boolean;
  expectedSha256: string;
  observedSha256: string;
}

export interface ReleaseCandidateEvidence {
  schemaVersion: 1;
  release: string;
  observedAt: string;
  artifacts: ReleaseArtifactEvidence[];
  compatibility: {
    accepted: boolean;
    requiredMigrations: string[];
  };
  signature: {
    present: boolean;
    verified: boolean;
    certificateIdentity: string;
    oidcIssuer: string;
    validFrom: string;
    validUntil: string;
    integratedAt: string;
    transparencyLog: string;
  };
  provenance: {
    present: boolean;
    verified: boolean;
    sourceRepository: string;
    sourceDigest: string;
    sourceRef: string;
    runnerEnvironment: string;
  };
  releaseStatus: {
    state: "active" | "revoked";
  };
}

export interface ReleaseCompatibilityManifest {
  release: string;
  components: {
    application: ReleaseComponentIdentity;
    schemas: ReleaseComponentIdentity;
    content: ReleaseComponentIdentity;
    trainingPackage: ReleaseComponentIdentity;
    adapters: ReleaseComponentIdentity[];
  };
  compatibility: {
    requiredMigrations: Array<{ id: string }>;
  };
  integrityPolicy: {
    certificateIdentity: string;
    certificateOidcIssuer: string;
    trustedTransparencyLog: string;
    allowedRunnerEnvironment: string;
  };
  releaseStatus: {
    state: "active" | "revoked";
  };
}

interface ReleaseComponentIdentity {
  id: string;
  digest: {
    value: string;
  };
}

export interface ReleaseCandidateValidation {
  valid: boolean;
  errors: string[];
}

function expectedComponents(
  manifest: ReleaseCompatibilityManifest,
): ReleaseComponentIdentity[] {
  return [
    manifest.components.application,
    manifest.components.schemas,
    manifest.components.content,
    manifest.components.trainingPackage,
    ...manifest.components.adapters,
  ];
}

function validTimestamp(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export function validateReleaseCandidate(
  evidence: ReleaseCandidateEvidence,
  manifest: ReleaseCompatibilityManifest,
): ReleaseCandidateValidation {
  const errors: string[] = [];
  const observedAt = validTimestamp(evidence.observedAt);

  if (evidence.schemaVersion !== 1) errors.push("unsupported_schema");
  if (evidence.release !== manifest.release) errors.push("release_mismatch");
  if (observedAt === undefined) errors.push("invalid_observation_time");

  const evidenceById = new Map<string, ReleaseArtifactEvidence>();
  for (const artifact of evidence.artifacts) {
    if (evidenceById.has(artifact.id)) {
      errors.push(`duplicate_artifact:${artifact.id}`);
    }
    evidenceById.set(artifact.id, artifact);
  }
  for (const component of expectedComponents(manifest)) {
    const artifact = evidenceById.get(component.id);
    if (!artifact?.present) {
      errors.push(`missing_artifact:${component.id}`);
      continue;
    }
    if (
      artifact.expectedSha256 !== component.digest.value ||
      artifact.observedSha256 !== component.digest.value
    ) {
      errors.push(`altered_artifact:${component.id}`);
    }
  }

  if (!evidence.compatibility.accepted) errors.push("incompatible_release");
  const appliedMigrations = new Set(evidence.compatibility.requiredMigrations);
  for (const migration of manifest.compatibility.requiredMigrations) {
    if (!appliedMigrations.has(migration.id)) {
      errors.push(`missing_migration:${migration.id}`);
    }
  }

  if (!evidence.signature.present) errors.push("unsigned_release");
  if (!evidence.signature.verified) errors.push("unverified_signature");
  if (
    evidence.signature.certificateIdentity !==
    manifest.integrityPolicy.certificateIdentity
  ) {
    errors.push("untrusted_certificate_identity");
  }
  if (
    evidence.signature.oidcIssuer !==
    manifest.integrityPolicy.certificateOidcIssuer
  ) {
    errors.push("untrusted_oidc_issuer");
  }
  if (
    evidence.signature.transparencyLog !==
    manifest.integrityPolicy.trustedTransparencyLog
  ) {
    errors.push("untrusted_transparency_log");
  }
  const validFrom = validTimestamp(evidence.signature.validFrom);
  const validUntil = validTimestamp(evidence.signature.validUntil);
  const integratedAt = validTimestamp(evidence.signature.integratedAt);
  if (
    validFrom === undefined ||
    validUntil === undefined ||
    integratedAt === undefined ||
    integratedAt < validFrom ||
    integratedAt > validUntil
  ) {
    errors.push("expired_or_not_yet_valid_signature");
  }
  if (
    observedAt !== undefined &&
    integratedAt !== undefined &&
    integratedAt > observedAt
  ) {
    errors.push("future_transparency_timestamp");
  }

  if (!evidence.provenance.present) errors.push("missing_provenance");
  if (!evidence.provenance.verified) errors.push("unverified_provenance");
  if (
    evidence.provenance.sourceRepository !==
    "https://github.com/project42dev/project42-platform"
  ) {
    errors.push("untrusted_source_repository");
  }
  if (!/^[a-f0-9]{40}$/.test(evidence.provenance.sourceDigest)) {
    errors.push("invalid_source_digest");
  }
  if (
    evidence.provenance.sourceRef !== `refs/tags/v${manifest.release}`
  ) {
    errors.push("untrusted_source_ref");
  }
  if (
    evidence.provenance.runnerEnvironment !==
    manifest.integrityPolicy.allowedRunnerEnvironment
  ) {
    errors.push("untrusted_runner_environment");
  }

  if (
    manifest.releaseStatus.state !== "active" ||
    evidence.releaseStatus.state !== "active"
  ) {
    errors.push("revoked_release");
  }

  return {
    valid: errors.length === 0,
    errors: [...new Set(errors)].sort(),
  };
}
