import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { serviceWorkerSource } from "../scripts/service-worker.mjs";

const root = path.resolve(import.meta.dirname, "..");

async function read(relative) {
  return readFile(path.join(root, relative), "utf8");
}

// The portal is meant to install and run standalone on iPhone, iPad and
// desktop. Every requirement for that is a small, quiet detail that is easy to
// delete by accident and produces no error when it is missing -- the site just
// silently stops being installable. These assertions are the alarm.

test("the manifest describes an installable, themed application", async () => {
  const manifest = await read("app/manifest.ts");

  for (const field of [
    'id: "/"',
    'start_url: "/"',
    'scope: "/"',
    'display: "standalone"',
    "display_override:",
    'lang: "en"',
    'dir: "ltr"',
    "categories:",
    "shortcuts:",
  ]) {
    assert.ok(manifest.includes(field), `manifest is missing ${field}`);
  }

  // Chrome only offers its richer install dialog when both form factors are
  // declared; without them the install affordance degrades to a bare chip.
  assert.match(manifest, /form_factor: "wide"/);
  assert.match(manifest, /form_factor: "narrow"/);

  for (const purpose of ['purpose: "any"', 'purpose: "maskable"']) {
    assert.ok(manifest.includes(purpose), `manifest is missing an icon with ${purpose}`);
  }
});

test("browser chrome colour comes from the theme bundle, not from core", async () => {
  const manifest = await read("app/manifest.ts");
  const layout = await read("app/layout.tsx");

  assert.match(manifest, /background_color: brand\.background/);
  assert.match(manifest, /theme_color: brand\.theme/);
  assert.match(layout, /themeColor: brand\.theme/);
  assert.match(layout, /color: brand\.mask/);

  // The theme-boundary gate only scans CSS, so a colour literal in these two
  // files would otherwise ship an installed app still wearing the previous
  // theme's splash screen and status bar.
  for (const [name, source] of [["app/manifest.ts", manifest], ["app/layout.tsx", layout]]) {
    const literals = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    assert.deepEqual(literals, [], `${name} declares colour literals: ${literals.join(", ")}`);
  }
});

test("iOS standalone metadata and safe-area viewport are declared", async () => {
  const layout = await read("app/layout.tsx");

  // iOS shows no install prompt and ignores the manifest for standalone mode.
  // Without these tags, Add to Home Screen produces a bookmark in Safari chrome.
  assert.match(layout, /appleWebApp: \{/);
  assert.match(layout, /capable: true/);
  assert.match(layout, /statusBarStyle: "black-translucent"/);

  assert.match(layout, /viewportFit: "cover"/);
  assert.match(layout, /width: "device-width"/);
  assert.match(layout, /initialScale: 1/);
});

test("every edge that viewport-fit=cover exposes is padded", async () => {
  const styles = await read("app/globals.css");

  // viewport-fit=cover without these puts the header under the notch and the
  // footer under the home indicator.
  for (const selector of [".site-header", ".site-footer", ".skip-link"]) {
    const block = styles.slice(styles.lastIndexOf(`${selector} {`));
    assert.ok(
      /env\(safe-area-inset-/.test(block.slice(0, 400)),
      `${selector} does not account for the safe-area insets`,
    );
  }

  for (const inset of ["top", "bottom", "left", "right"]) {
    assert.ok(
      styles.includes(`env(safe-area-inset-${inset}`),
      `no rule accounts for safe-area-inset-${inset}`,
    );
  }
});

test("the service worker is registered only for the published origin", async () => {
  const component = await read("app/components/ServiceWorkerRegistration.tsx");
  const layout = await read("app/layout.tsx");

  assert.match(component, /navigator\.serviceWorker\.register\("\/sw\.js"/);
  // A worker registered on localhost would serve cached responses back to
  // pages:serve and to the Playwright suites, so a run could silently be
  // testing the previous build.
  assert.match(component, /window\.location\.origin !== canonicalOrigin/);
  assert.match(layout, /<ServiceWorkerRegistration canonicalOrigin=\{config\.portal\.canonicalOrigin\} \/>/);
});

test("the service worker never caches a session-bearing path", () => {
  const source = serviceWorkerSource("testversion");

  // A cached copy of any of these can show one person's state to the next or
  // resurrect a session the user has ended.
  for (const route of [
    "/auth/",
    "/account",
    "/profile",
    "/learner-data",
    "/import-progress",
    "/transfer-progress",
    "/admin",
  ]) {
    assert.ok(
      source.includes(`"${route}"`),
      `${route} is not in the service worker's never-cache list`,
    );
  }

  // The API is a separate origin and carries the session; the worker must not
  // touch cross-origin requests at all.
  assert.match(source, /url\.origin !== self\.location\.origin\) return;/);
  assert.match(source, /request\.method !== "GET"\) return;/);
});

test("each published artifact owns its own cache namespace", () => {
  const first = serviceWorkerSource("aaaaaaaaaaaa");
  const second = serviceWorkerSource("bbbbbbbbbbbb");

  assert.match(first, /const VERSION = "aaaaaaaaaaaa";/);
  assert.notEqual(first, second);
  // Activation must delete every cache that is not this version's, or a stale
  // response could outlive the deploy that replaced it.
  assert.match(first, /keys\.filter\(\(key\) => key !== RUNTIME\)\.map\(\(key\) => caches\.delete\(key\)\)/);
  assert.match(first, /OFFLINE_URL = "\/offline\/"/);

  for (const bad of ["", "a b", "../etc", 'x";evil()//', 42, null]) {
    assert.throws(() => serviceWorkerSource(bad), /Unusable service-worker version/);
  }
});

test("the offline fallback is a real exported route", async () => {
  const page = await read("app/offline/page.tsx");
  assert.match(page, /export default function OfflinePage/);
  // Caching a route the export does not produce would leave the worker with no
  // fallback at all.
  assert.match(serviceWorkerSource("v"), /cache\.add\(OFFLINE_URL\)/);
});
