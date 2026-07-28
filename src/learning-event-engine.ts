import {
  digestLearningCommand,
  LEARNING_EVENT_CONTRACT_VERSION,
  type AssessmentCorrectedEvent,
  type AssessmentRecordedEvent,
  type LearningActorType,
  type LearningBadgeDefinition,
  type LearningCommand,
  type LearningEvent,
  validateLearningCommand,
  validateLearningEvent,
} from "./learning-events.js";
import type {
  LearningRecordDeletionReceipt,
  LearningRecordDeletionReplay,
  LearningRecordReceiptStore,
  VerifiedLearningRecordExport,
} from "./learning-record-receipts.js";

export const LEARNING_EVENT_PERMISSIONS = [
  "learning:write:self",
  "learning:write:any",
  "learning:read:self",
  "learning:read:any",
  "learning:delete:self",
  "learning:delete:any",
] as const;

export type LearningEventPermission =
  (typeof LEARNING_EVENT_PERMISSIONS)[number];

export interface LearningEventAccess {
  installationId: string;
  actorType: LearningActorType;
  actorUserId: string | null;
  permissions: LearningEventPermission[];
}

export type LearningEventCandidate = LearningEvent extends infer Event
  ? Event extends LearningEvent
    ? Omit<Event, "sequence">
    : never
  : never;

export interface LearningEventAppendResult {
  event: LearningEvent;
  replayed: boolean;
}

export interface LearningEventStore {
  append(
    candidate: LearningEventCandidate,
    expectedRevision: number,
  ): Promise<LearningEventAppendResult>;
  list(installationId: string, learnerId: string): Promise<LearningEvent[]>;
  delete(installationId: string, learnerId: string): Promise<number>;
}

export interface LearningEnrollmentProjection {
  pathId: string;
  pathTitle: string;
  contentVersion: string;
  moduleIds: string[];
  badge: LearningBadgeDefinition;
  enrolledAt: string;
}

export interface LearningModuleProjection {
  pathId: string;
  moduleId: string;
  contentVersion: string;
  status: "visited" | "completed";
  firstVisitedAt: string | null;
  completedAt: string | null;
  evidenceRefs: string[];
}

export interface LearningAssessmentCorrection {
  correctionId: string;
  assessmentVersion: string;
  scorePercent: number;
  passed: boolean;
  reason: string;
  correctedAt: string;
  actorType: LearningActorType;
  actorUserId: string | null;
}

export interface LearningAssessmentAttemptProjection {
  attemptId: string;
  pathId: string;
  moduleId: string;
  contentVersion: string;
  assessmentVersion: string;
  answers: Record<string, number | null>;
  originalScorePercent: number;
  originalPassed: boolean;
  effectiveScorePercent: number;
  effectivePassed: boolean;
  completedAt: string;
  corrections: LearningAssessmentCorrection[];
}

export interface LearningTranscriptProjection {
  pathId: string;
  pathTitle: string;
  contentVersion: string;
  completedModules: number;
  totalModules: number;
  completionPercent: number;
  bestScorePercent: number | null;
}

export interface LearningBadgeProjection extends LearningBadgeDefinition {
  pathId: string;
  contentVersion: string;
  earnedAt: string;
  evidenceModuleIds: string[];
}

export interface LearningProjection {
  schemaVersion: typeof LEARNING_EVENT_CONTRACT_VERSION;
  installationId: string;
  learnerId: string;
  revision: number;
  lastSequence: number;
  enrollments: LearningEnrollmentProjection[];
  modules: LearningModuleProjection[];
  attempts: LearningAssessmentAttemptProjection[];
  transcript: LearningTranscriptProjection[];
  badges: LearningBadgeProjection[];
  progressSnapshot: Extract<
    LearningEvent,
    { type: "progress.imported" }
  >["payload"]["progress"] | null;
  progressSnapshotSequence: number;
  progressSynchronizedAt: string | null;
}

export interface LearningCommandResult {
  event: LearningEvent;
  replayed: boolean;
  projection: LearningProjection;
}

export interface LearningEventEngineOptions {
  now?: () => string;
}

