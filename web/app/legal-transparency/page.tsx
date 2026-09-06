import type { Metadata } from "next";
import Link from "next/link";
import { siteFacts } from "../lib/siteFacts";
import { copy } from "../../lib/copy";
import { RichText } from "../components/RichText";

const legal = copy.legal;
const legalVersion = legal.version;

// Anchors and destinations are structure, not prose: the copy layer supplies
// the labels, the page keeps the targets.
const tocAnchors = [
  "#legal-review-title",
  "#people-title",
  "#licenses-title",
  "#service-title",
  "#third-party-title",
  "#account-title",
  "#acceptable-use-title",
  "#warranty-title",
  "#history-title",
];

const referenceLinks = [
  "https://www.apache.org/licenses/LICENSE-2.0",
  "https://creativecommons.org/licenses/by/4.0/legalcode.en",
  "https://www.copyright.gov/ai/",
  "https://www.ftc.gov/policy/advocacy-research/tech-at-ftc/2024/01/ai-companies-uphold-your-privacy-confidentiality-commitments",
];

export const metadata: Metadata = {
  title: legal.metaTitle,
  description: legal.metaDescription,
};

export default function LegalTransparencyPage() {
  return (
    <main className="page-shell shell legal-page">
      <header className="page-hero legal-hero">
        <p className="eyebrow">{legal.hero.eyebrow}</p>
        <h1>{legal.hero.heading}</h1>
        <p>{legal.hero.lede}</p>
      </header>

      <nav aria-labelledby="legal-contents-title" className="legal-toc">
        <div>
          <p className="eyebrow">{legal.toc.eyebrow}</p>
          <h2 id="legal-contents-title">{legal.toc.heading}</h2>
        </div>
        <ol>
          {legal.toc.items.map((item, index) => (
            <li key={item}>
              <a href={tocAnchors[index] ?? "#"}>{item}</a>
            </li>
          ))}
        </ol>
      </nav>

      <aside
        aria-labelledby="legal-review-title"
        className="legal-review-notice"
        role="note"
      >
        <div>
          <p className="eyebrow">{legal.review.eyebrow}</p>
          <h2 id="legal-review-title" tabIndex={-1}>
            {legal.review.heading}
          </h2>
          <p>{legal.review.body}</p>
        </div>
        <dl>
          <div>
            <dt>{legal.review.versionLabel}</dt>
            <dd>
              {legalVersion}
              <br />
              <span>{legal.review.versionNote}</span>
            </dd>
          </div>
          <div>
            <dt>{legal.review.effectiveLabel}</dt>
            <dd>{legal.review.effectiveValue}</dd>
          </div>
          <div>
            <dt>{legal.review.authorityLabel}</dt>
            <dd>{legal.review.authorityValue}</dd>
          </div>
        </dl>
      </aside>

      <section className="legal-section" aria-labelledby="people-title">
        <div className="policy-section-heading">
          <p className="eyebrow">{legal.people.eyebrow}</p>
          <h2 id="people-title" tabIndex={-1}>
            {legal.people.heading}
          </h2>
          <p>{legal.people.intro}</p>
        </div>
        <div className="policy-fact-grid">
          {legal.people.facts.map((fact) => (
            <article key={fact.number}>
              <span>{fact.number}</span>
              <h3>{fact.title}</h3>
              <p>{fact.body}</p>
            </article>
          ))}
        </div>
        <p className="legal-caution">
          <RichText value={legal.people.caution} />
        </p>
      </section>

      <section className="legal-section" aria-labelledby="licenses-title">
        <div className="policy-section-heading">
          <p className="eyebrow">{legal.licenses.eyebrow}</p>
          <h2 id="licenses-title" tabIndex={-1}>
            {legal.licenses.heading}
          </h2>
          <p>{legal.licenses.intro}</p>
        </div>
        <div className="legal-license-grid">
          {legal.licenses.cards.map((card) => (
            <article key={card.title}>
              <h3>{card.title}</h3>
              <p>
                <RichText value={card.body} />
              </p>
            </article>
          ))}
        </div>
        <p className="legal-caution">{legal.licenses.caution}</p>
      </section>

      <section className="legal-section" aria-labelledby="service-title">
        <div className="policy-section-heading">
          <p className="eyebrow">{legal.service.eyebrow}</p>
          <h2 id="service-title" tabIndex={-1}>
            {legal.service.heading}
          </h2>
          <p>{legal.service.intro}</p>
        </div>
        <div className="policy-two-column">
          {legal.service.columns.map((column) => (
            <article key={column.title}>
              <h3>{column.title}</h3>
              <ul>
                {column.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="legal-section" aria-labelledby="third-party-title">
        <div className="policy-section-heading">
          <p className="eyebrow">{legal.thirdParty.eyebrow}</p>
          <h2 id="third-party-title" tabIndex={-1}>
            {legal.thirdParty.heading}
          </h2>
          <p>{legal.thirdParty.intro}</p>
        </div>
        <div className="legal-link-grid">
          {legal.thirdParty.cards.map((card) => (
            <article key={card.title}>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="legal-section" aria-labelledby="account-title">
        <div className="policy-section-heading">
          <p className="eyebrow">{legal.account.eyebrow}</p>
          <h2 id="account-title" tabIndex={-1}>
            {legal.account.heading}
          </h2>
          <p>{legal.account.intro}</p>
        </div>
        <div className="legal-destination-grid">
          <Link href="/learner-data">
            <strong>{legal.account.learnerData.title}</strong>
            <span>{legal.account.learnerData.description}</span>
          </Link>
          <Link href="/account">
            <strong>{legal.account.accountControls.title}</strong>
            <span>{legal.account.accountControls.description}</span>
          </Link>
          <a href="https://github.com/project42dev/project42-platform/security/policy">
            <strong>{legal.account.security.title}</strong>
            <span>{legal.account.security.description}</span>
          </a>
          <a href={siteFacts.repositories.issues}>
            <strong>{legal.account.roadmap.title}</strong>
            <span>{legal.account.roadmap.description}</span>
          </a>
        </div>
      </section>

      <section
        className="legal-section"
        aria-labelledby="acceptable-use-title"
        id="acceptable-use"
      >
        <div className="policy-section-heading">
          <p className="eyebrow">{legal.acceptableUse.eyebrow}</p>
          <h2 id="acceptable-use-title" tabIndex={-1}>
            {legal.acceptableUse.heading}
          </h2>
          <p>{legal.acceptableUse.body}</p>
        </div>
      </section>

      <section className="legal-section" aria-labelledby="warranty-title">
        <div className="policy-section-heading">
          <p className="eyebrow">{legal.warranty.eyebrow}</p>
          <h2 id="warranty-title" tabIndex={-1}>
            {legal.warranty.heading}
          </h2>
          <p>{legal.warranty.intro}</p>
        </div>
        <p className="legal-caution">{legal.warranty.caution}</p>
      </section>

      <section className="legal-section" aria-labelledby="history-title">
        <div className="policy-section-heading">
          <p className="eyebrow">{legal.history.eyebrow}</p>
          <h2 id="history-title" tabIndex={-1}>
            {legal.history.heading}
          </h2>
        </div>
        <div className="policy-two-column">
          <article>
            <h3>{legal.history.changesTitle}</h3>
            <ul>
              {legal.history.changes.map((change) => (
                <li key={change.version}>
                  <strong>{change.version}</strong> {change.detail}
                </li>
              ))}
            </ul>
          </article>
          <article>
            <h3>{legal.history.referencesTitle}</h3>
            <ul>
              {legal.history.references.map((reference, index) => (
                <li key={reference}>
                  <a href={referenceLinks[index] ?? "#"}>{reference}</a>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </main>
  );
}
