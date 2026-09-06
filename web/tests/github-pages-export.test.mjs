import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  defaultLearnerDataPolicy,
} from "@project42/platform";
import siteCatalog from "../lib/siteCatalog.generated.json" with { type: "json" };
import {
  buildRetiredRouteRedirects,
  buildRouteInventory,
} from "../scripts/link-integrity.mjs";
import portalConfig from "../project42.config.json" with { type: "json" };

// The exporter reads its canonical domain and its Admin redirect target from
// project42.config.json, so this suite reads the same source. Asserting the
// literals a single deployment happens to use would fail every adopter whose
// origins differ, which is the class of defect the move into the platform
// exists to remove.
const canonicalDomain = new URL(portalConfig.portal.canonicalOrigin).hostname;
const adminOrigin = portalConfig.portal.adminOrigin.replace(/\/$/, "");

const projectRoot = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(projectRoot, "dist", "pages");

test("exports every governed route for GitHub Pages", async () => {
  const inventory = buildRouteInventory(siteCatalog);
  const manifest = JSON.parse(
    await readFile(path.join(outputRoot, "pages-manifest.json"), "utf8"),
  );

  assert.equal(manifest.canonicalDomain, canonicalDomain);
  assert.deepEqual(manifest.htmlRoutes, inventory.htmlRoutes);
  assert.ok(inventory.htmlRoutes.includes("/account"));
  assert.ok(inventory.htmlRoutes.includes("/account/github/callback"));
  assert.ok(inventory.htmlRoutes.includes("/admin"));
  assert.ok(inventory.htmlRoutes.includes("/auth/callback"));
  for (const route of inventory.htmlRoutes) {
    const relative = route === "/" ? "index.html" : `${route.slice(1)}/index.html`;
    await access(path.join(outputRoot, relative));
  }
});

test("keeps previously published learning-path URLs alive in the artifact", async () => {
  // The hosted worker answers a retired path ID with a 308. A static artifact
  // cannot send a status code, so the export writes the same meta-refresh
  // document the retired Admin routes get. Without this the Pages copy would
  // still 404 on every URL the redirect map exists to rescue.
  const redirects = buildRetiredRouteRedirects(siteCatalog);
  const manifest = JSON.parse(
    await readFile(path.join(outputRoot, "pages-manifest.json"), "utf8"),
  );
  assert.deepEqual(manifest.redirectRoutes, [...redirects.keys()].sort());
  for (const [route, target] of redirects) {
    const html = await readFile(
      path.join(outputRoot, `${route.slice(1)}`, "index.html"),
      "utf8",
    );
    assert.match(html, new RegExp(`content="0; url=${target}"`));
    assert.match(html, /name="robots" content="noindex"/);
  }
});

test("keeps public account routes live while isolating Admin AB#6167", async () => {
  // Account remains part of the unified public journey. Admin is replaced by a
  // noindex redirect in the hosted public artifact.
  const [account, admin] = await Promise.all([
    readFile(path.join(outputRoot, "account", "index.html"), "utf8"),
    readFile(path.join(outputRoot, "admin", "index.html"), "utf8"),
  ]);

  assert.doesNotMatch(account, /<meta http-equiv="refresh"/);
  // The Admin redirect target is portal.adminOrigin, which the exporter
  // already reads. Asserting one deployment's Admin host here meant every
  // other deployment failed a gate that its own exporter had satisfied.
  assert.ok(
    admin.includes(`${adminOrigin}/admin/`),
    `Admin redirect should point at ${adminOrigin}/admin/`,
  );
  assert.match(account, /One learning record/);
  assert.doesNotMatch(admin, /Accounts &amp; Registrations/);
});

