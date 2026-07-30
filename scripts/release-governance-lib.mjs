import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export const RELEASE_MANIFEST_SCHEMA_VERSION = 1;

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export const RELEASE_ROLES = Object.freeze([
  {
    role: "platform",
    file: (version) => `project42-platform-v${version}.tgz`,
    mediaType: "application/gzip",
    required: true,
  },
  {
    role: "content",
    file: (version) => `project42-content-v${version}.tar.gz`,
    mediaType: "application/gzip",
    required: true,
  },
  {
    role: "migrations",
    file: (version) => `project42-migrations-v${version}.tar.gz`,
    mediaType: "application/gzip",
    required: true,
  },
  {
    role: "compatibility",
    file: (version) => `project42-compatibility-v${version}.json`,
    mediaType: "application/json",
    required: true,
  },
  {
    role: "rehearsal-evidence",
    file: (version) => `project42-release-rehearsal-v${version}.json`,
    mediaType: "application/json",
    required: false,
  },
  {
    role: "oci-metadata",
    file: (version) => `project42-image-metadata-v${version}.json`,
    mediaType: "application/json",
    required: false,
  },
]);

export function assertSemver(version, label = "version") {
  if (typeof version !== "string" || !SEMVER_PATTERN.test(version)) {
    throw new Error(`${label} must be a valid semantic version`);
  }
  return version;
}

