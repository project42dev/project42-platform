#!/usr/bin/env node
// project42-portal -- the adopter's entry point into the platform.
//
//   project42-portal create <name>        scaffold a front end and a content
//                                         repository, inheritance wired
//   project42-portal materialise          install the front-end application
//                                         into the current repository
//   project42-portal doctor               report what a repository is missing
//
// WHY A MATERIALISER RATHER THAN A LIBRARY IMPORT
//
// The front end is a Next.js application. Its routes must be real files under
// app/, its stylesheet must be resolvable by PostCSS, its Playwright specs must
// see the same relative paths as the code they drive, and every one of the
// portal's twenty quality gates walks the tree with plain path reads. An
// application vendored into node_modules satisfies none of that.
//
// So the platform ships the application under web/, and `materialise` copies it
// onto the consuming repository's root -- app/, lib/, copy/, worker/, scripts/,
// tests/ and the build configs land at exactly the paths they occupied when the
// application lived in the front-end repository. Every gate then runs unchanged,
// and every relative import of instance data (../project42.config.json,
// ../../config/roadmap.json, ../../public/release-facts.json) resolves without a
// loader, because the instance data is still where it always was.
//
// The materialised files are build inputs, not source: they are git-ignored in
// the consuming repository and rewritten on every install. The single rule that
// keeps that safe is that materialise REFUSES to overwrite a git-tracked file --
// so an adopter who has genuinely forked a page gets an error, not a silent
// clobber.

