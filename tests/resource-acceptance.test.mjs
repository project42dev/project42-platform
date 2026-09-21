import assert from "node:assert/strict";
import test from "node:test";
import { hasVerificationGuidance } from "../scripts/resource-pack-rules.mjs";

test("acceptance guidance uses stable identity and requires explanatory content", () => {
  const section = {
    id: "expected-result-and-verification",
    title: "Check the completed run",
    paragraphs: ["Verify the saved result against the expected output and reject any mismatch."],
  };
  assert.equal(hasVerificationGuidance({ sections: [section] }), true);
  assert.equal(hasVerificationGuidance({ sections: [] }), false);
  for (const paragraphs of [[], [""], ["  "], ["verification"]]) {
    assert.equal(hasVerificationGuidance({ sections: [{ ...section, paragraphs }] }), false);
  }
  assert.equal(hasVerificationGuidance({ sections: [{ ...section, id: "unrelated" }] }), false);
  assert.equal(hasVerificationGuidance({ sections: [{ ...section, id: "legacy", title: "Expected evidence and verification" }] }), true);
});
