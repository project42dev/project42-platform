import type { Metadata } from "next";
import Link from "next/link";
import { orgName } from "../../lib/copy";

export const metadata: Metadata = {
  title: "Offline",
  description:
    "You are offline. Pages you have already opened remain available; the rest return when your connection does.",
  robots: { index: false, follow: false },
};

// Served by the service worker when a navigation fails and nothing matching is
// in the cache. It is a normal exported route, so the worker caches it on
// install like any other page and it inherits the configured theme and layout
// -- there is no separate offline bundle to keep in step with the design system.
export default function OfflinePage() {
  return (
    <main className="page-shell shell">
      <header className="page-hero">
        <p className="eyebrow">No connection</p>
        <h1>You are offline</h1>
        <p>
          {orgName} could not reach the network. Anything you have already
          opened on this device stays available, and progress saved locally is
          kept until a connection returns.
        </p>
      </header>
      <p>
        <Link className="btn-primary" href="/">
          Go to the home page
        </Link>{" "}
        <Link className="btn-secondary" href="/learn">
          Open the learning paths
        </Link>
      </p>
    </main>
  );
}
