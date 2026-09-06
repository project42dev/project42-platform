import type { MetadataRoute } from "next";
import { siteCatalog } from "../lib/catalog";
import { diagramCatalog } from "./lib/diagrams";
import { instructorRenderings } from "./lib/instructorMedia";
import { canonicalOrigin } from "../lib/copy";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = canonicalOrigin;
  return [
    "",
    "/learn",
    "/learn/paths",
    "/ondemand",
    "/guide",
    "/guide/diagrams",
    "/import-progress",
    "/profile",
    "/learner-data",
    "/about",
    "/roadmap",
    "/releases",
    "/platform",
    "/support",
    "/legal-transparency",
    ...siteCatalog.paths.map((path) => `/learn/${path.id}`),
    ...siteCatalog.paths.flatMap((path) =>
      path.moduleIds.map((moduleId) => `/learn/${path.id}/${moduleId}`),
    ),
    ...instructorRenderings.map(
      (rendering) => `/ondemand/${rendering.pathId}/${rendering.moduleId}`,
    ),
    ...siteCatalog.resources.map(
      (resource) => `/guide/resources/${resource.id}`,
    ),
    ...diagramCatalog.map((diagram) => `/guide/diagrams/${diagram.id}`),
  ].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date("2026-07-25"),
    changeFrequency: "monthly",
    priority: path === "" ? 1 : path.split("/").length <= 2 ? 0.8 : 0.6,
  }));
}
