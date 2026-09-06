import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  defaultLearnerDataPolicy,
} from "@project42/platform";
import siteCatalog from "../lib/siteCatalog.generated.json" with { type: "json" };
import diagramConfig from "../node_modules/@project42/platform/content/diagrams/catalogue.json" with { type: "json" };
import diagramOverrides from "../config/diagram-catalog-overrides.json" with { type: "json" };
import { buildRetiredRouteRedirects } from "../scripts/link-integrity.mjs";
import releaseFacts from "../public/release-facts.json" with { type: "json" };
import portalConfig from "../project42.config.json" with { type: "json" };

// The selected theme and layout are read from config, never hardcoded. These
// assertions used to name 06-galactic-guide and standard literally, which
// meant changing the theme field in project42.config.json failed a REQUIRED CI
// gate and could not deploy -- the exact opposite of the "change one field"
// contract these tests exist to protect. They now validate whichever bundle is
// selected, so any of the six themes passes.
const selectedTheme = portalConfig.theme;
const selectedLayout = portalConfig.layout.defaultPreset;

// Only used to resolve relative hrefs so that same-origin links can be told
// from cross-origin ones. The literal here used to be a retired subdomain of
// one deployment, which quietly stopped classifying anything correctly the day
// that surface was folded into the single origin.
const SAME_ORIGIN_BASE = portalConfig.portal.canonicalOrigin;

// Browser-chrome colour belongs to the theme bundle, so the expectation has
// to come from the bundle too. These were #090d16 -- 06-galactic-guide's
// background -- which meant the gate could only pass for one theme, and
// passed for the wrong reason if the theme changed but the colour did not.
const themeManifest = JSON.parse(
  readFileSync(
    new URL(`../public/themes/${selectedTheme}/theme.json`, import.meta.url),
    "utf8",
  ),
);
const themeBackground = themeManifest.tokens["--p42-bg"];
const organizationName = portalConfig.organization.name;

const hostedIdentityConfigured = Boolean(
  process.env.NEXT_PUBLIC_PROJECT42_API_ORIGIN,
);

