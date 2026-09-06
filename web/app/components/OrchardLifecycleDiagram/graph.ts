/**
 * Layout and edge data for the Orchard lifecycle diagram.
 *
 * This is a hand-rolled graph description, not a Mermaid source. Node text
 * is resolved at render time from `app/lib/diagramSteps.ts` (the "orchard-lifecycle"
 * entry) by matching `OrchardNodeMeta.id` against `DiagramStep.highlightClass`,
 * so the visible label always comes from the single source of truth for this
 * diagram's content. The two nodes with no corresponding step (`noAuthority1`,
 * `rework`) are dead-end/loop-back outcomes carried over verbatim from
 * `public/diagrams/orchard-lifecycle.mmd`, which has no step of its own for
 * either one.
 *
 * Rows are laid out top to bottom; columns 1-3 are only meaningful while the
 * three intake lanes (discovery, currency, request) run in parallel. Once
 * they converge at "issue1", every node in the main flow spans the full
 * width. `noAuthority1` and `rework` are off-flow outcomes placed beside the
 * gate that produces them.
 */

export type OrchardNodeId =
  | "kickoff"
  | "sources"
  | "storeDiscovered"
  | "score"
  | "storeScores"
  | "currencyInspect"
  | "currencyRecord"
  | "requestIntake"
  | "issue1"
  | "gate1"
  | "noAuthority1"
  | "approvedTracker"
  | "orchestration"
  | "storeWritten"
  | "issue2"
  | "gate2"
  | "rework"
  | "commitPush"
  | "verifyLive";

export type OrchardNodeKind = "process" | "gate" | "issue" | "terminal";
export type OrchardLane = "discovery" | "currency" | "request";

export interface OrchardNodeMeta {
  id: OrchardNodeId;
  kind: OrchardNodeKind;
  row: number;
  col: 1 | 2 | 3;
  /** Spans the full grid width and is centered; used once lanes converge. */
  span?: boolean;
  /** Designed, not built. Rendered dashed plus an explicit text badge. */
  pending?: boolean;
  lane?: OrchardLane;
  /**
   * Label for the two outcome nodes that have no matching DiagramStep.
   * Copied verbatim from orchard-lifecycle.mmd; not a paraphrase.
   */
  fallbackLabel?: string;
}

/**
 * Declaration order doubles as the narrow-viewport reading order (the
 * responsive layout collapses the grid to a single stacked column in
 * document order), so this list runs top to bottom, left to right.
 */
// Row 1 is reserved for the three lane-title captions (rendered separately,
// not as graph nodes); node rows start at 2.
export const orchardNodes: OrchardNodeMeta[] = [
  { id: "kickoff", kind: "process", row: 2, col: 1, lane: "discovery" },
  { id: "currencyInspect", kind: "process", row: 2, col: 2, lane: "currency" },
  {
    id: "requestIntake",
    kind: "process",
    row: 2,
    col: 3,
    lane: "request",
    pending: true,
    fallbackLabel: "Request intake: a labeled GitHub issue (designed, not built)",
  },
  { id: "sources", kind: "process", row: 3, col: 1, lane: "discovery" },
  { id: "currencyRecord", kind: "process", row: 3, col: 2, lane: "currency" },
  { id: "storeDiscovered", kind: "process", row: 4, col: 1, lane: "discovery" },
  { id: "score", kind: "process", row: 5, col: 1, lane: "discovery" },
  { id: "storeScores", kind: "process", row: 6, col: 1, lane: "discovery" },
  { id: "issue1", kind: "issue", row: 7, col: 2, span: true },
  { id: "gate1", kind: "gate", row: 8, col: 2, span: true },
  {
    id: "noAuthority1",
    kind: "terminal",
    row: 9,
    col: 1,
    fallbackLabel: "No delivery authority",
  },
  { id: "approvedTracker", kind: "process", row: 10, col: 2, span: true },
  { id: "orchestration", kind: "process", row: 11, col: 2, span: true },
  { id: "storeWritten", kind: "process", row: 12, col: 2, span: true },
  { id: "issue2", kind: "issue", row: 13, col: 2, span: true },
  { id: "gate2", kind: "gate", row: 14, col: 2, span: true },
  {
    id: "rework",
    kind: "terminal",
    row: 15,
    col: 3,
    fallbackLabel: "No publication authority, work returns for rework",
  },
  { id: "commitPush", kind: "process", row: 16, col: 2, span: true },
  {
    id: "verifyLive",
    kind: "process",
    row: 17,
    col: 2,
    span: true,
    pending: true,
    fallbackLabel: "Verify the new content is live (designed, not wired)",
  },
];

export interface OrchardEdgeMeta {
  id: string;
  from: OrchardNodeId;
  to: OrchardNodeId;
  label?: string;
  pending?: boolean;
  /** A back edge loops from a later row to an earlier one (rework). */
  variant?: "forward" | "deny" | "back";
}

export const orchardEdges: OrchardEdgeMeta[] = [
  { id: "kickoff-sources", from: "kickoff", to: "sources" },
  { id: "sources-storeDiscovered", from: "sources", to: "storeDiscovered" },
  { id: "storeDiscovered-score", from: "storeDiscovered", to: "score" },
  { id: "score-storeScores", from: "score", to: "storeScores" },
  { id: "currencyInspect-currencyRecord", from: "currencyInspect", to: "currencyRecord" },
  { id: "storeScores-issue1", from: "storeScores", to: "issue1" },
  { id: "currencyRecord-issue1", from: "currencyRecord", to: "issue1" },
  { id: "requestIntake-issue1", from: "requestIntake", to: "issue1", pending: true },
  { id: "issue1-gate1", from: "issue1", to: "gate1" },
  { id: "gate1-noAuthority1", from: "gate1", to: "noAuthority1", label: "deny", variant: "deny" },
  { id: "gate1-approvedTracker", from: "gate1", to: "approvedTracker", label: "approve" },
  { id: "approvedTracker-orchestration", from: "approvedTracker", to: "orchestration" },
  { id: "orchestration-storeWritten", from: "orchestration", to: "storeWritten" },
  { id: "storeWritten-issue2", from: "storeWritten", to: "issue2" },
  { id: "issue2-gate2", from: "issue2", to: "gate2" },
  {
    id: "gate2-rework",
    from: "gate2",
    to: "rework",
    label: "deny, reason required",
    variant: "deny",
  },
  { id: "rework-orchestration", from: "rework", to: "orchestration", variant: "back" },
  { id: "gate2-commitPush", from: "gate2", to: "commitPush", label: "approve" },
  { id: "commitPush-verifyLive", from: "commitPush", to: "verifyLive", pending: true },
];

export const orchardLaneOrder: OrchardLane[] = ["discovery", "currency", "request"];

export const orchardLaneTitles: Record<OrchardLane, string> = {
  discovery: "Discovery track",
  currency: "Currency track",
  request: "Request intake",
};

/**
 * Short captions for the two outcome nodes that have no DiagramStep of their
 * own, so their place in the flow reads clearly without relying on position
 * or color alone. Not diagram step content; UI chrome only.
 */
export const orchardTerminalNotes: Record<"noAuthority1" | "rework", string> = {
  noAuthority1: "Dead end: nothing moves forward from a Gate 1 denial.",
  rework: "Loops back to the authoring ensemble for another pass.",
};
