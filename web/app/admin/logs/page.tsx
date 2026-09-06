import type { Metadata } from "next";
import { AdminDashboard } from "../../components/AccountDashboard";

export const metadata: Metadata = {
  title: "Privileged Audit Logs — Owner administration",
  description:
    "Inspect privileged audit logs, administrative actions, and verification evidence.",
};

export default function AdminLogsPage() {
  return (
    <main className="page-shell shell">
      <header className="page-hero profile-hero">
        <p className="eyebrow">Owner administration</p>
        <h1>Privileged Audit Logs</h1>
        <p>
          Inspect request-correlated administrative, state-change, and data-rights
          evidence events in chronological sequence.
        </p>
      </header>
      <AdminDashboard view="logs" />
    </main>
  );
}
