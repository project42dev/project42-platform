import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { instructorRenderings as curriculumRenderings, starterCatalog } from "@project42/platform";
import diagramConfig from "../node_modules/@project42/platform/content/diagrams/catalogue.json" with { type: "json" };
import diagramOverrides from "../config/diagram-catalog-overrides.json" with { type: "json" };
import retiredPathConfig from "../config/retired-learning-paths.json" with { type: "json" };
import portalConfig from "../project42.config.json" with { type: "json" };
import projectMetadata from "../config/project-metadata.json" with { type: "json" };

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultBaseUrl = portalConfig.portal.canonicalOrigin;
const defaultExceptionsPath = path.join(
  projectRoot,
  "config",
  "link-check-exceptions.json",
);
const defaultStaticRoot = path.join(projectRoot, "dist", "client");
const defaultWorkerPath = path.join(projectRoot, "dist", "server", "index.js");
// The crawler identifies itself as the deployment doing the crawling, not as
// one operator's site. A User-Agent product token cannot contain whitespace, so
// the organisation name is compacted; the version and the "(+url)" contact shape
// are the conventional form and are unchanged.
const linkCheckerUserAgent = `${portalConfig.organization.name.replace(/\s+/g, "")}-LinkChecker/0.1 (+${projectMetadata.repositories.site})`;

const ignoredProtocols = new Set(["mailto:", "tel:"]);
const dynamicEndpointPaths = new Set([
  "/learner-data/policy",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
]);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function normalizeRoute(pathname) {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

function sourceLabel(reference) {
  return `${reference.sourceRoute} -> ${reference.target}`;
}

const mergedDiagrams = [...new Map(
  [...diagramConfig.diagrams, ...diagramOverrides.diagrams].map((diagram) => [diagram.id, diagram]),
).values()];

// Previously published learning-path URLs that now answer with a permanent
// redirect. They are deliberately not htmlRoutes: the export fetches every
// htmlRoute and fails on anything that is not a 200, and these never return
// 200. They are still part of the published surface, so the export has to write
// something for each of them rather than leaving a hole where a page was.
export function buildRetiredRouteRedirects(
  catalog = starterCatalog,
  retired = retiredPathConfig.retired,
  catalogueIndex = retiredPathConfig.catalogueIndex,
) {
  const redirects = new Map();
  for (const entry of retired) {
    const successor = entry.successorPathId
      ? catalog.paths.find((path) => path.id === entry.successorPathId)
      : undefined;
    const pathTarget = successor ? `/learn/${successor.id}` : catalogueIndex;
    redirects.set(`/learn/${entry.pathId}`, pathTarget);
    for (const moduleId of entry.retiredModuleIds) {
      redirects.set(
        `/learn/${entry.pathId}/${moduleId}`,
        successor && successor.moduleIds.includes(moduleId)
          ? `/learn/${successor.id}/${moduleId}`
          : pathTarget,
      );
    }
  }
  return redirects;
}

export function buildRouteInventory(
  catalog = starterCatalog,
  diagrams = mergedDiagrams,
  instructorRenderings = curriculumRenderings,
) {
  const htmlRoutes = new Set([
    "/",
    "/about",
    "/account",
    "/account/github/callback",
    "/admin",
    "/admin/appearance",
    "/admin/logs",
    "/admin/settings",
    "/auth/callback",
    "/diagrams",
    "/guide",
    "/guide/diagrams",
    "/import-progress",
    "/learn",
    "/learn/paths",
    "/learner-data",
    "/legal-transparency",
    // Served by the service worker when a navigation fails offline. It is
    // never linked from the site, so it has to be listed here or the export
    // would not produce it and the worker would cache nothing to fall back to.
    "/offline",
    "/ondemand",
    "/platform",
    "/profile",
    "/releases",
    "/roadmap",
    "/support",
    "/transfer-progress",
  ]);
  for (const learningPath of catalog.paths) {
    htmlRoutes.add(`/learn/${learningPath.id}`);
    for (const moduleId of learningPath.moduleIds) {
      htmlRoutes.add(`/learn/${learningPath.id}/${moduleId}`);
    }
  }
  for (const diagram of diagrams) {
    htmlRoutes.add(`/diagrams/${diagram.id}`);
    htmlRoutes.add(`/guide/diagrams/${diagram.id}`);
  }
  for (const resource of catalog.resources) {
    htmlRoutes.add(`/guide/resources/${resource.id}`);
    htmlRoutes.add(`/resources/${resource.id}`);
  }
  // Only lessons that have been rendered get a route, which is the same rule
  // generateStaticParams applies. Deriving these from the class scripts instead
  // would inventory forty routes for one film.
  for (const rendering of instructorRenderings) {
    htmlRoutes.add(`/ondemand/${rendering.pathId}/${rendering.moduleId}`);
  }
  return {
    htmlRoutes: [...htmlRoutes].sort(),
    redirectRoutes: [...buildRetiredRouteRedirects(catalog).keys()].sort(),
    endpointRoutes: [
      "/learner-data/policy",
      "/manifest.webmanifest",
      "/robots.txt",
      "/sitemap.xml",
    ],
  };
}

export function extractDocumentLinks(html, sourceRoute, baseUrl = defaultBaseUrl) {
  const ids = new Set();
  const references = [];

  for (const match of html.matchAll(/\sid=(?:"([^"]+)"|'([^']+)')/gi)) {
    ids.add(decodeHtml(match[1] ?? match[2]));
  }
  for (const match of html.matchAll(
    /<a\b[^>]*\bname=(?:"([^"]+)"|'([^']+)')[^>]*>/gi,
  )) {
    ids.add(decodeHtml(match[1] ?? match[2]));
  }

  for (const tagMatch of html.matchAll(
    /<(a|img|link|script|source)\b[^>]*>/gi,
  )) {
    const tag = tagMatch[1].toLowerCase();
    const tagText = tagMatch[0];
    const attribute = tag === "img" || tag === "script" || tag === "source"
      ? "src"
      : "href";
    const attributeMatch = tagText.match(
      new RegExp(`\\b${attribute}=(?:"([^"]+)"|'([^']+)')`, "i"),
    );
    if (!attributeMatch) continue;
    const target = decodeHtml(attributeMatch[1] ?? attributeMatch[2]).trim();
    if (!target || target.startsWith("data:") || target.startsWith("javascript:")) {
      continue;
    }

    let url;
    try {
      url = new URL(target, new URL(sourceRoute, baseUrl));
    } catch {
      references.push({
        kind: "invalid",
        sourceRoute,
        tag,
        attribute,
        target,
      });
      continue;
    }

    references.push({
      kind:
        url.origin === new URL(baseUrl).origin
          ? "internal"
          : url.protocol === "http:" || url.protocol === "https:"
            ? "external"
            : ignoredProtocols.has(url.protocol)
              ? "ignored"
              : "invalid",
      sourceRoute,
      tag,
      attribute,
      target,
      url,
    });
  }

  return { ids, references };
}

