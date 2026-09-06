import type { Metadata } from "next";
import Link from "next/link";
import {
  AccountDashboard,
  DeletionStatusLookup,
} from "../components/AccountDashboard";
import { orgName } from "../../lib/copy";

export const metadata: Metadata = {
  title: "My account",
  description:
    `${orgName} profile, approval status, and owner administration.`,
};

export default function AccountPage() {
  return (
    <main className="page-shell shell">
      <header className="page-hero profile-hero">
        <p className="eyebrow">Account and access</p>
        <h1>One learning record. Your account.</h1>
        <p>
          Manage your profile and sign-in identity while keeping progress
          available across browsers and devices.
        </p>
        <div className="policy-link-row" aria-label="Account policies">
          <Link className="text-link" href="/learner-data">
            Learner data and controls
          </Link>
          <Link
            className="text-link"
            href="/legal-transparency"
          >
            Legal &amp; Transparency
          </Link>
        </div>
      </header>
      <AccountDashboard />
      <DeletionStatusLookup />
    </main>
  );
}
