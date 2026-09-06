"use client";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
} from "react";
import type { DiagramStep, DiagramStepLink } from "../InteractiveDiagram";
import {
    orchardEdges,
    orchardLaneOrder,
    orchardLaneTitles,
    orchardNodes,
    orchardTerminalNotes,
    type OrchardEdgeMeta,
    type OrchardNodeId,
    type OrchardNodeKind,
    type OrchardNodeMeta,
} from "./graph";

export interface OrchardLifecycleDiagramProps {
    /** Diagram title, shown in the fullscreen header. */
    title: string;
    /** Accessible name for the whole diagram figure. */
    alt: string;
    /** Optional category badge shown in the fullscreen header. */
    category?: string;
    /** The 19 Orchard lifecycle steps from app/lib/diagramSteps.ts, unmodified. */
    steps: DiagramStep[];
}

const linkKindLabel: Record<DiagramStepLink["kind"], string> = {
    design: "Design doc",
    runbook: "Runbook",
    adr: "ADR",
    reference: "Reference",
};

const nodeKindKicker: Record<OrchardNodeKind, string> = {
    process: "Step",
    gate: "Gate",
    issue: "GitHub issue",
    terminal: "Outcome",
};

function isExternalHref(href: string) {
    return /^https?:\/\//i.test(href);
}

interface EdgeGeometry {
    id: string;
    d: string;
    labelX: number;
    labelY: number;
    label?: string;
    pending?: boolean;
    variant?: OrchardEdgeMeta["variant"];
}

/** Extends a fullscreen-capable element with the vendor-prefixed Safari API. */
interface FullscreenCapableElement extends HTMLDivElement {
    webkitRequestFullscreen?: () => Promise<void> | void;
}

interface FullscreenCapableDocument extends Document {
    webkitExitFullscreen?: () => Promise<void> | void;
    webkitFullscreenElement?: Element | null;
}

