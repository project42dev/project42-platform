import assert from "node:assert/strict";
import test from "node:test";
import { createEmptyProgress, starterCatalog } from "@project42/platform";
import {
  deviceLocalProgressKey,
  deviceLocalProgressQuarantineKey,
  readDeviceLocalProgress,
} from "../app/lib/deviceLocalProgress.ts";

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

test("returns a fully validated compatible progress record", () => {
  const storage = new MemoryStorage();
  const progress = createEmptyProgress("Device learner");
  progress.startedPathIds = [starterCatalog.paths[0].id];
  storage.setItem(deviceLocalProgressKey, JSON.stringify(progress));

  const result = readDeviceLocalProgress(
    storage,
    starterCatalog,
    "2026-07-29T12:00:00.000Z",
  );

  assert.equal(result.status, "valid");
  assert.deepEqual(result.progress, progress);
  assert.equal(storage.getItem(deviceLocalProgressQuarantineKey), null);
});

test("quarantines a future schema without changing the source record", () => {
  const storage = new MemoryStorage();
  const rawRecord = JSON.stringify({
    ...createEmptyProgress(),
    schemaVersion: 2,
  });
  storage.setItem(deviceLocalProgressKey, rawRecord);

  const result = readDeviceLocalProgress(
    storage,
    starterCatalog,
    "2026-07-29T12:00:00.000Z",
  );

  assert.equal(result.status, "quarantined");
  assert.equal(result.quarantineStored, true);
  assert.equal(storage.getItem(deviceLocalProgressKey), rawRecord);
  assert.match(result.recovery.errors[0], /unsupported progress schema version 2/i);
  assert.deepEqual(
    Object.keys(
      JSON.parse(storage.getItem(deviceLocalProgressQuarantineKey) ?? "{}"),
    ).sort(),
    ["capturedAt", "errors", "rawRecord", "schemaVersion", "sourceKey"],
  );
});

test("quarantines malformed JSON and catalog-incompatible evidence losslessly", () => {
  for (const rawRecord of [
    '{"schemaVersion":1,',
    JSON.stringify({
      ...createEmptyProgress(),
      startedPathIds: ["path-that-is-not-in-this-catalog"],
    }),
    JSON.stringify({
      ...createEmptyProgress(),
      badges: [
        {
          id: "badge-that-is-not-in-this-catalog",
          name: "Unknown badge",
          description: "This badge cannot be reconciled automatically.",
          earnedAt: "2026-07-29T12:00:00.000Z",
          evidenceModuleIds: ["module-that-is-not-in-this-catalog"],
        },
      ],
    }),
  ]) {
    const storage = new MemoryStorage();
    storage.setItem(deviceLocalProgressKey, rawRecord);

    const result = readDeviceLocalProgress(
      storage,
      starterCatalog,
      "2026-07-29T12:00:00.000Z",
    );

    assert.equal(result.status, "quarantined");
    assert.equal(result.recovery.rawRecord, rawRecord);
    assert.equal(storage.getItem(deviceLocalProgressKey), rawRecord);
    assert.equal(
      JSON.parse(storage.getItem(deviceLocalProgressQuarantineKey) ?? "{}")
        .rawRecord,
      rawRecord,
    );
  }
});

test("leaves the source intact when quarantine storage is unavailable", () => {
  const rawRecord = '{"schemaVersion":1,';
  const storage = {
    getItem: (key) => (key === deviceLocalProgressKey ? rawRecord : null),
    setItem: () => {
      throw new Error("quota exceeded");
    },
  };

  const result = readDeviceLocalProgress(
    storage,
    starterCatalog,
    "2026-07-29T12:00:00.000Z",
  );

  assert.equal(result.status, "quarantined");
  assert.equal(result.quarantineStored, false);
  assert.equal(result.recovery.rawRecord, rawRecord);
});