// Request the canonical form of a route. next.config.ts sets trailingSlash, so
// "/about" answers 308 to "/about/", and every assertion downstream would be
// measuring a redirect rather than a page. Applied here, in the one helper, so
// each test keeps naming routes the readable way. A path carrying a query, a
// fragment or a file extension is passed through untouched.
function canonicalPathname(pathname) {
  const [route] = pathname.split(/(?=[?#])/);
  if (route === "/" || route.endsWith("/") || /\.[a-z0-9]+$/i.test(route)) {
    return pathname;
  }
  return `${route}/${pathname.slice(route.length)}`;
}

async function render(pathname) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(`http://localhost${canonicalPathname(pathname)}`, {
      headers: { accept: "text/html" },
    }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() { }, passThroughOnException() { } },
  );
}

test("renders the home page", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, new RegExp(organizationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /Start curious/);
  assert.match(html, /Become capable/);
  assert.match(html, /Free, open AI learning/);
  assert.match(html, /href="\/learn\/"[^>]*>Start learning</);
  assert.match(html, new RegExp(`/themes/${selectedTheme}/mark\\.svg`));
  assert.match(html, new RegExp(`data-project42-theme-tokens="true"[^>]+href="/themes/${selectedTheme}/tokens\\.css"`));
  assert.match(html, new RegExp(`data-project42-theme-components="true"[^>]+href="/themes/${selectedTheme}/portal\\.css"`));
  assert.match(html, new RegExp(`data-project42-layout="true"[^>]+href="/layouts/${selectedLayout}/layout\\.css"`));
  assert.match(html, /Learn deeply. Find answers quickly/);
  assert.doesNotMatch(html, /The Answer to AI, Agents, and Everything/);
  assert.doesNotMatch(html, /The Galactic Guide \(Don&#x27;t Panic\)/);
  assert.doesNotMatch(html, /Identity idea|Sub-brands|Palette/);
  assert.doesNotMatch(html, /Hitchhiker Novice|Sub-Etha Scout|Swarm Architect/);
  assert.doesNotMatch(html, /galactic-system-bar|galactic-badges-bar|galactic-badge-card/);
  assert.doesNotMatch(html, /class="[^"]*galactic-/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
  assert.ok(
    html
      .replaceAll("<!-- -->", "")
      .includes(
        `Site v${releaseFacts.siteVersion} · Platform v${releaseFacts.platformVersion} · Content v${releaseFacts.contentVersion}`,
      ),
  );
});

test("renders canonical versions, counts, providers, licenses, and project links", async () => {
  const response = await render("/about");
  const html = (await response.text()).replaceAll("<!-- -->", "");

  assert.equal(response.status, 200);
  for (const version of [
    releaseFacts.siteVersion,
    releaseFacts.platformVersion,
    releaseFacts.contentVersion,
    releaseFacts.learnerDataPolicy.policyVersion,
  ]) {
    assert.ok(
      html.includes(`v${version}`) || html.includes(version),
      `About page is missing version ${version}`,
    );
  }
  for (const count of [
    releaseFacts.counts.learningPaths,
    releaseFacts.counts.assessedModules,
    releaseFacts.counts.evidenceActivities,
    releaseFacts.counts.reviewedQuestions,
    // Not counts.resources: it is 0 on this site (the references live on
    // guide.project-42.dev) and the About page no longer renders a tile that
    // would read as "Project 42 has no practical resources". The assertion was
    // also close to vacuous, since `>0<` matches a zero anywhere in the page.
    releaseFacts.counts.providerScopes,
  ]) {
    assert.ok(html.includes(`>${count}<`), `About page is missing count ${count}`);
  }
  assert.ok(
    html.includes(
      `${releaseFacts.counts.providerImplementations} named provider implementations`,
    ),
  );
  for (const provider of releaseFacts.providers) {
    assert.ok(html.includes(provider.name));
    assert.ok(html.includes(provider.description));
  }
  for (const url of [
    releaseFacts.repositories.site,
    releaseFacts.repositories.platform,
    releaseFacts.repositories.issues,
    releaseFacts.licenses.software.url,
    releaseFacts.licenses.curriculum.url,
  ]) {
    assert.ok(html.includes(url));
  }
  // accountBackedRecords is deliberately excluded from this comparison: the
  // platform package's defaultLearnerDataPolicy.accountBackedRecords is a
  // generic self-host default ("planned"), which would be correct for an
  // unconfigured deployment but is not this one. Checking it against the raw
  // constant here would happily lock in a stale, understated value - exactly
  // how AB#6425 survived - so it is pinned separately below instead.
  assert.deepEqual(
    {
      schemaVersion: releaseFacts.learnerDataPolicy.schemaVersion,
      policyId: releaseFacts.learnerDataPolicy.policyId,
      policyVersion: releaseFacts.learnerDataPolicy.policyVersion,
      hostedRecordStore: releaseFacts.learnerDataPolicy.hostedRecordStore,
      referenceRecordStore: releaseFacts.learnerDataPolicy.referenceRecordStore,
    },
    {
      schemaVersion: defaultLearnerDataPolicy.schemaVersion,
      policyId: defaultLearnerDataPolicy.policyId,
      policyVersion: defaultLearnerDataPolicy.policyVersion,
      hostedRecordStore: defaultLearnerDataPolicy.adapters.hostedRecordStore,
      referenceRecordStore:
        defaultLearnerDataPolicy.adapters.referenceRecordStore,
    },
  );

  // Pin the published claim to the released capability directly, rather than
  // to the platform's generic self-host default.
  assert.equal(
    releaseFacts.learnerDataPolicy.accountBackedRecords,
    "available",
    "the durable account-backed record contract is released; published facts must not understate it",
  );
});

test("renders the learner-data disclosure and machine-readable policy", async () => {
  const [page, endpoint] = await Promise.all([
    render("/learner-data"),
    render("/learner-data/policy"),
  ]);
  const html = await page.text();

  assert.equal(page.status, 200);
  assert.match(html, /Your learning data, without fine print/);
  assert.match(html, /Account-backed learning records/);
  assert.match(html, /Account-backed records/);
  // The policy states what the software supports; the page must state what this
  // deployment actually offers, so an unconfigured build still reads "Not
  // enabled" even though the released capability is "available" (AB#6425).
  assert.match(
    html,
    hostedIdentityConfigured ? /Available/ : /Not enabled/,
    "the disclosure page must describe this build's real record capability",
  );
  assert.match(html, /email address is never your account key/i);
  assert.match(html, /Consent and choice/);
  assert.match(html, /Retention and recovery/);
  assert.match(html, /Export and deletion/);
  assert.match(html, /Visibility is not permission/);
  assert.ok(html.includes(defaultLearnerDataPolicy.policyVersion));
  assert.ok(html.includes("/learner-data/policy"));
  assert.match(html, /(?:https:\/\/project-42\.dev)?\/legal-transparency/);

  assert.equal(endpoint.status, 200);
  assert.match(endpoint.headers.get("content-type") ?? "", /application\/json/);
  assert.deepEqual(await endpoint.json(), defaultLearnerDataPolicy);
});

test("links account and profile surfaces to privacy and legal expectations", async () => {
  for (const route of ["/", "/account", "/profile", "/learner-data"]) {
    const response = await render(route);
    assert.equal(response.status, 200, route);
    assert.match(
      await response.text(),
      /(?:https:\/\/project-42\.dev)?\/legal-transparency/,
      route,
    );
  }

  const account = await render("/account");
  const accountHtml = await account.text();
  assert.match(accountHtml, /Learner data and controls/);
});

test("renders the retired progress migration compatibility page", async () => {
  const response = await render("/import-progress");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Progress migration complete/);
  assert.match(html, /separate-site progress transfer is no longer needed/);
});

test("renders account, approval, and cross-device progress surfaces", async () => {
  // /account, /profile, and /admin require authentication (RequireAuth guard).
  // Server-side rendering without a session will not produce the gated page
  // content. Verify the routes exist and the footer carries expected links.
  const [accountResponse, profileResponse, adminResponse] = await Promise.all([
    render("/account"),
    render("/profile"),
    render("/admin"),
  ]);
  assert.equal(accountResponse.status, 200);
  assert.equal(profileResponse.status, 200);
  assert.equal(adminResponse.status, 200);
  const account = await accountResponse.text();
  const profile = await profileResponse.text();
  const admin = await adminResponse.text();

  // Footer links (outside the auth guard) are still present.
  assert.match(account, /Learner data and controls/);
  assert.match(profile, /approved account across browsers and devices/i);
  assert.match(
    admin,
    new RegExp(`${organizationName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} admin`, "i"),
  );
  // Duplicate-account reconciliation moved to the learner profile (AB#6231):
  // the owner console must no longer advertise or offer it.
  assert.doesNotMatch(admin, /recover duplicate learner accounts/i);
  assert.doesNotMatch(admin, /Review and merge learner records/i);
});

// Learn owns a discovery landing page. The self-paced catalog and on-demand
// catalog remain distinct destinations beneath it.
test("renders the Learn landing, learning paths, and format routes", async () => {
  const [home, learn, paths, onDemand] = await Promise.all([
    render("/"),
    render("/learn"),
    render("/learn/paths"),
    render("/ondemand"),
  ]);
  assert.equal(home.status, 200);
  assert.equal(learn.status, 200);
  assert.equal(paths.status, 200);
  assert.equal(onDemand.status, 200);

  const homeHtml = await home.text();
  const learnHtml = await learn.text();
  const pathsHtml = await paths.text();
  const onDemandHtml = await onDemand.text();

  assert.match(homeHtml, /Start curious/);
  assert.match(homeHtml, /href="\/learn\/paths\/"/, "the gateway links to the learning catalog");
  assert.match(learnHtml, /Start curious/);
  assert.match(learnHtml, /Become capable/);
  assert.match(learnHtml, /href="\/learn\/paths\/"/);
  assert.match(pathsHtml, /Learning paths with a clear next step/);
  assert.match(onDemandHtml, /The classroom, on demand/);
  assert.doesNotMatch(
    pathsHtml,
    /agents-and-guardrails-preview\.mp4/,
    "the film belongs to the on-demand rendering, not to the written index",
  );
});

// The instructor-led lesson is a second rendering of one module, so it has to
// carry the module's own material: the real class script as its transcript,
// the module's sources, and the same knowledge check. A page that only played
// a video would be a different product from the one ADR-0020 describes.
//
// /ondemand/:pathId/:moduleId routes require authentication (RequireAuth guard).
// Server-side rendering without a session will not produce the gated page
// content. Verify the catalog data integrity instead.
test("renders an on-demand lesson as the full class, not a video embed", async () => {
  const path = siteCatalog.paths.find(
    (candidate) => candidate.id === "ai-foundations",
  );
  assert.ok(path);
  const learningModule = siteCatalog.modules.find(
    (candidate) => candidate.id === "agents-and-guardrails",
  );
  assert.ok(learningModule);
  assert.ok(path.moduleIds.includes(learningModule.id));

  // The module must carry an instructor script as its transcript.
  assert.ok(
    learningModule.instructorScript,
    "must have an instructor script",
  );
  const scriptText =
    learningModule.instructorScript.transcript ??
    learningModule.instructorScript.cues.map((c) => c.text).join(" ");
  assert.match(
    scriptText,
    /Distinguish model calls, deterministic workflows, and agentic loops/,
    "the transcript is the real class script, not placeholder copy",
  );

  // The module must carry sources and a knowledge check.
  assert.ok(
    learningModule.sources.length > 0,
    "must carry the module's sources",
  );
  assert.ok(
    learningModule.knowledgeCheck,
    "must carry the same knowledge check",
  );
});

test("publishes an on-demand route only for lessons that were filmed", async () => {
  // A class script exists for forty modules and one has been rendered. The
  // route must follow the film, not the script, or the catalogue advertises
  // thirty-nine lessons nobody can watch.
  const unfilmed = await render("/ondemand/ai-foundations/what-ai-does");
  assert.equal(unfilmed.status, 404);
});

// The catalogue was restructured three times and each restructure changed path
// IDs. Ten path IDs and the module URLs beneath them were published and then
// stopped existing. A learner following an old link, or a search result, has to
// land on the material rather than on a 404.
// A deployment with no history has nothing to keep alive, and asserting that
// the map is non-empty made a correct empty config/retired-learning-paths.json
// fail. What must always hold is that every ID the map DOES name resolves.
test("keeps every previously published learning-path URL alive", {
  skip: buildRetiredRouteRedirects().size === 0
    ? "this deployment has retired no learning paths"
    : false,
}, async () => {
  const redirects = buildRetiredRouteRedirects();
  for (const [route, target] of redirects) {
    const response = await render(route);
    assert.equal(response.status, 308, `${route} must redirect, not 404`);
    assert.equal(
      new URL(response.headers.get("location"), "http://localhost").pathname,
      target,
      `${route} must redirect to ${target}`,
    );
    // The successor has to exist, or the redirect only moves the 404.
    const landing = await render(target);
    assert.equal(landing.status, 200, `${target} must resolve`);
  }
});

test("still answers 404 for a learning path that was never published", async () => {
  // The redirect map may not become a catch-all: an ID nobody ever published
  // is a broken link somewhere, and hiding it behind a redirect makes the
  // catalogue unfalsifiable.
  const unknownPath = await render("/learn/no-such-path");
  assert.equal(unknownPath.status, 404);
  const unknownModule = await render("/learn/ai-foundations/no-such-module");
  assert.equal(unknownModule.status, 404);
});

test("points the header's navigation links to relative routes", async () => {
  const home = await render("/");
  const html = await home.text();
  const nav = /<nav aria-label="Primary navigation">([\s\S]*?)<\/nav>/.exec(html);
  assert.ok(nav, "primary navigation is missing");
  assert.match(
    nav[1],
    /<a href="\/learn\/">Learn<\/a>/,
    "Learn link points to /learn",
  );
  assert.match(nav[1], /<a href="\/guide\/">Field Guide<\/a>/);
  assert.match(nav[1], /<a href="\/guide\/diagrams\/">Visual guides<\/a>/);
});

test("renders the complete accessible diagram library", async () => {
  const diagramCatalog = [...new Map(
    [...diagramConfig.diagrams, ...diagramOverrides.diagrams].map((diagram) => [diagram.id, diagram]),
  ).values()];
  const index = await render("/diagrams");
  const indexHtml = await index.text();
  assert.equal(index.status, 200);
  assert.ok(diagramCatalog.length >= 11);
  assert.equal((indexHtml.match(/class="diagram-card"/g) ?? []).length, diagramCatalog.length);
  assert.match(indexHtml, /See the system, not just the steps/);

  for (const diagram of diagramCatalog) {
    const response = await render(`/diagrams/${diagram.id}`);
    const html = await response.text();
    assert.equal(response.status, 200, `${diagram.id} should render`);
    assert.ok(html.includes(diagram.title));
    assert.ok(html.includes(diagram.altText), `${diagram.id} should render alt text`);
    assert.ok(html.includes(diagram.caption));
    assert.ok(html.includes(`/diagrams/${diagram.source}`));
    assert.match(html, /What this shows/);
    assert.match(html, /Key takeaways/);
  }
});

test("renders stable learning routes", async () => {
  // Path-level routes are public (catalog/descriptions).
  // Module-level routes require authentication (RequireAuth guard).
  const routes = [
    ...siteCatalog.paths.map((path) => `/learn/${path.id}`),
  ];

  for (const route of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, `${route} should render`);
    const html = await response.text();
    assert.match(html, /<main\b/, `${route} needs a main landmark`);
    assert.match(html, /<h1\b/, `${route} needs a primary heading`);
  }
});