export function assertExactKeys(value, expected, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has unexpected fields: ${actual.join(", ")}`);
  }
}

export async function sha256File(filePath) {
  const source = await readFile(filePath);
  return createHash("sha256").update(source).digest("hex");
}

export async function describeArtifact(releaseDirectory, definition, version) {
  const file = definition.file(version);
  const filePath = join(releaseDirectory, file);
  const fileStat = await stat(filePath);
  if (!fileStat.isFile() || fileStat.size < 1) {
    throw new Error(`${file} must be a non-empty regular file`);
  }
  return {
    role: definition.role,
    file,
    mediaType: definition.mediaType,
    bytes: fileStat.size,
    sha256: await sha256File(filePath),
  };
}

export async function buildReleaseManifest({
  releaseDirectory,
  version,
  sourceCommit,
  sourceRepository = "project42dev/project42-platform",
}) {
  assertSemver(version);
  if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
    throw new Error("sourceCommit must be a full lowercase Git commit SHA");
  }
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(sourceRepository)) {
    throw new Error("sourceRepository must use owner/repository form");
  }

  const artifacts = [];
  for (const definition of RELEASE_ROLES) {
    try {
      artifacts.push(await describeArtifact(releaseDirectory, definition, version));
    } catch (error) {
      if (definition.required || error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  const compatibilityArtifact = artifacts.find(({ role }) => role === "compatibility");
  const compatibility = JSON.parse(
    await readFile(join(releaseDirectory, compatibilityArtifact.file), "utf8"),
  );
  if (compatibility.release !== version || compatibility.api?.version !== version) {
    throw new Error("compatibility metadata must match the release version");
  }

  return {
    schemaVersion: RELEASE_MANIFEST_SCHEMA_VERSION,
    release: {
      version,
      tag: `v${version}`,
      package: "@project42/platform",
      sourceRepository,
      sourceCommit,
    },
    artifacts: artifacts.sort((left, right) => left.file.localeCompare(right.file)),
    compatibility: {
      supportLevel: compatibility.supportLevel,
      migrationHead: compatibility.database?.migrationHead,
      signature: compatibility.update?.signature,
    },
    policy: {
      automaticApply: false,
      administratorApprovalRequired: true,
      rollbackRequired: true,
    },
  };
}

export function validateReleaseManifest(manifest, expectedVersion) {
  assertExactKeys(
    manifest,
    ["schemaVersion", "release", "artifacts", "compatibility", "policy"],
    "release manifest",
  );
  if (manifest.schemaVersion !== RELEASE_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`unsupported release manifest schema ${manifest.schemaVersion}`);
  }
  assertExactKeys(
    manifest.release,
    ["version", "tag", "package", "sourceRepository", "sourceCommit"],
    "release identity",
  );
  assertSemver(manifest.release.version, "release.version");
  if (expectedVersion && manifest.release.version !== expectedVersion) {
    throw new Error(`manifest version ${manifest.release.version} does not match ${expectedVersion}`);
  }
  if (
    manifest.release.tag !== `v${manifest.release.version}` ||
    manifest.release.package !== "@project42/platform" ||
    !/^[0-9a-f]{40}$/.test(manifest.release.sourceCommit)
  ) {
    throw new Error("release identity is not canonical");
  }
  if (!Array.isArray(manifest.artifacts)) {
    throw new Error("artifacts must be an array");
  }

  const expectedFiles = new Map(
    RELEASE_ROLES.map((definition) => [
      definition.file(manifest.release.version),
      definition,
    ]),
  );
  const seenRoles = new Set();
  const seenFiles = new Set();
  for (const artifact of manifest.artifacts) {
    assertExactKeys(artifact, ["role", "file", "mediaType", "bytes", "sha256"], "artifact");
    const definition = expectedFiles.get(artifact.file);
    if (!definition || definition.role !== artifact.role || definition.mediaType !== artifact.mediaType) {
      throw new Error(`unexpected release artifact ${artifact.file}`);
    }
    if (
      seenRoles.has(artifact.role) ||
      seenFiles.has(artifact.file) ||
      !Number.isSafeInteger(artifact.bytes) ||
      artifact.bytes < 1 ||
      !SHA256_PATTERN.test(artifact.sha256)
    ) {
      throw new Error(`invalid or duplicate release artifact ${artifact.file}`);
    }
    seenRoles.add(artifact.role);
    seenFiles.add(artifact.file);
  }
  for (const definition of RELEASE_ROLES.filter(({ required }) => required)) {
    if (!seenRoles.has(definition.role)) {
      throw new Error(`required ${definition.role} artifact is missing`);
    }
  }
  const sorted = [...manifest.artifacts].sort((left, right) =>
    left.file.localeCompare(right.file),
  );
  if (JSON.stringify(sorted) !== JSON.stringify(manifest.artifacts)) {
    throw new Error("release artifacts must be sorted by file name");
  }

  assertExactKeys(
    manifest.compatibility,
    ["supportLevel", "migrationHead", "signature"],
    "compatibility summary",
  );
  if (
    typeof manifest.compatibility.supportLevel !== "string" ||
    !/\.sql$/.test(manifest.compatibility.migrationHead) ||
    manifest.compatibility.signature !== "sigstore-keyless"
  ) {
    throw new Error("compatibility summary is incomplete");
  }
  assertExactKeys(
    manifest.policy,
    ["automaticApply", "administratorApprovalRequired", "rollbackRequired"],
    "release policy",
  );
  if (
    manifest.policy.automaticApply !== false ||
    manifest.policy.administratorApprovalRequired !== true ||
    manifest.policy.rollbackRequired !== true
  ) {
    throw new Error("release policy must require explicit, rollback-capable administration");
  }
  return manifest;
}

export async function validateReleaseDirectory(releaseDirectory, expectedVersion) {
  assertSemver(expectedVersion);
  const manifestName = `project42-release-manifest-v${expectedVersion}.json`;
  const manifestPath = join(releaseDirectory, manifestName);
  const manifest = validateReleaseManifest(
    JSON.parse(await readFile(manifestPath, "utf8")),
    expectedVersion,
  );
  for (const artifact of manifest.artifacts) {
    const filePath = join(releaseDirectory, artifact.file);
    const fileStat = await stat(filePath);
    if (fileStat.size !== artifact.bytes || (await sha256File(filePath)) !== artifact.sha256) {
      throw new Error(`artifact integrity check failed for ${artifact.file}`);
    }
  }

  const checksumsPath = join(releaseDirectory, "SHA256SUMS");
  const checksumLines = (await readFile(checksumsPath, "utf8"))
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  const expectedChecksumFiles = [...manifest.artifacts.map(({ file }) => file), manifestName].sort();
  if (checksumLines.length !== expectedChecksumFiles.length) {
    throw new Error("SHA256SUMS must cover every manifested artifact and the manifest");
  }
  for (const [index, file] of expectedChecksumFiles.entries()) {
    const expectedHash = await sha256File(join(releaseDirectory, file));
    if (checksumLines[index] !== `${expectedHash}  ${file}`) {
      throw new Error(`SHA256SUMS entry is not canonical for ${file}`);
    }
  }
  return manifest;
}