async function mapLimit(values, concurrency, callback) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(values[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker()),
  );
  return results;
}

function isStaticAsset(pathname) {
  if (dynamicEndpointPaths.has(pathname)) return false;
  return (
    pathname.startsWith("/_next/") ||
    /\.[a-z0-9]{1,12}$/i.test(pathname)
  );
}

async function defaultFileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function validateInternalReferences({
  documents,
  endpointRoutes = [],
  loadRoute,
  staticRoot = defaultStaticRoot,
  fileExists = defaultFileExists,
}) {
  const failures = [];
  const routeCache = new Map(
    [...documents.entries()].map(([route, document]) => [
      normalizeRoute(route),
      document,
    ]),
  );
  const checkedAssets = new Set();
  const checkedRoutes = new Set();
  let internalReferenceCount = 0;

  async function getRoute(route) {
    const normalized = normalizeRoute(route);
    if (!routeCache.has(normalized)) {
      routeCache.set(normalized, await loadRoute(normalized));
    }
    return routeCache.get(normalized);
  }

  for (const document of documents.values()) {
    for (const reference of document.references) {
      if (reference.kind === "invalid") {
        failures.push(`Invalid URL: ${sourceLabel(reference)}`);
        continue;
      }
      if (reference.kind !== "internal") continue;
      internalReferenceCount += 1;
      const pathname = normalizeRoute(reference.url.pathname);

      if (isStaticAsset(reference.url.pathname)) {
        const decodedPath = decodeURIComponent(reference.url.pathname).replace(
          /^\/+/,
          "",
        );
        const candidate = path.resolve(staticRoot, decodedPath);
        const relative = path.relative(staticRoot, candidate);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
          failures.push(`Asset escapes static root: ${sourceLabel(reference)}`);
          continue;
        }
        if (!checkedAssets.has(candidate)) {
          checkedAssets.add(candidate);
          if (!(await fileExists(candidate))) {
            failures.push(`Missing internal asset: ${sourceLabel(reference)}`);
          }
        }
        continue;
      }

      let targetDocument;
      try {
        targetDocument = await getRoute(pathname);
      } catch (error) {
        failures.push(
          `Internal route failed: ${sourceLabel(reference)} (${error.message})`,
        );
        continue;
      }
      checkedRoutes.add(pathname);
      if (targetDocument.status < 200 || targetDocument.status >= 400) {
        failures.push(
          `Internal route returned ${targetDocument.status}: ${sourceLabel(reference)}`,
        );
        continue;
      }
      if (
        reference.url.hash &&
        !targetDocument.ids.has(decodeURIComponent(reference.url.hash.slice(1)))
      ) {
        failures.push(
          `Missing fragment ${reference.url.hash}: ${sourceLabel(reference)}`,
        );
      }
    }
  }

  for (const route of endpointRoutes) {
    const endpoint = await loadRoute(route);
    checkedRoutes.add(route);
    if (endpoint.status < 200 || endpoint.status >= 400) {
      failures.push(`Endpoint returned ${endpoint.status}: ${route}`);
    }
  }

  return {
    failures,
    internalReferenceCount,
    checkedAssetCount: checkedAssets.size,
    checkedRouteCount: checkedRoutes.size,
  };
}

