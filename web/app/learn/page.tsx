import type { Metadata } from "next";
import Link from "next/link";
import { siteCatalog } from "../../lib/catalog";
import { orgName } from "../../lib/copy";

export const metadata: Metadata = {
  title: "Learn",
  description: "Start learning AI with guided paths, practical references, and progress you can keep.",
};

export default function LearnPage() {
  const pathCount = siteCatalog.paths.length;
  const moduleCount = siteCatalog.modules.length;
  // Rounded to hours: the raw minute total reads like a bug rather than a size.
  const hours = Math.round(
    siteCatalog.modules.reduce(
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

      {/*
        Everything below the chooser used to be the home page's complete h2
        sequence, in order: "Learn deeply. Find answers quickly.", "Paths with
        a destination", "Learn the ideas that transfer.", "Run ... Inside Your
        Organization", "Understanding beats intimidation." A reader who
        clicked "Learn" from the home page scrolled past the chooser back into
        the page they had just left. This page has one job -- the choice
        between the two renderings -- so it now ends on that choice.
      */}
      <section className="cta shell">
        <p className="eyebrow">Your first checkpoint is 12 minutes away</p>
        <h2>Pick either one. Start now.</h2>
        <p>Both renderings open the same first module, and your progress follows you between them.</p>
        <Link className="button button-primary" href="/learn/ai-foundations/what-ai-does">Begin the first module</Link>
      </section>
    </main>
  );
}
