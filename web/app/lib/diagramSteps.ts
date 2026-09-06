import type { DiagramStep } from "../components/InteractiveDiagram";

/**
 * Step-through data for all 8 visual guides.
 *
 * Each diagram is decomposed into 4–6 steps that reveal the diagram
 * progressively with explanatory text. Step 0 is always the overview.
 */

export interface DiagramStepData {
    diagramId: string;
    steps: DiagramStep[];
}

export const diagramStepData: DiagramStepData[] = [
    {
        diagramId: "learning-evidence-loop",
        steps: [
            {
                step: 1,
                label: "Start with a question",
                description:
                    "Every learning cycle begins with a concrete question. The question defines what evidence you need and which sources are relevant. Without a clear question, you cannot measure whether you learned anything.",
            },
            {
                step: 2,
                label: "Gather primary sources",
                description:
                    "Collect dated, attributable primary sources — documentation, research papers, official specifications. Secondary sources and unsupported claims are excluded. Every source must have a retrieval date.",
            },
            {
                step: 3,
                label: "Form a claim",
                description:
                    "Synthesize what the sources say into a testable claim. The claim must be specific enough to verify and broad enough to be useful. Ambiguous claims produce ambiguous evidence.",
            },
            {
                step: 4,
                label: "Verify against evidence",
                description:
                    "Check the claim against each source. Does the source support, contradict, or remain ambiguous about the claim? Record the relationship explicitly — unsupported confidence is the most common failure mode.",
            },
            {
                step: 5,
                label: "Update or retire",
                description:
                    "If evidence supports the claim, publish it with a freshness date. If evidence contradicts it, revise or retire it. Stale claims that outlive their sources are worse than no claims at all.",
            },
        ],
    },
    {
        diagramId: "grounded-answer-workflow",
        steps: [
            {
                step: 1,
                label: "Receive the question",
                description:
                    "The workflow starts when a question arrives. The question may come from a human, an agent, or a system. The first job is to determine what kind of answer is needed — factual, procedural, comparative, or diagnostic.",
            },
            {
                step: 2,
                label: "Search for evidence",
                description:
                    "Query primary sources — documentation, code repositories, issue trackers, runbooks. The search must be reproducible: same query, same sources, same date should return the same evidence.",
            },
            {
                step: 3,
                label: "Evaluate source quality",
                description:
                    "Not all sources are equal. Check recency, authority, and relevance. A source from last week is better than one from last year. An official document beats a forum post. Reject sources that cannot be dated or attributed.",
            },
            {
                step: 4,
                label: "Construct the answer",
                description:
                    "Build the answer from evidence, not from memory. Every factual claim must cite at least one source. The answer must distinguish between what the evidence supports and what remains uncertain.",
            },
            {
                step: 5,
                label: "Verify and deliver",
                description:
                    "Review the answer: are all claims sourced? Are sources current? Is uncertainty clearly marked? Only then deliver the answer. The evidence trail stays with the answer for future verification.",
            },
        ],
    },
    {
        diagramId: "safe-agent-loop",
        steps: [
            {
                step: 1,
                label: "Receive the work order",
                description:
                    "Every agent run starts with a bounded work order — a specific task with explicit scope, permissions, and success criteria. Unbounded agents are unsafe by design.",
            },
            {
                step: 2,
                label: "Plan within guardrails",
                description:
                    "The agent plans its approach within declared guardrails: allowed tools, maximum steps, cost ceiling, and required approvals. The plan must be verifiable — a human should be able to read it and predict what the agent will do.",
            },
            {
                step: 3,
                label: "Execute with tool calls",
                description:
                    "The agent executes its plan, calling tools as needed. Each tool call is logged with its inputs, outputs, and timing. Tools that modify state require explicit confirmation.",
            },
            {
                step: 4,
                label: "Verify each step",
                description:
                    "After each tool call, the agent verifies the result against expectations. Unexpected outputs trigger a review gate. The agent must not proceed past a failed verification without human input.",
            },
            {
                step: 5,
                label: "Produce evidence package",
                description:
                    "The agent produces a complete evidence package: what it did, what tools it called, what outputs it received, and what decisions it made. The package is the basis for human review and audit.",
            },
            {
                step: 6,
                label: "Human review gate",
                description:
                    "The evidence package passes through a human review gate before any permanent changes are applied. The human can approve, reject, or request revision. No irreversible action happens without this gate.",
            },
        ],
    },
    {
        diagramId: "prompt-contract",
        steps: [
            {
                step: 1,
                label: "Define the role",
                description:
                    "Start by defining who the model is in this interaction — a researcher, a reviewer, a coder, a teacher. The role sets expectations for tone, depth, and boundaries.",
            },
            {
                step: 2,
                label: "State the task",
                description:
                    "Describe exactly what you want the model to do. Be specific about the output format, length, and level of detail. Vague tasks produce vague results.",
            },
            {
                step: 3,
                label: "Provide context",
                description:
                    "Supply the background the model needs — relevant facts, constraints, examples, and references. Context is what turns a generic response into a useful one.",
            },
            {
                step: 4,
                label: "Set success criteria",
                description:
                    "Define what a good answer looks like. Include acceptance criteria: must cite sources, must be under 500 words, must include a code example. Without criteria, you cannot evaluate the output.",
            },
            {
                step: 5,
                label: "Specify the output contract",
                description:
                    "Define the exact structure of the response — JSON schema, markdown format, required sections. A clear output contract makes the response machine-readable and human-verifiable.",
            },
        ],
    },
    {
        diagramId: "provider-selection",
        steps: [
            {
                step: 1,
                label: "Define your requirements",
                description:
                    "Start with your actual needs: latency budget, throughput, cost ceiling, capability requirements, compliance constraints. Provider selection without requirements is brand preference, not engineering.",
            },
            {
                step: 2,
                label: "Map capabilities to providers",
                description:
                    "Match your requirements against each provider's documented capabilities. Use official documentation and published benchmarks — not marketing claims or anecdotal reports.",
            },
            {
                step: 3,
                label: "Run comparative evaluations",
                description:
                    "Test providers against your actual workloads using the same prompts, the same evaluation criteria, and the same success metrics. Cross-provider comparisons are only valid when the test is identical.",
            },
            {
                step: 4,
                label: "Evaluate cost and reliability",
                description:
                    "Compare pricing models, rate limits, SLA terms, and historical reliability data. The cheapest provider that fails your latency budget is not cheaper — it is unusable.",
            },
            {
                step: 5,
                label: "Document and review",
                description:
                    "Record your selection decision with dated evidence. Revisit periodically — provider capabilities and pricing change. A decision made six months ago may no longer be optimal.",
            },
        ],
    },
    {
        diagramId: "tool-trust-boundaries",
        steps: [
            {
                step: 1,
                label: "Classify the tool",
                description:
                    "Every tool falls into one of three trust tiers: read-only (safe), read-write (requires confirmation), or destructive (requires human approval). Classification is the first security decision.",
            },
            {
                step: 2,
                label: "Define the data boundary",
                description:
                    "What data can the tool access? What data must it never see? Define explicit allowlists and denylists. A tool that can read everything is a tool that can leak everything.",
            },
            {
                step: 3,
                label: "Set the permission scope",
                description:
                    "Grant the minimum permissions the tool needs — no more. If a tool only needs to read one table, do not give it database admin. Principle of least privilege applies to AI tools exactly as it does to human users.",
            },
            {
                step: 4,
                label: "Add verification gates",
                description:
                    "Insert verification checks before and after tool calls. Before: is this call within scope? After: did the output match expectations? Failed verifications halt the workflow.",
            },
            {
                step: 5,
                label: "Audit every call",
                description:
                    "Log every tool invocation with its inputs, outputs, timing, and authorization decision. The audit trail must be complete enough to reconstruct what happened and why.",
            },
        ],
    },
    {
        diagramId: "multi-agent-handoff",
        steps: [
            {
                step: 1,
                label: "Define agent roles",
                description:
                    "Each agent in a multi-agent system has a specific role with bounded responsibilities. Roles must not overlap in ways that create ambiguity about who owns a decision.",
            },
            {
                step: 2,
                label: "Establish the handoff contract",
                description:
                    "Define exactly what data passes between agents: the payload schema, required fields, optional fields, and validation rules. A handoff without a schema is a handoff that will break.",
            },
            {
                step: 3,
                label: "Validate before transfer",
                description:
                    "The sending agent validates its output against the handoff contract before transferring. The receiving agent validates the input before processing. Double validation catches drift on either side.",
            },
            {
                step: 4,
                label: "Transfer with traceability",
                description:
                    "Every handoff is logged with a unique ID, timestamp, sender, receiver, and payload digest. The trace allows you to reconstruct the full chain of custody for any decision.",
            },
            {
                step: 5,
                label: "Handle handoff failures",
                description:
                    "Define what happens when a handoff fails: retry with backoff, escalate to a human, or abort the workflow. Unhandled handoff failures are the most common cause of silent multi-agent bugs.",
            },
        ],
    },
    {
        diagramId: "content-freshness-release",
        steps: [
            {
                step: 1,
                label: "Detect source drift",
                description:
                    "Monitor primary sources for changes. When a source updates, flag every piece of content that cites it. Source drift is the root cause of stale content — you cannot fix what you do not detect.",
            },
            {
                step: 2,
                label: "Assess impact",
                description:
                    "For each flagged content item, determine whether the source change affects the claims. A typo fix may require no action. A deprecated API requires immediate revision.",
            },
            {
                step: 3,
                label: "Update or retire content",
                description:
                    "Revise affected content to reflect the new source state, or retire it if it is no longer relevant. Every update records the new source version and the date of review.",
            },
            {
                step: 4,
                label: "Review and approve",
                description:
                    "Updated content passes through human review. The reviewer checks that claims still match sources, that no new errors were introduced, and that the freshness date is correct.",
            },
            {
                step: 5,
                label: "Release with attestation",
                description:
                    "Publish the updated content with a freshness attestation: what sources were checked, when they were checked, and who approved the release. The attestation is the proof that the content is current.",
            },
        ],
    },
    {
        diagramId: "agent-orchestration",
        steps: [
            {
                step: 1,
                label: "Classify the request",
                description:
                    "Every incoming request hits the router agent first. The router classifies intent — build, review, investigate, operate, refactor, test, or document — and selects the appropriate specialist agent. Misclassification is the most common failure mode in multi-agent systems.",
            },
            {
                step: 2,
                label: "Dispatch to specialist",
                description:
                    "The specialist agent receives the task with a bounded work order: explicit scope, allowed tools, cost ceiling, and success criteria. Each specialist has a narrow domain — a coder does not review, a reviewer does not investigate.",
            },
            {
                step: 3,
                label: "Execute with guardrails",
                description:
                    "The specialist executes within its guardrails. Tool calls are logged with inputs, outputs, and timing. State-modifying operations require explicit confirmation. The agent produces a complete evidence package of everything it did.",
            },
            {
                step: 4,
                label: "Independent review",
                description:
                    "Every output passes through an independent reviewer agent — running on a different model family than the specialist. The reviewer checks correctness, security, style, and test coverage. This cross-model review catches blind spots that same-model review misses.",
            },
            {
                step: 5,
                label: "Assemble and deliver",
                description:
                    "Approved outputs are assembled into a coherent response. The human receives the result with a complete audit trail: which agents were involved, what decisions they made, and what evidence supports each conclusion.",
            },
        ],
    },
    {
        diagramId: "cost-and-capacity-management",
        steps: [
            {
                step: 1,
                label: "Estimate workload cost",
                description:
                    "Start with a workload estimate: expected request volume, average token count per request, and model pricing. Multiply tokens by rate to get a cost projection. An estimate within 20% of actual is good enough to begin — you will refine it with real data.",
            },
            {
                step: 2,
                label: "Allocate budget",
                description:
                    "Set a budget based on the cost estimate plus a buffer for variance. The budget is a hard ceiling, not a suggestion. Every agent run checks remaining budget before starting. A run that would exceed budget is queued, not executed.",
            },
            {
                step: 3,
                label: "Provision capacity",
                description:
                    "Deploy endpoints with the right quota for your workload. Under-provisioning causes throttling and timeouts. Over-provisioning wastes money. Capacity planning is a continuous process — review quotas monthly against actual usage.",
            },
            {
                step: 4,
                label: "Monitor and alert",
                description:
                    "Real-time monitoring tracks spend against budget. Alerts fire at warning thresholds (80% of budget) and critical thresholds (95%). The monitoring dashboard shows per-model, per-agent, and per-run cost breakdowns.",
            },
            {
                step: 5,
                label: "Apply spend brakes",
                description:
                    "When spend hits the critical threshold, automated spend brakes engage: new runs are halted, running operations complete but no new ones start, and the human operator is notified. Spend brakes are the last line of defense — they must be tested regularly.",
            },
            {
                step: 6,
                label: "Audit and adjust",
                description:
                    "Periodically audit actual spend against estimates. Adjust budgets, quotas, and model choices based on real data. A model that looked cost-effective on paper may be expensive in practice. Continuous adjustment is the difference between controlled spend and surprise bills.",
            },
        ],
    },
    {
        diagramId: "orchard-lifecycle",
        steps: [
            {
                step: 1,
                label: "Discovery kicks off",
                description:
                    "The discovery track runs monthly, on the 1st, at 06:00 UTC. This is one of three ways a topic can enter Orchard's queue, alongside the currency track and a designed request-intake path; all three converge on the same first approval.",
                highlightClass: "kickoff",
                links: [
                    {
                        label: "Track 1 discovery: job, schedule, and script",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-1-survey-the-approved-sources-discovery",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 2,
                label: "Read the approved-source list",
                description:
                    "A discovery agent runs against a versioned list of approved sources only. A full run is not considered complete until at least 50 distinct approved and enabled sources have been attempted, which is how Track 1 avoids being satisfied by a handful of easy sources.",
                highlightClass: "sources",
                links: [
                    {
                        label: "Track 1, approved-source discovery: job, schedule, and script",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-1-survey-the-approved-sources-discovery",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 3,
                label: "Store discovered content",
                description:
                    "Everything the discovery pass finds is written to the content database as a candidate. Candidates are derived data, not authoritative; they can be rebuilt from a fresh run at any time and losing them costs nothing.",
                highlightClass: "storeDiscovered",
                links: [
                    {
                        label: "Persisting candidates: table and state transitions",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-4-persist-candidates-as-held-work",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 4,
                label: "Score the discovered content",
                description:
                    "Every candidate is scored on breadth of demand, depth of demand, the supply gap in our own corpus, and surface spread. Scoring only orders the queue a human reads; nothing is excluded for scoring low, and there is no cutoff.",
                highlightClass: "score",
                links: [
                    {
                        label: "How a candidate is scored, in the per-step design",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-3-propose-candidates",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 5,
                label: "Store the scores",
                description:
                    "Scored candidates are written back to the content database alongside the evidence the score was built from, so the reasoning behind the ranking survives the run that produced it.",
                highlightClass: "storeScores",
                links: [
                    {
                        label: "Persisting candidates: table and state transitions",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-4-persist-candidates-as-held-work",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 6,
                label: "Raise a GitHub issue with everything discovered",
                description:
                    "A GitHub issue and an alert list everything discovered in the run along with its scoring, in one place the owner can review and act on without opening the database directly.",
                highlightClass: "issue1",
                links: [
                    {
                        label: "Announcing the gate: job, script, and manifest",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-5-announce-the-gate",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 7,
                label: "Gate 1: the owner approves on the comment",
                description:
                    "Nothing reaches a model before this approval. The owner approves on the issue comment; a denial leaves the item with no delivery authority. This is the first of Orchard's two gates, and it is the one every intake path shares.",
                highlightClass: "gate1",
                links: [
                    {
                        label: "Applying the owner's decision: job and script",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-6-apply-the-owners-decision",
                        kind: "reference",
                    },
                    {
                        label: "The protected adapter and trust anchor",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-6-apply-the-owners-decision",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 8,
                label: "Approved content moves to the approved list",
                description:
                    "Approved items move to an approved list, and each one gets a work item for tracking. One standing epic covers a surface family, one story covers one selected content item, and the story carries the work-item id that joins the two systems.",
                highlightClass: "approvedTracker",
                links: [
                    {
                        label: "Creating the tracker work item: fields and idempotence",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-8-create-the-tracker-work-item",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 9,
                label: "Orchestration runs the authoring ensemble",
                description:
                    "Research, authoring, and review agents run in order against the approved item. Six roles are designed; four are running today. Each role runs as a separate call against a different vendor family wherever roles check each other's work.",
                highlightClass: "orchestration",
                links: [
                    {
                        label: "Authoring: status in the deployed system",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-10-authoring",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 10,
                label: "Store the written content",
                description:
                    "The ensemble's output, brand-new content or a correction to an existing item, is stored ahead of owner review. Content files stay the source of truth; the database is compiled from them.",
                highlightClass: "storeWritten",
                links: [
                    {
                        label: "Ingesting the authored proposal: artifact binding",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-11-ingest-the-authored-proposal",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 11,
                label: "A second GitHub issue for owner review",
                description:
                    "A second GitHub issue carries the work-item link and either the written content or a link to it, so the owner can review the actual output before it goes anywhere near the central content store.",
                highlightClass: "issue2",
                links: [
                    {
                        label: "Announcing the gate: job, script, and manifest",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-5-announce-the-gate",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 12,
                label: "Gate 2: approve or deny the exact artifact",
                description:
                    "This is the second gate, and it binds to the exact artifact digest, not just the item. Editing the artifact after this point invalidates approvals written before the edit. A denial carries a reason and the work returns for rework; an approval moves the content toward the central content store.",
                highlightClass: "gate2",
                links: [
                    {
                        label: "Gate 2, publication approval: status and design rule",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-12-gate-2-publication-approval",
                        kind: "reference",
                    },
                    {
                        label: "The protected adapter and trust anchor",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-12-gate-2-publication-approval",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 13,
                label: "Commit and push",
                description:
                    "Approved content is committed and pushed to the central content store: brand-new content becomes a new course, and content extending an existing course is added to it.",
                highlightClass: "commitPush",
                links: [
                    {
                        label: "Publishing: job, script, and status",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-13-publish",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 14,
                label: "Verify the new content is live",
                description:
                    "The intended last step of the discovery track is verifying that the newly published content is actually reachable. This step is designed and implemented as a script, but it is not yet wired to any phase or workflow, so nothing invokes it automatically today.",
                highlightClass: "verifyLive",
                links: [
                    {
                        label: "Verifying published content is live: status",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-14-verify-the-published-content-is-live",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 15,
                label: "Currency track: inspect existing content",
                description:
                    "Instead of discovering new content, the currency track inspects what Orchard already has, using the same approved-source list. An online search input is an owner requirement that is not yet designed. This runs monthly, on the 15th, at 06:00 UTC, and it is the one currency step that actually runs today.",
                highlightClass: "currencyInspect",
                links: [
                    {
                        label: "Inspecting the canonical corpus: job, schedule, and script",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-2-inspect-the-canonical-corpus-currency",
                        kind: "reference",
                    },
                    {
                        label: "Track 2, canonical inspection: status on the current estate",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-2-inspect-the-canonical-corpus-currency",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 16,
                label: "Record updates and removals",
                description:
                    "New updates the inspection finds are recorded, as is stale content that should be removed. This recording step runs today; nothing yet carries the findings on to review, authoring, or publication.",
                highlightClass: "currencyRecord",
                links: [
                    {
                        label: "What currency writes, and the structural defect",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#step-2-inspect-the-canonical-corpus-currency",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 17,
                label: "The same approval path, once wired",
                description:
                    "The currency track is designed to rejoin the discovery track from the shared GitHub issue onward: the same Gate 1, the same research and authoring agents, a second issue for the written updates and deletions, and the same Gate 2 before commit and push. Today, only inspecting and recording findings actually run; impact assessment, authoring, and publication for currency findings do not exist yet.",
                highlightClass: "gate1",
                links: [
                    {
                        label: "Summary of what actually runs",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle-steps.md#summary-of-what-actually-runs",
                        kind: "reference",
                    },
                ],
            },
            {
                step: 18,
                label: "Request intake: a labeled GitHub issue",
                description:
                    "Designed, not built. Anyone would be able to propose a topic through an issue form or by applying a content-request label to an ordinary issue. The request would be matched against the existing corpus and open candidates to avoid duplicating work already underway.",
                highlightClass: "requestIntake",
                links: [
                    {
                        label: "Request intake, in the owner's mandate",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle.md#request-intake",
                        kind: "design",
                    },
                ],
            },
            {
                step: 19,
                label: "The request joins the same queue and Gate 1",
                description:
                    "A surviving request would be written into the same discovery queue a discovered candidate uses, batched with discovered and currency items in the same Gate 1 manifest and issue. Only the owner's Gate 1 approval would move a requested item forward, and everything after Gate 1 would be identical regardless of where the item came from. No issue template or intake code exists yet.",
                highlightClass: "gate1",
                links: [
                    {
                        label: "Request intake, in the owner's mandate",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle.md#request-intake",
                        kind: "design",
                    },
                    {
                        label: "Known gaps against this mandate",
                        href: "https://github.com/project42dev/project42-platform/blob/main/docs/orchard/lifecycle.md#known-gaps-against-this-mandate",
                        kind: "reference",
                    },
                ],
            },
        ],
    },
];

/** Lookup steps by diagram ID. Returns empty array for unknown IDs. */
export function getDiagramSteps(diagramId: string): DiagramStep[] {
    return diagramStepData.find((d) => d.diagramId === diagramId)?.steps ?? [];
}

