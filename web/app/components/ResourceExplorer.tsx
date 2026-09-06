"use client";

import type {
  Level,
  Provider,
  Resource,
  ResourceFormat,
  ResourceFreshnessStatus,
} from "@project42/platform";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  displayEditorialValue,
  getResourceFreshnessView,
} from "../lib/resourceFreshness";
import { ProviderPills } from "./ProviderPills";

const providerLabels: Record<Provider, string> = {
  "provider-neutral": "Provider-neutral",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

const freshnessLabels: Record<ResourceFreshnessStatus, string> = {
  current: "Current",
  "review-due": "Review due",
  stale: "Stale",
};

function titleCase(value: string) {
  return value
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function ResourceExplorer({
  resources,
  asOf,
}: {
  resources: Resource[];
  asOf: string;
}) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<"all" | string>("all");
  const [provider, setProvider] = useState<"all" | Provider>("all");
  const [level, setLevel] = useState<"all" | Level>("all");
  const [format, setFormat] = useState<"all" | ResourceFormat>("all");
  const [freshness, setFreshness] = useState<
    "all" | ResourceFreshnessStatus
  >("all");
  const topics = useMemo(
    () => [...new Set(resources.map((resource) => resource.category))].sort(),
    [resources],
  );
  const providers = useMemo(
    () => [...new Set(resources.flatMap((resource) => resource.providers))].sort(),
    [resources],
  );
  const levels = useMemo(
    () => [...new Set(resources.map((resource) => resource.level))].sort(),
    [resources],
  );
  const formats = useMemo(
    () => [...new Set(resources.map((resource) => resource.format))].sort(),
    [resources],
  );
  const freshnessById = useMemo(
    () =>
      new Map(
        resources.map((resource) => [
          resource.id,
          getResourceFreshnessView(resource, asOf),
        ]),
      ),
    [asOf, resources],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return resources.filter((resource) => {
      const matchesText =
        !normalized ||
        [
          resource.title,
          resource.summary,
          resource.category,
          resource.format,
          ...resource.tags,
          ...resource.audience,
          ...resource.providers,
          ...resource.prerequisites,
          ...resource.sources.flatMap((source) => [
            source.title,
            source.publisher,
          ]),
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      const matchesTopic = topic === "all" || resource.category === topic;
      const matchesProvider =
        provider === "all" || resource.providers.includes(provider);
      const matchesLevel = level === "all" || resource.level === level;
      const matchesFormat = format === "all" || resource.format === format;
      const matchesFreshness =
        freshness === "all" ||
        freshnessById.get(resource.id)?.status === freshness;
      return (
        matchesText &&
        matchesTopic &&
        matchesProvider &&
        matchesLevel &&
        matchesFormat &&
        matchesFreshness
      );
    });
  }, [
    format,
    freshness,
    freshnessById,
    level,
    provider,
    query,
    resources,
    topic,
  ]);
  const hasFilters =
    query.trim().length > 0 ||
    topic !== "all" ||
    provider !== "all" ||
    level !== "all" ||
    format !== "all" ||
    freshness !== "all";

  const clearFilters = () => {
    setQuery("");
    setTopic("all");
    setProvider("all");
    setLevel("all");
    setFormat("all");
    setFreshness("all");
  };

  return (
    <>
      <div className="resource-controls" aria-label="Resource filters">
        <label>
          <span>Search the field guide</span>
          <input
            aria-controls="resource-results"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Try “agents” or “prompt”"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span>Topic</span>
          <select
            onChange={(event) => setTopic(event.target.value)}
            value={topic}
          >
            <option value="all">All topics</option>
            {topics.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Provider</span>
          <select
            onChange={(event) =>
              setProvider(event.target.value as "all" | Provider)
            }
            value={provider}
          >
            <option value="all">All providers</option>
            {providers.map((option) => (
              <option key={option} value={option}>
                {providerLabels[option]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Level</span>
          <select
            onChange={(event) =>
              setLevel(event.target.value as "all" | Level)
            }
            value={level}
          >
            <option value="all">All levels</option>
            {levels.map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Format</span>
          <select
            onChange={(event) =>
              setFormat(event.target.value as "all" | ResourceFormat)
            }
            value={format}
          >
            <option value="all">All formats</option>
            {formats.map((option) => (
              <option key={option} value={option}>
                {titleCase(option)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Freshness</span>
          <select
            onChange={(event) =>
              setFreshness(
                event.target.value as "all" | ResourceFreshnessStatus,
              )
            }
            value={freshness}
          >
            <option value="all">All freshness states</option>
            {Object.entries(freshnessLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="resource-results-summary">
        <p
          className="results-count"
          aria-live="polite"
          id="resource-results-status"
          role="status"
        >
          Showing {filtered.length} of {resources.length} resources
        </p>
        {hasFilters && filtered.length > 0 ? (
          <button
            className="clear-filter-button"
            onClick={clearFilters}
            type="button"
          >
            Clear all filters
          </button>
        ) : null}
      </div>
      <div className="resource-grid" id="resource-results">
        {filtered.map((resource) => {
          const resourceFreshness = freshnessById.get(resource.id);
          if (!resourceFreshness) return null;
          return (
            <article
              className="resource-card"
              data-resource-id={resource.id}
              key={resource.id}
            >
              <div className="resource-meta">
                <span>{resource.category}</span>
                <span>{titleCase(resource.format)}</span>
              </div>
              <h2>{resource.title}</h2>
              <p>{resource.summary}</p>
              <ProviderPills providers={resource.providers} />
              <dl className="resource-card-facts">
                <div>
                  <dt>Audience</dt>
                  <dd>{resource.audience.map(titleCase).join(", ")}</dd>
                </div>
                <div>
                  <dt>Level</dt>
                  <dd>{titleCase(resource.level)}</dd>
                </div>
                <div>
                  <dt>Prerequisites</dt>
                  <dd>
                    {resource.prerequisites.length === 0
                      ? "None"
                      : `${resource.prerequisites.length} listed`}
                  </dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{displayEditorialValue(resource.owner)}</dd>
                </div>
              </dl>
              <div className="resource-foot">
                <div>
                  <span
                    className={`freshness-badge ${resourceFreshness.className}`}
                  >
                    {resourceFreshness.label}
                  </span>
                  <small>
                    Reviewed{" "}
                    <time dateTime={resource.lastVerified}>
                      {resource.lastVerified}
                    </time>
                  </small>
                </div>
                <Link
                  aria-label={`Open ${resource.title}`}
                  href={`/resources/${resource.id}`}
                >
                  Open →
                </Link>
              </div>
            </article>
          );
        })}
      </div>
      {filtered.length === 0 ? (
        <div className="empty-state">
          <h2>No resources match these filters.</h2>
          <p>Try a broader search or clear the active filters to see all resources.</p>
          <button
            className="button button-secondary"
            onClick={clearFilters}
            type="button"
          >
            Clear all filters
          </button>
        </div>
      ) : null}
    </>
  );
}