import { execFileSync } from "node:child_process";
import { access, cp, mkdir, readFile, readdir, rm, rmdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(platformRoot, "web");
const templateRoot = path.join(platformRoot, "web", "template");

// The product ships its own theme and layout bundles. A site therefore has a
// complete, intentional appearance the moment it is installed -- no Gallery
// checkout, no sync step, no lock file, no network. The Gallery is where you
// go for a DIFFERENT look, not for a look at all.
const shippedThemesRoot = path.join(webRoot, "themes");
const shippedLayoutsRoot = path.join(webRoot, "layouts");

// Everything under web/ except template/, which is the seed for a NEW
// repository rather than part of the application.
const APP_ENTRIES = [
  "app",
  "copy",
  "lib",
  "scripts",
  "tests",
  "worker",
  "eslint.config.mjs",
  "next.config.ts",
  "playwright.config.ts",
  "playwright.pages.config.ts",
  "postcss.config.mjs",
  "tsconfig.json",
  "vite.config.ts",
];

// These live inside the materialised directories but belong to the deployment,
// so materialise must never write over them and .gitignore must keep tracking
// them. scripts/mint-github-app-token.mjs mints a token for one owner's GitHub
// App installation; tests/production/** drive one live deployment.
const INSTANCE_EXCEPTIONS = ["scripts/mint-github-app-token.mjs", "tests/production"];

// Files the materialiser writes itself. They live under a materialised root but
// are not copied from web/, so without this list the pruner would read them as
// product files the product no longer ships and delete them every run.
const GENERATED_FILES = [
  "lib/themeBundles.generated.ts",
  "lib/siteCatalog.generated.json",
  "lib/siteCatalog.generated.ts",
  "lib/progressCatalog.generated.ts",
];

function fail(message) {
  console.error(`project42-portal: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const positional = [];
  const flags = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const separator = token.indexOf("=");
      if (separator > 0) {
        flags.set(token.slice(2, separator), token.slice(separator + 1));
      } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
        flags.set(token.slice(2), argv[index + 1]);
        index += 1;
      } else {
        flags.set(token.slice(2), "true");
      }
    } else {
      positional.push(token);
    }
  }
  return { positional, flags };
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

function isGitRepository(root) {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function trackedFiles(root) {
  try {
    const output = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
    return new Set(output.split("\n").filter(Boolean));
  } catch {
    // Not a git repository, or git is unavailable. A fresh scaffold is the
    // normal case; there is nothing tracked to protect.
    return new Set();
  }
}

async function filesUnder(root, prefix = "") {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOTDIR") return [{ relative: prefix, absolute: root }];
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const output = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await filesUnder(absolute, relative)));
    else if (entry.isFile()) output.push({ relative, absolute });
  }
  return output;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

// ---------------------------------------------------------------- materialise

// lib/themeBrand.ts needs every installed theme's tokens at module scope: it
// runs in the Workers runtime during build, where there is no filesystem, so
// the bundles cannot be read at call time. It used to carry six hand-written
// import lines naming Project 42's own theme IDs -- product code that could
// only ever serve one operator. The index is generated from the consuming
// deployment's own availableThemes instead.
function themeBundleModule(themeIds) {
  const imported = themeIds.map((id, index) => ({ id, binding: `bundle${index}` }));
  return [
    "// GENERATED by `project42-portal materialise` from availableThemes in",
    "// project42.config.json. Do not edit; re-run the materialiser instead.",
    ...imported.map(
      (entry) => `import ${entry.binding} from "../public/themes/${entry.id}/theme.json";`,
    ),
    "",
    "export interface ThemeBundle {",
    "  tokens: Record<string, string>;",
    "}",
    "",
    "export const themeBundles: Record<string, ThemeBundle> = {",
    ...imported.map((entry) => `  ${JSON.stringify(entry.id)}: ${entry.binding},`),
    "};",
    "",
  ].join("\n");
}


// -------------------------------------------------------- the site catalogue
//
// WHY THE CATALOGUE IS GENERATED RATHER THAN IMPORTED
//
// The rendering application used to import `starterCatalog` from
// @project42/platform: the canonical curriculum, baked into the package at
// platform build time. That is the right default and the wrong ceiling. An
// adopter's own content repository publishes dist/catalog.json -- the inherited
// curriculum merged with their own modules -- and nothing read it, so an
// adopter's module existed, passed its own tests, and never appeared on their
// site.
//
// So the front end reads lib/siteCatalog.generated.json, written here, and the
// resolution has exactly two outcomes:
//
//   content.customContentDir configured  ->  that repository's dist/catalog.json
//   not configured                       ->  the platform's own catalogue
//
// There is no third outcome. A configured content repository whose catalogue is
// missing, unparseable or the wrong shape FAILS the install, naming the command
// that fixes it. Falling back to the starter catalogue there would ship a site
// silently missing its operator's own content -- indistinguishable, from the
// outside, from a site that never had any.

function contentDirFor(targetRoot, config) {
  // The environment override exists for CI, where a sibling checkout cannot
  // live at "../<name>-content": actions/checkout cannot write above the
  // workspace.
  const configured = process.env.PROJECT42_CONTENT_DIR || config.content?.customContentDir;
  return configured ? path.resolve(targetRoot, configured) : null;
}

function assertCatalogShape(catalog, origin) {
  const bad = (reason) =>
    fail(
      `the catalogue at ${origin} is not a catalogue: ${reason}. Rebuild it with ` +
        "`npm run content:build` in that repository; never hand-edit dist/.",
    );
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) bad("not an object");
  for (const key of ["paths", "modules", "resources", "providers"]) {
    if (!Array.isArray(catalog[key])) bad(`${key} is not an array`);
  }
  if (catalog.paths.length === 0) bad("it declares no learning paths");
  if (catalog.modules.length === 0) bad("it declares no modules");
}


// The progress projection.
//
// The three components that track a learner's progress -- ProgressProvider,
// ProfileDashboard, ProgressSnapshot -- are client components, and each was
// handed the whole catalogue. That put every module body, every knowledge
// check and every source list into the client bundle: 1.3 MB of prose the
// browser downloads and never renders, because the progress API reads exactly
// eight fields from it.
//
// Projecting at run time would not help -- a projection computed from the full
// object still has the full object in the module graph -- so the projection is
// generated here, into its own module that imports nothing else. What the
// browser downloads is then the shape of the curriculum without its content.
//
// The fields are every one the progress API touches: contentVersion for the
// version stamped on an attempt, paths for membership and badges, module ids
// and titles for transcripts, and the capstone definition for submissions.
// Anything else it needs later must be added here, and the type cast is why
// that is a deliberate act rather than an accident.
function progressProjection(catalog) {
  return {
    schemaVersion: catalog.schemaVersion,
    contentVersion: catalog.contentVersion,
    title: catalog.title,
    description: catalog.description,
    providers: catalog.providers,
    paths: catalog.paths.map((entry) => ({
      id: entry.id,
      title: entry.title,
      level: entry.level,
      summary: entry.summary,
      moduleIds: entry.moduleIds,
      badge: entry.badge,
    })),
    modules: catalog.modules.map((entry) => ({
      id: entry.id,
      pathId: entry.pathId,
      title: entry.title,
      ...(entry.capstone ? { capstone: entry.capstone } : {}),
    })),
    resources: [],
  };
}

async function writeSiteCatalog(targetRoot, config) {
  const contentDir = contentDirFor(targetRoot, config);
  let catalog;
  let origin;

  if (contentDir) {
    origin = path.join(contentDir, "dist", "catalog.json");
    if (!(await exists(contentDir))) {
      fail(
        `content.customContentDir points at ${contentDir}, which does not exist. ` +
          "Clone this deployment's content repository beside the front end, or set " +
          "PROJECT42_CONTENT_DIR to where it is checked out.",
      );
    }
    if (!(await exists(origin))) {
      fail(
        `${origin} has not been built. Run \`npm run content:sync\` then ` +
          `\`npm run content:build\` in ${contentDir} -- this site renders that merged ` +
          "catalogue, not the platform's own.",
      );
    }
    try {
      catalog = JSON.parse(await readFile(origin, "utf8"));
    } catch (error) {
      fail(`${origin} is not valid JSON (${error.message}). Rebuild it with \`npm run content:build\`.`);
    }
    assertCatalogShape(catalog, origin);
  } else {
    origin = "@project42/platform";
    ({ starterCatalog: catalog } = await import(
      pathToFileURL(path.join(platformRoot, "dist", "catalog.js")).href
    ));
    assertCatalogShape(catalog, origin);
  }

  // Two forms of one catalogue, written together so they cannot drift. The
  // TypeScript module is what the application imports: an annotated object
  // literal, exactly like the platform's own src/generated/catalog.ts, so the
  // compiler checks it against Catalog instead of inferring a megabyte-wide
  // literal type from a JSON import. The JSON is what the .mjs gates and
  // scripts read, since those cannot import TypeScript.
  const serialized = JSON.stringify(catalog, null, 2);
  await mkdir(path.join(targetRoot, "lib"), { recursive: true });
  await writeFile(
    path.join(targetRoot, "lib", "siteCatalog.generated.json"),
    `${serialized}\n`,
    "utf8",
  );
  await writeFile(
    path.join(targetRoot, "lib", "siteCatalog.generated.ts"),
    [
      "// GENERATED by `project42-portal materialise`. Do not edit.",
      `// Source: ${contentDir ? "the merged catalogue this deployment's content repository publishes" : "the canonical curriculum shipped by @project42/platform"}.`,
      'import type { Catalog } from "@project42/platform";',
      `export const generatedSiteCatalog: Catalog = ${serialized};`,
      "",
    ].join("\n"),
    "utf8",
  );
  const projection = `${JSON.stringify(progressProjection(catalog), null, 2)}`;
  await writeFile(
    path.join(targetRoot, "lib", "progressCatalog.generated.ts"),
    [
      "// GENERATED by `project42-portal materialise`. Do not edit.",
      "// The curriculum's shape without its content: what the client components that",
      "// track progress need, and nothing they do not download for no reason.",
      'import type { Catalog } from "@project42/platform";',
      `export const generatedProgressCatalog = ${projection} as unknown as Catalog;`,
      "",
    ].join("\n"),
    "utf8",
  );

  return {
    origin,
    paths: catalog.paths.length,
    modules: catalog.modules.length,
    resources: catalog.resources.length,
    projectionBytes: projection.length,
    catalogBytes: serialized.length,
  };
}