test("retires only Admin routes in hosted public artifacts AB#6167", async () => {
  const retiredRoot = path.join(projectRoot, "dist", "pages-retired-test");
  execFileSync(
    process.execPath,
    [
      path.join(projectRoot, "scripts", "export-github-pages.mjs"),
      "--retire-admin-routes",
      "--out=pages-retired-test",
    ],
    { cwd: projectRoot, stdio: "pipe" },
  );

  const [account, admin, githubCallback] = await Promise.all([
    readFile(path.join(retiredRoot, "account", "index.html"), "utf8"),
    readFile(path.join(retiredRoot, "admin", "index.html"), "utf8"),
    readFile(
      path.join(retiredRoot, "account", "github", "callback", "index.html"),
      "utf8",
    ),
  ]);

  for (const [html, target] of [
    [admin, `${adminOrigin}/admin/`],
  ]) {
    assert.match(html, new RegExp(`<meta http-equiv="refresh" content="0; url=${target}">`));
    assert.match(html, new RegExp(`<link rel="canonical" href="${target}">`));
    assert.match(html, /<meta name="robots" content="noindex">/);
    // The published artifact must not keep serving a second live copy of a
    // surface that now belongs to its own subdomain.
    assert.doesNotMatch(html, /AccountDashboard|AdminDashboard/);
  }

  assert.match(account, /One learning record/);
  assert.doesNotMatch(admin, /Accounts &amp; Registrations/);

  // /account/github/callback is the live GitHub identity-link redirect URI
  // (GITHUB_LINK_REDIRECT_URI still points at learn.project-42.dev), so it is
  // deliberately NOT retired - retiring it would break identity linking.
  assert.doesNotMatch(githubCallback, /<meta http-equiv="refresh"/);
});

test("publishes current release facts and learner-data disclosure", async () => {
  const [home, learnerData, releaseFacts, policy, installedPlatform, application] = await Promise.all([
    readFile(path.join(outputRoot, "index.html"), "utf8"),
    readFile(path.join(outputRoot, "learner-data", "index.html"), "utf8"),
    readFile(path.join(outputRoot, "release-facts.json"), "utf8").then(JSON.parse),
    readFile(path.join(outputRoot, "learner-data", "policy.json"), "utf8").then(
      JSON.parse,
    ),
    readFile(
      path.join(projectRoot, "node_modules", "@project42", "platform", "package.json"),
      "utf8",
    ).then(JSON.parse),
    readFile(path.join(projectRoot, "package.json"), "utf8").then(JSON.parse),
  ]);

  const normalizedHome = home.replaceAll("<!-- -->", "");
  assert.match(normalizedHome, /Project 42/);
  assert.ok(normalizedHome.includes(`Site v${releaseFacts.siteVersion}`));
  assert.match(learnerData, /Your learning data, without fine print/);
  assert.match(learnerData, /href="\/learner-data\/policy\.json"/);
  assert.equal(releaseFacts.siteVersion, application.version);
  assert.equal(releaseFacts.platformVersion, installedPlatform.version);
  assert.equal(releaseFacts.learnerDataPolicy.policyVersion, "2026-07-27");
  assert.equal(
    releaseFacts.learnerDataPolicy.hostedRecordStore,
    "cloudflare-d1",
  );
  assert.deepEqual(policy, defaultLearnerDataPolicy);
});

test("contains GitHub Pages controls without server or Sites metadata", async () => {
  assert.equal(
    await readFile(path.join(outputRoot, "CNAME"), "utf8"),
    `${canonicalDomain}\n`,
  );
  await access(path.join(outputRoot, ".nojekyll"));
  await access(path.join(outputRoot, "404.html"));
  await assert.rejects(access(path.join(outputRoot, ".openai")));
  await assert.rejects(access(path.join(outputRoot, "server")));
});