export function OrchardLifecycleDiagram({ title, alt, category, steps }: OrchardLifecycleDiagramProps) {
    const fullscreenRef = useRef<FullscreenCapableElement | null>(null);
    const graphRef = useRef<HTMLDivElement | null>(null);
    const nodeElementsRef = useRef(new Map<OrchardNodeId, HTMLElement>());
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const triggerRef = useRef<HTMLButtonElement | null>(null);
    const wasExpandedRef = useRef(false);

    const [selectedStep, setSelectedStep] = useState(0);
    const [expanded, setExpanded] = useState(false);
    const [usingNativeFullscreen, setUsingNativeFullscreen] = useState(false);
    const [edgeGeometry, setEdgeGeometry] = useState<EdgeGeometry[]>([]);

    // The region a highlightClass can only point to one place, mirroring the
    // canonical-step rule used by the eight Mermaid diagrams: when several
    // steps share a node (Gate 1 is steps 7, 17, and 19), clicking the node
    // jumps to the first step that claims it. Every step, shared or not, is
    // still reachable directly from the step list below.
    const canonicalStepByNode = useMemo(() => {
        const map = new Map<OrchardNodeId, DiagramStep>();
        for (const step of steps) {
            const id = step.highlightClass as OrchardNodeId | undefined;
            if (!id) continue;
            if (!map.has(id)) map.set(id, step);
        }
        return map;
    }, [steps]);

    const activeStep = selectedStep === 0 ? null : (steps.find((step) => step.step === selectedStep) ?? null);
    const activeNodeId = activeStep?.highlightClass as OrchardNodeId | undefined;

    const selectNode = useCallback(
        (nodeId: OrchardNodeId) => {
            const step = canonicalStepByNode.get(nodeId);
            if (step) setSelectedStep(step.step);
        },
        [canonicalStepByNode],
    );

    const selectStep = useCallback((stepNumber: number) => {
        setSelectedStep(stepNumber);
    }, []);

    const registerNode = useCallback((id: OrchardNodeId, element: HTMLElement | null) => {
        if (element) {
            nodeElementsRef.current.set(id, element);
        } else {
            nodeElementsRef.current.delete(id);
        }
    }, []);

    // Recompute every edge's path from the live positions of its two nodes.
    // Runs after layout, on resize (including entering/leaving fullscreen,
    // which resizes the container), and once web fonts settle so text reflow
    // doesn't leave stale connector lines.
    const recomputeEdges = useCallback(() => {
        const container = graphRef.current;
        if (!container) return;
        const containerRect = container.getBoundingClientRect();

        const anchor = (element: HTMLElement, side: "top" | "bottom" | "right") => {
            const rect = element.getBoundingClientRect();
            const x = side === "right" ? rect.right - containerRect.left : rect.left + rect.width / 2 - containerRect.left;
            const y =
                side === "top"
                    ? rect.top - containerRect.top
                    : side === "bottom"
                      ? rect.bottom - containerRect.top
                      : rect.top + rect.height / 2 - containerRect.top;
            return { x, y };
        };

        const geometry: EdgeGeometry[] = [];
        for (const edge of orchardEdges) {
            const fromEl = nodeElementsRef.current.get(edge.from);
            const toEl = nodeElementsRef.current.get(edge.to);
            if (!fromEl || !toEl) continue;

            const isBack = edge.variant === "back";
            const start = anchor(fromEl, isBack ? "right" : "bottom");
            const end = anchor(toEl, isBack ? "right" : "top");

            const d = isBack
                ? `M ${start.x} ${start.y} C ${start.x + 56} ${start.y}, ${end.x + 56} ${end.y}, ${end.x} ${end.y}`
                : `M ${start.x} ${start.y} C ${start.x} ${(start.y + end.y) / 2}, ${end.x} ${(start.y + end.y) / 2}, ${end.x} ${end.y}`;

            geometry.push({
                id: edge.id,
                d,
                labelX: isBack ? Math.max(start.x, end.x) + 30 : (start.x + end.x) / 2,
                labelY: (start.y + end.y) / 2,
                label: edge.label,
                pending: edge.pending,
                variant: edge.variant,
            });
        }
        setEdgeGeometry(geometry);
    }, []);

    useLayoutEffect(() => {
        recomputeEdges();
        const container = graphRef.current;
        if (!container || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(() => recomputeEdges());
        observer.observe(container);
        window.addEventListener("resize", recomputeEdges);
        let cancelled = false;
        if (typeof document !== "undefined" && document.fonts?.ready) {
            document.fonts.ready.then(() => {
                if (!cancelled) recomputeEdges();
            });
        }
        return () => {
            cancelled = true;
            observer.disconnect();
            window.removeEventListener("resize", recomputeEdges);
        };
    }, [recomputeEdges]);

    // Keep expanded/native state in sync with the browser's own fullscreen
    // state, so Escape, F11, or browser chrome (not just our own close
    // button) collapse the diagram cleanly.
    useEffect(() => {
        const handleFullscreenChange = () => {
            const doc = document as FullscreenCapableDocument;
            const activeElement = doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
            const isOurs = activeElement === fullscreenRef.current;
            setUsingNativeFullscreen((wasNative) => {
                if (wasNative && !isOurs) setExpanded(false);
                return isOurs;
            });
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
            document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
        };
    }, []);

    const closeFullscreen = useCallback(() => {
        const doc = document as FullscreenCapableDocument;
        if (doc.fullscreenElement === fullscreenRef.current || doc.webkitFullscreenElement === fullscreenRef.current) {
            const exit = doc.exitFullscreen?.bind(doc) ?? doc.webkitExitFullscreen?.bind(doc);
            Promise.resolve(exit?.()).catch(() => {});
        }
        setExpanded(false);
        setUsingNativeFullscreen(false);
    }, []);

    const openFullscreen = useCallback(() => {
        setExpanded(true);
        const el = fullscreenRef.current;
        const request = el?.requestFullscreen?.bind(el) ?? el?.webkitRequestFullscreen?.bind(el);
        if (!request) {
            setUsingNativeFullscreen(false);
            return;
        }
        Promise.resolve(request())
            .then(() => setUsingNativeFullscreen(true))
            .catch(() => setUsingNativeFullscreen(false));
    }, []);

    // Escape always exits, whether native fullscreen engaged or not. Some
    // headless/automated browser contexts do not wire up the browser's own
    // native Escape-exits-fullscreen chrome gesture, so this does not rely
    // on that; it calls the same closeFullscreen() path explicitly.
    useEffect(() => {
        if (!expanded) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            closeFullscreen();
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [expanded, closeFullscreen]);

    // Fallback path only: when the browser has no usable Fullscreen API (or
    // it was denied), the component renders as a fixed-position dialog
    // instead. That path needs its own body scroll lock and Tab focus trap,
    // since the browser provides none of that for us; native fullscreen
    // needs neither.
    useEffect(() => {
        if (!expanded || usingNativeFullscreen) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeButtonRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Tab") return;
            const focusable = fullscreenRef.current?.querySelectorAll<HTMLElement>(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            if (!focusable || focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [expanded, usingNativeFullscreen]);

    // Focus the close control once native fullscreen actually engages.
    useEffect(() => {
        if (expanded && usingNativeFullscreen) closeButtonRef.current?.focus();
    }, [expanded, usingNativeFullscreen]);

    // Return focus to the trigger on collapse, but never on first mount.
    useEffect(() => {
        if (expanded) {
            wasExpandedRef.current = true;
        } else if (wasExpandedRef.current) {
            wasExpandedRef.current = false;
            triggerRef.current?.focus();
        }
    }, [expanded]);

    const isOverview = selectedStep === 0;

    const graphAndPanel = (
        <>
            <div className="orchard-header">
                <div className="orchard-header-text">
                    {/*
                      The page's own <h1> already carries this title; a second
                      heading with identical text would be a redundant stop
                      for screen reader users navigating by heading. It only
                      becomes a heading here in fullscreen, where the page's
                      <h1> is out of view and this is the only title on screen.
                    */}
                    {expanded ? (
                        <h2 className="orchard-title">{title}</h2>
                    ) : (
                        <p className="orchard-title">{title}</p>
                    )}
                    {category && <span className="orchard-category-badge">{category}</span>}
                </div>
                <button
                    aria-label={expanded ? "Exit fullscreen viewer" : "Open full-screen viewer"}
                    className="orchard-fullscreen-btn"
                    onClick={expanded ? closeFullscreen : openFullscreen}
                    ref={expanded ? closeButtonRef : triggerRef}
                    type="button"
                >
                    {expanded ? "✕ Exit fullscreen" : "⛶ Fullscreen"}
                </button>
            </div>

            <div className="orchard-step-indicator" aria-live="polite">
                {isOverview ? (
                    <span className="orchard-step-badge orchard-step-badge-overview">Overview</span>
                ) : (
                    <span className="orchard-step-badge">
                        Step {activeStep!.step} of {steps.length}: {activeStep!.label}
                    </span>
                )}
            </div>

            <div className="orchard-graph-scroll">
                <div className="orchard-graph-inner" ref={graphRef}>
                    <svg aria-hidden="true" className="orchard-edges" focusable="false">
                        <defs>
                            <marker id="orchard-arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4" viewBox="0 0 8 8">
                                <path className="orchard-edge-arrowhead" d="M0,0 L8,4 L0,8 Z" />
                            </marker>
                            <marker
                                id="orchard-arrow-pending"
                                markerHeight="8"
                                markerWidth="8"
                                orient="auto"
                                refX="7"
                                refY="4"
                                viewBox="0 0 8 8"
                            >
                                <path className="orchard-edge-arrowhead-pending" d="M0,0 L8,4 L0,8 Z" />
                            </marker>
                            <marker id="orchard-arrow-deny" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4" viewBox="0 0 8 8">
                                <path className="orchard-edge-arrowhead-deny" d="M0,0 L8,4 L0,8 Z" />
                            </marker>
                        </defs>
                        {edgeGeometry.map((edge) => {
                            const markerId = edge.pending ? "orchard-arrow-pending" : edge.variant === "deny" ? "orchard-arrow-deny" : "orchard-arrow";
                            const classNames = [
                                "orchard-edge",
                                edge.pending ? "orchard-edge-pending" : "",
                                edge.variant ? `orchard-edge-${edge.variant}` : "",
                            ]
                                .filter(Boolean)
                                .join(" ");
                            return (
                                <g className={classNames} key={edge.id}>
                                    <path d={edge.d} markerEnd={`url(#${markerId})`} />
                                    {edge.label && (
                                        <text className="orchard-edge-label" x={edge.labelX} y={edge.labelY}>
                                            {edge.label}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>

                    <div className="orchard-graph">
                        {orchardLaneOrder.map((lane, index) => (
                            <span
                                aria-hidden="true"
                                className="orchard-lane-title"
                                key={lane}
                                style={{ "--orchard-col": index + 1, "--orchard-row": 1 } as CSSProperties}
                            >
                                {orchardLaneTitles[lane]}
                            </span>
                        ))}
                        {orchardNodes.map((node) => (
                            <OrchardNodeCard
                                isActive={activeNodeId === node.id}
                                key={node.id}
                                node={node}
                                onSelect={selectNode}
                                registerNode={registerNode}
                                step={canonicalStepByNode.get(node.id)}
                            />
                        ))}
                    </div>
                </div>
            </div>

            <div aria-live="polite" className="orchard-step-description">
                {isOverview ? (
                    <p className="orchard-step-overview-text">
                        {steps.length} steps. Click a node in the diagram, or a step below, to walk through this
                        lifecycle.
                    </p>
                ) : (
                    <p className="orchard-step-text">{activeStep!.description}</p>
                )}
                {!isOverview && activeStep!.links && activeStep!.links.length > 0 && (
                    <ul aria-label={`Documentation for step ${activeStep!.step}`} className="orchard-step-links">
                        {activeStep!.links.map((link) => (
                            <li key={link.href}>
                                <span className={`orchard-step-link-kind orchard-step-link-kind-${link.kind}`}>
                                    {linkKindLabel[link.kind]}
                                </span>
                                <a
                                    href={link.href}
                                    rel={isExternalHref(link.href) ? "noreferrer" : undefined}
                                    target={isExternalHref(link.href) ? "_blank" : undefined}
                                >
                                    {link.label} {isExternalHref(link.href) ? "↗" : "→"}
                                </a>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <nav aria-label={`${title} steps`} className="orchard-step-list">
                <ol>
                    {steps.map((step) => (
                        <li key={step.step}>
                            <button
                                aria-current={selectedStep === step.step ? "step" : undefined}
                                className={`orchard-step-list-item ${selectedStep === step.step ? "active" : ""}`}
                                onClick={() => selectStep(step.step)}
                                type="button"
                            >
                                <span className="orchard-step-list-number">{step.step}</span>
                                <span className="orchard-step-list-label">{step.label}</span>
                            </button>
                        </li>
                    ))}
                </ol>
            </nav>
        </>
    );

    const diagramFigure = (
        <div
            aria-label={alt}
            aria-roledescription="flowchart"
            className={`orchard-lifecycle-diagram ${expanded ? "orchard-expanded" : ""}`}
            ref={fullscreenRef}
            role="figure"
        >
            {graphAndPanel}
        </div>
    );

    if (expanded && !usingNativeFullscreen) {
        // No usable Fullscreen API (or the browser denied the request): fall
        // back to the same fixed-position dialog pattern the site's other
        // diagrams use, so fullscreen still works everywhere.
        return (
            <div aria-label={`${title} — fullscreen viewer`} aria-modal="true" className="orchard-fallback-overlay" role="dialog">
                {diagramFigure}
            </div>
        );
    }

    return diagramFigure;
}

interface OrchardNodeCardProps {
    node: OrchardNodeMeta;
    step: DiagramStep | undefined;
    isActive: boolean;
    onSelect: (id: OrchardNodeId) => void;
    registerNode: (id: OrchardNodeId, element: HTMLElement | null) => void;
}

function OrchardNodeCard({ node, step, isActive, onSelect, registerNode }: OrchardNodeCardProps) {
    const label = step?.label ?? node.fallbackLabel ?? node.id;
    const style = { "--orchard-row": node.row, "--orchard-col": node.col } as CSSProperties;
    const classNames = [
        "orchard-node",
        `orchard-node-${node.kind}`,
        node.span ? "orchard-node-span" : "",
        node.pending ? "orchard-node-pending" : "",
        isActive ? "orchard-node-active" : "",
    ]
        .filter(Boolean)
        .join(" ");

    if (node.kind === "terminal") {
        const note = orchardTerminalNotes[node.id as "noAuthority1" | "rework"];
        return (
            <div className={classNames} ref={(el) => registerNode(node.id, el)} style={style}>
                <span className="orchard-node-kicker">{nodeKindKicker[node.kind]}</span>
                <span className="orchard-node-label">{label}</span>
                {note && <span className="orchard-node-note">{note}</span>}
            </div>
        );
    }

    return (
        <button
            aria-current={isActive ? "step" : undefined}
            aria-label={step ? `Step ${step.step}: ${label}` : label}
            className={classNames}
            onClick={() => onSelect(node.id)}
            ref={(el) => registerNode(node.id, el)}
            type="button"
        >
            <span className="orchard-node-kicker">{nodeKindKicker[node.kind]}</span>
            <span className="orchard-node-label">{label}</span>
            {node.pending && <span className="orchard-pending-badge">Designed, not built</span>}
        </button>
    );
}
