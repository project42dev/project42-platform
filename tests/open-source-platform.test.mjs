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
});

test('Open-Source Platform: static portal builds and produces all required pages', () => {
  const outDir = path.join(rootDir, 'dist/portal');
  assert.ok(fs.existsSync(path.join(outDir, 'index.html')), 'Root index.html must exist');
  assert.ok(fs.existsSync(path.join(outDir, 'learn/index.html')), 'learn/index.html must exist');
  assert.ok(fs.existsSync(path.join(outDir, 'guide/index.html')), 'guide/index.html must exist');
  assert.ok(fs.existsSync(path.join(outDir, 'profile/index.html')), 'profile/index.html must exist');
  assert.ok(!fs.existsSync(path.join(outDir, 'admin/index.html')), 'Admin must not be published in the public artifact');
  const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8');
  assert.match(html, /data-theme="06-galactic-guide"/);
});

test('Open-Source Platform: air-gapped zero-CDN asset bundling integrity', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'dist/portal/index.html'), 'utf8');
  assert.ok(!indexHtml.includes('fonts.googleapis.com'), 'Must not make external calls to Google Fonts');
  assert.ok(!indexHtml.includes('cdn.jsdelivr.net'), 'Must not make external calls to CDNs');
  assert.ok(!indexHtml.includes('unpkg.com'), 'Must not make external calls to unpkg');
});

test('Open-Source Platform: self-host compose stack includes Web UI service', () => {
  const composePath = path.join(rootDir, 'self-host/compose.yaml');
  const composeContent = fs.readFileSync(composePath, 'utf8');
  assert.ok(composeContent.includes('web:'), 'compose.yaml must contain web service');
  assert.ok(composeContent.includes('3000:80'), 'compose.yaml must expose web service on port 3000');
});
