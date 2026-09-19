import assert from "node:assert/strict";
import test from "node:test";
import { starterCatalog, validateCatalog } from "../dist/index.js";

test("validateCatalog validates optional callout shapes in module and resource sections", async (t) => {
  const cases = [
    { key: "module-object", collection: "modules", value: { title: "Bad", body: "Bad" }, valid: false },
    { key: "module-array", collection: "modules", value: ["Bad"], valid: false },
    { key: "module-null", collection: "modules", value: null, valid: false },
    { key: "module-number", collection: "modules", value: 42, valid: false },
    { key: "module-boolean", collection: "modules", value: true, valid: false },
    { key: "resource-object", collection: "resources", value: { title: "Bad", body: "Bad" }, valid: false },
    { key: "resource-array", collection: "resources", value: ["Bad"], valid: false },
    { key: "resource-null", collection: "resources", value: null, valid: false },
    { key: "resource-number", collection: "resources", value: 42, valid: false },
    { key: "resource-boolean", collection: "resources", value: false, valid: false },
    { key: "module-string", collection: "modules", value: "Optional note", valid: true },
    { key: "resource-string", collection: "resources", value: "Optional note", valid: true },
    { key: "module-omitted", collection: "modules", value: undefined, valid: true },
    { key: "resource-omitted", collection: "resources", value: undefined, valid: true },
  ]         ;

  for (const testCase of cases) {
    await t.test(testCase.key, () => {
      const catalog = structuredClone(starterCatalog)       ;
      const collection = catalog[testCase.collection];
      assert.ok(Array.isArray(collection), `${testCase.collection} must be an array`);
      const owner = collection.find((entry     ) => Array.isArray(entry.sections));
      assert.ok(owner, `${testCase.collection} must contain a section owner`);
      assert.ok(owner.sections.length > 0, `${testCase.collection} must contain a section`);

      const section = owner.sections[0];
      if (testCase.value === undefined) {
        delete section.callout;
      } else {
        section.callout = testCase.value;
      }

      const result = validateCatalog(catalog);
      assert.equal(result.valid, testCase.valid);
      if (!testCase.valid) {
        assert.ok(
          result.errors.some((error        ) => /callout/i.test(error)),
          `expected a callout diagnostic, got: ${JSON.stringify(result.errors)}`,
        );
      }
    });
  }
});