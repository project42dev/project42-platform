import type { Metadata } from "next";
import Link from "next/link";
import { siteFacts } from "../lib/siteFacts";
import { copy } from "../../lib/copy";

const text = copy.about;

export const metadata: Metadata = {
  title: text.metaTitle,
  description: text.metaDescription,
};

export default function AboutPage() {
  const openSourceBody = text.openSource.bodyTemplate
    .replace("{softwareLicense}", siteFacts.licenses.software.spdx)
    .replace("{curriculumLicense}", siteFacts.licenses.curriculum.spdx);

  return (
    <main className="page-shell shell">
      <header className="page-hero">
        <p className="eyebrow">{text.hero.eyebrow}</p>
        <h1>{text.hero.heading}</h1>
        <p>{text.hero.lede}</p>
      </header>

      <div className="about-grid">
        {text.principles.map((principle) => (
          <section key={principle.number}>
            <span className="about-number">{principle.number}</span>
            <h2>{principle.title}</h2>
            <p>{principle.body}</p>
          </section>
        ))}
      </div>

      <section className="release-facts" aria-labelledby="release-facts-title">
        <div className="release-facts-heading">
          <div>
            <p className="eyebrow">{text.facts.eyebrow}</p>
            <h2 id="release-facts-title">{text.facts.heading}</h2>
          </div>
          <p>{text.facts.summary}</p>
        </div>

        <dl className="version-fact-grid" aria-label={text.facts.versionsLabel}>
          <div>
            <dt>{text.facts.versions.site}</dt>
            <dd>v{siteFacts.siteVersion}</dd>
          </div>
          <div>
            <dt>{text.facts.versions.platform}</dt>
            <dd>v{siteFacts.platformVersion}</dd>
          </div>
          <div>
            <dt>{text.facts.versions.content}</dt>
            <dd>v{siteFacts.contentVersion}</dd>
          </div>
          <div>
            <dt>{text.facts.versions.policy}</dt>
            <dd>{siteFacts.learnerDataPolicy.policyVersion}</dd>
          </div>
        </dl>

        <dl className="catalog-fact-grid" aria-label={text.facts.countsLabel}>
          <div>
            <dt>{text.facts.counts.paths}</dt>
            <dd>{siteFacts.counts.learningPaths}</dd>
          </div>
          <div>
            <dt>{text.facts.counts.modules}</dt>
            <dd>{siteFacts.counts.assessedModules}</dd>
          </div>
          <div>
            <dt>{text.facts.counts.activities}</dt>
            <dd>{siteFacts.counts.evidenceActivities}</dd>
          </div>
          <div>
            <dt>{text.facts.counts.questions}</dt>
            <dd>{siteFacts.counts.reviewedQuestions}</dd>
          </div>
          {/*
            No "Practical resources" tile. Learn's count is legitimately 0
            because the references live under /guide, but rendering
            that reads as "this site has no practical resources", which is
            false: there are 83 of them on this same site. The fact stays in
            release-facts.json; it just is not a stat this site should display.
          */}
          <div>
            <dt>{text.facts.counts.providers}</dt>
            <dd>{siteFacts.counts.providerScopes}</dd>
          </div>
        </dl>

        <div className="provider-fact-section">
          <div>
            <p className="eyebrow">{text.facts.providerSection.eyebrow}</p>
            <h3>{text.facts.providerSection.heading}</h3>
            <p className="provider-fact-summary">
              {siteFacts.counts.providerImplementations}{" "}
              {text.facts.providerSection.summarySuffix}
            </p>
          </div>
          <ul aria-label={text.facts.providerSection.coverageLabel}>
            {siteFacts.providers.map((provider) => (
              <li key={provider.id}>
                <strong>{provider.name}</strong>
                <span>{provider.description}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="release-fact-links">
          <a href={siteFacts.licenses.software.url}>
            {text.facts.links.softwarePrefix} {siteFacts.licenses.software.label}
          </a>
          <a href={siteFacts.licenses.curriculum.url}>
            {text.facts.links.curriculumPrefix} {siteFacts.licenses.curriculum.label}
          </a>
          <a href={siteFacts.repositories.site}>{text.facts.links.site}</a>
          <a href={siteFacts.repositories.platform}>{text.facts.links.platform}</a>
          <a href={siteFacts.repositories.issues}>{text.facts.links.issues}</a>
        </div>
      </section>

      <section className="open-source-banner">
        <div>
          <p className="eyebrow">{text.openSource.eyebrow}</p>
          <h2>{text.openSource.heading}</h2>
          <p>{openSourceBody}</p>
        </div>
        <div className="button-row">
          <a className="button button-primary" href={siteFacts.repositories.platform}>
            {text.openSource.platformAction}
          </a>
          <Link className="button button-secondary" href="/learn">
            {text.openSource.learnAction}
          </Link>
        </div>
      </section>

      <section
        className="future-platform-banner"
        aria-labelledby="future-platform-title"
      >
        <div>
          <p className="eyebrow">{text.future.eyebrow}</p>
          <h2 id="future-platform-title">{text.future.heading}</h2>
          <p>{text.future.body}</p>
        </div>
        <aside aria-label={text.future.asideLabel}>
          <strong>{text.future.asideHeading}</strong>
          <p>{text.future.asideBody}</p>
        </aside>
      </section>
    </main>
  );
}
