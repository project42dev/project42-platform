import Link from "next/link";
import Image from "next/image";
import { siteCatalog } from "../lib/catalog";
import { diagramCatalog } from "./lib/diagrams";
import { getThemeAssets } from "../lib/theme";
import { copy } from "../lib/copy";

export default function Home() {
  const themeAssets = getThemeAssets();
  const text = copy.home;
  const beginnerPath = siteCatalog.paths.find((path) => path.id === "ai-foundations");
  const practitionerPath = siteCatalog.paths.find(
    (path) => path.id === "providers-in-practice",
  );

  return (
    <main>
      <section className="portal-showcase shell" aria-labelledby="portal-headline">
        <div className="portal-poster-card">
          <div className="portal-poster-hero">
            <div className="portal-floating-card">
              <div className="portal-brand-row">
                <Image
                  alt={text.hero.brandLabel}
                  className="portal-brand-mark"
                  height={42}
                  priority
                  src={themeAssets.mark}
                  width={42}
                />
                <span>{text.hero.brandLabel}</span>
              </div>
              <p className="portal-eyebrow">{text.hero.eyebrow}</p>
              <h1 id="portal-headline">
                {text.hero.headlineLead}
                <span>{text.hero.headlineEmphasis}</span>
              </h1>
              <p className="portal-lede">{text.hero.lede}</p>
              <div className="portal-actions">
                <Link href="/learn">{text.hero.actions.learn}</Link>
                <Link href="/guide">{text.hero.actions.guide}</Link>
                {/* /guide/diagrams, not /diagrams. Both routes render the same
                    index, but sitemap.ts publishes the /guide/ one as canonical
                    and every diagram card and breadcrumb already points there,
                    so this was the one link dropping readers on the duplicate. */}
                <Link href="/guide/diagrams">{text.hero.actions.diagrams}</Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="progress-strip shell" aria-label={text.strip.label}>
        <div>
          <strong>{text.strip.learnTitle}</strong>
          <span>{text.strip.learnSummary}</span>
        </div>
        <div>
          <strong>{text.strip.guideTitle}</strong>
          <span>{text.strip.guideSummary}</span>
        </div>
        <Link className="button button-secondary" href="/account">
          {text.strip.signIn}
        </Link>
      </section>

      <section className="section shell" aria-labelledby="two-ways">
        <div className="section-heading">
          <p className="eyebrow">{text.twoWays.eyebrow}</p>
          <h2 id="two-ways">{text.twoWays.heading}</h2>
          <p>{text.twoWays.summary}</p>
        </div>
        <div className="pillar-grid">
          <article className="pillar-card pillar-learn">
            <div className="card-index">{text.twoWays.learn.index}</div>
            <h3>{text.twoWays.learn.title}</h3>
            <p>{text.twoWays.learn.summary}</p>
            <ul>
              <li>
                {siteCatalog.paths.length} {text.twoWays.learn.pathsSuffix}
              </li>
              <li>
                {siteCatalog.modules.length} {text.twoWays.learn.modulesSuffix}
              </li>
              <li>{text.twoWays.learn.extra}</li>
            </ul>
            <Link href="/learn/paths">{text.twoWays.learn.link}</Link>
          </article>
          <article className="pillar-card pillar-reference">
            <div className="card-index">{text.twoWays.guide.index}</div>
            <h3>{text.twoWays.guide.title}</h3>
            <p>{text.twoWays.guide.summary}</p>
            <ul>
              <li>
                {siteCatalog.resources.length} {text.twoWays.guide.resourcesSuffix}
              </li>
              <li>
                {diagramCatalog.length} {text.twoWays.guide.diagramsSuffix}
              </li>
              {text.twoWays.guide.extra.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ul>
            <Link href="/guide">{text.twoWays.guide.link}</Link>
          </article>
        </div>
      </section>

      <section className="section shell" aria-labelledby="featured-paths">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">{text.featured.eyebrow}</p>
            <h2 id="featured-paths">{text.featured.heading}</h2>
          </div>
          <Link className="text-link" href="/learn/paths">
            {text.featured.viewAll}
          </Link>
        </div>
        <div className="path-grid">
          {[beginnerPath, practitionerPath].filter(Boolean).map((path, index) => (
            <article className="path-card" key={path!.id}>
              <div className="path-card-top">
                <span className="level-pill">{path!.level}</span>
                <span>
                  {path!.moduleIds.length} {text.featured.modulesSuffix}
                </span>
              </div>
              <div className="path-number">0{index + 1}</div>
              <h3>{path!.title}</h3>
              <p>{path!.summary}</p>
              <Link href={`/learn/${path!.id}`}>{text.featured.pathLink}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section shell provider-section" aria-labelledby="provider-title">
        <div>
          <p className="eyebrow">{text.providers.eyebrow}</p>
          <h2 id="provider-title">{text.providers.heading}</h2>
        </div>
        <div className="provider-stack">
          {siteCatalog.providers.map((provider) => (
            <div className="provider-row" key={provider.id}>
              <span className={`provider-dot provider-${provider.id}`} />
              <strong>{provider.name}</strong>
              <p>{provider.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section shell self-host-section" aria-labelledby="self-host-title">
        <div className="self-host-content">
          <p className="eyebrow">{text.selfHost.eyebrow}</p>
          <h2 id="self-host-title">{text.selfHost.heading}</h2>
          <p>{text.selfHost.body}</p>
          <div className="button-row">
            <a className="button button-primary" href={text.selfHost.platformHref} target="_blank" rel="noopener noreferrer">
              {text.selfHost.platformLink}
            </a>
            <a className="button button-secondary" href={text.selfHost.runbookHref} target="_blank" rel="noopener noreferrer">
              {text.selfHost.runbookLink}
            </a>
          </div>
        </div>
      </section>

      <section className="cta shell">
        <p className="eyebrow">{text.cta.eyebrow}</p>
        <h2>{text.cta.heading}</h2>
        <p>{text.cta.body}</p>
        <Link className="button button-primary" href={text.cta.href}>
          {text.cta.action}
        </Link>
      </section>
    </main>
  );
}
