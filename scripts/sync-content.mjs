import { loadDynamicCatalog } from "../dist/content-sync.js";
import { resolve } from "node:path";

const contentDir = process.argv[2] || process.env.PROJECT42_CONTENT_DIR || resolve(process.cwd(), "../project42-content");

console.log(`Syncing curriculum catalog from ${contentDir}...`);
try {
  const catalog = await loadDynamicCatalog({ contentRoot: contentDir, fallbackToGenerated: true });
  console.log(`Successfully synced catalog:`);
  console.log(` - Learning Paths: ${catalog.paths.length}`);
  console.log(` - Modules: ${catalog.modules.length}`);
  console.log(` - Resources: ${catalog.resources?.length ?? 0}`);
  console.log(` - Providers: ${catalog.providers?.length ?? 0}`);
} catch (err) {
  console.error(`Failed to sync catalog: ${err.message}`);
  process.exit(1);
}