export class LearningEventEngineError extends Error {
  constructor(
    public readonly code:
      | "invalid-command"
      | "invalid-event"
      | "access-denied"
      | "idempotency-conflict"
      | "duplicate-attempt-id"
      | "duplicate-correction-id"
      | "projection-conflict"
      | "concurrency-conflict"
      | "clock-invalid"
      | "adapter-unsupported",
    message: string,
  ) {
    super(message);
    this.name = "LearningEventEngineError";
  }
}

export class InMemoryLearningEventStore implements LearningEventStore {
  readonly #events = new Map<string, LearningEvent[]>();

  async append(
    candidate: LearningEventCandidate,
    expectedRevision: number,
  ): Promise<LearningEventAppendResult> {
    const key = scopeKey(candidate.installationId, candidate.learnerId);
    const events = this.#events.get(key) ?? [];
    const existing = events.find(
      (event) => event.idempotencyKey === candidate.idempotencyKey,
    );
    if (existing) {
      if (existing.commandDigest !== candidate.commandDigest) {
        throw new LearningEventEngineError(
          "idempotency-conflict",
          "The idempotency key is already bound to another learning command.",
        );
      }
      return { event: clone(existing), replayed: true };
    }
    if (events.length !== expectedRevision) {
      throw new LearningEventEngineError(
        "concurrency-conflict",
        "The learner event stream changed before the command could append.",
      );
    }

    if (candidate.type === "assessment.recorded") {
      const duplicateAttempt = events.find(
        (event) =>
          event.type === "assessment.recorded" &&
          event.payload.attemptId === candidate.payload.attemptId,
      );
      if (duplicateAttempt) {
        throw new LearningEventEngineError(
          "duplicate-attempt-id",
          "Assessment attempt IDs are immutable and unique per learner.",
        );
      }
    }
    if (candidate.type === "assessment.corrected") {
      const duplicateCorrection = events.find(
        (event) =>
          event.type === "assessment.corrected" &&
          event.payload.correctionId === candidate.payload.correctionId,
      );
      if (duplicateCorrection) {
        throw new LearningEventEngineError(
          "duplicate-correction-id",
          "Assessment correction IDs are immutable and unique per learner.",
        );
      }
    }

    const sequence =
      events.length === 0
        ? 1
        : Math.max(...events.map((event) => event.sequence)) + 1;
    const event = { ...clone(candidate), sequence } as LearningEvent;
    const validation = validateLearningEvent(event);
    if (!validation.valid) {
      throw new LearningEventEngineError(
        "invalid-event",
        validation.errors.join("; "),
      );
    }
    this.#events.set(key, [...events, clone(event)]);
    return { event: clone(event), replayed: false };
  }

  async list(
    installationId: string,
    learnerId: string,
  ): Promise<LearningEvent[]> {
    return (this.#events.get(scopeKey(installationId, learnerId)) ?? [])
      .map(clone)
      .sort((left, right) => left.sequence - right.sequence);
  }

  async delete(
    installationId: string,
    learnerId: string,
  ): Promise<number> {
    const key = scopeKey(installationId, learnerId);
    const count = this.#events.get(key)?.length ?? 0;
    this.#events.delete(key);
    return count;
  }
}

export class LearningEventEngine {
  readonly #now: () => string;

  constructor(
    private readonly store: LearningEventStore,
    options: LearningEventEngineOptions = {},
  ) {
    this.#now = options.now ?? (() => new Date().toISOString());
  }

  async execute(
    command: LearningCommand,
    access: LearningEventAccess,
  ): Promise<LearningCommandResult> {
    const validation = validateLearningCommand(command);
    if (!validation.valid) {
      throw new LearningEventEngineError(
        "invalid-command",
        validation.errors.join("; "),
      );
    }
    assertCanWrite(command, access);
    const recordedAt = this.#now();
    if (
      !validTimestamp(recordedAt) ||
      Date.parse(recordedAt) < Date.parse(command.occurredAt)
    ) {
      throw new LearningEventEngineError(
        "clock-invalid",
        "The storage clock must be a valid UTC time at or after occurredAt.",
      );
    }

    const commandDigest = await digestLearningCommand(command);
    const eventId = await learningEventId(command);
    const candidate = commandToEvent(
      command,
      eventId,
      commandDigest,
      recordedAt,
    );
    const appendResult = await this.appendWithProjectionGuard(
      candidate,
      command.installationId,
      command.learnerId,
    );
    const projection = projectLearningEvents(
      await this.store.list(command.installationId, command.learnerId),
      command.installationId,
      command.learnerId,
    );
    return {
      event: appendResult.event,
      replayed: appendResult.replayed,
      projection,
    };
  }

