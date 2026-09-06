import assert from "node:assert/strict";

export function assertReleaseFactsMatch(serializedFacts, expectedFacts) {
  let parsedFacts;
  try {
    parsedFacts = JSON.parse(serializedFacts);
  } catch (error) {
    throw new Error("public/release-facts.json must contain valid JSON.", {
      cause: error,
    });
  }

  assert.deepEqual(
    parsedFacts,
    expectedFacts,
    "public/release-facts.json is stale; run npm run facts:generate.",
  );
}
