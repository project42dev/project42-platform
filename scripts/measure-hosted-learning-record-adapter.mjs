import { performance } from "node:perf_hooks";
import { readFile, readdir } from "node:fs/promises";
import { Miniflare } from "miniflare";
import {
  HOSTED_LEARNING_RECORD_OPERATING_THRESHOLDS,
  LearningEventEngine,
  SqlLearningEventStore,
} from "../dist/index.js";

const thresholds = HOSTED_LEARNING_RECORD_OPERATING_THRESHOLDS;
const miniflare = new Miniflare({
  compatibilityDate: "2026-07-28",
  d1Databases: { PROJECT42_DB: "project42-hosted-adapter-measurement" },
  d1Persist: false,
  modules: true,
  script: "export default { fetch() { return new Response('measurement'); } };",
});

try {
  const database = await miniflare.getD1Database("PROJECT42_DB");
  await applyMigrations(database);
  const timestamp = "2026-07-28T20:00:00.000Z";
  await database
    .prepare("INSERT INTO installations VALUES (?, ?, ?, ?)")
    .bind("hosted-measurement", "Hosted measurement", timestamp, timestamp)
    .run();

  const durations = [];
  for (
    let index = 0;
    index < thresholds.referenceMeasurementStreams;
    index += 1
  ) {
    const suffix = String(index).padStart(3, "0");
    const learnerId = `measurement-learner-${suffix}`;
    await database
      .prepare(
        `INSERT INTO users (
           id, installation_id, display_name, primary_email,
           email_verified, account_state, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        learnerId,
        "hosted-measurement",
        `Measurement learner ${suffix}`,
        null,
        0,
        "approved",
        timestamp,
        timestamp,
      )
      .run();

    const engine = new LearningEventEngine(
      new SqlLearningEventStore(database),
      { now: () => timestamp },
    );
    const access = {
      installationId: "hosted-measurement",
      actorType: "learner",
      actorUserId: learnerId,
      permissions: ["learning:write:self", "learning:read:self"],
    };
    const start = performance.now();
    await engine.execute(
      {
        schemaVersion: "1.0",
        type: "path.enroll",
        installationId: "hosted-measurement",
        learnerId,
        idempotencyKey: `hosted-measurement-enroll-${suffix}`,
        contentVersion: "measurement-1.0.0",
        occurredAt: timestamp,
        actor: { type: "learner", userId: learnerId },
        payload: {
          pathId: "measurement-path",
          pathTitle: "Hosted adapter reference measurement",
          moduleIds: ["measurement-module"],
          badge: {
            id: "measurement-badge",
            name: "Measurement",
            description: "Deterministic hosted-adapter measurement evidence.",
          },
        },
      },
      access,
    );
    const rebuilt = await engine.rebuild(
      "hosted-measurement",
      learnerId,
      access,
    );
    if (rebuilt.revision !== 1) {
      throw new Error("Hosted measurement did not rebuild revision 1");
    }
    durations.push(performance.now() - start);
  }

  const observed = await database
    .prepare(
      `SELECT COUNT(*) AS event_count,
              COUNT(DISTINCT user_id) AS learner_count
         FROM learning_events
        WHERE installation_id = ?`,
    )
    .bind("hosted-measurement")
    .all();
  const sorted = durations.toSorted((left, right) => left - right);
  const report = {
    schemaVersion: "1.0",
    runtime: "miniflare-d1",
    streams: thresholds.referenceMeasurementStreams,
    operation: "append-and-deterministic-rebuild",
    errors: 0,
    p50Milliseconds: percentile(sorted, 50),
    p95Milliseconds: percentile(sorted, 95),
    p99Milliseconds: percentile(sorted, 99),
    maximumMilliseconds: round(sorted.at(-1) ?? 0),
    eventCount: Number(observed.results[0]?.event_count ?? 0),
    learnerCount: Number(observed.results[0]?.learner_count ?? 0),
    d1Meta: {
      rowsRead: observed.meta?.rows_read ?? null,
      rowsWritten: observed.meta?.rows_written ?? null,
      durationMilliseconds: observed.meta?.duration ?? null,
    },
    releaseThresholds: {
      p95Milliseconds: thresholds.referenceMeasurementP95Milliseconds,
      errors: thresholds.sustainedOverloadErrors,
    },
  };
  if (
    report.eventCount !== thresholds.referenceMeasurementStreams ||
    report.learnerCount !== thresholds.referenceMeasurementStreams
  ) {
    throw new Error("Hosted measurement lost a learner stream or event");
  }
  if (report.p95Milliseconds > thresholds.referenceMeasurementP95Milliseconds) {
    throw new Error(
      `Hosted reference p95 ${report.p95Milliseconds} ms exceeds ${thresholds.referenceMeasurementP95Milliseconds} ms`,
    );
  }
  console.log(JSON.stringify(report));
} finally {
  await miniflare.dispose();
}

async function applyMigrations(database) {
  const migrations = (await readdir(new URL("../migrations/", import.meta.url)))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const migration of migrations) {
    const sql = await readFile(
      new URL(`../migrations/${migration}`, import.meta.url),
      "utf8",
    );
    await database.exec(sql.replace(/\r?\n/g, " "));
  }
}

function percentile(sorted, value) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((value / 100) * sorted.length) - 1),
  );
  return round(sorted[index]);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
