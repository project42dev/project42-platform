"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";

/**
 * Client-side auth guard for routes that require a signed-in account.
 *
 * While the session is loading this renders nothing (the auth check completes
 * in a single effect tick).  Once the session is known:
 * - signed-in → renders children
 * - signed-out or error → redirects to sign-in with the current path as the
 *   return URL, so the learner lands back on the page they were trying to
 *   reach rather than a dashboard.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { configured, status, signIn } = useAuth();

    useEffect(() => {
        if (!configured) return;
        if (status === "loading" || status === "signing-in") return;
        if (status === "signed-in") return;

        // signed-out, error, or unavailable — send to sign-in
        void signIn(pathname);
    }, [configured, status, signIn, pathname]);

    // While loading or signing in, render nothing.  The redirect in the effect
    // above will navigate away for unauthenticated users; authenticated users
    // will see children on the next render after status flips to signed-in.
    if (!configured || status === "loading" || status === "signing-in") {
        return null;
    }

    if (status !== "signed-in") {
        return null;
    }

    return <>{children}</>;
}
