import { access, cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { buildRetiredRouteRedirects, buildRouteInventory } from "./link-integrity.mjs";
import { serviceWorkerSource } from "./service-worker.mjs";
import portalConfig from "../project42.config.json" with { type: "json" };

const projectRoot = path.resolve(import.meta.dirname, "..");
const clientRoot = path.join(projectRoot, "dist", "client");
const workerPath = path.join(projectRoot, "dist", "server", "index.js");

// Defaults reproduce the full-site export exactly - tests/github-pages-export.test.mjs
// depends on that. --domain and --routes together produce a filtered export of just
// the given route prefixes under a distinct domain, used to publish /admin and
// /account to their own subdomains (AB#6851) without duplicating Learn's toolchain.
const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/, "").split("=");
    return [key, rest.join("=")];
  }),
);
const canonicalDomain =
  args.get("domain") ?? new URL(portalConfig.portal.canonicalOrigin).hostname;
const routePrefixes = args.get("routes")?.split(",").map((value) => value.trim()).filter(Boolean) ?? null;
const isFilteredExport = routePrefixes !== null;
// Hosted public artifacts redirect Admin routes to the isolated Admin Portal.
// Account and learner-profile routes remain on the unified public origin.
const retireAdminRoutes = args.has("retire-admin-routes");
const outputRoot = path.join(
  projectRoot,
  "dist",
  args.get("out") ?? "pages",
);

function matchesRoutePrefix(route) {
  if (!routePrefixes) return true;
  return routePrefixes.some(
    (prefix) => route === prefix || route.startsWith(`${prefix}/`),
  );
}

const endpointFiles = new Map([
  ["/manifest.webmanifest", "manifest.webmanifest"],
  ["/robots.txt", "robots.txt"],
  ["/sitemap.xml", "sitemap.xml"],
]);

