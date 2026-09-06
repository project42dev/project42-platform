import type { Metadata } from "next";
import Link from "next/link";
import { orgName } from "../../lib/copy";

export const metadata: Metadata = {
  title: "Progress transfer retired",
  description: "The previous browser progress transfer is no longer supported.",
  robots: { index: false, follow: false },
};

export default function TransferProgressPage() {
  return (
    <main className="page-shell shell">
      <header className="page-hero">
        <p className="eyebrow">{orgName} account update</p>
        <h1>The previous progress transfer has been retired.</h1>
        <p>
          {orgName} now uses approved learner accounts for progress, scores, badges,
          and transcripts. The former browser record cannot be imported.
        </p>
      </header>
      <section className="profile-card">
        <p>
          <Link href="/account">Sign in to {orgName} Learn</Link>{" "}
          to start or continue an account-backed learning record.
        </p>
      </section>
    </main>
  );
}
