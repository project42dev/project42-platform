import type { Metadata } from "next";
import Link from "next/link";
import { starterCatalog } from "@project42/platform";
import { diagramCatalog } from "../lib/diagrams";
import { orgName } from "../../lib/copy";

export const metadata: Metadata = {
  title: "Learn",
  description: "Start learning AI with guided paths, practical references, and progress you can keep.",
};

export default function LearnPage() {
  const beginnerPath = starterCatalog.paths.find((path) => path.id === "ai-foundations");
  const practitionerPath = starterCatalog.paths.find(
    (path) => path.id === "providers-in-practice",
  );

  const pathCount = starterCatalog.paths.length;
  const moduleCount = starterCatalog.modules.length;
  // Rounded to hours: the raw minute total reads like a bug rather than a size.
  const hours = Math.round(
    starterCatalog.modules.reduce(
      (total, module) => total + (module.estimatedMinutes ?? 0),
      0,
    ) / 60,
  );

  return (
    <main>
      {/*
        This page's job is the choice between the two renderings (ADR-0020),
        not a second copy of the site's home page. It carried a duplicate of
        the project-42.dev hero from commit 0bbfe97 until this was restored,
        so arriving here from the main site showed you the page you had just
        left.

        ADR-0020: these are two RENDERINGS of one course, never two
        catalogues. Same modules, same knowledge checks, one learner record
        whichever you pick. Nothing here may describe them as separate
        curricula.
      */}
      <header className="page-hero landing-hero shell">
        {/*
          The journey art leads the header rather than trailing it: .page-hero
          styles its lede with "> p:last-child", so anything appended after the
          paragraph silently strips the lede's treatment. Commit 4446a44
          replaced this page's two-column hero with the chooser and dropped the
          element, leaving its stylesheet, the Galactic bundle's
          --p42-hero-image binding, and the conformance assertion behind with
          nothing to render. The selected theme paints its hero image over it;
          the orbit children are what the other bundles show.
        */}
        <div
          className="hero-map"
          role="img"
          aria-label="Learning journey preview: understand, practise, prove it"
        >
          <div className="map-orbit map-orbit-one" />
          <div className="map-orbit map-orbit-two" />
          <div className="map-node map-node-start"><span>01</span>Understand</div>
          <div className="map-node map-node-build"><span>02</span>Practice</div>
          <div className="map-node map-node-prove"><span>03</span>Prove it</div>
          <div className="map-center">
            <span className="map-mark">42</span>
            <small>Your path</small>
          </div>
        </div>
        <p className="eyebrow">{orgName} Academy</p>
        <h1>Two ways to take the same course.</h1>
        <p>
          The same modules, the same knowledge checks, the same sources, and one
          record of what you have finished. Read it, or watch it taught. Switch
          whenever you like: your progress does not care which one you picked.
        </p>
      </header>

      <section className="section shell" aria-label="Choose how you want to learn">
        <div className="pillar-grid">
          <article className="pillar-card pillar-selfpaced">
            <div className="card-index">Self-paced / Available now</div>
            <h2>Read it at your own pace.</h2>
            <p>
              Short written modules in plain language, worked examples you can copy,
              and a knowledge check at the end of every one. Stop and start whenever
              you want.
            </p>
            <ul>
              <li>
                {pathCount} learning paths, {moduleCount} assessed modules
              </li>
              <li>About {hours} hours of material</li>
              <li>Every claim carries its source and a verification date</li>
              <li>Account-backed progress across browsers and devices</li>
            </ul>
            <Link href="/learn/paths">Browse learning paths →</Link>
          </article>

          <article className="pillar-card pillar-ondemand">
            <div className="card-index">Instructor-led / Preview</div>
            <h2>Watch it taught.</h2>
            <p>
              The same material presented as a lesson rather than a page. A virtual
              instructor works through each module on video, with captions and a
              full transcript.
            </p>
            <ul>
              <li>Captions embedded in the video</li>
              <li>Full transcript you can search and copy</li>
              <li>The same knowledge check at the end</li>
              <li>Nothing is generated while you watch</li>
            </ul>
            <Link href="/ondemand">See the on-demand classroom →</Link>
          </article>
        </div>
      </section>

      <section className="progress-strip shell" aria-label={`${orgName} destinations`}>
        <div><strong>Learn</strong><span>Courses, knowledge checks, badges, and your transcript</span></div>
        <div><strong>Field Guide</strong><span>Practical answers, workflows, comparisons, and visual guides</span></div>
        <Link className="button button-secondary" href="/account">Sign in to track progress</Link>
      </section>

      <section className="section shell" aria-labelledby="two-ways">
        <div className="section-heading">
          <p className="eyebrow">Two ways to grow</p>
          <h2 id="two-ways">Learn deeply. Find answers quickly.</h2>
          <p>Follow a guided path when you want mastery, or jump into the field guide when you need something useful right now.</p>
        </div>
        <div className="pillar-grid">
          <article className="pillar-card pillar-learn">
            <div className="card-index">Academy / 01</div>
            <h3>Self-paced learning</h3>
            <p>Short modules, plain language, practical examples, and a knowledge check at the end of every major section.</p>
            <ul>
              <li>{starterCatalog.paths.length} starter paths</li>
              <li>{starterCatalog.modules.length} assessed modules</li>
              <li>Account-backed progress and transcript</li>
            </ul>
            <Link href="/learn/paths">Explore learning paths →</Link>
          </article>
          <article className="pillar-card pillar-reference">
            <div className="card-index">Field guide / 02</div>
            <h3>Resources for the work</h3>
            <p>Checklists, explainers, provider maps, and decision tools with visible verification dates and sources.</p>
            <ul>
              <li>{starterCatalog.resources.length} starter resources</li>
              <li>{diagramCatalog.length} source-first visual guides</li>
              <li>Anthropic, OpenAI, and Google coverage</li>
              <li>Provider-neutral core concepts</li>
            </ul>
            <Link href="/guide">Open the Field Guide →</Link>
          </article>
        </div>
      </section>

      <section className="section shell" aria-labelledby="featured-paths">
        <div className="section-heading section-heading-inline">
          <div>
            <p className="eyebrow">Choose your starting point</p>
            <h2 id="featured-paths">Paths with a destination</h2>
          </div>
          <Link className="text-link" href="/learn/paths">View all paths</Link>
        </div>
        <div className="path-grid">
          {[beginnerPath, practitionerPath].filter(Boolean).map((path, index) => (
            <article className="path-card" key={path!.id}>
              <div className="path-card-top">
                <span className="level-pill">{path!.level}</span>
                <span>{path!.moduleIds.length} modules</span>
              </div>
              <div className="path-number">0{index + 1}</div>
              <h3>{path!.title}</h3>
              <p>{path!.summary}</p>
              <Link href={`/learn/${path!.id}`}>See this path →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section shell provider-section" aria-labelledby="provider-title">
        <div>
          <p className="eyebrow">No single-provider tunnel vision</p>
          <h2 id="provider-title">Learn the ideas that transfer.</h2>
        </div>
        <div className="provider-stack">
          {starterCatalog.providers.map((provider) => (
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
          <p className="eyebrow">Open Source &amp; Self-Hosting</p>
          <h2 id="self-host-title">Run {orgName} Inside Your Organization</h2>
          <p>Deploy the complete, host-agnostic {orgName} platform in your own cloud, air-gapped intranet, or local server. Customize with your organization&apos;s branding, overlay internal courses, and sync with upstream curriculum updates.</p>
          <div className="button-row">
            <a className="button button-primary" href="https://github.com/project42dev/project42-platform" target="_blank" rel="noopener noreferrer">View Open-Source Platform on GitHub →</a>
            <a className="button button-secondary" href="https://github.com/project42dev/project42-platform/blob/main/docs/self-hosting/portal-and-theming.md" target="_blank" rel="noopener noreferrer">Read Self-Hosting Runbook</a>
          </div>
        </div>
      </section>

      <section className="cta shell">
        <p className="eyebrow">Your first checkpoint is 12 minutes away</p>
        <h2>Understanding beats intimidation.</h2>
        <p>Start with one module. Your approved account keeps your place across devices.</p>
        <Link className="button button-primary" href="/learn/ai-foundations/what-ai-does">Begin the first module</Link>
      </section>
    </main>
  );
}