function exportVersion() {
  try {
    return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim();
  } catch {
    // No git in the environment: fall back to the package version so the
    // worker still gets a stable, non-empty cache namespace.
    return process.env.npm_package_version ?? "0";
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function outputPathForRoute(route) {
  if (route === "/") return path.join(outputRoot, "index.html");
  return path.join(outputRoot, route.replace(/^\/+/, ""), "index.html");
}

// Admin routes remain renderable for validation and filtered Admin exports, but
// the hosted public artifact must never expose a second operational console.
//
// This is deliberately an export-time transform rather than runtime
// headers().get("host") branching inside the pages: a previous attempt at the
// runtime version broke CI, because Playwright drives a live `vinext start`
// server whose per-request Host is not the canonical origin, so any
// host-conditional redirect either fired for the tests or would have had to
// special-case them. Only the published artifact needs to redirect, and only
// the default full-site export produces it.
// The destination is the deployment's own Admin origin, not one operator's
// host: resolving each route against portal.adminOrigin tolerates a trailing
// slash on the configured origin and keeps the published redirect targets in
// step with the rest of the configuration.
const adminOrigin = portalConfig.portal.adminOrigin;
const RETIRED_ROUTES = new Map(
  ["/admin", "/admin/logs", "/admin/settings"].map((route) => [
    route,
    new URL(`${route}/`, adminOrigin).href,
  ]),
);

function redirectDocument(route, target) {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta http-equiv="refresh" content="0; url=${target}">` +
    `<link rel="canonical" href="${target}">` +
    `<meta name="robots" content="noindex">` +
    `<title>Redirecting…</title></head><body>` +
    `<p>This page has moved. <a href="${target}">Continue to ${target}</a></p>` +
    `</body></html>\n`
  );
}

function addStaticNavigation(html) {
  const navigation = `<script data-project42-static-navigation>
document.addEventListener("click",function(event){
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const link=event.target.closest("a[href]");
  if(!link||link.target||link.hasAttribute("download"))return;
  const url=new URL(link.href,window.location.href);
  if(url.origin!==window.location.origin)return;
  if(url.pathname===window.location.pathname&&url.search===window.location.search)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  window.location.assign(url.href);
},true);
</script>`;
  return applyInstallableMetadata(
    html
      .replaceAll('href="/learner-data/policy"', 'href="/learner-data/policy.json"')
      .replace("</head>", `${navigation}</head>`),
  );
}

// Two tags the installed app needs that Next 16 does not produce.
//
// 1. viewport-fit=cover. `viewport.viewportFit` is a documented Viewport key
//    and Next maps it to "viewport-fit" in its constants, but this pipeline
//    emits the viewport meta without it. Without the attribute the page is
//    letterboxed inside the display cutout on a notched device and the
//    env(safe-area-inset-*) padding in globals.css all resolves to 0.
//
// 2. apple-mobile-web-app-capable. Next now emits only the standard
//    "mobile-web-app-capable", which iOS Safari does not read. iOS has no
//    install prompt and ignores the manifest for standalone mode, so without
//    the apple-prefixed tag Add to Home Screen on an iPhone or iPad produces a
//    bookmark that opens in Safari chrome rather than a standalone app.
//
// This is an export-time transform for the same reason the retired Admin
// routes are: only the published artifact needs it, and the alternative --
// hand-writing a second <meta name="viewport"> in the layout -- would leave
// two viewport tags on the page and let the framework's win.
function applyInstallableMetadata(html) {
  let output = html.replace(
    /(<meta name="viewport" content=")([^"]*)(")/,
    (match, open, content, close) =>
      content.includes("viewport-fit")
        ? match
        : `${open}${content}, viewport-fit=cover${close}`,
  );

  if (!output.includes('name="apple-mobile-web-app-capable"')) {
    output = output.replace(
      '<meta name="mobile-web-app-capable" content="yes"/>',
      '<meta name="mobile-web-app-capable" content="yes"/>' +
        '<meta name="apple-mobile-web-app-capable" content="yes"/>',
    );
  }

  return output;
}

async function writeRoute(route, content) {
  const target = outputPathForRoute(route);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function main() {
  if (!(await exists(workerPath)) || !(await exists(clientRoot))) {
    throw new Error('Run "npm run build" before exporting GitHub Pages.');
  }

  const workerUrl = pathToFileURL(workerPath);
  workerUrl.searchParams.set("pages-export", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const fetchRoute = (route) =>
    worker.fetch(
      // Set the synthetic host explicitly so generated metadata and client
      // bootstrap state reflect the artifact's deployment domain.
      new Request(`https://${canonicalDomain}${route}`, {
        headers: { host: canonicalDomain },
      }),
      {
        ASSETS: {
          fetch: async () => new Response("Not found", { status: 404 }),
        },
      },
      { waitUntil() {}, passThroughOnException() {} },
    );

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await cp(clientRoot, outputRoot, { recursive: true });

  const fullInventory = buildRouteInventory();
  const htmlRoutes = fullInventory.htmlRoutes.filter(matchesRoutePrefix);
  // Retired learning-path URLs. The worker answers these with a 308, which a
  // static artifact cannot express, so the export writes the same meta-refresh
  // document the retired Admin routes get. Without this the previously
  // published catalogue URLs would 404 on the Pages artifact even though they
  // redirect correctly on the hosted origin.
  const retiredLearningRedirects = buildRetiredRouteRedirects();
  if (isFilteredExport && htmlRoutes.length === 0) {
    throw new Error(`--routes matched no known route: ${routePrefixes.join(",")}`);
  }
  for (const route of htmlRoutes) {
    // Retire only when explicitly asked, and never for a filtered --domain
    // export: that export IS the subdomain publishing its own copy, so it must
    // keep the real page or it would redirect to itself forever.
    const retiredTarget =
      retireAdminRoutes && !isFilteredExport
        ? RETIRED_ROUTES.get(route)
        : undefined;
    if (retiredTarget) {
      await writeRoute(route, redirectDocument(route, retiredTarget));
      continue;
    }
    const response = await fetchRoute(route);
    if (!response.ok) {
      throw new Error(`Cannot export ${route}: HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      throw new Error(`Cannot export ${route}: expected HTML, received ${contentType}`);
    }
    await writeRoute(route, addStaticNavigation(await response.text()));
  }

  for (const [route, target] of retiredLearningRedirects) {
    if (!matchesRoutePrefix(route)) continue;
    await writeRoute(route, redirectDocument(route, target));
  }

  const exportedEndpoints = [];
  if (!isFilteredExport) {
    for (const [route, target] of endpointFiles) {
      const response = await fetchRoute(route);
      if (!response.ok) {
        throw new Error(`Cannot export ${route}: HTTP ${response.status}`);
      }
      await writeFile(path.join(outputRoot, target), await response.text());
      exportedEndpoints.push(route);
    }

    const policyResponse = await fetchRoute("/learner-data/policy");
    if (!policyResponse.ok) {
      throw new Error(
        `Cannot export /learner-data/policy: HTTP ${policyResponse.status}`,
      );
    }
    const policy = await policyResponse.text();
    JSON.parse(policy);
    await mkdir(path.join(outputRoot, "learner-data"), { recursive: true });
    await writeFile(path.join(outputRoot, "learner-data", "policy.json"), policy);
    exportedEndpoints.push("/learner-data/policy.json");
  }

  const notFoundResponse = await fetchRoute("/__project42_not_found__");
  const notFoundHtml = addStaticNavigation(await notFoundResponse.text());
  await writeFile(path.join(outputRoot, "404.html"), notFoundHtml);

  // A filtered export's own routes never include "/" (the site being
  // republished is a single existing Learn route, e.g. "/account"), but a
  // subdomain root still needs to resolve to something. Redirect it to the
  // one route this export actually owns rather than shipping a dead root.
  if (isFilteredExport && !htmlRoutes.includes("/")) {
    const target = htmlRoutes[0];
    await writeFile(
      path.join(outputRoot, "index.html"),
      `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
        `<meta http-equiv="refresh" content="0; url=${target}/">` +
        `<link rel="canonical" href="https://${canonicalDomain}${target}/">` +
        `<title>Redirecting…</title></head><body>` +
        `<p><a href="${target}/">Continue to ${canonicalDomain}${target}/</a></p>` +
        `</body></html>\n`,
    );
  }
  // The service worker is stamped with the commit being published, so every
  // artifact owns its own cache namespace and activation deletes the previous
  // one. A filtered export (admin/account subdomains) gets no worker: those are
  // operational consoles, not installable apps, and must not cache.
  if (!isFilteredExport) {
    await writeFile(
      path.join(outputRoot, "sw.js"),
      serviceWorkerSource(exportVersion(), portalConfig.organization.name),
    );
  }

  await writeFile(path.join(outputRoot, ".nojekyll"), "");
  await writeFile(path.join(outputRoot, "CNAME"), `${canonicalDomain}\n`);
  await writeFile(
    path.join(outputRoot, "pages-manifest.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        canonicalDomain,
        htmlRoutes,
        redirectRoutes: [...retiredLearningRedirects.keys()]
          .filter(matchesRoutePrefix)
          .sort(),
        endpoints: exportedEndpoints,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `GitHub Pages export ready: ${htmlRoutes.length} HTML routes, ` +
      `${retiredLearningRedirects.size} retired-path redirects and ` +
      `${exportedEndpoints.length} endpoints in ${outputRoot}.`,
  );
}

await main();