  async rebuild(
    installationId: string,
    learnerId: string,
    access: LearningEventAccess,
  ): Promise<LearningProjection> {
    assertCanRead(installationId, learnerId, access);
    return projectLearningEvents(
      await this.store.list(installationId, learnerId),
      installationId,
      learnerId,
    );
  }

  async export(
    installationId: string,
    learnerId: string,
    access: LearningEventAccess,
  ): Promise<LearningEvent[]> {
    assertCanRead(installationId, learnerId, access);
    return this.store.list(installationId, learnerId);
  }

  async delete(
    installationId: string,
    learnerId: string,
    access: LearningEventAccess,
  ): Promise<number> {
    assertCanDelete(installationId, learnerId, access);
    return this.store.delete(installationId, learnerId);
  }

  async exportVerified(
    installationId: string,
    learnerId: string,
    access: LearningEventAccess,
    exportedAt = this.#now(),
  ): Promise<VerifiedLearningRecordExport> {
    assertCanRead(installationId, learnerId, access);
    return requireReceiptStore(this.store).exportVerified(
      installationId,
      learnerId,
      exportedAt,
    );
  }

  async deleteVerified(
    installationId: string,
    learnerId: string,
    operationKey: string,
    access: LearningEventAccess,
    deletedAt = this.#now(),
  ): Promise<LearningRecordDeletionReceipt> {
    assertCanDelete(installationId, learnerId, access);
    return requireReceiptStore(this.store).deleteVerified(
      installationId,
      learnerId,
      operationKey,
      deletedAt,
    );
  }

  async replayDeletion(
    installationId: string,
    learnerId: string,
    deletionReceipt: LearningRecordDeletionReceipt,
    restoreId: string,
    access: LearningEventAccess,
    replayedAt = this.#now(),
  ): Promise<LearningRecordDeletionReplay> {
    assertCanDelete(installationId, learnerId, access);
    return requireReceiptStore(this.store).replayDeletion(
      installationId,
      learnerId,
      deletionReceipt,
      restoreId,
      replayedAt,
    );
  }

  async appendWithProjectionGuard(
    candidate: LearningEventCandidate,
    installationId: string,
    learnerId: string,
  ): Promise<LearningEventAppendResult> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await this.store.list(installationId, learnerId);
      const existing = current.find(
        (event) => event.idempotencyKey === candidate.idempotencyKey,
      );
      if (existing) {
        return this.store.append(candidate, current.length);
      }
      const nextSequence =
        current.length === 0
          ? 1
          : Math.max(...current.map((event) => event.sequence)) + 1;
      projectLearningEvents(
        [
          ...current,
          { ...clone(candidate), sequence: nextSequence } as LearningEvent,
        ],
        installationId,
        learnerId,
      );
      try {
        return await this.store.append(candidate, current.length);
      } catch (error) {
        if (
          error instanceof LearningEventEngineError &&
          error.code === "concurrency-conflict"
        ) {
          continue;
        }
        throw error;
      }
    }
    throw new LearningEventEngineError(
      "concurrency-conflict",
      "The learner event stream changed repeatedly; retry the command.",
    );
  }
}

function requireReceiptStore(
  store: LearningEventStore,
): LearningEventStore & LearningRecordReceiptStore {
  if (
    !("exportVerified" in store) ||
    typeof store.exportVerified !== "function" ||
    !("deleteVerified" in store) ||
    typeof store.deleteVerified !== "function" ||
    !("replayDeletion" in store) ||
    typeof store.replayDeletion !== "function"
  ) {
    throw new LearningEventEngineError(
      "adapter-unsupported",
      "The configured learning-event adapter does not support verified receipts.",
    );
  }
  return store as LearningEventStore & LearningRecordReceiptStore;
}

