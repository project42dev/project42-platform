import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function canonicalFileSha256(path) {
  const content = await readFile(path, "utf8");
  return sha256(content.replaceAll("\r\n", "\n"));
}

export async function calculateComponentDigest(component) {
  const artifacts = [];
  const seenPaths = new Set();

  for (const artifact of component.artifacts) {
    if (
      artifact.path.startsWith("/") ||
      artifact.path.includes("\\") ||
      artifact.path.split("/").includes("..")
    ) {
      throw new Error(`Unsafe release artifact path: ${artifact.path}`);
    }
    if (seenPaths.has(artifact.path)) {
      throw new Error(`Duplicate release artifact path: ${artifact.path}`);
    }
    seenPaths.add(artifact.path);
    artifacts.push({
      path: artifact.path,
      sha256: await canonicalFileSha256(artifact.path),
    });
  }

  artifacts.sort((left, right) => left.path.localeCompare(right.path));
  const aggregate = [
    component.id,
    component.version,
    ...artifacts.flatMap((artifact) => [artifact.path, artifact.sha256]),
  ].join("\n");

  return {
    artifacts,
    digest: sha256(`${aggregate}\n`),
  };
}

export function manifestComponents(manifest) {
  return [
    manifest.components.application,
    manifest.components.schemas,
    manifest.components.content,
    manifest.components.trainingPackage,
    ...manifest.components.adapters,
  ];
}

export async function refreshComponentDigests(manifest) {
  for (const component of manifestComponents(manifest)) {
    const calculated = await calculateComponentDigest(component);
    component.artifacts = calculated.artifacts;
    component.digest.value = calculated.digest;
  }

  const migrationByPath = new Map(
    manifest.components.adapters
      .flatMap((adapter) => adapter.artifacts)
      .map((artifact) => [artifact.path, artifact.sha256]),
  );
  for (const migration of manifest.compatibility.requiredMigrations) {
    const digest = migrationByPath.get(migration.path);
    if (!digest) {
      throw new Error(
        `Required migration is missing from adapter artifacts: ${migration.path}`,
      );
    }
    migration.sha256 = digest;
  }

  return manifest;
}
