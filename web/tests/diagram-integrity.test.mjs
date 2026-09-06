import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import diagramConfig from "../node_modules/@project42/platform/content/diagrams/catalogue.json" with { type: "json" };
import {
  runDiagramIntegrity,
  validateDiagramConfig,
  validateGeneratedSvg,
  validateMermaidSource,
} from "../scripts/generate-diagrams.mjs";

test("publishes a substantial, uniquely identified diagram catalog", () => {
  const diagrams = validateDiagramConfig(diagramConfig);
  assert.equal(diagrams.length, diagramConfig.diagrams.length);
  assert.equal(new Set(diagrams.map(({ id }) => id)).size, diagrams.length);
  assert.ok(diagrams.some(({ category }) => category === "Providers"));
  assert.ok(diagrams.some(({ category }) => category === "Safety"));
  assert.ok(diagrams.some(({ category }) => category === "Governance"));
});

test("rejects active or externally loaded Mermaid source", () => {
  const diagram = diagramConfig.diagrams[0];
  for (const unsafe of [
    "flowchart LR\n  accTitle: Unsafe\n  accDescr: Unsafe click behavior\n  A-->B\n  click A call run()\n",
    "flowchart LR\n  accTitle: Unsafe\n  accDescr: Unsafe external reference\n  A[https://example.com]-->B\n",
    "flowchart LR\n  accTitle: Unsafe\n  accDescr: Unsafe inline content\n  A[<script>alert(1)</script>]-->B\n",
  ]) {
    assert.throws(() => validateMermaidSource(unsafe, diagram), /unsafe/);
  }
});

test("rejects generated SVG active content", () => {
  const diagram = diagramConfig.diagrams[0];
  const hash = "a".repeat(64);
  const prefix = `<!-- project42:source-sha256=${hash} -->`;
  assert.throws(
    () =>
      validateGeneratedSvg(
        `${prefix}<svg><title>Title</title><desc>Description</desc><script /></svg>`,
        diagram,
        hash,
      ),
    /unsafe script/,
  );
});

test("generated SVG and public Mermaid artifacts match canonical sources", async () => {
  const result = await runDiagramIntegrity({ generate: false });
  assert.equal(result.diagramCount, diagramConfig.diagrams.length);
  for (const diagram of diagramConfig.diagrams) {
    const source = await readFile(
      new URL(`../public/diagrams/${diagram.source}`, import.meta.url),
      "utf8",
    );
    assert.match(source, /accTitle:/);
    assert.match(source, /accDescr:/);
  }
});