export function projectLearningEvents(
  sourceEvents: LearningEvent[],
  installationId: string,
  learnerId: string,
): LearningProjection {
  const events = sourceEvents.map(clone).sort((left, right) => {
    if (left.sequence !== right.sequence) return left.sequence - right.sequence;
    return left.id.localeCompare(right.id);
  });
  const enrollments = new Map<string, LearningEnrollmentProjection>();
  const modules = new Map<string, LearningModuleProjection>();
  const attempts = new Map<string, LearningAssessmentAttemptProjection>();
  const correctionIds = new Set<string>();
  let progressSnapshot: LearningProjection["progressSnapshot"] = null;
  let progressSnapshotSequence = 0;
  let progressSynchronizedAt: string | null = null;
  let lastSequence = 0;

  for (const event of events) {
    const validation = validateLearningEvent(event);
    if (!validation.valid) {
      throw new LearningEventEngineError(
        "invalid-event",
        validation.errors.join("; "),
      );
    }
    if (
      event.installationId !== installationId ||
      event.learnerId !== learnerId
    ) {
      throw new LearningEventEngineError(
        "projection-conflict",
        "An event crossed the requested installation or learner boundary.",
      );
    }
    if (event.sequence <= lastSequence) {
      throw new LearningEventEngineError(
        "projection-conflict",
        "Learning event sequence must increase monotonically.",
      );
    }
    lastSequence = event.sequence;
    if (event.type === "progress.imported") {
      enrollments.clear();
      modules.clear();
      attempts.clear();
      correctionIds.clear();
      progressSnapshot = clone(event.payload.progress);
      progressSnapshotSequence = event.sequence;
      progressSynchronizedAt = event.payload.synchronizedAt;
      continue;
    }
    applyEvent(event, enrollments, modules, attempts, correctionIds);
  }

  const enrollmentList = [...enrollments.values()].sort(compareEnrollment);
  const moduleList = [...modules.values()].sort(compareModule);
  const attemptList = [...attempts.values()].sort(compareAttempt);
  const transcript = enrollmentList.map((enrollment) =>
    buildTranscriptEntry(enrollment, moduleList, attemptList),
  );
  const badges = enrollmentList
    .map((enrollment) => deriveBadge(enrollment, moduleList))
    .filter((badge): badge is LearningBadgeProjection => badge !== null)
    .sort((left, right) => left.earnedAt.localeCompare(right.earnedAt));

  return {
    schemaVersion: LEARNING_EVENT_CONTRACT_VERSION,
    installationId,
    learnerId,
    revision: events.length,
    lastSequence,
    enrollments: enrollmentList,
    modules: moduleList,
    attempts: attemptList,
    transcript,
    badges,
    progressSnapshot,
    progressSnapshotSequence,
    progressSynchronizedAt,
  };
}

function applyEvent(
  event: LearningEvent,
  enrollments: Map<string, LearningEnrollmentProjection>,
  modules: Map<string, LearningModuleProjection>,
  attempts: Map<string, LearningAssessmentAttemptProjection>,
  correctionIds: Set<string>,
): void {
  switch (event.type) {
    case "path.enrolled":
      applyEnrollment(event, enrollments);
      return;
    case "module.visited":
      requireEnrolledModule(event, enrollments);
      applyModuleVisit(event, modules);
      return;
    case "assessment.recorded":
      requireEnrolledModule(event, enrollments);
      applyAssessment(event, attempts);
      return;
    case "module.completed":
      requireEnrolledModule(event, enrollments);
      applyCompletion(event, modules);
      return;
    case "assessment.corrected":
      applyCorrection(event, attempts, correctionIds);
      return;
    case "progress.imported":
      return;
  }
}

