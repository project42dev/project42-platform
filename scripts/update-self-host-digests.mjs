import { readFile, writeFile } from "node:fs/promises";
import { refreshComponentDigests } from "./release-component-digests.mjs";

const manifestPath = "self-host/compatibility.json";
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
await refreshComponentDigests(manifest);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Updated component digests in ${manifestPath}.`);