// ------------------------------------------------------------------- pruning
//
// materialise copies what the product ships. Without a matching removal, a file
// the product deletes upstream lives forever in every consumer: a dead route
// still exported to Pages, a retired gate still run by `npm run check`, a
// component nothing imports. The consumer's own .gitignore already states who
// owns what under a materialised root -- ignored means build input, un-ignored
// means a declared fork -- so the pruner reads that same contract rather than
// inventing a second one. It names everything it declines to delete, because
// leaving a stale product file behind is always better than deleting an
// adopter's work.

function ignoredPaths(root, relatives) {
  if (relatives.length === 0) return new Set();
  const listed = (output) => new Set((output ?? "").split(/\r?\n/).filter(Boolean));
  try {
    return listed(
      execFileSync("git", ["check-ignore", "--stdin"], {
        cwd: root,
        input: `${relatives.join("\n")}\n`,
        encoding: "utf8",
      }),
    );
  } catch (error) {
    // git exits 1 when nothing matched, which is a legitimate answer; any other
    // status means git could not answer and nothing may be deleted.
    if (error?.status === 1) return listed(error.stdout);
    return null;
  }
}

async function prune(targetRoot, planned, tracked, isGitRepository) {
  const shipped = new Set(planned.map((file) => file.relative));
  const protectedPaths = [...INSTANCE_EXCEPTIONS, ...GENERATED_FILES];

  const candidates = [];
  for (const entry of APP_ENTRIES) {
    for (const file of await filesUnder(path.join(targetRoot, entry), entry)) {
      if (shipped.has(file.relative)) continue;
      const isProtected = protectedPaths.some(
        (keep) => file.relative === keep || file.relative.startsWith(`${keep}/`),
      );
      if (!isProtected) candidates.push(file);
    }
  }
  if (candidates.length === 0) return { removed: [], kept: [] };

  // Without git there is no way to tell an adopter's file from a stale one, and
  // guessing wrong deletes their work. Report, delete nothing.
  const relatives = candidates.map((file) => file.relative);
  if (!isGitRepository) return { removed: [], kept: relatives };
  const ignored = ignoredPaths(targetRoot, relatives);
  if (ignored === null) return { removed: [], kept: relatives };

  const removed = [];
  const kept = [];
  for (const file of candidates) {
    // Tracked, or not ignored: the consumer has claimed this file.
    if (tracked.has(file.relative) || !ignored.has(file.relative)) kept.push(file.relative);
    else removed.push(file);
  }

  for (const file of removed) await rm(file.absolute, { force: true });

  // Then the directories those removals emptied, innermost first.
  const directories = [...new Set(removed.map((file) => path.dirname(file.absolute)))].sort(
    (a, b) => b.length - a.length,
  );
  for (const directory of directories) {
    let current = directory;
    while (current.startsWith(targetRoot) && current !== targetRoot) {
      try {
        await rmdir(current);
      } catch {
        break;
      }
      current = path.dirname(current);
    }
  }

  return { removed: removed.map((file) => file.relative), kept };
}

