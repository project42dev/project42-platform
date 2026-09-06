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
import { execFileSync } from "node:child_process";
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