test("publishes a versioned service worker at the scope root with an offline fallback", async () => {
  // The worker must sit at the export root: one served from a subdirectory can
  // only control that subdirectory, so the site would silently stop being
  // installable with no error anywhere.
  const worker = await readFile(path.join(outputRoot, "sw.js"), "utf8");

  // Stamped per artifact, so activation deletes the previous deploy's caches
  // and a stale response can never outlive the deploy that replaced it.
  const version = worker.match(/const VERSION = "([^"]+)";/)?.[1];
  assert.ok(version, "the published worker carries no version");
  assert.match(version, /^[A-Za-z0-9._-]+$/);
  assert.match(worker, /const RUNTIME = "p42-runtime-" \+ VERSION;/);

  // The fallback it caches on install has to be a route the export produced.
  const offlineUrl = worker.match(/OFFLINE_URL = "([^"]+)"/)?.[1];
  assert.equal(offlineUrl, "/offline/");
  await access(path.join(outputRoot, "offline", "index.html"));

  const manifest = JSON.parse(
    await readFile(path.join(outputRoot, "manifest.webmanifest"), "utf8"),
  );
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.display, "standalone");
  assert.ok(
    manifest.icons.some((icon) => icon.purpose === "maskable"),
    "an installable manifest needs a maskable icon",
  );
});

test("every published page carries the metadata iOS needs to install it", async () => {
  // Asserted on the EXPORTED HTML, not on the source. Both of these were
  // declared correctly in app/layout.tsx and silently not emitted: Next 16
  // dropped viewport-fit from the viewport meta, and replaced
  // apple-mobile-web-app-capable with the standard name that iOS Safari does
  // not read. A source-level assertion passed the whole time.
  for (const page of ["index.html", "about/index.html", "offline/index.html", "404.html"]) {
    const html = await readFile(path.join(outputRoot, page), "utf8");

    const viewport = html.match(/<meta name="viewport" content="([^"]*)"/)?.[1];
    assert.ok(viewport, `${page} has no viewport meta`);
    assert.match(
      viewport,
      /viewport-fit=cover/,
      `${page} is letterboxed inside the display cutout, and every ` +
        `env(safe-area-inset-*) in globals.css resolves to 0 without this`,
    );
    // Exactly one, or the framework's tag wins over ours.
    assert.equal((html.match(/<meta name="viewport"/g) ?? []).length, 1);

    assert.match(
      html,
      /<meta name="apple-mobile-web-app-capable" content="yes"\/?>/,
      `${page} would be added to an iPhone home screen as a Safari bookmark, ` +
        `not as a standalone app`,
    );
  }
});

test("a filtered --domain/--routes export publishes only its own routes with cross-subdomain nav links AB#6851", async () => {
  const filteredOutputRoot = path.join(projectRoot, "dist", "pages-account-test");
  execFileSync(
    process.execPath,
    [
      "scripts/export-github-pages.mjs",
      "--domain=account.project-42.dev",
      "--routes=/account",
      "--out=pages-account-test",
    ],
    { cwd: projectRoot, stdio: "pipe" },
  );

  const manifest = JSON.parse(
    await readFile(path.join(filteredOutputRoot, "pages-manifest.json"), "utf8"),
  );
  assert.equal(manifest.canonicalDomain, "account.project-42.dev");
  assert.deepEqual(manifest.htmlRoutes, [
    "/account",
    "/account/github/callback",
  ]);
  assert.deepEqual(manifest.endpoints, []);

  assert.equal(
    await readFile(path.join(filteredOutputRoot, "CNAME"), "utf8"),
    "account.project-42.dev\n",
  );
  await assert.rejects(
    access(path.join(filteredOutputRoot, "learn", "index.html")),
    "a filtered export must not publish routes it doesn't own",
  );
  await assert.rejects(
    access(path.join(filteredOutputRoot, "learner-data")),
    "a filtered export skips site-wide endpoints, not just unowned HTML routes",
  );
  await assert.rejects(
    access(path.join(filteredOutputRoot, "sw.js")),
    "admin and account are operational consoles, not installable apps: a " +
      "worker there would cache session-adjacent pages on a session-bearing origin",
  );

  const accountPage = await readFile(
    path.join(filteredOutputRoot, "account", "index.html"),
    "utf8",
  );
  assert.ok(
    accountPage.length > 500 && accountPage.includes("One learning record. Your account."),
    "a filtered export renders the owned account page correctly",
  );
  const rootRedirect = await readFile(
    path.join(filteredOutputRoot, "index.html"),
    "utf8",
  );
  assert.match(rootRedirect, /content="0; url=\/account\/"/);
});
