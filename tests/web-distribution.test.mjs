// The front-end distribution contract.
//
// web/ is the rendering half of the product and bin/project42-portal.mjs is how
// an adopter gets it. Neither is exercised by this repository's own build --
// there is no React toolchain here, on purpose, because Next and its transitive
// tree would enter `audit:production` and never be clean again. So the gate that
// keeps the distribution honest is this file: it asserts the package ships the
// application, that the materialiser installs it, that the scaffolder produces
// two working repositories, and that no single deployment's values have crept
// back into product code.

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webDir = path.join(rootDir, "web");
const cli = path.join(rootDir, "bin", "project42-portal.mjs");

function walk(directory, prefix = "") {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute, relative));
    else output.push(relative);
  }
  return output;
}

function scaffoldConfig(themes) {
  return {
    theme: themes[0],
    availableThemes: themes,
    galleryUrl: "https://gallery.example.org",
    layout: { defaultPreset: "standard" },
    portal: {
      canonicalOrigin: "https://learn.example.org",
      adminOrigin: "https://admin.example.org",
      legacyOrigins: [],
    },
    organization: {
      name: "Example Academy",
      tagline: "Practical AI learning.",
      supportUrl: "https://example.org/support",
    },
  };
}

test("the package ships the front-end application and the adopter CLI", () => {
  const manifest = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
  assert.ok(manifest.files.includes("web"), "files must include web/ or a git install ships no front end");
  assert.ok(manifest.files.includes("bin"), "files must include bin/");
  assert.equal(manifest.bin["project42-portal"], "./bin/project42-portal.mjs");
  assert.ok(existsSync(cli), "the CLI must exist");

  // The rendering half really is here, not a stub.
  for (const required of [
    "app/layout.tsx",
    "app/page.tsx",
    "app/globals.css",
    "lib/theme.ts",
    "lib/layout.ts",
    "lib/themeBrand.ts",
    "lib/copy.ts",
    "copy/defaults.ts",
    "worker/index.ts",
    "tsconfig.json",
    "vite.config.ts",
    "template/frontend/package.json",
    "template/content/package.json",
  ]) {
    assert.ok(existsSync(path.join(webDir, required)), `web/${required} must be shipped`);
  }
  assert.ok(
    statSync(path.join(webDir, "app/globals.css")).size > 100_000,
    "globals.css is the portal's design system; a small one means it was not shipped",
  );
});

test("no ignore rule silently drops a packaged file", () => {
  // This caught a shipping defect. .gitignore carried an unanchored "logs",
  // which matched web/app/admin/logs -- a real route -- so npm excluded it
  // when installing this package as a git dependency. The tarball built here
  // contained the file and the tarball npm built during install did not, so
  // the loss was invisible until a consuming site 404ed a page its own link
  // gate had inventoried. Every file the package ships must survive that.
  const packaged = execFileSync("git", ["ls-files", "web", "bin", "schemas"], {
    cwd: rootDir,
    encoding: "utf8",
  })
    .split(/\r?\n/)
    .filter(Boolean);
  assert.ok(packaged.length > 100, "expected the front-end application to be tracked");

  const ignored = [];
  for (const relative of packaged) {
    const result = spawnSync("git", ["check-ignore", "--no-index", "-q", relative], {
      cwd: rootDir,
    });
    if (result.status === 0) ignored.push(relative);
  }
  assert.deepEqual(
    ignored,
    [],
    "these packaged files match a .gitignore rule and npm will drop them from a git install",
  );
});