function applyEnrollment(
  event: Extract<LearningEvent, { type: "path.enrolled" }>,
  enrollments: Map<string, LearningEnrollmentProjection>,
): void {
  const key = versionedPathKey(
    event.payload.pathId,
    event.contentVersion,
  );
  const existing = enrollments.get(key);
  const projection: LearningEnrollmentProjection = {
    pathId: event.payload.pathId,
    pathTitle: event.payload.pathTitle,
    contentVersion: event.contentVersion,
    moduleIds: [...event.payload.moduleIds],
    badge: { ...event.payload.badge },
    enrolledAt: event.occurredAt,
  };
  if (existing && stableJson(existing) !== stableJson(projection)) {
    throw new LearningEventEngineError(
      "projection-conflict",
      `Path ${event.payload.pathId} was redefined within content version ${event.contentVersion}.`,
    );
  }
  if (!existing) enrollments.set(key, projection);
}

function applyModuleVisit(
  event: Extract<LearningEvent, { type: "module.visited" }>,
  modules: Map<string, LearningModuleProjection>,
): void {
  const key = versionedModuleKey(
    event.payload.pathId,
    event.payload.moduleId,
    event.contentVersion,
  );
  const existing = modules.get(key);
  if (!existing) {
    modules.set(key, {
      pathId: event.payload.pathId,
      moduleId: event.payload.moduleId,
      contentVersion: event.contentVersion,
      status: "visited",
      firstVisitedAt: event.occurredAt,
      completedAt: null,
      evidenceRefs: [],
    });
  } else if (
    existing.firstVisitedAt === null ||
    event.occurredAt.localeCompare(existing.firstVisitedAt) < 0
  ) {
    existing.firstVisitedAt = event.occurredAt;
  }
}

function applyAssessment(
  event: AssessmentRecordedEvent,
  attempts: Map<string, LearningAssessmentAttemptProjection>,
): void {
  if (attempts.has(event.payload.attemptId)) {
    throw new LearningEventEngineError(
      "duplicate-attempt-id",
      `Duplicate assessment attempt ID: ${event.payload.attemptId}`,
    );
  }
  attempts.set(event.payload.attemptId, {
    attemptId: event.payload.attemptId,
    pathId: event.payload.pathId,
    moduleId: event.payload.moduleId,
    contentVersion: event.contentVersion,
    assessmentVersion: event.payload.assessmentVersion,
    answers: { ...event.payload.answers },
    originalScorePercent: event.payload.scorePercent,
    originalPassed: event.payload.passed,
    effectiveScorePercent: event.payload.scorePercent,
    effectivePassed: event.payload.passed,
    completedAt: event.occurredAt,
    corrections: [],
  });
}

function applyCompletion(
  event: Extract<LearningEvent, { type: "module.completed" }>,
  modules: Map<string, LearningModuleProjection>,
): void {
  const key = versionedModuleKey(
    event.payload.pathId,
    event.payload.moduleId,
    event.contentVersion,
  );
  const existing = modules.get(key) ?? {
    pathId: event.payload.pathId,
    moduleId: event.payload.moduleId,
    contentVersion: event.contentVersion,
    status: "visited" as const,
    firstVisitedAt: null,
    completedAt: null,
    evidenceRefs: [],
  };
  existing.status = "completed";
  if (
    existing.completedAt === null ||
    event.occurredAt.localeCompare(existing.completedAt) < 0
  ) {
    existing.completedAt = event.occurredAt;
  }
  existing.evidenceRefs = [
    ...new Set([...existing.evidenceRefs, ...event.payload.evidenceRefs]),
  ].sort();
  modules.set(key, existing);
}

