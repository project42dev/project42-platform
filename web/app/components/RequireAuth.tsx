"use client";

import { usePathname } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { headerAccountPresentation } from "../lib/headerAccountPresentation";

/**
 * Client-side auth guard for routes that require a signed-in account.
 *
 * There are three answers here, not two, and the difference is the whole
 * defect this guard used to cause. The session lives in an HttpOnly cookie no
 * script can read, so the only way to know is to ask the account service. If
 * that question has not been answered yet -- or could not be answered -- the
 * page does not know whether the reader is signed in.
 *
 * It used to treat "could not be answered" as "signed out" and call signIn()
 * from an effect. signIn() replaces the document with /v1/auth/start, and the
 * authorization request carries prompt=login and max_age=0, so the identity
 * provider re-authenticates from scratch every time. One failed GET
 * /v1/auth/session on /account, /profile or /learner-data therefore threw the
 * reader at a full credential prompt with no action on their part and no
 * explanation -- while their session cookie sat there, still valid. That is
 * exactly the reported "I have to sign in again every time I open the site",
 * and it needed nothing more than a flaky connection or one bad minute at the
 * edge to happen.
 *
 * Now:
 * - signed-in            → renders children
 * - signed-out           → redirects to sign-in, returning to this path
 * - unknown (loading)    → renders nothing; the read will resolve
 * - unknown (error)      → says so, and offers a retry that re-reads the
 *                          session instead of destroying it
 */
export function RequireAuth({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const { configured, status, account, error, signIn, refreshAccount } = useAuth();
    const presentation = headerAccountPresentation(status, account);

    useEffect(() => {
        if (!configured) return;
        // Only a settled "there is no session" may start a sign-in. An
        // unresolved or failed read must never do it on the reader's behalf.
        if (presentation !== "signed-out") return;
        void signIn(pathname);
    }, [configured, presentation, signIn, pathname]);

    if (!configured || presentation === "signed-in") {
        return presentation === "signed-in" ? <>{children}</> : null;
    }

    if (presentation === "unknown" && status === "error") {
        return (
            <section className="auth-callback auth-recovery" role="status">
                <h1>We could not check your sign-in</h1>
                <p>
                    {error ??
                        "The account service could not be reached. Your sign-in was not cleared."}
                </p>
                <p>
                    You are probably still signed in — this page just could not confirm
                    it. Try again before signing in from scratch.
                </p>
                <p className="auth-recovery-actions">
                    <button onClick={() => void refreshAccount()} type="button">
                        Try again
                    </button>
                    <button onClick={() => void signIn(pathname)} type="button">
                        Sign in again
                    </button>
                </p>
            </section>
        );
    }

    // Loading, signing in, or already on the way to the provider.
    return null;
}
