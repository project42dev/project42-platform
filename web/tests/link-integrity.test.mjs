import assert from "node:assert/strict";
import test from "node:test";
import {
  checkExternalReferences,
  extractDocumentLinks,
  validateExceptionPolicy,
  validateInternalReferences,
} from "../scripts/link-integrity.mjs";
import portalConfig from "../project42.config.json" with { type: "json" };

const baseUrl = portalConfig.portal.canonicalOrigin;

function externalReference(target, sourceRoute = "/learn") {
  return extractDocumentLinks(
    `<a href="${target}">Source</a>`,
    sourceRoute,
    baseUrl,
  ).references[0];
}

function document(route, html, status = 200) {
  return {
    route,
    status,
    contentType: "text/html",
    html,
    ...extractDocumentLinks(html, route, baseUrl),
  };
}

test("extracts internal, external, ignored, and invalid references with IDs", () => {
  const result = extractDocumentLinks(
    [
      '<main id="main-content">',
      '<a href="/learn#start">Learn</a>',
      '<img src="/icon.png" alt="">',
      '<a href="https://example.com/docs">Docs</a>',
      '<a href="mailto:hello@example.com">Email</a>',
      '<a href="http://[invalid">Bad</a>',
      "</main>",
    ].join(""),
    "/",
    baseUrl,
  );
  assert.ok(result.ids.has("main-content"));
  assert.deepEqual(
    result.references.map((reference) => reference.kind),
    ["internal", "internal", "external", "ignored", "invalid"],
  );
});

test("accepts valid internal routes, fragments, and assets", async () => {
  const documents = new Map([
    [
      "/",
      document(
        "/",
        '<a href="/learn#start">Learn</a><img src="/icon.png" alt="">',
      ),
    ],
    ["/learn", document("/learn", '<main id="start">Start</main>')],
  ]);
  const result = await validateInternalReferences({
    documents,
    endpointRoutes: ["/robots.txt"],
    loadRoute: async (route) =>
      route === "/robots.txt"
        ? { route, status: 200, ids: new Set(), references: [] }
        : documents.get(route),
    staticRoot: "/static",
    fileExists: async (filePath) => filePath.endsWith("icon.png"),
  });
  assert.deepEqual(result.failures, []);
});

test("reports missing internal routes, fragments, and assets", async () => {
  const documents = new Map([
    [
      "/",
      document(
        "/",
        [
          '<a href="/missing">Missing route</a>',
          '<a href="/learn#missing">Missing fragment</a>',
          '<img src="/missing.png" alt="">',
        ].join(""),
      ),
    ],
    ["/learn", document("/learn", '<main id="present">Learn</main>')],
  ]);
  const result = await validateInternalReferences({
    documents,
    loadRoute: async (route) =>
      documents.get(route) ?? {
        route,
        status: 404,
        ids: new Set(),
        references: [],
      },
    staticRoot: "/static",
    fileExists: async () => false,
  });
  assert.equal(result.failures.length, 3);
  assert.ok(result.failures.some((failure) => failure.includes("returned 404")));
  assert.ok(result.failures.some((failure) => failure.includes("Missing fragment")));
  assert.ok(
    result.failures.some((failure) => failure.includes("Missing internal asset")),
  );
});

test("accepts successful and redirect external responses", async () => {
  const responses = new Map([
    ["https://example.com/ok", 200],
    ["https://example.com/redirect", 302],
  ]);
  const redirectModes = [];
  const result = await checkExternalReferences({
    references: [...responses.keys()].map((target) => externalReference(target)),
    fetchImpl: async (url, options) => {
      redirectModes.push(options.redirect);
      return new Response("", {
        status: responses.get(url),
        headers: { location: "https://example.com/final" },
      });
    },
    concurrency: 2,
    timeoutMs: 100,
    attempts: 1,
    today: "2026-07-25",
  });
  assert.deepEqual(result.failures, []);
  assert.equal(result.uniqueTargetCount, 2);
  assert.deepEqual(redirectModes, ["follow", "follow"]);
});

test("retries and reports an unreachable external source with its route", async () => {
  let attempts = 0;
  const result = await checkExternalReferences({
    references: [externalReference("https://unreachable.example/docs", "/resources/x")],
    fetchImpl: async () => {
      attempts += 1;
      throw new TypeError("network unavailable");
    },
    concurrency: 1,
    timeoutMs: 100,
    attempts: 2,
    today: "2026-07-25",
  });
  assert.equal(attempts, 2);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /unreachable\.example/);
  assert.match(result.failures[0], /\/resources\/x/);
});

test("accepts expected failure and environment-dependent success for an active exception", async () => {
  const exception = {
    targetPattern: "https://blocked.example/docs",
    expectedStatuses: [403],
    reason: "The public documentation blocks automated clients.",
    owner: "Project 42 maintainers",
    expires: "2026-10-31",
  };
  const result = await checkExternalReferences({
    references: [externalReference("https://blocked.example/docs")],
    exceptions: [exception],
    fetchImpl: async () => new Response("", { status: 403 }),
    concurrency: 1,
    timeoutMs: 100,
    attempts: 1,
    today: "2026-07-25",
  });
  assert.deepEqual(result.failures, []);
  assert.equal(result.usedExceptionCount, 1);

  const successfulEnvironment = await checkExternalReferences({
    references: [externalReference("https://blocked.example/docs")],
    exceptions: [exception],
    fetchImpl: async () => new Response("", { status: 200 }),
    concurrency: 1,
    timeoutMs: 100,
    attempts: 1,
    today: "2026-07-25",
  });
  assert.deepEqual(successfulEnvironment.failures, []);
  assert.equal(successfulEnvironment.usedExceptionCount, 1);
});

test("rejects expired and unused exceptions", async () => {
  const expired = {
    targetPattern: "https://blocked.example/docs",
    expectedStatuses: [403],
    reason: "Temporary automation block.",
    owner: "Project 42 maintainers",
    expires: "2026-07-24",
  };
  assert.ok(
    validateExceptionPolicy(
      [expired],
      ["https://blocked.example/docs"],
      "2026-07-25",
    ).some((failure) => failure.includes("expired")),
  );
  assert.ok(
    validateExceptionPolicy(
      [
        {
          ...expired,
          targetPattern: "https://unused.example/*",
          expires: "2026-10-31",
        },
      ],
      ["https://blocked.example/docs"],
      "2026-07-25",
    ).some((failure) => failure.includes("is unused")),
  );
  assert.ok(
    validateExceptionPolicy(
      [{ ...expired, expires: "2026-13-40" }],
      ["https://blocked.example/docs"],
      "2026-07-25",
    ).some((failure) => failure.includes("invalid expiry date")),
  );

});
