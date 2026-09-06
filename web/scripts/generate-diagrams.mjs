import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const platformDiagrams = path.join(
  projectRoot, "node_modules", "@project42", "platform", "content", "diagrams");
const configPath = path.join(platformDiagrams, "catalogue.json");
const sourceRoot = platformDiagrams;
const publicRoot = path.join(projectRoot, "public", "diagrams");
const manifestPath = path.join(publicRoot, "manifest.json");
const checkOnly = process.argv.includes("--check");
const allowedCategories = new Set([
  "Agents",
  "Governance",
  "Learning",
  "Prompting",
  "Providers",
  "Research",
  "Safety",
]);
const allowedDiagramStarts = /^(?:flowchart|graph|sequenceDiagram|stateDiagram)/;
const unsafeSourcePatterns = [
  { pattern: /%%\s*\{init:/i, label: "inline initialization directive" },
  { pattern: /^\s*click\s+/im, label: "click directive" },
  { pattern: /javascript:/i, label: "JavaScript URL" },
  { pattern: /https?:\/\//i, label: "external URL" },
  { pattern: /<\/?[a-z][^>]*>/i, label: "inline HTML" },
];
const unsafeSvgPatterns = [
  { pattern: /<script\b/i, label: "script element" },
  { pattern: /<foreignObject\b/i, label: "foreignObject element" },
  { pattern: /<(?:iframe|object|embed)\b/i, label: "embedded active content" },
  { pattern: /\son[a-z]+\s*=/i, label: "event handler" },
  { pattern: /javascript:/i, label: "JavaScript URL" },
  {
    pattern: /\b(?:href|src)=["'](?:https?:|\/\/|data:text\/html)/i,
    label: "external or active reference",
  },
];

function canonicalText(value) {
  return value.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nonEmptyString(value, label) {
  assert.equal(typeof value, "string", `${label} must be a string`);
  assert.ok(value.trim(), `${label} must not be empty`);
}

export function validateDiagramConfig(config) {
  assert.equal(config.$schemaVersion, 1, "diagram config must use schema version 1");
  assert.equal(
    config.renderer,
    "@mermaid-js/mermaid-cli@11.15.0",
    "diagram renderer must be explicitly pinned",
  );
  assert.ok(Array.isArray(config.diagrams), "diagram config needs a diagrams array");
  assert.ok(config.diagrams.length >= 6, "publish a substantial starter diagram set");

  const ids = new Set();
  const sources = new Set();
  for (const [index, diagram] of config.diagrams.entries()) {
    const label = `diagram ${index + 1}`;
    for (const field of [
      "id",
      "title",
      "category",
      "summary",
      "description",
      "altText",
      "caption",
      "source",
    ]) {
      nonEmptyString(diagram[field], `${label}.${field}`);
    }
    assert.match(diagram.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${label}.id is invalid`);
    assert.equal(diagram.source, `${diagram.id}.mmd`, `${label}.source must match id`);
    assert.ok(!ids.has(diagram.id), `duplicate diagram id: ${diagram.id}`);
    assert.ok(!sources.has(diagram.source), `duplicate diagram source: ${diagram.source}`);
    ids.add(diagram.id);
    sources.add(diagram.source);
    assert.ok(
      allowedCategories.has(diagram.category),
      `${label}.category is not approved`,
    );
    assert.ok(diagram.summary.length >= 70, `${label}.summary is too short`);
    assert.ok(diagram.description.length >= 180, `${label}.description is too short`);
    assert.ok(diagram.altText.length >= 140, `${label}.altText is too short`);
    assert.ok(diagram.caption.length >= 90, `${label}.caption is too short`);
    assert.ok(
      Array.isArray(diagram.takeaways) && diagram.takeaways.length >= 3,
      `${label}.takeaways needs at least three items`,
    );
    for (const takeaway of diagram.takeaways) {
      nonEmptyString(takeaway, `${label}.takeaway`);
      assert.ok(takeaway.length >= 40, `${label}.takeaway is too short`);
    }
  }
  return config.diagrams;
}

export function validateMermaidSource(source, diagram) {
  const normalized = canonicalText(source);
  assert.ok(
    allowedDiagramStarts.test(normalized.trimStart()),
    `${diagram.source} uses an unapproved diagram type`,
  );
  assert.match(normalized, /^\s*accTitle:\s+\S+/m, `${diagram.source} needs accTitle`);
  assert.match(normalized, /^\s*accDescr:\s+\S+/m, `${diagram.source} needs accDescr`);
  assert.ok(normalized.length <= 40_000, `${diagram.source} is unexpectedly large`);
  for (const unsafe of unsafeSourcePatterns) {
    assert.ok(
      !unsafe.pattern.test(normalized),
      `${diagram.source} contains an unsafe ${unsafe.label}`,
    );
  }
  return normalized.endsWith("\n") ? normalized : `${normalized}\n`;
}

export function validateGeneratedSvg(svg, diagram, sourceHash) {
  const normalized = canonicalText(svg);
  assert.match(normalized, /<svg\b/i, `${diagram.id}.svg is missing its SVG root`);
  assert.match(
    normalized,
    new RegExp(`project42:source-sha256=${sourceHash}`),
    `${diagram.id}.svg is stale or missing provenance`,
  );
  assert.match(normalized, /<title\b/i, `${diagram.id}.svg needs an embedded title`);
  assert.match(normalized, /<desc\b/i, `${diagram.id}.svg needs an embedded description`);
  for (const unsafe of unsafeSvgPatterns) {
    assert.ok(
      !unsafe.pattern.test(normalized),
      `${diagram.id}.svg contains an unsafe ${unsafe.label}`,
    );
  }
  return normalized;
}

async function loadConfigAndSources() {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const diagrams = validateDiagramConfig(config);
  const records = [];
  for (const diagram of diagrams) {
    const sourcePath = path.join(sourceRoot, diagram.source);
    const source = validateMermaidSource(await readFile(sourcePath, "utf8"), diagram);
    records.push({
      diagram,
      source,
      sourceHash: sha256(source),
      sourcePath,
      publicSourcePath: path.join(publicRoot, diagram.source),
      svgPath: path.join(publicRoot, `${diagram.id}.svg`),
    });
  }
  return { config, records };
}

async function assertExactInventory(records) {
  const expectedSources = new Set(records.map(({ diagram }) => diagram.source));
  const sourceFiles = (await readdir(sourceRoot)).filter((name) => name.endsWith(".mmd"));
  assert.deepEqual(
    sourceFiles.sort(),
    [...expectedSources].sort(),
    "diagrams/ contains unregistered or missing Mermaid sources",
  );

  const expectedPublic = new Set([
    "manifest.json",
    ...records.flatMap(({ diagram }) => [diagram.source, `${diagram.id}.svg`]),
  ]);
  const publicFiles = (await readdir(publicRoot)).filter((name) => !name.startsWith("."));
  assert.deepEqual(
    publicFiles.sort(),
    [...expectedPublic].sort(),
    "public/diagrams contains unregistered or missing generated artifacts",
  );
}

function buildManifest(config, records) {
  return {
    $schemaVersion: 1,
    renderer: config.renderer,
    entries: records.map(({ diagram, sourceHash, svg }) => ({
      id: diagram.id,
      source: diagram.source,
      sourceSha256: sourceHash,
      svg: `${diagram.id}.svg`,
      svgSha256: sha256(svg),
    })),
  };
}

async function verifyGeneratedArtifacts(config, records) {
  await assertExactInventory(records);
  for (const record of records) {
    const publicSource = canonicalText(await readFile(record.publicSourcePath, "utf8"));
    assert.equal(
      publicSource,
      record.source,
      `${record.diagram.source} public source copy is stale`,
    );
    record.svg = validateGeneratedSvg(
      await readFile(record.svgPath, "utf8"),
      record.diagram,
      record.sourceHash,
    );
  }
  const expectedManifest = buildManifest(config, records);
  const actualManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.deepEqual(actualManifest, expectedManifest, "diagram manifest is stale");
}

async function generateArtifacts(config, records) {
  await mkdir(publicRoot, { recursive: true });
  const { run } = await import("@mermaid-js/mermaid-cli");
  const { chromium } = await import("@playwright/test");
  const executablePath = chromium.executablePath();
  try {
    await access(executablePath);
  } catch {
    throw new Error(
      'A full Playwright Chromium executable is required. Run "npx playwright install chromium".',
    );
  }

  for (const record of records) {
    const temporarySvg = `${record.svgPath}.tmp`;
    await writeFile(record.publicSourcePath, record.source, "utf8");
    try {
      await run(record.sourcePath, temporarySvg, {
        quiet: true,
        outputFormat: "svg",
        puppeteerConfig: {
          executablePath,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
        parseMMDOptions: {
          backgroundColor: "transparent",
          svgId: `project42-${record.diagram.id}`,
          viewport: { width: 1440, height: 1000, deviceScaleFactor: 1 },
          mermaidConfig: {
            deterministicIds: true,
            deterministicIDSeed: `project42-${record.diagram.id}-v1`,
            htmlLabels: false,
            flowchart: { htmlLabels: false, curve: "basis" },
            fontFamily: "Inter, Arial, sans-serif",
            securityLevel: "strict",
            sequence: { useMaxWidth: true, wrap: false },
            theme: "base",
            themeVariables: {
              background: "transparent",
              fontFamily: "Inter, Arial, sans-serif",
              fontSize: "17px",
              lineColor: "#455066",
              primaryColor: "#f6f3eb",
              primaryTextColor: "#111827",
              primaryBorderColor: "#455066",
              secondaryColor: "#c9f25f",
              secondaryTextColor: "#111827",
              secondaryBorderColor: "#526f1b",
              tertiaryColor: "#dff7fa",
              tertiaryTextColor: "#111827",
              tertiaryBorderColor: "#247b86"
            },
          },
        },
      });
      const rendered = canonicalText(await readFile(temporarySvg, "utf8"));
      const provenance =
        `<!-- project42:source-sha256=${record.sourceHash}; ` +
        `renderer=${config.renderer} -->\n`;
      record.svg = validateGeneratedSvg(
        `${provenance}${rendered}`,
        record.diagram,
        record.sourceHash,
      );
      await writeFile(temporarySvg, record.svg, "utf8");
      await rename(temporarySvg, record.svgPath);
    } catch (error) {
      await unlink(temporarySvg).catch(() => { });
      throw error;
    }
  }
  const manifest = buildManifest(config, records);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await verifyGeneratedArtifacts(config, records);
}

export async function runDiagramIntegrity({ generate = !checkOnly } = {}) {
  const { config, records } = await loadConfigAndSources();
  if (generate) {
    await generateArtifacts(config, records);
  } else {
    await verifyGeneratedArtifacts(config, records);
  }
  return { diagramCount: records.length, renderer: config.renderer };
}

async function main() {
  const result = await runDiagramIntegrity();
  console.log(
    `${checkOnly ? "Diagram integrity passed" : "Generated diagram artifacts"}: ` +
    `${result.diagramCount} diagrams with ${result.renderer}.`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
