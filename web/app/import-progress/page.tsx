import type { Metadata } from "next";
import Link from "next/link";
import { orgName } from "../../lib/copy";

export const metadata: Metadata = {
  title: "Progress migration complete",
  description:
    `Continue learning from the unified ${orgName} profile and account experience.`,
  robots: { index: false, follow: false },
};

export default function ImportProgressPage() {
  return (
    <main className="page-shell shell">
      <header className="page-hero">
        <p className="eyebrow">{orgName} account update</p>
        <h1>The separate-site progress transfer is no longer needed.</h1>
        <p>
          Learning and profile routes now share one {orgName} origin. Browser and
          approved account progress are handled directly by the unified portal.
        </p>
      </header>
      <section className="profile-card">
        <p>
          <Link href="/profile">Open your learner profile</Link> or{" "}
          <Link href="/account">sign in</Link> to continue your account-backed
          learning record.
        </p>
      </section>
    </main>
  );
}
