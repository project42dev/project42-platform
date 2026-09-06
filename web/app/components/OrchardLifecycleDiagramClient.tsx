"use client";

import { type ComponentProps, Suspense, lazy } from "react";

const OrchardLifecycleDiagramLazy = lazy(
    () => import("./OrchardLifecycleDiagram/index").then((mod) => ({ default: mod.OrchardLifecycleDiagram })),
);

type OrchardLifecycleDiagramProps = ComponentProps<typeof OrchardLifecycleDiagramLazy>;

export function OrchardLifecycleDiagramClient(props: OrchardLifecycleDiagramProps) {
    return (
        <Suspense fallback={<div aria-label="Loading interactive diagram…" className="diagram-loading" />}>
            <OrchardLifecycleDiagramLazy {...props} />
        </Suspense>
    );
}
