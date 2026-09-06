import assert from "node:assert/strict";
import test from "node:test";
import { assertReleaseFactsMatch } from "../scripts/release-facts-validation.mjs";

const expected = {
  siteVersion: "1.2.3",
  counts: { modules: 42 },
  providers: ["provider-neutral", "anthropic", "openai", "google"],
};

test("accepts semantically identical LF and CRLF release facts", () => {
  const lf = `${JSON.stringify(expected, null, 2)}\n`;
  const crlf = lf.replaceAll("\n", "\r\n");

  assert.doesNotThrow(() => assertReleaseFactsMatch(lf, expected));
  assert.doesNotThrow(() => assertReleaseFactsMatch(crlf, expected));
});

test("still rejects semantic release-fact drift", () => {
  const drifted = JSON.stringify({
    ...expected,
    counts: { modules: expected.counts.modules + 1 },
  });

  assert.throws(
    () => assertReleaseFactsMatch(drifted, expected),
    /release-facts\.json is stale/,
  );
});

test("rejects malformed release-facts JSON", () => {
  assert.throws(
    () => assertReleaseFactsMatch('{"siteVersion":', expected),
    /must contain valid JSON/,
  );
});