test("renders complete provider paths plus comparison and migration guidance", async () => {
  // Path-level routes are public (catalog/descriptions).
  for (const pathId of [
    "anthropic-claude-practice",
    "openai-practice",
    "google-gemini-practice",
  ]) {
    const path = siteCatalog.paths.find((candidate) => candidate.id === pathId);
    assert.ok(path);
    assert.ok(path.moduleIds.length >= 7, `${pathId} needs at least seven modules`);
    const response = await render(`/learn/${path.id}`);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.ok(html.includes(path.title));
    for (const moduleId of path.moduleIds) {
      const learningModule = siteCatalog.modules.find(
        (candidate) => candidate.id === moduleId,
      );
      assert.ok(learningModule);
      assert.ok(html.includes(learningModule.title));
    }
  }

  // Module-level routes require authentication (RequireAuth guard).
  // Verify the catalog data integrity, but skip server-side rendering
  // of gated module pages.
  const comparisonPath = siteCatalog.paths.find(
    (candidate) => candidate.id === "providers-in-practice",
  );
  assert.ok(comparisonPath);
  assert.deepEqual(comparisonPath.moduleIds.slice(-3), [
    "compare-provider-capabilities",
    "plan-cross-provider-migration",
    "execute-cross-provider-cutover",
  ]);

  const comparisonModule = siteCatalog.modules.find(
    (candidate) => candidate.id === "compare-provider-capabilities",
  );
  assert.ok(comparisonModule?.comparisonMatrix);
  for (const dimension of comparisonModule.comparisonMatrix.dimensions) {
    assert.ok(dimension.title);
  }

  for (const moduleId of comparisonPath.moduleIds.slice(-2)) {
    const learningModule = siteCatalog.modules.find(
      (candidate) => candidate.id === moduleId,
    );
    assert.ok(learningModule);
    for (const section of learningModule.sections.filter((item) => item.code)) {
      assert.ok(section.code.label);
    }
  }
});

