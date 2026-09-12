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
  /** Optional: only the signed-in hand-off clears the key, and only if it can. */
  removeItem?(key: string): void;
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

/**
 * WHAT THIS WRITES, AND THE POLICY IT IS KEPT INSIDE.
 *
 * docs/learner-data-policy.md governs the ACCOUNT record: identity, consent
 * purposes, retention classes, export and verified deletion. It is silent on
 * browser storage, because until now the front end kept none -- `ProgressProvider`
 * hydrated from empty and read nothing back. This writer is the first thing to
 * put a learner's progress on their own device, so it is deliberately scoped to
 * stay clear of every invariant that policy does declare:
 *
 * - SIGNED-OUT ONLY. The caller never writes while an approved account is
 *   connected. A signed-in learner's record is the account's, it already
 *   carries `recentModule` through `recordModuleVisit`, and copying it to the
 *   device would leave scores, badges and a display name sitting in a shared
 *   browser after the session expired -- outside the retention classes and
 *   outside the verified-deletion workflow the policy requires. Nothing here
 *   is a second copy of an account record.
 * - NO IDENTITY. A signed-out record has no issuer, subject, or email. The
 *   policy's hard rule is that email is never an identity or merge key; this
 *   key holds neither, so a device record can never become one.
 * - NOTHING UNTIL THERE IS SOMETHING. The caller writes only when
 *   `hasLearningEvidence` is true, so a visitor who reads the home page and
 *   leaves has nothing stored under this key at all. A first visit that stores
 *   nothing is what makes this proportionate rather than a tracking decision.
 * - SAME SHAPE, SAME VALIDATOR. It is `LearnerProgress` under the existing
 *   `project42.progress.v1` key, so `readDeviceLocalProgress` validates it on
 *   the way back in and quarantines anything it cannot vouch for. No second
 *   store, no second schema.
 *
 * OWNER DECISION STILL OPEN: this stores a signed-out learner's knowledge-check
 * attempts and completions, not only their place, because that is the record
 * `mergeLearnerProgress` is built to carry and narrowing it would mean a second
 * shape. Storing visits only is a supportable alternative. Either way the
 * learner-data page should say the key exists. See the report.
 *
 * Returns false when the browser refused the write -- Safari private mode
 * throws on setItem, and a full quota throws too. A refused write is not an
 * error the learner needs to see: their place is still correct in memory for
 * this tab, it simply will not survive the reload.
 */
export function writeDeviceLocalProgress(
  storage: DeviceLocalProgressStorage,
  progress: LearnerProgress,
): boolean {
  try {
    storage.setItem(deviceLocalProgressKey, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

/**
 * Drop the signed-out record once an account has taken over as the source of
 * truth, so the device stops holding a copy the learner cannot see or delete
 * from their profile. Best-effort for the same reasons as the write.
 */
export function clearDeviceLocalProgress(
  storage: DeviceLocalProgressStorage,
): boolean {
  try {
    storage.removeItem?.(deviceLocalProgressKey);
    return true;
  } catch {
    return false;
  }
}
