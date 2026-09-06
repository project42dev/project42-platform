#!/usr/bin/env node
// Enforces the page-weight budget in config/performance-budget.json against the
// build output in dist/client. Nothing else in the repository measures what a
// visitor has to download, so "fast" was an unmeasured claim.
//
// This reads bytes off disk rather than driving a browser, so it is
// deterministic and cannot flake. The Core Web Vitals side of the budget is
// measured separately in tests/browser/performance-budget.spec.ts, which needs
// a running server.
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const budgetPath = join(repositoryRoot, "config", "performance-budget.json");
const clientRoot = join(repositoryRoot, "dist", "client");

const measuredExtensions = new Set([".js", ".css"]);

async function collectAssets(directory) {
  const assets = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      assets.push(...(await collectAssets(path)));
      continue;
    }
    const extension = extname(entry.name);
    if (!measuredExtensions.has(extension)) continue;
    const { size } = await stat(path);
    assets.push({
      path: relative(clientRoot, path).replaceAll("\\", "/"),
      extension,
      size,
    });
  }
  return assets;
}

function formatBytes(value) {
  return `${value.toLocaleString("en-US")} bytes (${(value / 1024).toFixed(1)} KiB)`;
}

async function main() {
  let budgetDocument;
  try {
    budgetDocument = JSON.parse(await readFile(budgetPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${budgetPath}: ${error.message}`);
  }
  if (budgetDocument.$schemaVersion !== 1) {
    throw new Error("config/performance-budget.json must use $schemaVersion 1.");
  }

  let assets;
  try {
    assets = await collectAssets(clientRoot);
  } catch (error) {
    throw new Error(
      `Unable to read the build output at dist/client. Run "npm run build" first. (${error.message})`,
    );
  }
  if (assets.length === 0) {
    throw new Error(
      "The build output contains no JavaScript or CSS. Run \"npm run build\" first.",
    );
  }

  const cssBytes = assets
    .filter((asset) => asset.extension === ".css")
    .reduce((total, asset) => total + asset.size, 0);
  const jsBytes = assets
    .filter((asset) => asset.extension === ".js")
    .reduce((total, asset) => total + asset.size, 0);
  const largest = assets
    .filter((asset) => asset.extension === ".js")
    .reduce((worst, asset) => (asset.size > worst.size ? asset : worst));

  const actuals = new Map([
    ["client-total-bytes", { value: cssBytes + jsBytes, detail: `${assets.length} files` }],
    ["client-css-bytes", { value: cssBytes, detail: "all .css" }],
    ["largest-chunk-bytes", { value: largest.size, detail: largest.path }],
  ]);

  const failures = [];
  const lines = [];
  for (const budget of budgetDocument.budgets ?? []) {
    for (const field of ["id", "label", "reasoning"]) {
      if (typeof budget[field] !== "string" || !budget[field].trim()) {
        failures.push(`Budget entry is missing a ${field}.`);
      }
    }
    if (typeof budget.reasoning === "string" && budget.reasoning.trim().length < 80) {
      failures.push(
        `Budget "${budget.id}" must record why its threshold is what it is.`,
      );
    }
    const actual = actuals.get(budget.id);
    if (!actual) {
      failures.push(`Budget "${budget.id}" does not correspond to a measurement.`);
      continue;
    }
    if (!Number.isInteger(budget.limit) || budget.limit <= 0) {
      failures.push(`Budget "${budget.id}" must declare an integer limit.`);
      continue;
    }
    const headroom = budget.limit - actual.value;
    const status = headroom >= 0 ? "ok" : "OVER";
    lines.push(
      `${status.padEnd(4)} ${budget.id.padEnd(20)} ${formatBytes(actual.value).padStart(28)} / ${formatBytes(budget.limit).padStart(28)}  ${actual.detail}`,
    );
    if (headroom < 0) {
      failures.push(
        `${budget.label} is ${formatBytes(-headroom)} over its budget: ` +
          `${formatBytes(actual.value)} against a limit of ${formatBytes(budget.limit)} (${actual.detail}).`,
      );
    }
  }

  // A measurement with no budget is a silent gap, so require full coverage.
  for (const id of actuals.keys()) {
    if (!(budgetDocument.budgets ?? []).some((budget) => budget.id === id)) {
      failures.push(`Measurement "${id}" has no budget entry.`);
    }
  }

  for (const line of lines) console.log(line);

  if (failures.length > 0) {
    console.error("");
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(
      "\nRaising a limit is a reviewed decision: update config/performance-budget.json " +
        "with a new measurement and say in `reasoning` what changed and why the new number is right.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nPerformance budget passed: ${assets.length} client assets within ${budgetDocument.budgets.length} budgets.`,
  );
}

await main();