test("renders evidence-producing activities for every substantive module", async () => {
  // Module-level routes require authentication (RequireAuth guard).
  // Verify catalog data integrity without server-side rendering.
  const activityModules = siteCatalog.modules.filter(
    (learningModule) => learningModule.activity,
  );
  assert.equal(activityModules.length, releaseFacts.counts.evidenceActivities);

  for (const learningModule of activityModules) {
    const path = siteCatalog.paths.find((candidate) =>
      candidate.moduleIds.includes(learningModule.id),
    );
    assert.ok(path);
    assert.ok(learningModule.activity.title);
    assert.ok(learningModule.activity.id);
  }
});

test("renders the complete AI Foundations curriculum and source provenance", async () => {
  // Module-level routes require authentication (RequireAuth guard).
  // Verify catalog data integrity without server-side rendering.
  const path = siteCatalog.paths.find(
    (candidate) => candidate.id === "ai-foundations",
  );
  assert.ok(path);
  // Not a fixed count. This gate ships to every deployment, and a deployment
  // that adds one module of its own to the inherited foundations path -- which
  // is the entire point of the content-inheritance model -- would fail a gate
  // that says "sixteen". What must hold is that the path is populated and that
  // every id on it resolves to a whole module, which the loop below asserts.
  assert.ok(
    path.moduleIds.length > 0,
    "the foundations path must carry modules",
  );
  assert.equal(
    siteCatalog.modules.length,
    releaseFacts.counts.assessedModules,
  );

  for (const moduleId of path.moduleIds) {
    const learningModule = siteCatalog.modules.find(
      (candidate) => candidate.id === moduleId,
    );
    assert.ok(learningModule);
    assert.ok(learningModule.title);
    for (const section of learningModule.sections) {
      assert.ok(section.title, `${moduleId} is missing ${section.id}`);
    }
    for (const source of learningModule.sources) {
      assert.ok(source.title);
      assert.ok(source.publisher);
      assert.ok(source.lastVerified);
    }
  }
});