function applyCorrection(
  event: AssessmentCorrectedEvent,
  attempts: Map<string, LearningAssessmentAttemptProjection>,
  correctionIds: Set<string>,
): void {
  const attempt = attempts.get(event.payload.attemptId);
  if (!attempt) {
    throw new LearningEventEngineError(
      "projection-conflict",
      `Correction references missing attempt: ${event.payload.attemptId}`,
    );
  }
  if (correctionIds.has(event.payload.correctionId)) {
    throw new LearningEventEngineError(
      "duplicate-correction-id",
      `Duplicate assessment correction ID: ${event.payload.correctionId}`,
    );
  }
  if (
    event.contentVersion !== attempt.contentVersion ||
    event.payload.assessmentVersion !== attempt.assessmentVersion
  ) {
    throw new LearningEventEngineError(
      "projection-conflict",
      "A correction must use the original content and assessment versions.",
    );
  }
  correctionIds.add(event.payload.correctionId);
  const correction: LearningAssessmentCorrection = {
    correctionId: event.payload.correctionId,
    assessmentVersion: event.payload.assessmentVersion,
    scorePercent: event.payload.scorePercent,
    passed: event.payload.passed,
    reason: event.payload.reason,
    correctedAt: event.occurredAt,
    actorType: event.actor.type,
    actorUserId: event.actor.userId,
  };
  attempt.corrections.push(correction);
  attempt.effectiveScorePercent = correction.scorePercent;
  attempt.effectivePassed = correction.passed;
}

function requireEnrolledModule(
  event:
    | Extract<LearningEvent, { type: "module.visited" }>
    | Extract<LearningEvent, { type: "assessment.recorded" }>
    | Extract<LearningEvent, { type: "module.completed" }>,
  enrollments: Map<string, LearningEnrollmentProjection>,
): void {
  const enrollment = enrollments.get(
    versionedPathKey(event.payload.pathId, event.contentVersion),
  );
  if (!enrollment || !enrollment.moduleIds.includes(event.payload.moduleId)) {
    throw new LearningEventEngineError(
      "projection-conflict",
      `Module ${event.payload.moduleId} is not enrolled in path ${event.payload.pathId} for content version ${event.contentVersion}.`,
    );
  }
}

function buildTranscriptEntry(
  enrollment: LearningEnrollmentProjection,
  modules: LearningModuleProjection[],
  attempts: LearningAssessmentAttemptProjection[],
): LearningTranscriptProjection {
  const completedModules = modules.filter(
    (module) =>
      module.pathId === enrollment.pathId &&
      module.contentVersion === enrollment.contentVersion &&
      module.status === "completed" &&
      enrollment.moduleIds.includes(module.moduleId),
  ).length;
  const pathAttempts = attempts.filter(
    (attempt) =>
      attempt.pathId === enrollment.pathId &&
      attempt.contentVersion === enrollment.contentVersion,
  );
  return {
    pathId: enrollment.pathId,
    pathTitle: enrollment.pathTitle,
    contentVersion: enrollment.contentVersion,
    completedModules,
    totalModules: enrollment.moduleIds.length,
    completionPercent: Math.round(
      (completedModules / enrollment.moduleIds.length) * 100,
    ),
    bestScorePercent:
      pathAttempts.length === 0
        ? null
        : Math.max(
            ...pathAttempts.map((attempt) => attempt.effectiveScorePercent),
          ),
  };
}

function deriveBadge(
  enrollment: LearningEnrollmentProjection,
  modules: LearningModuleProjection[],
): LearningBadgeProjection | null {
  const completed = enrollment.moduleIds
    .map((moduleId) =>
      modules.find(
        (module) =>
          module.pathId === enrollment.pathId &&
          module.moduleId === moduleId &&
          module.contentVersion === enrollment.contentVersion &&
          module.status === "completed",
      ),
    )
    .filter(
      (module): module is LearningModuleProjection => module !== undefined,
    );
  if (completed.length !== enrollment.moduleIds.length) return null;
  const earnedAt = completed
    .map((module) => module.completedAt)
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  if (!earnedAt) return null;
  return {
    ...enrollment.badge,
    pathId: enrollment.pathId,
    contentVersion: enrollment.contentVersion,
    earnedAt,
    evidenceModuleIds: [...enrollment.moduleIds],
  };
}

function assertCanWrite(
  command: LearningCommand,
  access: LearningEventAccess,
): void {
  if (access.installationId !== command.installationId) {
    deny("The command crossed the authorized installation boundary.");
  }
  if (
    command.actor.type !== access.actorType ||
    command.actor.userId !== access.actorUserId
  ) {
    deny("The command actor does not match the authenticated actor.");
  }
  const self = access.actorUserId === command.learnerId;
  const permitted = self
    ? access.permissions.includes("learning:write:self") ||
      access.permissions.includes("learning:write:any")
    : access.permissions.includes("learning:write:any");
  if (!permitted) deny("The actor cannot write this learner record.");
}

