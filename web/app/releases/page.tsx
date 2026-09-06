import type { Metadata } from "next";
import releaseNotes from "../../config/release-notes.json";
import { siteFacts } from "../lib/siteFacts";
import { copy } from "../../lib/copy";

const text = copy.releases;

export const metadata: Metadata = {
  title: text.metaTitle,
  description: text.metaDescription,
};

// Compiled from CHANGELOG.md by scripts/generate-release-notes.mjs. The
// changelog stays the source of truth; a hand-maintained copy here would be a
// second place to update and a second place to be wrong.
export default function ReleasesPage() {
  const releases = releaseNotes.releases;

  return (
    <main className="page-shell shell">
      <header className="page-hero">
        <p className="eyebrow">{text.eyebrow}</p>
        <h1>{text.heading}</h1>
        <p>{text.lede}</p>
      </header>

      <dl className="version-fact-grid" aria-label={text.versionsLabel}>
        <div>
          <dt>{text.versions.site}</dt>
          <dd>v{siteFacts.siteVersion}</dd>
        </div>
        <div>
          <dt>{text.versions.platform}</dt>
          <dd>v{siteFacts.platformVersion}</dd>
        </div>
        <div>
          <dt>{text.versions.content}</dt>
          <dd>v{siteFacts.contentVersion}</dd>
        </div>
        <div>
          <dt>{text.versions.policy}</dt>
          <dd>{siteFacts.learnerDataPolicy.policyVersion}</dd>
        </div>
      </dl>

      <ol className="release-list">
        {releases.map((release) => (
          <li className="release-entry" key={release.version}>
            <div className="release-entry-head">
              <h2>v{release.version}</h2>
              {release.date ? (
                <time dateTime={release.date}>{release.date}</time>
              ) : (
                <span className="level-pill">{text.unreleased}</span>
              )}
            </div>
            <ul>
              {release.changes.map((change) => (
                <li key={change}>{change}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      <p className="page-foot-note">
        {text.footNote} <a href={siteFacts.repositories.site}>{text.siteRepoLink}</a> ·{" "}
        <a href={siteFacts.repositories.platform}>{text.platformRepoLink}</a>
      </p>
    </main>
  );
}