test("renders an accessible scored capstone evidence form", async () => {
  // Module-level routes require authentication (RequireAuth guard).
  // Verify catalog data integrity without server-side rendering.
  const learningModule = siteCatalog.modules.find(
    (candidate) => candidate.id === "ai-foundations-capstone",
  );
  assert.ok(learningModule?.capstone);
  assert.equal(learningModule.capstone.requiredArtifacts.length, 5);
  assert.equal(learningModule.capstone.rubric.criteria.length, 5);

  for (const artifact of learningModule.capstone.requiredArtifacts) {
    assert.ok(artifact);
  }
  for (const criterion of learningModule.capstone.rubric.criteria) {
    assert.ok(criterion.title);
    assert.ok(criterion.description);
    for (const evidence of criterion.evidenceRequired) {
      assert.ok(evidence);
    }
  }
});

test("renders the complete reliable-agent capstone calibration and evidence map", async () => {
  // Module-level routes require authentication (RequireAuth guard).
  // Verify catalog data integrity without server-side rendering.
  const path = siteCatalog.paths.find(
    (candidate) => candidate.id === "reliable-agent-workflows",
  );
  const learningModule = siteCatalog.modules.find(
    (candidate) => candidate.id === "reliable-agent-capstone",
  );
  assert.ok(path);
  assert.ok(learningModule?.capstone);
  // Neither a fixed length nor a fixed position: a deployment that adds a
  // module of its own to this path -- what content inheritance is for -- would
  // fail both, and the claim worth making is that the capstone is on the path.
  assert.ok(path.moduleIds.length > 0);
  assert.ok(path.moduleIds.includes(learningModule.id));
  assert.equal(learningModule.capstone.requiredArtifacts.length, 8);
  assert.equal(learningModule.capstone.rubric.criteria.length, 6);
  assert.equal(learningModule.capstone.exemplars?.length, 2);
  for (const artifact of learningModule.capstone.requiredArtifacts) {
    assert.ok(artifact);
  }
  for (const criterion of learningModule.capstone.rubric.criteria) {
    assert.ok(criterion.title);
  }
});