function escapeRegularExpression(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
}

function patternMatches(pattern, target) {
  const expression = `^${escapeRegularExpression(pattern).replaceAll("*", ".*")}$`;
  return new RegExp(expression).test(target);
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.valueOf()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function validateExceptionPolicy(
  exceptions,
  targets,
  today = new Date().toISOString().slice(0, 10),
) {
  const failures = [];
  for (const [index, exception] of exceptions.entries()) {
    const label = `exception ${index + 1}`;
    for (const field of ["targetPattern", "reason", "owner", "expires"]) {
      if (typeof exception[field] !== "string" || !exception[field].trim()) {
        failures.push(`${label} is missing ${field}`);
      }
    }
    if (
      !Array.isArray(exception.expectedStatuses) ||
      exception.expectedStatuses.length === 0 ||
      exception.expectedStatuses.some(
        (status) => !Number.isInteger(status) || status < 100 || status > 599,
      )
    ) {
      failures.push(`${label} needs one or more valid expectedStatuses`);
    }
    if (
      typeof exception.expires === "string" &&
      !isValidIsoDate(exception.expires)
    ) {
      failures.push(`${label} has an invalid expiry date`);
    } else if (exception.expires < today) {
      failures.push(`${label} expired on ${exception.expires}`);
    }
    if (
      typeof exception.targetPattern === "string" &&
      !targets.some((target) => patternMatches(exception.targetPattern, target))
    ) {
      failures.push(`${label} is unused: ${exception.targetPattern}`);
    }
  }
  return failures;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchExternal(
  url,
  {
    fetchImpl,
    timeoutMs,
    attempts,
  },
) {
  let lastFailure;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.1",
          range: "bytes=0-2047",
          "user-agent": linkCheckerUserAgent,
        },
      });
      try {
        await response.body?.cancel();
      } catch {
        // The status and final URL are sufficient; cancellation is best effort.
      }
      if (response.status >= 200 && response.status < 400) {
        return {
          ok: true,
          status: response.status,
          finalUrl: response.url || url,
          attempt,
        };
      }
      lastFailure = {
        ok: false,
        status: response.status,
        finalUrl: response.url || url,
        attempt,
      };
    } catch (error) {
      lastFailure = {
        ok: false,
        error: `${error.name}: ${error.message}`,
        attempt,
      };
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < attempts) await delay(250 * attempt);
  }
  return lastFailure;
}

export async function checkExternalReferences({
  references,
  exceptions = [],
  fetchImpl = fetch,
  concurrency = 12,
  timeoutMs = 20_000,
  attempts = 3,
  today,
}) {
  const byTarget = new Map();
  for (const reference of references.filter(
    (candidate) => candidate.kind === "external",
  )) {
    const target = reference.url.href;
    if (!byTarget.has(target)) byTarget.set(target, []);
    byTarget.get(target).push(reference);
  }
  const targets = [...byTarget.keys()].sort();
  const failures = validateExceptionPolicy(exceptions, targets, today);
  const activeExceptions = new Set(
    exceptions.filter(
      (exception) =>
        typeof exception.targetPattern === "string" &&
        targets.some((target) =>
          patternMatches(exception.targetPattern, target),
        ),
    ),
  );
  const results = await mapLimit(targets, concurrency, async (target) => {
    const result = await fetchExternal(target, {
      fetchImpl,
      timeoutMs,
      attempts,
    });
    const matchingException = exceptions.find(
      (exception) =>
        typeof exception.targetPattern === "string" &&
        patternMatches(exception.targetPattern, target),
    );
    if (
      !result.ok &&
      matchingException &&
      ((Number.isInteger(result.status) &&
        Array.isArray(matchingException.expectedStatuses) &&
        matchingException.expectedStatuses.includes(result.status)) ||
        (!Number.isInteger(result.status) &&
          Array.isArray(matchingException.expectedStatuses) &&
          (matchingException.expectedStatuses.includes(null) ||
            matchingException.expectedStatuses.includes(0) ||
            matchingException.expectedStatuses.includes(404))))
    ) {
      return { target, ...result, excepted: true };
    }
    if (!result.ok) {
      const sources = [
        ...new Set(byTarget.get(target).map((reference) => reference.sourceRoute)),
      ];
      failures.push(
        `External link failed: ${target} (${result.status ? `HTTP ${result.status}` : result.error
        }; sources: ${sources.join(", ")})`,
      );
    }
    return { target, ...result, excepted: false };
  });

  return {
    failures: [...new Set(failures)],
    results,
    uniqueTargetCount: targets.length,
    usedExceptionCount: activeExceptions.size,
  };
}