function assertCanRead(
  installationId: string,
  learnerId: string,
  access: LearningEventAccess,
): void {
  if (access.installationId !== installationId) {
    deny("The read crossed the authorized installation boundary.");
  }
  const self = access.actorUserId === learnerId;
  const permitted = self
    ? access.permissions.includes("learning:read:self") ||
      access.permissions.includes("learning:read:any")
    : access.permissions.includes("learning:read:any");
  if (!permitted) deny("The actor cannot read this learner record.");
}

function assertCanDelete(
  installationId: string,
  learnerId: string,
  access: LearningEventAccess,
): void {
  if (access.installationId !== installationId) {
    deny("The deletion crossed the authorized installation boundary.");
  }
  const self = access.actorUserId === learnerId;
  const permitted = self
    ? access.permissions.includes("learning:delete:self") ||
      access.permissions.includes("learning:delete:any")
    : access.permissions.includes("learning:delete:any");
  if (!permitted) deny("The actor cannot delete this learner record.");
}

function deny(message: string): never {
  throw new LearningEventEngineError("access-denied", message);
}

function commandToEvent(
  command: LearningCommand,
  id: string,
  commandDigest: string,
  recordedAt: string,
): LearningEventCandidate {
  const common = {
    schemaVersion: LEARNING_EVENT_CONTRACT_VERSION,
    id,
    installationId: command.installationId,
    learnerId: command.learnerId,
    idempotencyKey: command.idempotencyKey,
    contentVersion: command.contentVersion,
    commandDigest,
    occurredAt: command.occurredAt,
    recordedAt,
    actor: { ...command.actor },
  };
  switch (command.type) {
    case "path.enroll":
      return {
        ...common,
        type: "path.enrolled",
        payload: clone(command.payload),
      };
    case "module.visit":
      return {
        ...common,
        type: "module.visited",
        payload: clone(command.payload),
      };
    case "assessment.record":
      return {
        ...common,
        type: "assessment.recorded",
        payload: clone(command.payload),
      };
    case "module.complete":
      return {
        ...common,
        type: "module.completed",
        payload: clone(command.payload),
      };
    case "assessment.correct":
      return {
        ...common,
        type: "assessment.corrected",
        payload: clone(command.payload),
      };
    case "progress.import":
      return {
        ...common,
        type: "progress.imported",
        payload: clone(command.payload),
      };
  }
}

async function learningEventId(command: LearningCommand): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${command.installationId}\u0000${command.learnerId}\u0000${command.idempotencyKey}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `learning-event-${hex.slice(0, 32)}`;
}

function versionedPathKey(pathId: string, contentVersion: string): string {
  return `${pathId}\u0000${contentVersion}`;
}

function versionedModuleKey(
  pathId: string,
  moduleId: string,
  contentVersion: string,
): string {
  return `${pathId}\u0000${moduleId}\u0000${contentVersion}`;
}

function scopeKey(installationId: string, learnerId: string): string {
  return `${installationId}\u0000${learnerId}`;
}

function compareEnrollment(
  left: LearningEnrollmentProjection,
  right: LearningEnrollmentProjection,
): number {
  return (
    left.pathId.localeCompare(right.pathId) ||
    left.contentVersion.localeCompare(right.contentVersion)
  );
}

function compareModule(
  left: LearningModuleProjection,
  right: LearningModuleProjection,
): number {
  return (
    left.pathId.localeCompare(right.pathId) ||
    left.moduleId.localeCompare(right.moduleId) ||
    left.contentVersion.localeCompare(right.contentVersion)
  );
}

function compareAttempt(
  left: LearningAssessmentAttemptProjection,
  right: LearningAssessmentAttemptProjection,
): number {
  return (
    left.completedAt.localeCompare(right.completedAt) ||
    left.attemptId.localeCompare(right.attemptId)
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJsonValue(value));
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJsonValue(child)]),
    );
  }
  return value;
}

function validTimestamp(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function clone<Value>(value: Value): Value {
  return structuredClone(value);
}
