import type { Metadata } from "next";
import Link from "next/link";
import { ProfileDashboard } from "../components/ProfileDashboard";
import { orgName } from "../../lib/copy";

export const metadata: Metadata = {
  title: "My progress",
  description: `Your ${orgName} learning progress, scores, badges, and transcript.`,
};

export default function ProfilePage() {
  return (
    <main className="page-shell shell">
      <header className="page-hero profile-hero">
        <p className="eyebrow">My progress</p>
        <h1>Your work, made visible.</h1>
        <p>
          Track completed modules, knowledge-check scores, and badges in your
          approved account across browsers and devices.
        </p>
        <div className="policy-link-row" aria-label="Progress policies">
          <Link className="text-link" href="/learner-data">
            How {orgName} protects learner data
          </Link>
          <Link
            className="text-link"
            href="/legal-transparency"
          >
            Service and legal expectations
          </Link>
        </div>
      </header>
      <ProfileDashboard />
    </main>
  );
}
