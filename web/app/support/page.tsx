import type { Metadata } from "next";
import Link from "next/link";
import { siteFacts } from "../lib/siteFacts";
import { copy } from "../../lib/copy";

const text = copy.support;

export const metadata: Metadata = {
  title: text.metaTitle,
  description: text.metaDescription,
};

export default function SupportPage() {
  const policyBody = text.policy.bodyTemplate
    .replace("{softwareLicense}", siteFacts.licenses.software.spdx)
    .replace("{curriculumLicense}", siteFacts.licenses.curriculum.spdx);

  return (
    <main className="page-shell shell support-page">
      <header className="page-hero">
        <p className="eyebrow">{text.hero.eyebrow}</p>
        <h1>{text.hero.heading}</h1>
        <p>{text.hero.lede}</p>
      </header>

      <div className="support-grid">
        {text.options.map((option) => (
          <article className="support-card" key={option.index}>
            <span className="support-index" aria-hidden="true">{option.index}</span>
            <div>
              <h2>{option.title}</h2>
              <p>{option.description}</p>
            </div>
            {option.external === "true" ? (
              <a className="button button-secondary" href={option.href} rel="noopener noreferrer" target="_blank">
                {option.label} <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <Link className="button button-secondary" href={option.href}>{option.label}</Link>
            )}
          </article>
        ))}
      </div>

      <section className="support-policy" aria-labelledby="support-policy-title">
        <div>
          <p className="eyebrow">{text.policy.eyebrow}</p>
          <h2 id="support-policy-title">{text.policy.heading}</h2>
          <p>{policyBody}</p>
        </div>
        <nav aria-label={text.policy.navLabel}>
          <Link className="text-link" href="/legal-transparency">{text.policy.legal}</Link>
          <Link className="text-link" href="/roadmap">{text.policy.roadmap}</Link>
          <Link className="text-link" href="/releases">{text.policy.releases}</Link>
        </nav>
      </section>
    </main>
  );
}