test("no single deployment's origins survive in product code", () => {
  // The whole point of the move. A hostname in app/ or lib/ would silently
  // point an adopter's learners at somebody else's site.
  const offenders = [];
  for (const relative of walk(webDir)) {
    if (!/\.(ts|tsx)$/.test(relative)) continue;
    if (relative.startsWith("tests/production/")) continue; // acceptance tests, instance by design
    if (relative.startsWith("template/")) continue; // scaffold seed, substituted at create time
    const text = readFileSync(path.join(webDir, relative), "utf8");
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      if (/https:\/\/(?:[a-z]+\.)?project-42\.dev/.test(code)) {
        offenders.push(`${relative}:${index + 1}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "product code must read portal.canonicalOrigin / portal.adminOrigin from configuration",
  );
});

test("every page module the copy layer composes exists", () => {
  const defaults = readFileSync(path.join(webDir, "copy", "defaults.ts"), "utf8");
  const imports = [...defaults.matchAll(/from "\.\/([A-Za-z]+)"/g)].map((match) => match[1]);
  assert.ok(imports.length >= 8, "the copy layer should cover every editorial page");
  for (const name of imports) {
    assert.ok(
      existsSync(path.join(webDir, "copy", `${name}.ts`)),
      `copy/${name}.ts is imported by copy/defaults.ts but missing`,
    );
  }
});

test("materialise installs the application and generates the theme-bundle index", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "p42-materialise-"));
  try {
    writeFileSync(
      path.join(scratch, "project42.config.json"),
      JSON.stringify(scaffoldConfig(["05-open-orbit", "06-galactic-guide"]), null, 2),
      "utf8",
    );
    execFileSync(process.execPath, [cli, "materialise", "--target", scratch], { stdio: "pipe" });

    assert.ok(existsSync(path.join(scratch, "app", "layout.tsx")));
    assert.ok(existsSync(path.join(scratch, "copy", "defaults.ts")));
    assert.ok(existsSync(path.join(scratch, "scripts", "link-integrity.mjs")));
    assert.ok(existsSync(path.join(scratch, "vite.config.ts")));

    // The instance-owned exceptions must never be written by the materialiser.
    assert.ok(
      !existsSync(path.join(scratch, "scripts", "mint-github-app-token.mjs")),
      "owner operational tooling is not part of the product distribution",
    );
    assert.ok(
      !existsSync(path.join(scratch, "tests", "production")),
      "one deployment's acceptance tests are not part of the product distribution",
    );

    const generated = readFileSync(path.join(scratch, "lib", "themeBundles.generated.ts"), "utf8");
    assert.match(generated, /public\/themes\/05-open-orbit\/theme\.json/);
    assert.match(generated, /public\/themes\/06-galactic-guide\/theme\.json/);
    assert.ok(
      !/01-cosmic-answer/.test(generated),
      "only the configured themes may be indexed; a fixed six-theme list was the defect this replaced",
    );

    // lib/copy.ts imports the override document statically, so it must exist.
    assert.ok(existsSync(path.join(scratch, "project42.copy.json")));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("materialise refuses to overwrite a git-tracked file", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "p42-collision-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: scratch, stdio: "pipe" });
    git("init", "-q");
    git("config", "user.email", "test@localhost");
    git("config", "user.name", "test");
    writeFileSync(
      path.join(scratch, "project42.config.json"),
      JSON.stringify(scaffoldConfig(["06-galactic-guide"]), null, 2),
      "utf8",
    );
    mkdirSync(path.join(scratch, "app"), { recursive: true });
    writeFileSync(path.join(scratch, "app", "page.tsx"), "// a deliberate fork\n", "utf8");
    git("add", "-A");
    git("commit", "-qm", "fork a product file");

    assert.throws(
      () => execFileSync(process.execPath, [cli, "materialise", "--target", scratch], { stdio: "pipe" }),
      "a tracked product file must stop the materialiser rather than be clobbered",
    );
    assert.equal(
      readFileSync(path.join(scratch, "app", "page.tsx"), "utf8"),
      "// a deliberate fork\n",
      "and nothing may be written before it refuses",
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("create produces a front-end repository and a content repository, inheritance wired", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "p42-create-"));
  try {
    execFileSync(
      process.execPath,
      [
        cli,
        "create",
        "Example Academy",
        "--dir",
        scratch,
        "--org",
        "Example Academy",
        "--theme",
        "05-open-orbit",
        "--origin",
        "https://learn.example.org",
      ],
      { stdio: "pipe" },
    );

    const frontend = path.join(scratch, "example-academy");
    const content = path.join(scratch, "example-academy-content");

    const config = JSON.parse(readFileSync(path.join(frontend, "project42.config.json"), "utf8"));
    assert.equal(config.theme, "05-open-orbit");
    assert.equal(config.organization.name, "Example Academy");
    assert.equal(config.portal.canonicalOrigin, "https://learn.example.org");
    assert.equal(config.portal.adminOrigin, "https://admin.learn.example.org");
    assert.equal(
      config.content.customContentDir,
      "../example-academy-content",
      "the front end must know where its own curriculum repository is",
    );

    const frontendPackage = JSON.parse(readFileSync(path.join(frontend, "package.json"), "utf8"));
    assert.equal(frontendPackage.name, "example-academy");
    assert.match(
      frontendPackage.dependencies["@project42/platform"],
      /^github:project42dev\/project42-platform#v\d+\.\d+\.\d+$/,
      "generate-release-facts.mjs requires exactly this pin shape",
    );
    assert.match(frontendPackage.scripts.postinstall, /project42-portal\.mjs materialise/);
    assert.ok(existsSync(path.join(frontend, ".gitignore")));
    assert.ok(existsSync(path.join(frontend, "project42.copy.json")));
    assert.ok(existsSync(path.join(frontend, "public", "brand", "mark.svg")));
    assert.ok(existsSync(path.join(frontend, ".github", "workflows", "ci.yml")));

    // No unsubstituted tokens may survive anywhere in either scaffold.
    for (const [root, label] of [[frontend, "front end"], [content, "content"]]) {
      for (const relative of walk(root)) {
        if (!/\.(json|md|ya?ml|mjs|ts|tsx)$/.test(relative) && relative !== ".gitignore") continue;
        const text = readFileSync(path.join(root, relative), "utf8");
        assert.ok(
          !/\{\{[A-Z_]+\}\}/.test(text),
          `${label} scaffold left an unsubstituted token in ${relative}`,
        );
      }
    }

    const contentPackage = JSON.parse(readFileSync(path.join(content, "package.json"), "utf8"));
    assert.equal(contentPackage.name, "example-academy-content");
    assert.ok(existsSync(path.join(content, "custom", "catalog.json")));
    assert.ok(existsSync(path.join(content, "scripts", "sync-upstream.mjs")));
    assert.ok(existsSync(path.join(content, "scripts", "build-catalog.mjs")));
    assert.ok(existsSync(path.join(content, "config", "content.lock.json")));

    // And the scaffolded front end knows what it is still missing.
    assert.throws(
      () => execFileSync(process.execPath, [cli, "doctor", "--target", frontend], { stdio: "pipe" }),
      "doctor must report the un-materialised, un-synced state of a fresh scaffold",
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

// --------------------------------------------------------- the site catalogue
//
// The seam this closes: content inheritance was proven in the content
// repository and rendering was proven on the site, and nothing joined them. An
// adopter's module merged correctly into dist/catalog.json, and the site went
// on rendering the platform's own catalogue, so their module was never on their
// site. These tests assert the join, and assert that it fails loudly rather
// than falling back -- a silent fallback ships a site missing its operator's
// own content and looks identical, from outside, to a site that has none.

function writeContentRepository(root, catalog) {
  mkdirSync(path.join(root, "dist"), { recursive: true });
  writeFileSync(path.join(root, "dist", "catalog.json"), JSON.stringify(catalog, null, 2), "utf8");
}

function mergedCatalogueFixture() {
  return {
    schemaVersion: "1.0",
    contentVersion: "0.1.0",
    title: "Example Academy Curriculum",
    description: "Inherited, plus our own.",
    providers: [{ id: "provider-neutral", name: "Provider neutral", description: "Inherited." }],
    paths: [
      {
        id: "ai-foundations",
        title: "AI Foundations",
        level: "beginner",
        summary: "Inherited path, extended locally.",
        moduleIds: ["what-ai-does", "house-style"],
      },
    ],
    modules: [
      { id: "what-ai-does", pathId: "ai-foundations", title: "What AI does" },
      { id: "house-style", pathId: "ai-foundations", title: "Our house style for prompts" },
    ],
    resources: [],
    inheritedFrom: { contentVersion: "0.42.0", commit: "0".repeat(40) },
  };
}

test("materialise renders the catalogue the adopter's content repository publishes", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "p42-catalogue-"));
  try {
    const frontend = path.join(scratch, "frontend");
    const content = path.join(scratch, "frontend-content");
    mkdirSync(frontend, { recursive: true });
    const config = scaffoldConfig(["06-galactic-guide"]);
    config.content = { customContentDir: "../frontend-content" };
    writeFileSync(
      path.join(frontend, "project42.config.json"),
      JSON.stringify(config, null, 2),
      "utf8",
    );
    writeContentRepository(content, mergedCatalogueFixture());

    execFileSync(process.execPath, [cli, "materialise", "--target", frontend], { stdio: "pipe" });

    const installed = JSON.parse(
      readFileSync(path.join(frontend, "lib", "siteCatalog.generated.json"), "utf8"),
    );
    assert.ok(
      installed.modules.some((entry) => entry.id === "house-style"),
      "the adopter's own module must reach the front end -- this is the whole seam",
    );
    assert.deepEqual(
      installed.paths.find((entry) => entry.id === "ai-foundations").moduleIds,
      ["what-ai-does", "house-style"],
      "and it must stay attached to the inherited path it joined",
    );
    assert.ok(
      !installed.modules.some((entry) => entry.id === "prompt-with-purpose"),
      "the platform's own catalogue must not leak in beside the adopter's",
    );

    // The application imports the TypeScript form; the .mjs gates read the
    // JSON. They are written together so they cannot disagree.
    const generated = readFileSync(path.join(frontend, "lib", "siteCatalog.generated.ts"), "utf8");
    assert.match(generated, /export const generatedSiteCatalog: Catalog =/);
    assert.match(generated, /house-style/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("materialise uses the platform catalogue only when none is configured", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "p42-catalogue-default-"));
  try {
    writeFileSync(
      path.join(scratch, "project42.config.json"),
      JSON.stringify(scaffoldConfig(["06-galactic-guide"]), null, 2),
      "utf8",
    );
    execFileSync(process.execPath, [cli, "materialise", "--target", scratch], { stdio: "pipe" });

    const installed = JSON.parse(
      readFileSync(path.join(scratch, "lib", "siteCatalog.generated.json"), "utf8"),
    );
    // The deployment with no content repository -- the operator's own -- must
    // keep rendering exactly what it rendered before.
    assert.ok(installed.paths.length > 10, "the canonical curriculum must be installed whole");
    assert.ok(installed.modules.some((entry) => entry.id === "what-ai-does"));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("a configured content repository that has not been built fails the install", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "p42-catalogue-missing-"));
  try {
    const frontend = path.join(scratch, "frontend");
    mkdirSync(path.join(scratch, "frontend-content"), { recursive: true });
    mkdirSync(frontend, { recursive: true });
    const config = scaffoldConfig(["06-galactic-guide"]);
    config.content = { customContentDir: "../frontend-content" };
    writeFileSync(
      path.join(frontend, "project42.config.json"),
      JSON.stringify(config, null, 2),
      "utf8",
    );

    const result = spawnSync(process.execPath, [cli, "materialise", "--target", frontend], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0, "a missing merged catalogue must stop the install");
    assert.match(result.stderr, /content:build/, "and must name the command that fixes it");
    assert.ok(
      !existsSync(path.join(frontend, "lib", "siteCatalog.generated.json")),
      "no catalogue at all beats the wrong one: a fallback here ships a site silently " +
        "missing its operator's own content",
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("a malformed merged catalogue fails the install", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "p42-catalogue-malformed-"));
  try {
    const frontend = path.join(scratch, "frontend");
    const content = path.join(scratch, "frontend-content");
    mkdirSync(frontend, { recursive: true });
    const config = scaffoldConfig(["06-galactic-guide"]);
    config.content = { customContentDir: "../frontend-content" };
    writeFileSync(
      path.join(frontend, "project42.config.json"),
      JSON.stringify(config, null, 2),
      "utf8",
    );

    // An empty catalogue is what a half-finished build leaves behind.
    writeContentRepository(content, { ...mergedCatalogueFixture(), modules: [] });
    let result = spawnSync(process.execPath, [cli, "materialise", "--target", frontend], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /no modules/);

    // A truncated one is what an interrupted write leaves behind.
    writeFileSync(path.join(content, "dist", "catalog.json"), "{\"paths\": [", "utf8");
    result = spawnSync(process.execPath, [cli, "materialise", "--target", frontend], {
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /not valid JSON/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

// -------------------------------------------------------------------- pruning
//
// materialise copies what the product ships. Without a matching removal, a file
// the product deletes upstream lives forever in every consumer: a dead route
// still exported, a retired gate still run, a component nothing imports. The
// rule it applies is the consumer's own .gitignore, because that file already
// states who owns what under a materialised root.

test("materialise removes a product file the product no longer ships", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "p42-prune-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: scratch, stdio: "pipe" });
    git("init", "-q");
    git("config", "user.email", "test@localhost");
    git("config", "user.name", "test");
    writeFileSync(
      path.join(scratch, "project42.config.json"),
      JSON.stringify(scaffoldConfig(["06-galactic-guide"]), null, 2),
      "utf8",
    );
    writeFileSync(path.join(scratch, ".gitignore"), "/app/\n/lib/\n", "utf8");

    // A file an earlier release materialised and this one no longer ships.
    mkdirSync(path.join(scratch, "app", "retired"), { recursive: true });
    writeFileSync(path.join(scratch, "app", "retired", "page.tsx"), "// last release\n", "utf8");
    // A file the adopter wrote and tracked, under the same root.
    mkdirSync(path.join(scratch, "app", "mine"), { recursive: true });
    writeFileSync(path.join(scratch, "app", "mine", "page.tsx"), "// ours\n", "utf8");
    git("add", "-f", ".gitignore", "project42.config.json", "app/mine/page.tsx");
    git("commit", "-qm", "our own page");

    const output = execFileSync(process.execPath, [cli, "materialise", "--target", scratch], {
      encoding: "utf8",
    });

    assert.ok(
      !existsSync(path.join(scratch, "app", "retired", "page.tsx")),
      "a stale product file must go, or every consumer accumulates dead routes forever",
    );
    assert.ok(
      !existsSync(path.join(scratch, "app", "retired")),
      "and the directory it emptied with it",
    );
    assert.equal(
      readFileSync(path.join(scratch, "app", "mine", "page.tsx"), "utf8"),
      "// ours\n",
      "an adopter's own file must survive -- deleting their work is far worse than a stale file",
    );
    assert.match(output, /Pruned 1 file/);
    assert.match(output, /app\/mine\/page\.tsx/, "and what it declined to delete must be named");

    // The materialiser's own generated files are not product files. Pruning
    // them every run would delete the catalogue the site renders.
    assert.ok(existsSync(path.join(scratch, "lib", "siteCatalog.generated.json")));
    assert.ok(existsSync(path.join(scratch, "lib", "themeBundles.generated.ts")));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("materialise refuses to prune an unshipped file the consumer has not ignored", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "p42-prune-unclaimed-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd: scratch, stdio: "pipe" });
    git("init", "-q");
    git("config", "user.email", "test@localhost");
    git("config", "user.name", "test");
    writeFileSync(
      path.join(scratch, "project42.config.json"),
      JSON.stringify(scaffoldConfig(["06-galactic-guide"]), null, 2),
      "utf8",
    );
    writeFileSync(path.join(scratch, ".gitignore"), "/lib/\n", "utf8");
    mkdirSync(path.join(scratch, "app", "draft"), { recursive: true });
    // Untracked and un-ignored: somebody has started something and not
    // committed it. Erring toward refusing is the whole rule.
    writeFileSync(path.join(scratch, "app", "draft", "page.tsx"), "// in progress\n", "utf8");

    const output = execFileSync(process.execPath, [cli, "materialise", "--target", scratch], {
      encoding: "utf8",
    });
    assert.equal(
      readFileSync(path.join(scratch, "app", "draft", "page.tsx"), "utf8"),
      "// in progress\n",
    );
    assert.match(output, /Left 1 unshipped file/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("materialise prunes nothing outside a git repository", () => {
  const scratch = mkdtempSync(path.join(tmpdir(), "p42-prune-nogit-"));
  try {
    writeFileSync(
      path.join(scratch, "project42.config.json"),
      JSON.stringify(scaffoldConfig(["06-galactic-guide"]), null, 2),
      "utf8",
    );
    mkdirSync(path.join(scratch, "app", "retired"), { recursive: true });
    writeFileSync(path.join(scratch, "app", "retired", "page.tsx"), "// unknown owner\n", "utf8");

    execFileSync(process.execPath, [cli, "materialise", "--target", scratch], { stdio: "pipe" });
    assert.ok(
      existsSync(path.join(scratch, "app", "retired", "page.tsx")),
      "without git there is no way to tell an adopter's file from a stale one, and " +
        "guessing wrong deletes their work",
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("the scaffold approves the install scripts its own build depends on", () => {
  // npm keys allowScripts by package NAME. The template keyed it by the
  // dependency spec, so it covered nothing: every install warned that
  // @project42/platform's prepare script was unapproved -- and that prepare
  // script is what compiles dist/, which is the entire front end. npm warns
  // today. The day it enforces, an install produces a package with no dist/
  // and the adopter's first build fails at its first import, which is exactly
  // the failure this scaffold exists to prevent.
  const manifest = JSON.parse(
    readFileSync(path.join(webDir, "template", "frontend", "package.json"), "utf8"),
  );
  const approved = manifest.allowScripts ?? {};
  for (const name of ["@project42/platform", "esbuild", "workerd", "sharp"]) {
    assert.equal(
      approved[name],
      true,
      `${name} runs an install or prepare script the build needs; approve it by name`,
    );
  }
  for (const key of Object.keys(approved)) {
    assert.ok(
      !key.includes("#") && !key.startsWith("github:"),
      `allowScripts key ${key} is a dependency spec; npm matches package names and ` +
        "silently covers nothing here",
    );
  }
});

test("no client component pulls the whole catalogue into the browser", () => {
  // The progress API reads eight fields from the catalogue. A client component
  // that imports lib/catalog to get them ships every module body, knowledge
  // check and source list with them -- 1.3 MB the browser downloads and never
  // renders, and the largest single chunk in the bundle. lib/progressCatalog
  // is the generated shape-without-content they read instead.
  //
  // This is a direct-import check. It cannot see a client component reaching
  // the catalogue through an intermediate module, which is what the
  // performance budget in a consuming repository is for; what it does catch is
  // the easy regression, which is someone adding the obvious import back.
  const offenders = [];
  for (const relative of walk(webDir)) {
    if (!/\.(ts|tsx)$/.test(relative)) continue;
    if (relative.startsWith("template/") || relative.startsWith("tests/")) continue;
    const text = readFileSync(path.join(webDir, relative), "utf8");
    if (!/^\s*["']use client["']/m.test(text)) continue;
    if (/from "[^"]*\/lib\/catalog"/.test(text)) offenders.push(relative);
  }
  assert.deepEqual(
    offenders,
    [],
    "client components must read lib/progressCatalog, not the full catalogue",
  );
});
