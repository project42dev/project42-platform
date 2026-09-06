"use client";

import { RequireAuth } from "../components/RequireAuth";

export default function ImportProgressLayout({ children }: { children: React.ReactNode }) {
    return <RequireAuth>{children}</RequireAuth>;
}
