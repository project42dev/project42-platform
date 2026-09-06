"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";

/** A documentation link attached to a diagram step */
export interface DiagramStepLink {
    /** Link text */
    label: string;
    /** Destination URL */
    href: string;
    /** What kind of documentation this points to */
    kind: "design" | "runbook" | "adr" | "reference";
}

export interface DiagramStep {
    /** 1-based step number */
    step: number;
    /** Label shown in the step indicator */
    label: string;
    /** Explanatory text for this step */
    description: string;
    /**
     * Optional identifier that ties this step to a region of the SVG.
     * Matched against the Mermaid node id embedded in the generated SVG
     * (rendered as `...-flowchart-<highlightClass>-<index>`). When at
     * least one step in a diagram declares this, the diagram renders the
     * SVG inline and makes the matching region clickable and focusable.
     */
    highlightClass?: string;
    /** Optional links to design or operational documentation for this step */
    links?: DiagramStepLink[];
}

const linkKindLabel: Record<DiagramStepLink["kind"], string> = {
    design: "Design doc",
    runbook: "Runbook",
    adr: "ADR",
    reference: "Reference",
};

function isExternalHref(href: string) {
    return /^https?:\/\//i.test(href);
}

/**
 * The inlined, clickable SVG. Isolated in its own memoized component so that
 * step navigation (which changes props like the active step's label
 * elsewhere in the tree) never touches this element's own props, and the
 * injected markup, along with the click and keyboard handlers wired onto it,
 * survives every step change untouched.
 */
const InlineDiagramSvg = memo(function InlineDiagramSvg({
    className,
    hostRef,
    markup,
}: {
    className: string;
    hostRef: React.RefObject<HTMLDivElement | null>;
    markup: string;
}) {
    return (
        // No role="img" here: this element has focusable, interactive
        // descendants (the wired step regions), and role="img" requires
        // browsers to flatten and ignore descendant semantics, which would
        // make those regions unreachable to assistive technology. The
        // embedded SVG carries its own <title>/<desc>, and the outer figure
        // and live step indicator already give the overall diagram context.
        <div
            className={className}
            dangerouslySetInnerHTML={{ __html: markup }}
            ref={hostRef}
        />
    );
});

export interface InteractiveDiagramProps {
    /** Diagram title */
    title: string;
    /** Alt text for the full diagram */
    alt: string;
    /** SVG source URL */
    src: string;
    /** Natural dimensions */
    width: number;
    height: number;
    /** Step-through data */
    steps: DiagramStep[];
    /** Optional category badge */
    category?: string;
}

const minimumZoom = 100;
const maximumZoom = 400;
const zoomStep = 25;

/** Shared spring config for step transitions — snappy but not jarring */
const stepSpring = { type: "spring" as const, stiffness: 300, damping: 30 };

/** Fade + slide-up variants for step descriptions */
const descriptionVariants = {
    enter: { opacity: 0, y: 12 },
    center: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
};

/** Fade + slight scale for SVG container on step change */
const svgVariants = {
    enter: { opacity: 0, scale: 0.98 },
    center: { opacity: 1, scale: 1 },
};

