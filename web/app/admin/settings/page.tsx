import type { Metadata } from "next";
import { AdminDashboard } from "../../components/AccountDashboard";

export const metadata: Metadata = {
  title: "Security settings — Owner administration",
  description:
    "Review the fixed console presentation and tenant security policy.",
};

export default function AdminSettingsPage() {
  return (
    <main className="page-shell shell">
      <header className="page-hero profile-hero">
        <p className="eyebrow">Owner administration</p>
        <h1>Console security settings</h1>
        <p>
          Review the fixed operational presentation and tenant security policy.
        </p>
      </header>
      <AdminDashboard view="settings" />
    </main>
  );
}
