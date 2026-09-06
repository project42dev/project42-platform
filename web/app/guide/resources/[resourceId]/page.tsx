import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getResource, siteCatalog } from "../../../../lib/catalog";
import { LessonSections } from "../../../components/LessonSections";
import { ContentUseNotice } from "../../../components/ContentUseNotice";
import { ProviderPills } from "../../../components/ProviderPills";
import {
  displayEditorialValue,
  getResourceFreshnessView,
} from "../../../lib/resourceFreshness";
import { orgName } from "../../../../lib/copy";

interface ResourcePageProps {
  params: Promise<{ resourceId: string }>;
}

export function generateStaticParams() {
  return siteCatalog.resources.map((resource) => ({ resourceId: resource.id }));
}

export async function generateMetadata({ params }: ResourcePageProps): Promise<Metadata> {
  const { resourceId } = await params;
  const resource = getResource(resourceId);
  // Rendered here and, via a re-export, at the previously published
  // /resources/<id>. This is the URL sitemap.ts publishes and the Field Guide
  // links to, so it is named as canonical from both.
  return resource
    ? {
        title: `${resource.title} · ${orgName} Field Guide`,
        description: resource.summary,
        alternates: { canonical: `/guide/resources/${resource.id}/` },
      }
    : { title: "Resource not found" };
}

export default async function ResourcePage({ params }: ResourcePageProps) {
  const { resourceId } = await params;
  const resource = getResource(resourceId);
  if (!resource) notFound();
  const freshness = getResourceFreshnessView(
    resource,
    new Date().toISOString().slice(0, 10),
  );

  // Where to go next. A reader who finished a resource had three anchors in
  // the whole <main>, of which two were internal -- the breadcrumb and a legal
  // link -- so the page simply ended. Related resources are drawn from the
  // same category first, because that is the grouping the Field Guide's own
  // filters offer, and topped up from the rest of the catalogue so a
  // single-member category is not a dead end either.
  const others = siteCatalog.resources.filter(
    (candidate) => candidate.id !== resource.id,
  );
  const sameCategory = others.filter(
    (candidate) => candidate.category === resource.category,
  );
  const related = [
    ...sameCategory,
    ...others.filter((candidate) => candidate.category !== resource.category),
  ].slice(0, 3);

  return (
    <main className="resource-detail shell" id="main-content">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <Link href="/guide">Field guide</Link>
        <span>/</span>
        <span aria-current="page">{resource.title}</span>
      </nav>
      <header className="resource-detail-hero">
        <div>
          <p className="eyebrow">{resource.category}</p>
          <h1>{resource.title}</h1>
          <p>{resource.summary}</p>
          <ProviderPills providers={resource.providers} />
        </div>
        <div className="verification-card">
          <span
            className={`freshness-badge ${freshness.className}`}
          >
            {freshness.label}
          </span>
          <strong>
            <time dateTime={resource.lastVerified}>{resource.lastVerified}</time>
          </strong>
          <small>Next review due {freshness.dueOn}</small>
          <small>Content version {siteCatalog.contentVersion}</small>
        </div>
      </header>
      <dl className="resource-detail-facts" aria-label="Resource details">
        <div>
          <dt>Format</dt>
          <dd>{displayEditorialValue(resource.format)}</dd>
        </div>
        <div>
          <dt>Level</dt>
          <dd>{displayEditorialValue(resource.level)}</dd>
        </div>
        <div>
          <dt>Audience</dt>
          <dd>{resource.audience.map(displayEditorialValue).join(", ")}</dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{displayEditorialValue(resource.owner)}</dd>
        </div>
        <div>
          <dt>Review cadence</dt>
          <dd>Every {resource.reviewCadenceDays} days</dd>
        </div>
        <div>
          <dt>Prerequisites</dt>
          <dd>
            {resource.prerequisites.length === 0
              ? "None"
              : resource.prerequisites.join("; ")}
          </dd>
        </div>
      </dl>
      <ContentUseNotice artifact="resource" />
      <div className="resource-body">
        <LessonSections sections={resource.sections} />
        <aside className="source-panel">
          <p className="eyebrow">Primary sources</p>
          {resource.sources.map((source) => (
            <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
              <strong>{source.title}</strong>
              <span>{source.publisher} ↗</span>
              <small>
                Source reviewed{" "}
                <time dateTime={source.lastVerified}>{source.lastVerified}</time>
              </small>
            </a>
          ))}
        </aside>
      </div>

      <nav className="resource-next" aria-label="Where to go next">
        <div className="resource-next-heading">
          <p className="eyebrow">Keep reading</p>
          <h2>More from the Field Guide</h2>
        </div>
        <ul>
          {related.map((candidate) => (
            <li key={candidate.id}>
              <Link href={`/guide/resources/${candidate.id}`}>
                <span>{candidate.category}</span>
                <strong>{candidate.title}</strong>
                <small>{candidate.summary}</small>
              </Link>
            </li>
          ))}
        </ul>
        <Link className="button button-secondary" href="/guide">
          Back to the Field Guide
        </Link>
      </nav>
    </main>
  );
}