// ------------------------------------------------------ appearance resolution
//
// A theme is a FOLDER, and a site chooses one by naming it in
// project42.config.json. Resolution, highest precedence first:
//
//   1. themes/<id>/ in the site's own repository -- you downloaded a theme
//      folder, dropped it in, and named it. Nothing else changes: no script,
//      no manifest, no lock entry. This is the Hugo/Jekyll move.
//   2. public/themes/<id>/ already installed and tracked by git -- a site that
//      predates (1) and vendors its Gallery-synced bundles. Left untouched so
//      the Gallery sync keeps working as a convenience.
//   3. web/themes/<id>/ shipped by the platform -- the default. Every install
//      has one, so every install renders.
//
// public/themes/ is the rendered output of that decision and is a build input,
// exactly like app/. Layout bundles resolve the same way from layouts/.

async function readdirSafe(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

async function copyBundle(from, to) {
  await rm(to, { recursive: true, force: true });
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
}

// The lock is the durable, git-tracked record of "I pulled this one from the
// Gallery". It has to be the signal, because a bundle the sync writes into
// public/ is build output that a new scaffold git-ignores -- so tracking alone
// is not reliable, and without reading the lock the very next install would
// overwrite a freshly synced Gallery bundle with the platform default.
async function galleryLockedIds(targetRoot, kind) {
  try {
    const lock = await readJson(path.join(targetRoot, "config", "theme-bundles.lock.json"));
    return new Set(Object.keys((kind === "themes" ? lock.themes : lock.layouts) ?? {}));
  } catch {
    return new Set();
  }
}

async function resolveBundle(kind, id, targetRoot, tracked, shippedRoot, manifest, locked) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) fail(`unsafe ${kind} id: ${id}`);
  const repoFolder = path.join(targetRoot, kind, id);
  const installed = path.join(targetRoot, "public", kind, id);
  if (await exists(path.join(repoFolder, manifest))) {
    await copyBundle(repoFolder, installed);
    return "repository";
  }
  if (
    (await exists(path.join(installed, manifest))) &&
    (tracked.has(`public/${kind}/${id}/${manifest}`) || locked.has(id))
  ) {
    return "vendored";
  }
  const shipped = path.join(shippedRoot, id);
  if (await exists(path.join(shipped, manifest))) {
    await copyBundle(shipped, installed);
    return "platform";
  }
  const available = (await readdirSafe(shippedRoot)).join(", ") || "none";
  fail(
    `${kind} bundle "${id}" is named in project42.config.json but no folder ` +
      `provides it. Drop the folder in at ${kind}/${id}/ in this repository, or ` +
      `name one the platform ships (${available}).`,
  );
  return "missing";
}

