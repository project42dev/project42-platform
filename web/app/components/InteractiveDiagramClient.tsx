"use client";

import { type ComponentProps, Suspense, lazy } from "react";

const InteractiveDiagramLazy = lazy(
    () => import("./InteractiveDiagram/index").then((mod) => ({ default: mod.InteractiveDiagram })),
);

type InteractiveDiagramProps = ComponentProps<typeof InteractiveDiagramLazy>;

export function InteractiveDiagramClient(props: InteractiveDiagramProps) {
    return (
        <Suspense fallback={<div className="diagram-loading" aria-label="Loading interactive diagram…" />}>
            <InteractiveDiagramLazy {...props} />
        </Suspense>
    );
}
