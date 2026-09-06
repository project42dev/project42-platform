import {
  restorePortableLearnerRecord,
  type Catalog,
  type LearnerProgress,
} from "@project42/platform";

export const deviceLocalProgressKey = "project42.progress.v1";
export const deviceLocalProgressQuarantineKey =
  "project42.progress.quarantine.v1";

export interface DeviceLocalProgressRecovery {
  schemaVersion: 1;
  sourceKey: typeof deviceLocalProgressKey;
  capturedAt: string;
  rawRecord: string;
  errors: string[];
}

export interface DeviceLocalProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type DeviceLocalProgressReadResult =
  | { status: "missing" }
  | { status: "valid"; progress: LearnerProgress }
  | {
      status: "quarantined";
      recovery: DeviceLocalProgressRecovery;
      quarantineStored: boolean;
    };

export function validateDeviceLocalProgressValue(
  value: unknown,
  catalog: Catalog,
): { valid: true; progress: LearnerProgress } | { valid: false; errors: string[] } {
  if (
    value &&
    typeof value === "object" &&
    "schemaVersion" in value &&
    value.schemaVersion !== 1
  ) {
    const version =
      typeof value.schemaVersion === "number" ||
      typeof value.schemaVersion === "string"
        ? ` ${String(value.schemaVersion)}`
        : "";
    return {
      valid: false,
      errors: [
        `This browser record uses unsupported progress schema version${version}.`,
      ],
    };
  }

  const restored = restorePortableLearnerRecord(
    {
      format: "project42/learner-record",
      formatVersion: "1.0",
      exportedAt: new Date(0).toISOString(),
      catalogVersion: catalog.contentVersion,
      learner: value,
      transcript: [],
    },
    catalog,
  );
  if (!restored.valid) {
    return {
      valid: false,
      errors: restored.errors.map((error) => `${error}.`),
    };
  }

  const moduleIds = new Set(catalog.modules.map((module) => module.id));
  const badgeIds = new Set(catalog.paths.map((path) => path.badge.id));
  const badgeErrors = restored.progress.badges.flatMap((badge) => {
    const errors: string[] = [];
    if (!badgeIds.has(badge.id)) {
      errors.push(`Badge ${badge.id} is not present in the current catalog.`);
    }
    for (const moduleId of badge.evidenceModuleIds) {
      if (!moduleIds.has(moduleId)) {
        errors.push(
          `Badge ${badge.id} references unknown evidence module ${moduleId}.`,
        );
      }
    }
    return errors;
  });
  if (badgeErrors.length > 0) {
    return { valid: false, errors: badgeErrors };
  }
  return { valid: true, progress: restored.progress };
}

function quarantine(
  storage: DeviceLocalProgressStorage,
  rawRecord: string,
  errors: string[],
  capturedAt: string,
): Extract<DeviceLocalProgressReadResult, { status: "quarantined" }> {
  const recovery: DeviceLocalProgressRecovery = {
    schemaVersion: 1,
    sourceKey: deviceLocalProgressKey,
    capturedAt,
    rawRecord,
    errors,
  };
  let quarantineStored = false;
  try {
    storage.setItem(
      deviceLocalProgressQuarantineKey,
      JSON.stringify(recovery),
    );
    quarantineStored = true;
  } catch {
    // The source key remains untouched, so the original record is still recoverable.
  }
  return { status: "quarantined", recovery, quarantineStored };
}

export function readDeviceLocalProgress(
  storage: DeviceLocalProgressStorage,
  catalog: Catalog,
  capturedAt = new Date().toISOString(),
): DeviceLocalProgressReadResult {
  const rawRecord = storage.getItem(deviceLocalProgressKey);
  if (rawRecord === null) return { status: "missing" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawRecord);
  } catch {
    return quarantine(
      storage,
      rawRecord,
      ["The stored browser record is not valid JSON."],
      capturedAt,
    );
  }

  const validation = validateDeviceLocalProgressValue(parsed, catalog);
  if (!validation.valid) {
    return quarantine(
      storage,
      rawRecord,
      validation.errors,
      capturedAt,
    );
  }
  return { status: "valid", progress: validation.progress };
}
