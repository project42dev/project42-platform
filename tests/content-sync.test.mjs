import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { loadDynamicCatalog, mergeCatalogs, loadCatalogFromPath } from "../dist/content-sync.js";

const contentRepoRoot = resolve(import.meta.dirname, "../content");

test("loads dynamic catalog from extracted project42-content repository", async () => {
  const catalog = await loadCatalogFromPath(contentRepoRoot);
  assert.ok(catalog.paths.length >= 8, "Expected at least 8 learning paths");
  assert.ok(catalog.modules.length >= 70, "Expected at least 70 modules");
  assert.ok(catalog.paths.some((p) => p.id === "ai-foundations"), "Expected ai-foundations path to be present");
});

test("merges custom enterprise organization overlay seamlessly with canonical catalog", () => {
  const baseCatalog = {
    schemaVersion: 1,
    contentVersion: "1.0.0",
    title: "Project 42",
    description: "Core",
    providers: [{ id: "provider-neutral", name: "Neutral", description: "Neutral" }],
    paths: [
      { id: "ai-foundations", title: "Foundations", summary: "Summary", audience: "Learners", level: "beginner", moduleIds: ["mod-1"] }
    ],
    modules: [
      { id: "mod-1", title: "Module 1", summary: "Summary", level: "beginner", providers: ["provider-neutral"], estimatedMinutes: 20, objectives: [], prerequisites: [], sections: [] }
    ],
    resources: []
  };

  const enterpriseOverlay = {
    schemaVersion: 1,
    contentVersion: "1.0.0",
    title: "Acme Corp Overlay",
    description: "Internal",
    providers: [{ id: "acme-internal", name: "Acme", description: "Acme Internal" }],
    paths: [
      { id: "acme-security", title: "Internal AI Security", summary: "Corporate Policy", audience: "Employees", level: "intermediate", moduleIds: ["acme-mod-101"] }
    ],
    modules: [
      { id: "acme-mod-101", title: "Corporate LLM Gateway", summary: "Using the internal proxy", level: "intermediate", providers: ["acme-internal"], estimatedMinutes: 15, objectives: [], prerequisites: [], sections: [] }
    ],
    resources: []
  };

  const merged = mergeCatalogs(baseCatalog, [enterpriseOverlay]);
  assert.equal(merged.paths.length, 2, "Expected 2 paths after overlay merge");
  assert.equal(merged.modules.length, 2, "Expected 2 modules after overlay merge");
  assert.equal(merged.providers.length, 2, "Expected 2 providers after overlay merge");
  assert.ok(merged.paths.some((p) => p.id === "acme-security"), "Custom path must be present in merged catalog");
  assert.ok(merged.modules.some((m) => m.id === "acme-mod-101"), "Custom module must be present in merged catalog");
});
