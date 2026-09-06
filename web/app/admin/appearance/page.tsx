import Link from "next/link";

export default function AdminAppearancePage() {
  return (
    <main className="page-shell shell">
      <header className="page-hero profile-hero">
        <p className="eyebrow">Owner administration</p>
        <h1>Fixed operational appearance</h1>
        <p>
          The Admin Portal always uses its high-contrast control theme. Public learner
          themes cannot be selected, imported, or applied here.
        </p>
      </header>
      <section className="profile-card">
        <h2>Theme boundary</h2>
        <p>
          Preview public themes in the standalone Gallery. Apply the selected learner
          theme through the public portal configuration, not the Admin Portal.
        </p>
        <Link className="button button-secondary" href="/admin/settings">
          Review security settings
        </Link>
      </section>
    </main>
  );
}