export function InteractiveDiagram({
    title,
    alt,
    src,
    width,
    height,
    steps,
    category,
}: InteractiveDiagramProps) {
    const [currentStep, setCurrentStep] = useState(0); // 0 = overview
    const [zoom, setZoom] = useState(minimumZoom);
    const [fullscreen, setFullscreen] = useState(false);
    const [autoPlay, setAutoPlay] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Respect prefers-reduced-motion via useSyncExternalStore (no setState in effect)
    const reducedMotion = useSyncExternalStore(
        (onStoreChange) => {
            const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
            mq.addEventListener("change", onStoreChange);
            return () => mq.removeEventListener("change", onStoreChange);
        },
        () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    );

    // Auto-play: advance every 5 seconds, stop at end
    useEffect(() => {
        if (!autoPlay) {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current);
            return;
        }
        autoPlayRef.current = setInterval(() => {
            setCurrentStep((s) => {
                if (s >= steps.length) {
                    setAutoPlay(false);
                    return s;
                }
                return s + 1;
            });
        }, 5000);
        return () => {
            if (autoPlayRef.current) clearInterval(autoPlayRef.current);
        };
    }, [autoPlay, steps.length]);

    // Fullscreen management
    useEffect(() => {
        if (!fullscreen) {
            // Restore focus to the fullscreen trigger button outside the overlay.
            // The overlay's button is being unmounted; find the page-level one.
            const trigger = document.querySelector<HTMLButtonElement>(
                '[data-fullscreen-trigger]',
            );
            trigger?.focus();
            return;
        }
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        closeRef.current?.focus();

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setFullscreen(false);
                return;
            }
            if (event.key === "+" || event.key === "=") {
                event.preventDefault();
                setZoom((z) => Math.min(maximumZoom, z + zoomStep));
                return;
            }
            if (event.key === "-") {
                event.preventDefault();
                setZoom((z) => Math.max(minimumZoom, z - zoomStep));
                return;
            }
            if (event.key === "ArrowRight") {
                event.preventDefault();
                setCurrentStep((s) => Math.min(steps.length, s + 1));
                return;
            }
            if (event.key === "ArrowLeft") {
                event.preventDefault();
                setCurrentStep((s) => Math.max(0, s - 1));
                return;
            }
            // Focus trap
            if (event.key === "Tab") {
                const focusable = containerRef.current?.querySelectorAll<HTMLElement>(
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
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [fullscreen, steps.length]);

    const goToStep = useCallback((step: number) => {
        setAutoPlay(false);
        setCurrentStep(Math.max(0, Math.min(steps.length, step)));
    }, [steps.length]);

    const isOverview = currentStep === 0;
    const activeStep = isOverview ? null : steps[currentStep - 1];
    const canGoPrev = currentStep > 0;
    const canGoNext = currentStep < steps.length;
    const progressPercent = steps.length > 0 ? (currentStep / steps.length) * 100 : 0;

    // A diagram opts into clickable SVG regions by giving at least one step
    // a highlightClass. The 8 diagrams without any highlightClass keep
    // rendering as a plain <img>, unchanged.
    const hasHighlightableSteps = useMemo(
        () => steps.some((step) => Boolean(step.highlightClass)),
        [steps],
    );
    const svgHostRef = useRef<HTMLDivElement>(null);
    const [fetchedSvgMarkup, setFetchedSvgMarkup] = useState<string | null>(null);
    // Only ever inline the fetched markup when this diagram actually declares
    // highlightable steps, so a stray fetch can never surface on a diagram
    // that has not opted in.
    const inlineSvgMarkup = hasHighlightableSteps ? fetchedSvgMarkup : null;

    // Fetch and inline the SVG only when a step needs a clickable region.
    // The markup comes from our own generated, sanitized diagram artifacts.
    useEffect(() => {
        if (!hasHighlightableSteps) return;
        let cancelled = false;
        fetch(src)
            .then((response) => {
                if (!response.ok) throw new Error(`Failed to load ${src}`);
                return response.text();
            })
            .then((markup) => {
                if (!cancelled) setFetchedSvgMarkup(markup);
            })
            .catch(() => {
                if (!cancelled) setFetchedSvgMarkup(null);
            });
        return () => {
            cancelled = true;
        };
    }, [src, hasHighlightableSteps]);

    // Wire each highlightable step to its matching SVG region: clickable,
    // keyboard-operable, and labeled for assistive technology.
    useEffect(() => {
        const host = svgHostRef.current;
        if (!host || !inlineSvgMarkup) return;

        const svgEl = host.querySelector("svg");
        if (svgEl) {
            svgEl.removeAttribute("width");
            svgEl.removeAttribute("height");
            svgEl.style.width = "100%";
            svgEl.style.height = "auto";
            svgEl.style.display = "block";
        }

        // Multiple steps can share one highlightClass when they describe the
        // same shared region from different angles (for example, three
        // intake paths all converging on one gate node). The region can only
        // navigate to one place, so it targets the first step that claims it;
        // every step, shared or not, is still reachable from the step list.
        const canonicalStepByRegion = new Map<string, DiagramStep>();
        for (const step of steps) {
            if (!step.highlightClass || !/^[A-Za-z0-9_-]+$/.test(step.highlightClass)) continue;
            if (!canonicalStepByRegion.has(step.highlightClass)) {
                canonicalStepByRegion.set(step.highlightClass, step);
            }
        }

        const cleanups: Array<() => void> = [];
        for (const [highlightClass, step] of canonicalStepByRegion) {
            const matches = host.querySelectorAll<SVGGElement>(
                `[id*="flowchart-${highlightClass}-"]`,
            );
            matches.forEach((node) => {
                node.classList.add("diagram-svg-hotspot");
                node.setAttribute("tabindex", "0");
                node.setAttribute("role", "button");
                node.setAttribute("aria-label", `Jump to step ${step.step}: ${step.label}`);

                const handleActivate = (event: Event) => {
                    event.preventDefault();
                    goToStep(step.step);
                };
                const handleKeyDown = (event: KeyboardEvent) => {
                    if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        goToStep(step.step);
                    }
                };
                node.addEventListener("click", handleActivate);
                node.addEventListener("keydown", handleKeyDown);
                cleanups.push(() => {
                    node.removeEventListener("click", handleActivate);
                    node.removeEventListener("keydown", handleKeyDown);
                });
            });
        }
        return () => {
            cleanups.forEach((cleanup) => cleanup());
        };
    }, [inlineSvgMarkup, steps, goToStep]);

    // Reflect the current step as an active highlight on its SVG region.
    useEffect(() => {
        const host = svgHostRef.current;
        if (!host || !inlineSvgMarkup) return;
        host
            .querySelectorAll(".diagram-svg-hotspot-active")
            .forEach((node) => node.classList.remove("diagram-svg-hotspot-active"));
        const highlightClass = activeStep?.highlightClass;
        if (highlightClass && /^[A-Za-z0-9_-]+$/.test(highlightClass)) {
            host
                .querySelectorAll(`[id*="flowchart-${highlightClass}-"]`)
                .forEach((node) => node.classList.add("diagram-svg-hotspot-active"));
        }
    }, [currentStep, inlineSvgMarkup, activeStep]);

    const diagramContent = (
        <div
            className="interactive-diagram"
            role="figure"
            aria-label={alt}
        >
            {/* Step indicator with progress bar */}
            <div className="diagram-step-indicator" aria-live="polite">
                <div className="diagram-step-header">
                    {isOverview ? (
                        <span className="step-badge overview">Overview</span>
                    ) : (
                        <span className="step-badge">
                            Step {activeStep!.step} of {steps.length}: {activeStep!.label}
                        </span>
                    )}
                    {steps.length > 1 && (
                        <button
                            aria-label={autoPlay ? "Pause auto-play" : "Start auto-play"}
                            className={`diagram-autoplay-btn ${autoPlay ? "active" : ""}`}
                            onClick={() => setAutoPlay((p) => !p)}
                            type="button"
                            title={autoPlay ? "Pause auto-play" : "Auto-play through steps"}
                        >
                            {autoPlay ? "⏸" : "▶"}
                        </button>
                    )}
                </div>
                {/* Progress bar */}
                <div className="diagram-progress-track" role="progressbar" aria-valuenow={currentStep} aria-valuemin={0} aria-valuemax={steps.length} aria-label={`Step ${currentStep} of ${steps.length}`}>
                    <motion.div
                        className="diagram-progress-fill"
                        animate={reducedMotion ? {} : { width: `${progressPercent}%` }}
                        transition={stepSpring}
                    />
                </div>
            </div>

            {/* SVG with step-based highlights */}
            <motion.div
                // Diagrams with clickable regions keep one persistent instance so
                // the wired click handlers and focus state survive step changes;
                // the highlighted region itself is the step-change cue. Diagrams
                // without clickable regions keep the original per-step remount,
                // which replays the entrance transition as its step-change cue.
                key={hasHighlightableSteps ? "svg-inline" : `svg-${currentStep}`}
                className="diagram-svg-container"
                tabIndex={0}
                variants={reducedMotion ? {} : svgVariants}
                initial="enter"
                animate="center"
                transition={stepSpring}
                style={{
                    width: `${(width * zoom) / 100}px`,
                    overflow: "auto",
                }}
            >
                {hasHighlightableSteps && inlineSvgMarkup ? (
                    // This diagram is generated and safety-checked by our own build
                    // pipeline (see scripts/generate-diagrams.mjs). Inlining it is what
                    // lets an individual region become clickable and focusable. The
                    // accessible name lives on the outer figure and the live step
                    // indicator, not here, so step navigation never touches this
                    // element's props and never disturbs the wired regions.
                    <InlineDiagramSvg
                        className={`diagram-svg diagram-svg-inline ${reducedMotion ? "no-transition" : ""}`}
                        hostRef={svgHostRef}
                        markup={inlineSvgMarkup}
                    />
                ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        alt={isOverview ? alt : `${alt}, ${activeStep!.label}`}
                        className={`diagram-svg ${reducedMotion ? "no-transition" : ""}`}
                        height={(height * zoom) / 100}
                        src={src}
                        style={{ width: `${(width * zoom) / 100}px`, height: "auto" }}
                        width={(width * zoom) / 100}
                    />
                )}
            </motion.div>

            {/* Step description with animated transitions */}
            <div className="diagram-step-description" aria-live="polite">
                <AnimatePresence mode="wait">
                    {isOverview ? (
                        <motion.p
                            key="overview"
                            className="step-overview-text"
                            variants={reducedMotion ? {} : descriptionVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={stepSpring}
                        >
                            {steps.length} steps. Use the controls below, or click a step, to walk through this diagram.
                        </motion.p>
                    ) : (
                        <motion.p
                            key={`step-${activeStep!.step}`}
                            className="step-text"
                            variants={reducedMotion ? {} : descriptionVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={stepSpring}
                        >
                            {activeStep!.description}
                        </motion.p>
                    )}
                </AnimatePresence>
                {!isOverview && activeStep!.links && activeStep!.links.length > 0 && (
                    <ul aria-label={`Documentation for step ${activeStep!.step}`} className="diagram-step-links">
                        {activeStep!.links.map((link) => (
                            <li key={link.href}>
                                <span className={`diagram-step-link-kind diagram-step-link-kind-${link.kind}`}>
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

            {/* Step list: every step, clickable, for direct navigation */}
            {steps.length > 1 && (
                <nav aria-label={`${title} steps`} className="diagram-step-list">
                    <ol>
                        {steps.map((step) => (
                            <li key={step.step}>
                                <button
                                    aria-current={currentStep === step.step ? "step" : undefined}
                                    className={`diagram-step-list-item ${currentStep === step.step ? "active" : ""}`}
                                    onClick={() => goToStep(step.step)}
                                    type="button"
                                >
                                    <span className="diagram-step-list-number">{step.step}</span>
                                    <span className="diagram-step-list-label">{step.label}</span>
                                </button>
                            </li>
                        ))}
                    </ol>
                </nav>
            )}

            {/* Controls */}
            <DiagramControls
                autoPlay={autoPlay}
                canGoNext={canGoNext}
                canGoPrev={canGoPrev}
                currentStep={currentStep}
                onAutoPlay={() => setAutoPlay((p) => !p)}
                onFullscreen={() => setFullscreen(true)}
                onGoToStep={goToStep}
                onZoomIn={() => setZoom((z) => Math.min(maximumZoom, z + zoomStep))}
                onZoomOut={() => setZoom((z) => Math.max(minimumZoom, z - zoomStep))}
                onZoomReset={() => setZoom(minimumZoom)}
                steps={steps}
                triggerRef={triggerRef}
                zoom={zoom}
            />
        </div>
    );

    return (
        <>
            {diagramContent}

            {/* Fullscreen overlay */}
            <AnimatePresence>
                {fullscreen && (
                    <motion.div
                        aria-label={`${title} — fullscreen viewer`}
                        aria-modal="true"
                        className="diagram-fullscreen-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: reducedMotion ? 0 : 0.2 }}
                        ref={containerRef}
                        role="dialog"
                    >
                        <div className="diagram-fullscreen-header">
                            <h2 className="diagram-fullscreen-title">{title}</h2>
                            {category && <span className="diagram-category-badge">{category}</span>}
                            <button
                                aria-label="Close fullscreen viewer"
                                className="diagram-fullscreen-close"
                                onClick={() => setFullscreen(false)}
                                ref={closeRef}
                                type="button"
                            >
                                ✕
                            </button>
                        </div>
                        {diagramContent}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

interface DiagramControlsProps {
    autoPlay: boolean;
    canGoNext: boolean;
    canGoPrev: boolean;
    currentStep: number;
    onAutoPlay: () => void;
    onFullscreen: () => void;
    onGoToStep: (step: number) => void;
    onZoomIn: () => void;
    onZoomOut: () => void;
    onZoomReset: () => void;
    steps: DiagramStep[];
    triggerRef: React.RefObject<HTMLButtonElement | null>;
    zoom: number;
}

function DiagramControls({
    autoPlay,
    canGoNext,
    canGoPrev,
    currentStep,
    onAutoPlay,
    onFullscreen,
    onGoToStep,
    onZoomIn,
    onZoomOut,
    onZoomReset,
    steps,
    triggerRef,
    zoom,
}: DiagramControlsProps) {
    return (
        <div className="diagram-controls" role="toolbar" aria-label="Diagram controls">
            {/* Step navigation */}
            <div className="diagram-step-nav">
                <button
                    aria-label="Previous step"
                    className="diagram-btn"
                    disabled={!canGoPrev}
                    onClick={() => onGoToStep(currentStep - 1)}
                    type="button"
                >
                    ← Prev
                </button>

                <div className="diagram-step-dots">
                    <button
                        aria-current={currentStep === 0 ? "step" : undefined}
                        aria-label="Overview"
                        className={`step-dot ${currentStep === 0 ? "active" : ""}`}
                        onClick={() => onGoToStep(0)}
                        type="button"
                    />
                    {steps.map((step) => (
                        <button
                            aria-current={currentStep === step.step ? "step" : undefined}
                            aria-label={`Step ${step.step}: ${step.label}`}
                            className={`step-dot ${currentStep === step.step ? "active" : ""}`}
                            key={step.step}
                            onClick={() => onGoToStep(step.step)}
                            type="button"
                        />
                    ))}
                </div>

                <button
                    aria-label="Next step"
                    className="diagram-btn"
                    disabled={!canGoNext}
                    onClick={() => onGoToStep(currentStep + 1)}
                    type="button"
                >
                    Next →
                </button>
            </div>

            {/* Zoom + fullscreen */}
            <div className="diagram-zoom-controls">
                <button
                    aria-label="Zoom out"
                    className="diagram-btn diagram-btn-icon"
                    disabled={zoom <= 100}
                    onClick={onZoomOut}
                    type="button"
                >
                    −
                </button>
                <button
                    aria-label={`Reset zoom to 100% (currently ${zoom}%)`}
                    className="diagram-btn diagram-btn-zoom"
                    onClick={onZoomReset}
                    type="button"
                >
                    {zoom}%
                </button>
                <button
                    aria-label="Zoom in"
                    className="diagram-btn diagram-btn-icon"
                    disabled={zoom >= 400}
                    onClick={onZoomIn}
                    type="button"
                >
                    +
                </button>
                <button
                    aria-label={autoPlay ? "Pause auto-play" : "Start auto-play"}
                    className={`diagram-btn diagram-btn-icon ${autoPlay ? "autoplay-active" : ""}`}
                    onClick={onAutoPlay}
                    type="button"
                    title={autoPlay ? "Pause auto-play" : "Auto-play through steps"}
                >
                    {autoPlay ? "⏸" : "▶"}
                </button>
                <button
                    aria-label="Open full-screen viewer"
                    className="diagram-btn diagram-btn-icon"
                    data-fullscreen-trigger=""
                    onClick={onFullscreen}
                    ref={triggerRef}
                    type="button"
                >
                    ⛶
                </button>
            </div>
        </div>
    );
}
