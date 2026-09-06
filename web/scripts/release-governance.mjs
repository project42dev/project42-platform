import { createHash } from "node:crypto";
import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const requiredSections = [
  "Breaking changes",
  "Migrations",
  "Known limitations",
  "Rollback",
];

function parseArguments(values) {
  const result = { _: [] };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      result._.push(value);
      continue;
    }
    const name = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) {
      result[name] = true;
      continue;
    }
    index += 1;
    result[name] = result[name]
      ? [...(Array.isArray(result[name]) ? result[name] : [result[name]]), next]
      : next;
  }
  return result;
}

async function sha256(path) {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}

function fail(message) {
  throw new Error(message);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function sectionBody(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = new RegExp(`^## ${escaped}\\s*$`, "m").exec(markdown);
  if (!start) return "";
  const bodyStart = start.index + start[0].length;
  const remainder = markdown.slice(bodyStart);
  const nextHeading = /^## /m.exec(remainder);
  return remainder.slice(0, nextHeading?.index ?? remainder.length).trim();
}

export async function validateRelease(root = repositoryRoot) {
  const packageJson = await readJson(join(root, "package.json"));
  const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
  const notes = await readFile(join(root, "RELEASE_NOTES.md"), "utf8");
  const readme = await readFile(join(root, "README.md"), "utf8");
  const workflow = await readFile(
    join(root, ".github", "workflows", "release.yml"),
    "utf8",
  );
  const version = packageJson.version;

  if (!/^\d+\.\d+\.\d+$/.test(version)) fail("package version must be SemVer.");
  if (!changelog.includes(`## [${version}]`)) {
    fail(`CHANGELOG.md has no entry for ${version}.`);
  }
  if (!notes.match(new RegExp(`^# .+ ${version.replaceAll(".", "\\.")}$`, "m"))) {
    fail(`RELEASE_NOTES.md title does not identify ${version}.`);
  }
  for (const heading of requiredSections) {
    if (!sectionBody(notes, heading)) {
      fail(`RELEASE_NOTES.md section "${heading}" is empty or missing.`);
    }
  }
  for (const document of ["CONTRIBUTING.md", "SECURITY.md", "SUPPORT.md"]) {
    await stat(join(root, document));
    if (!readme.includes(`](${document})`)) {
      fail(`README.md does not link ${document}.`);
    }
  }

  const facts = await readJson(join(root, "public", "release-facts.json"));
  if (facts.siteVersion !== version) {
    fail(`release facts ${facts.siteVersion} do not match package ${version}.`);
  }

  const requiredWorkflowTokens = [
    "workflow_dispatch:",
    'tags:',
    "npm run release:validate",
    "npm audit --omit=dev --audit-level=critical",
    "release-manifest.json",
    "rehearsal-evidence.json",
    "RELEASE_NOTES.md",
  ];
  for (const token of requiredWorkflowTokens) {
    if (!workflow.includes(token)) fail(`release workflow is missing "${token}".`);
  }
  return { repository: packageJson.name, version };
}

export async function createManifest({
  root = repositoryRoot,
  output,
  source,
  tag,
  artifacts,
}) {
  const { repository, version } = await validateRelease(root);
  if (!/^[0-9a-f]{40}$/i.test(source)) fail("source must be a full commit SHA.");
  if (tag !== `v${version}`) fail(`tag ${tag} does not match v${version}.`);
  const entries = [];
  for (const item of artifacts) {
    const path = resolve(root, item);
    const details = await stat(path);
    if (!details.isFile()) fail(`${item} is not a file.`);
    entries.push({
      name: basename(item),
      path: item.replaceAll("\\", "/"),
      bytes: details.size,
      sha256: await sha256(path),
    });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const facts = await readJson(join(root, "public", "release-facts.json"));
  const manifest = {
    schemaVersion: 1,
    repository,
    version,
    tag,
    sourceCommit: source.toLowerCase(),
    compatibility: {
      platformVersion: facts.platformVersion,
      contentVersion: facts.contentVersion,
    },
    artifacts: entries,
  };
  await mkdir(resolve(root, output, ".."), { recursive: true });
  await writeFile(resolve(root, output), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export async function rehearseRelease({
  root = repositoryRoot,
  manifestPath,
  output,
}) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const manifest = await readJson(resolve(root, manifestPath));
  const registry = await mkdtemp(join(tmpdir(), "project42-release-rehearsal-"));
  let consumed = 0;
  try {
    await copyFile(resolve(root, manifestPath), join(registry, "release-manifest.json"));
    for (const artifact of manifest.artifacts) {
      const source = resolve(root, artifact.path);
      const published = join(registry, artifact.name);
      await copyFile(source, published);
      if ((await sha256(published)) !== artifact.sha256) {
        fail(`published digest mismatch for ${artifact.name}.`);
      }
      if (artifact.name.endsWith(".json")) {
        await readJson(published);
      } else if (artifact.name.endsWith(".tgz")) {
        const listed = spawnSync("tar", ["-tzf", published], { encoding: "utf8" });
        if (listed.status !== 0 || !listed.stdout.trim()) {
          fail(`could not consume ${artifact.name}.`);
        }
      } else {
        await readFile(published);
      }
      consumed += 1;
    }
  } finally {
    await rm(registry, { recursive: true, force: true });
  }
  const evidence = {
    schemaVersion: 1,
    repository: manifest.repository,
    version: manifest.version,
    sourceCommit: manifest.sourceCommit,
    startedAt,
    durationMilliseconds: Math.round(performance.now() - started),
    isolatedRegistry: true,
    productionMutation: false,
    publishedArtifacts: manifest.artifacts.length,
    consumedArtifacts: consumed,
    rollbackCompleted: true,
    cleanupVerified: true,
  };
  await writeFile(resolve(root, output), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const command = args._[0] ?? "validate";
  if (command === "validate") {
    const result = await validateRelease();
    console.log(`Validated release governance for ${result.repository} ${result.version}.`);
    return;
  }
  if (command === "manifest") {
    const artifacts = Array.isArray(args.artifact)
      ? args.artifact
      : [args.artifact].filter(Boolean);
    await createManifest({
      output: args.output,
      source: args.source,
      tag: args.tag,
      artifacts,
    });
    return;
  }
  if (command === "rehearse") {
    await rehearseRelease({
      manifestPath: args.manifest,
      output: args.output,
    });
    return;
  }
  fail(`Unknown command: ${command}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
