import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

test('Open-Source Platform: portal-config schema is valid JSON Schema', () => {
  const schemaPath = path.join(rootDir, 'schemas/portal-config.schema.json');
  assert.ok(fs.existsSync(schemaPath), 'portal-config schema must exist');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.type, 'object');
  assert.equal(schema.properties.theme.type, 'string');
  assert.ok(schema.properties.organization, 'organization properties must be defined');
  assert.ok(schema.properties.portal, 'portal origins must be defined');
  assert.ok(schema.properties.layout, 'layout preset must be defined');
  assert.equal(schema.properties.layout.properties.defaultPreset.type, 'string');
  assert.equal(schema.properties.layout.properties.defaultPreset.enum, undefined);
  assert.equal(schema.properties.organization.properties.logoUrl, undefined);
  assert.equal(schema.properties.organization.properties.faviconUrl, undefined);
});

// The two tests that used to sit here drove scripts/build-portal.mjs, a static
// portal generator that read a third copy of the theme bundles out of
// docs/branding/concepts/ and modelled a theme as five colour strings. It has
// been retired: docs/architecture.md principle 3 makes a theme a version-locked
// Gallery bundle selected by ID, and the real front end now ships in web/. What
// those tests were reaching for -- that a portal builds, that it publishes the
// core routes, that it makes no CDN call, that Admin stays off the public
// artifact -- is asserted against the real application by
// tests/web-distribution.test.mjs here and by the rendered-html, link-integrity,
// surface-isolation and GitHub Pages export gates in a consuming front end.

test('Open-Source Platform: self-host compose stack includes Web UI service', () => {
  const composePath = path.join(rootDir, 'self-host/compose.yaml');
  const composeContent = fs.readFileSync(composePath, 'utf8');
  assert.ok(composeContent.includes('web:'), 'compose.yaml must contain web service');
  assert.ok(composeContent.includes('3000:80'), 'compose.yaml must expose web service on port 3000');
});
