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
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const platformRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(platformRoot, "web");
const templateRoot = path.join(platformRoot, "web", "template");

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

  for (const file of planned) {
    const destination = path.join(targetRoot, file.relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(file.absolute, destination);
  }

  const declared = config.availableThemes ?? [config.theme];
  const themeIds = [...new Set(declared)].sort();
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
  // so the template carries it as "gitignore" and it is renamed on the way out.
  for (const root of [frontendRoot, contentRoot]) {
    const staged = path.join(root, "gitignore");
    if (await exists(staged)) {
      await cp(staged, path.join(root, ".gitignore"));
      await rm(staged);
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
  console.log(`  cd ${contentRoot} && npm run content:sync`);
  console.log(`  cd ${frontendRoot} && npm install`);
  console.log("  npm run themes:sync -- --source <a project42-gallery checkout>");
  console.log("  npm run build");
}

// --------------------------------------------------------------------- doctor

async function doctor(targetRoot) {
  const findings = [];
  const required = [
    "project42.config.json",
    "project42.copy.json",
    "config/theme-bundles.lock.json",
    "package.json",
  ];
  for (const relative of required) {
    if (!(await exists(path.join(targetRoot, relative)))) findings.push(`missing ${relative}`);
  }
  if (await exists(path.join(targetRoot, "project42.config.json"))) {
    const config = await readJson(path.join(targetRoot, "project42.config.json"));
    for (const id of config.availableThemes ?? []) {
      if (!(await exists(path.join(targetRoot, "public", "themes", id, "theme.json")))) {
        findings.push(
          `theme bundle ${id} is declared but not installed -- run npm run themes:sync`,
        );
      }
    }
  }
  if (!(await exists(path.join(targetRoot, "app", "layout.tsx")))) {
    findings.push("front-end application not materialised -- run npm run app:materialise");
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
