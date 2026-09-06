import Link from "next/link";
import { siteFacts } from "../lib/siteFacts";
import { copy, galleryUrl } from "../../lib/copy";

const text = copy.platform;

export default function OpenSourcePlatformPage() {
  return (
    <main className="page-shell shell platform-page">
      <header className="platform-hero">
        <p className="platform-kicker">{text.hero.kicker}</p>
        <h1>{text.hero.heading}</h1>
        <p className="platform-lede">{text.hero.lede}</p>
        <div className="button-row platform-actions">
          <a
            className="button button-primary"
            href={siteFacts.repositories.platform}
            rel="noopener noreferrer"
            target="_blank"
          >
            {text.hero.repoAction}
          </a>
          <a
            className="button button-secondary"
            href={galleryUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            {text.hero.galleryAction}
          </a>
        </div>
      </header>

      <section className="platform-pillar-grid" aria-label={text.pillarsLabel}>
        {text.pillars.map((pillar) => (
          <article className="platform-card" key={pillar.title}>
            <span className="platform-card-index">{pillar.index}</span>
            <h2>{pillar.title}</h2>
            <p>{pillar.description}</p>
          </article>
        ))}
      </section>

      <section className="platform-quickstart" aria-labelledby="quickstart-title">
        <h2 id="quickstart-title">{text.quickstart.heading}</h2>
        <p>{text.quickstart.lede}</p>
        <pre aria-label={text.quickstart.commandsLabel} tabIndex={0}>
          <code>{text.quickstart.commands}</code>
        </pre>
      </section>

      <section className="platform-documentation" aria-labelledby="documentation-title">
        <h2 id="documentation-title">{text.documentation.heading}</h2>
        <div className="platform-documentation-grid">
          {text.documentation.links.map((item) =>
            item.external === "true" ? (
              <a
                className="platform-documentation-card"
                href={item.href}
                key={item.href}
                rel="noopener noreferrer"
                target="_blank"
              >
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </a>
            ) : (
              <Link
                className="platform-documentation-card"
                href={item.href}
                key={item.href}
              >
                <strong>{item.title}</strong>
                <span>{item.description}</span>
              </Link>
            ),
          )}
        </div>
      </section>
    </main>
  );
}