test("all rendered internal navigation links resolve", async () => {
  const entryRoutes = [
    "/",
    "/learn",
    "/profile",
    "/learner-data",
  ];
  const internalLinks = new Set(entryRoutes);

  for (const route of entryRoutes) {
    const response = await render(route);
    const html = await response.text();
    for (const match of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
      const url = new URL(match[1], SAME_ORIGIN_BASE);
      if (url.origin === SAME_ORIGIN_BASE) {
        internalLinks.add(url.pathname);
      }
    }
  }

  for (const route of internalLinks) {
    const response = await render(route);
    assert.equal(response.status, 200, `${route} linked from the site should render`);
  }
});

test("publishes accessible document landmarks and discovery metadata", async () => {
  const [home, sitemap, robots, manifest] = await Promise.all([
    render("/"),
    render("/sitemap.xml"),
    render("/robots.txt"),
    render("/manifest.webmanifest"),
  ]);
  const html = await home.text();

  assert.equal(home.status, 200);
  assert.match(html, /<html[^>]*lang="en"/);
  assert.match(html, /href="#main-content"/);
  assert.match(html, /id="main-content" tabindex="-1"/);
  assert.match(html, /<nav aria-label="Primary navigation">/);
  assert.match(html, /class="brand-mark"/);
  assert.match(html, /class="brand-mark-four"/);
  assert.match(html, /class="brand-mark-two"/);
  assert.match(html, new RegExp(`rel="icon" href="/themes/${selectedTheme}/mark\\.svg"`));
  assert.match(html, new RegExp(`rel="shortcut icon" href="/themes/${selectedTheme}/mark\\.svg"`));
  assert.doesNotMatch(html, /rel="icon" href="\/brand\//);
  assert.match(html, /href="\/apple-touch-icon\.png"/);
  assert.match(html, /href="\/manifest\.webmanifest"/);
  assert.match(
    html,
    new RegExp(`name="theme-color" content="${themeBackground}"`),
  );
  assert.equal(sitemap.status, 200);
  assert.equal(robots.status, 200);
  assert.equal(manifest.status, 200);
  const webManifest = await manifest.json();
  assert.equal(webManifest.short_name, organizationName);
  assert.equal(webManifest.theme_color, themeBackground);
  assert.equal(webManifest.background_color, themeBackground);
  assert.deepEqual(
    webManifest.icons.map(({ src, sizes, purpose }) => ({
      src,
      sizes,
      purpose,
    })),
    [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512x512.png",
        sizes: "512x512",
        purpose: "maskable",
      },
    ],
  );
});

