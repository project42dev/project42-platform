import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found shell">
      <p className="eyebrow">404 / Off the map</p>
      <h1>This path has not been charted.</h1>
      <p>Return to the academy or search the field guide for another route.</p>
      <div className="button-row">
        <Link className="button button-primary" href="/learn/paths">
          Learning paths
        </Link>
        <Link className="button button-secondary" href="/guide">
          Field guide
        </Link>
      </div>
    </main>
  );
}
