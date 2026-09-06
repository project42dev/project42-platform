import type { Metadata } from "next";
import { AdminDashboard } from "../components/AccountDashboard";
import { orgName } from "../../lib/copy";

export const metadata: Metadata = {
  title: `${orgName} administration — Owner administration`,
  description:
    "Review registrations, enforce account states, manage approved-domain policy, and complete eligible deletion requests.",
};

export default function AdminPage() {
  return (
    <main className="page-shell shell">
      <header className="page-hero profile-hero">
        <p className="eyebrow">Owner administration</p>
        <h1>{orgName} administration</h1>
        <p>
          Review learner registration queue, approve pending accounts, manage
          exact-domain policy, and process deletion requests.
        </p>
      </header>
      <AdminDashboard view="accounts" />
    </main>
  );
}