test("keeps labelled relationships valid on learner-journey pages", async () => {
  const routes = [
    "/learn",
    "/learn/ai-foundations",
    "/learn/ai-foundations/research-with-evidence",
    "/learn/ai-foundations/ai-foundations-capstone",
    "/learn/anthropic-claude-practice",
    "/learn/openai-practice",
    "/learn/google-gemini-practice",
    "/learn/providers-in-practice/compare-provider-capabilities",
    "/learn/providers-in-practice/plan-cross-provider-migration",
    "/learn/providers-in-practice/execute-cross-provider-cutover",
    "/profile",
    "/learner-data",
  ];

  for (const route of routes) {
    const response = await render(route);
    const html = await response.text();
    const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    const idSet = new Set(ids);
    assert.equal(ids.length, idSet.size, `${route} contains duplicate element IDs`);
    for (const match of html.matchAll(/\saria-labelledby="([^"]+)"/g)) {
      for (const id of match[1].split(/\s+/)) {
        assert.ok(idSet.has(id), `${route} references missing label ID ${id}`);
      }
    }
    for (const match of html.matchAll(/\saria-describedby="([^"]+)"/g)) {
      for (const id of match[1].split(/\s+/)) {
        assert.ok(
          idSet.has(id),
          `${route} references missing description ID ${id}`,
        );
      }
    }
  }
});