async function createWorkerLoader(workerPath = defaultWorkerPath) {
  if (!(await defaultFileExists(workerPath))) {
    throw new Error(
      `Built worker not found at ${workerPath}. Run "npm run build" first.`,
    );
  }
  const workerUrl = pathToFileURL(workerPath);
  workerUrl.searchParams.set("link-check", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return async function loadRoute(route) {
    const response = await worker.fetch(
      new Request(`http://localhost${route}`, {
        headers: { accept: route.endsWith(".json") ? "application/json" : "*/*" },
      }),
      {
        ASSETS: {
          fetch: async () => new Response("Not found", { status: 404 }),
        },
      },
      { waitUntil() { }, passThroughOnException() { } },
    );
    const contentType = response.headers.get("content-type") ?? "";
    const html = contentType.includes("text/html") ? await response.text() : "";
    const extracted = html
      ? extractDocumentLinks(html, route)
      : { ids: new Set(), references: [] };
    return {
      route,
      status: response.status,
      contentType,
      html,
      ...extracted,
    };
  };
}

async function loadExceptions(exceptionsPath = defaultExceptionsPath) {
  const parsed = JSON.parse(await readFile(exceptionsPath, "utf8"));
  if (parsed.$schemaVersion !== 1 || !Array.isArray(parsed.exceptions)) {
    throw new Error(
      `${exceptionsPath} must use $schemaVersion 1 and contain an exceptions array`,
    );
  }
  return parsed.exceptions;
}

export async function runLinkIntegrityCheck({
  catalog = starterCatalog,
  loadRoute,
  exceptions,
  staticRoot = defaultStaticRoot,
  concurrency = positiveInteger(process.env.LINK_CHECK_CONCURRENCY, 12),
  timeoutMs = positiveInteger(process.env.LINK_CHECK_TIMEOUT_MS, 20_000),
  attempts = positiveInteger(process.env.LINK_CHECK_ATTEMPTS, 3),
} = {}) {
  const inventory = buildRouteInventory(catalog);
  const routeLoader = loadRoute ?? (await createWorkerLoader());
  const documents = new Map();
  const rendered = await mapLimit(inventory.htmlRoutes, 8, routeLoader);
  for (const document of rendered) {
    documents.set(normalizeRoute(document.route), document);
  }
  const renderFailures = rendered
    .filter((document) => document.status < 200 || document.status >= 400)
    .map(
      (document) =>
        `Inventory route returned ${document.status}: ${document.route}`,
    );

  const internal = await validateInternalReferences({
    documents,
    endpointRoutes: inventory.endpointRoutes,
    loadRoute: routeLoader,
    staticRoot,
  });
  const allReferences = [...documents.values()].flatMap(
    (document) => document.references,
  );
  const external = await checkExternalReferences({
    references: allReferences,
    exceptions: exceptions ?? (await loadExceptions()),
    concurrency,
    timeoutMs,
    attempts,
  });
  const failures = [
    ...renderFailures,
    ...internal.failures,
    ...external.failures,
  ];
  return {
    failures,
    summary: {
      htmlRoutes: inventory.htmlRoutes.length,
      endpointRoutes: inventory.endpointRoutes.length,
      internalReferences: internal.internalReferenceCount,
      checkedAssets: internal.checkedAssetCount,
      uniqueExternalLinks: external.uniqueTargetCount,
      usedExceptions: external.usedExceptionCount,
    },
  };
}

async function main() {
  const result = await runLinkIntegrityCheck();
  if (result.failures.length > 0) {
    console.error(`Link integrity failed with ${result.failures.length} issue(s):`);
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }
  const summary = result.summary;
  console.log(
    `Link integrity passed: ${summary.htmlRoutes} HTML routes, ` +
    `${summary.endpointRoutes} metadata endpoints, ` +
    `${summary.internalReferences} internal references, ` +
    `${summary.checkedAssets} static assets, ` +
    `${summary.uniqueExternalLinks} external links, ` +
    `${summary.usedExceptions} active exception(s) used.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
