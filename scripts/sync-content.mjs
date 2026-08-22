import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

console.log('=== Project 42 Content Ingestion & Synchronization Engine ===');

// Check custom-content directory
const customDir = path.join(rootDir, 'custom-content');
if (!fs.existsSync(customDir)) {
  fs.mkdirSync(path.join(customDir, 'modules'), { recursive: true });
  fs.writeFileSync(path.join(customDir, 'README.md'), '# Custom Corporate Content\n\nMount internal training modules and courses in this directory.\n', 'utf8');
  console.log('Initialized empty custom-content/ directory.');
}

console.log('Validating open-source catalog schemas...');
execSync('npm run generate', { cwd: rootDir, stdio: 'inherit' });
console.log('Content synchronization and schema validation complete!');