async function resolveAppearance(targetRoot, config, tracked) {
  const themeIds = [...new Set(config.availableThemes ?? [config.theme])].sort();
  const layoutIds = [
    ...new Set([
      ...(config.layout?.availablePresets ?? []),
      config.layout?.defaultPreset ?? "standard",
    ]),
  ].sort();
  const lockedThemes = await galleryLockedIds(targetRoot, "themes");
  const lockedLayouts = await galleryLockedIds(targetRoot, "layouts");
  const origins = { repository: [], vendored: [], platform: [] };
  for (const id of themeIds) {
    origins[
      await resolveBundle(
        "themes", id, targetRoot, tracked, shippedThemesRoot, "theme.json", lockedThemes,
      )
    ].push(id);
  }
  const layoutOrigins = { repository: [], vendored: [], platform: [] };
  for (const id of layoutIds) {
    layoutOrigins[
      await resolveBundle(
        "layouts", id, targetRoot, tracked, shippedLayoutsRoot, "layout.json", lockedLayouts,
      )
    ].push(id);
  }
  return { themeIds, layoutIds, origins, layoutOrigins };
}

async function materialise(targetRoot, options = {}) {
  const force = options.force === true;
  const quiet = options.quiet === true;
  const configPath = path.join(targetRoot, "project42.config.json");
  if (!(await exists(configPath))) {
    fail(
      `no project42.config.json in ${targetRoot}. A front-end repository is its ` +
        "configuration; run `project42-portal create <name>` to scaffold one.",
    );
  }
  const config = await readJson(configPath);
  const tracked = trackedFiles(targetRoot);

  // Refuse before writing anything, so a repository that has forked a product
  // file is never left half-overwritten.
  const planned = [];
  for (const entry of APP_ENTRIES) {
    for (const file of await filesUnder(path.join(webRoot, entry), entry)) {
      const isException = INSTANCE_EXCEPTIONS.some(
        (keep) => file.relative === keep || file.relative.startsWith(`${keep}/`),
      );
      if (!isException) planned.push(file);
    }
  }
  const collisions = planned.filter((file) => tracked.has(file.relative));
  if (collisions.length > 0 && !force) {
    const sample = collisions.slice(0, 5).map((file) => file.relative).join(", ");
    fail(
      `${collisions.length} materialised path(s) are tracked by git in this ` +
        `repository, starting with ${sample}. The front-end application is a ` +
        "build input owned by @project42/platform; git-ignore these paths, or " +
        "pass --force if you intend to overwrite a deliberate fork.",
    );
  }

  const pruned = await prune(targetRoot, planned, tracked, isGitRepository(targetRoot));

  for (const file of planned) {
    const destination = path.join(targetRoot, file.relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(file.absolute, destination);
  }

  const catalogue = await writeSiteCatalog(targetRoot, config);

  const appearance = await resolveAppearance(targetRoot, config, tracked);
  const themeIds = appearance.themeIds;
  await writeFile(
    path.join(targetRoot, "lib", "themeBundles.generated.ts"),
    themeBundleModule(themeIds),
    "utf8",
  );

  // lib/copy.ts imports the override document statically. An absent file is a
  // build error rather than an empty override, so the materialiser guarantees
  // it exists. It is written once and never overwritten: it is the adopter's.
  const copyPath = path.join(targetRoot, "project42.copy.json");
  if (!(await exists(copyPath))) {
    const seed = {
      $comment:
        "Override any string from the platform's copy defaults. Leaves you omit keep the shipped wording. The full vocabulary is node_modules/@project42/platform/web/copy/.",
    };
    await writeFile(copyPath, `${JSON.stringify(seed, null, 2)}\n`, "utf8");
  }

  if (!quiet) {
    console.log(
      `Materialised ${planned.length} front-end files from @project42/platform ` +
        `into ${targetRoot} (${themeIds.length} theme bundle(s) indexed).`,
    );
    const describe = (map) =>
      Object.entries(map)
        .filter(([, ids]) => ids.length > 0)
        .map(([origin, ids]) => `${ids.join(", ")} from ${origin}`)
        .join("; ");
    console.log(
      `Appearance: themes ${describe(appearance.origins)}; ` +
        `layouts ${describe(appearance.layoutOrigins)}.`,
    );
    console.log(
      `Catalogue: ${catalogue.paths} path(s), ${catalogue.modules} module(s), ` +
        `${catalogue.resources} resource(s) from ${catalogue.origin}; ` +
        `progress projection ${Math.round(catalogue.projectionBytes / 1024)} KiB of ` +
        `${Math.round(catalogue.catalogBytes / 1024)} KiB.`,
    );
    if (pruned.removed.length > 0) {
      console.log(
        `Pruned ${pruned.removed.length} file(s) the product no longer ships: ` +
          `${pruned.removed.slice(0, 5).join(", ")}${pruned.removed.length > 5 ? ", ..." : ""}`,
      );
    }
    if (pruned.kept.length > 0) {
      console.log(
        `Left ${pruned.kept.length} unshipped file(s) in place because this repository ` +
          `claims them (tracked, or not git-ignored): ${pruned.kept.join(", ")}`,
      );
    }
  }
  return planned.length;
}

// --------------------------------------------------------------------- create

function slug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

const TEXT_SUFFIXES = [
  ".json",
  ".md",
  ".yml",
  ".yaml",
  ".ts",
  ".tsx",
  ".mjs",
  ".js",
  ".txt",
  "gitignore",
  "LICENSE",
];

async function substituteTree(root, replacements) {
  for (const file of await filesUnder(root)) {
    if (!TEXT_SUFFIXES.some((suffix) => file.absolute.endsWith(suffix))) continue;
    let text = await readFile(file.absolute, "utf8");
    let changed = false;
    for (const [token, value] of Object.entries(replacements)) {
      const needle = `{{${token}}}`;
      if (text.includes(needle)) {
        text = text.split(needle).join(value);
        changed = true;
      }
    }
    if (changed) await writeFile(file.absolute, text, "utf8");
  }
}

async function create(name, flags) {
  const id = slug(name);
  if (!id) fail("a repository name is required: project42-portal create <name>");
  const parent = path.resolve(flags.get("dir") ?? process.cwd());
  const frontendRoot = path.join(parent, id);
  const contentRoot = path.join(parent, `${id}-content`);

  for (const target of [frontendRoot, contentRoot]) {
    if (await exists(target)) fail(`${target} already exists`);
  }

  const organization = flags.get("org") ?? name;
  const theme = flags.get("theme") ?? "06-galactic-guide";
  const origin = (flags.get("origin") ?? `https://${id}.example.org`).replace(/\/$/, "");
  const adminOrigin =
    flags.get("admin-origin") ?? origin.replace("https://", "https://admin.");
  const galleryUrl = flags.get("gallery-url") ?? "https://gallery.project-42.dev";
  const tagline = flags.get("tagline") ?? "Practical, evidence-based AI learning.";
  const supportUrl = flags.get("support-url") ?? `${origin}/support`;
  const platformPackage = await readJson(path.join(platformRoot, "package.json"));
  const availableThemes = (flags.get("themes") ?? theme)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const replacements = {
    NAME: id,
    ORGANIZATION: organization,
    TAGLINE: tagline,
    ORIGIN: origin,
    ADMIN_ORIGIN: adminOrigin,
    GALLERY_URL: galleryUrl,
    SUPPORT_URL: supportUrl,
    THEME: theme,
    AVAILABLE_THEMES: JSON.stringify(availableThemes),
    PLATFORM_VERSION: platformPackage.version,
    YEAR: String(new Date().getUTCFullYear()),
  };

  await cp(path.join(templateRoot, "frontend"), frontendRoot, { recursive: true });
  await cp(path.join(templateRoot, "content"), contentRoot, { recursive: true });
  // npm refuses to publish a file literally named .gitignore inside a package,
  // so the template carries these without their leading dot and they are
  // renamed on the way out.
  for (const root of [frontendRoot, contentRoot]) {
    for (const dotfile of ["gitignore", "gitattributes"]) {
      const staged = path.join(root, dotfile);
      if (await exists(staged)) {
        await cp(staged, path.join(root, `.${dotfile}`));
        await rm(staged);
      }
    }
  }
  await substituteTree(frontendRoot, replacements);
  await substituteTree(contentRoot, replacements);

  // The front end declares where its curriculum comes from, and the content
  // repository declares what it inherits. Writing both here is what "with
  // inheritance wired" means: neither side has to be told again.
  const configPath = path.join(frontendRoot, "project42.config.json");
  const config = await readJson(configPath);
  config.content = {
    upstreamRepo: "https://github.com/project42dev/project42-content.git",
    upstreamBranch: "main",
    customContentDir: `../${id}-content`,
  };
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

  console.log(`Created ${frontendRoot}`);
  console.log(`Created ${contentRoot}`);
  console.log("");
  console.log("Next:");
  // The content repository first, and built, not merely synced: the front end
  // renders ITS dist/catalog.json -- the inherited curriculum merged with this
  // organisation's own modules -- and its install fails without one.
  console.log(`  cd ${contentRoot}`);
  console.log("  npm install && npm run content:sync && npm run content:build");
  console.log(`  cd ${frontendRoot}`);
  // No theme step. `npm install` materialises the application and resolves the
  // appearance, so the site has its complete default look before it is built.
  console.log("  npm install");
  // facts:generate rewrites README and public/release-facts.json from the
  // catalogue that was just installed. `prebuild` verifies them, so a build
  // before this one fails on the content release it cannot find.
  console.log("  npm run facts:generate");
  console.log("  npm run build");
  console.log("");
  console.log("To publish a module of your own afterwards:");
  console.log(`  cd ${contentRoot} && <add custom/modules/<id>.json> && npm run content:build`);
  console.log(`  cd ${frontendRoot} && npm run app:materialise && npm run facts:generate`);
}

// --------------------------------------------------------------------- doctor

async function doctor(targetRoot) {
  const findings = [];
  // config/theme-bundles.lock.json is deliberately NOT required. It records
  // bundles a site pulled from the Gallery; a site whose appearance comes from
  // its own themes/ folder or from the platform default never has one.
  const required = [
    "project42.config.json",
    "project42.copy.json",
    "package.json",
  ];
  for (const relative of required) {
    if (!(await exists(path.join(targetRoot, relative)))) findings.push(`missing ${relative}`);
  }
  if (await exists(path.join(targetRoot, "project42.config.json"))) {
    const config = await readJson(path.join(targetRoot, "project42.config.json"));
    for (const id of config.availableThemes ?? [config.theme]) {
      const resolvable =
        (await exists(path.join(targetRoot, "themes", id, "theme.json"))) ||
        (await exists(path.join(targetRoot, "public", "themes", id, "theme.json"))) ||
        (await exists(path.join(shippedThemesRoot, id, "theme.json")));
      if (!resolvable) {
        findings.push(
          `theme "${id}" is named in project42.config.json but no folder provides it -- ` +
            `drop the theme folder in at themes/${id}/, or name one the platform ships ` +
            `(${(await readdirSafe(shippedThemesRoot)).join(", ") || "none"})`,
        );
      }
    }
  }
  if (!(await exists(path.join(targetRoot, "app", "layout.tsx")))) {
    findings.push("front-end application not materialised -- run npm run app:materialise");
  }
  if (await exists(path.join(targetRoot, "project42.config.json"))) {
    const config = await readJson(path.join(targetRoot, "project42.config.json"));
    const contentDir = contentDirFor(targetRoot, config);
    if (contentDir && !(await exists(path.join(contentDir, "dist", "catalog.json")))) {
      findings.push(
        `content repository ${contentDir} has no dist/catalog.json -- run ` +
          "`npm run content:sync && npm run content:build` there, then npm run app:materialise",
      );
    }
    if (!(await exists(path.join(targetRoot, "lib", "siteCatalog.generated.json")))) {
      findings.push(
        "no merged catalogue installed -- run npm run app:materialise (this site renders " +
          "lib/siteCatalog.generated.json, not the platform's own catalogue)",
      );
    }
  }
  if (findings.length === 0) {
    console.log(`${targetRoot} is a complete Project 42 front-end repository.`);
    return 0;
  }
  for (const finding of findings) console.log(`- ${finding}`);
  return 1;
}

// ----------------------------------------------------------------------- main

const USAGE = [
  "project42-portal <command>",
  "",
  "  create <name> [--dir <parent>] [--org <name>] [--theme <id>]",
  "                [--themes <id,id>] [--origin <url>] [--tagline <text>]",
  "      Scaffold a front-end repository and a content repository beside it,",
  "      with content inheritance already wired between them.",
  "",
  "  materialise [--target <dir>] [--force]",
  "      Install the front-end application into a front-end repository.",
  "      Run automatically by that repository's postinstall.",
  "",
  "  doctor [--target <dir>]",
  "      Report what a front-end repository is missing.",
].join("\n");

const { positional, flags } = parseArgs(process.argv.slice(2));
const command = positional[0] ?? "help";
const target = path.resolve(flags.get("target") ?? process.cwd());

if (command === "materialise" || command === "materialize") {
  await materialise(target, { force: flags.get("force") === "true" });
} else if (command === "create") {
  await create(positional[1] ?? "", flags);
} else if (command === "doctor") {
  process.exit(await doctor(target));
} else {
  console.log(USAGE);
  if (command !== "help") process.exit(1);
}
