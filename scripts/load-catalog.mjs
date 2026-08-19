import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

export async function loadCatalog(root) {
  const catalog = await readContentRecord(
    resolve(root, "content/catalog.json"),
    root,
  );
  const moduleRoot = resolve(root, "content/modules");
  const moduleFiles = await findJsonFiles(moduleRoot);
  const additionalModules = await Promise.all(
    moduleFiles.map((path) => readContentRecord(path, root)),
  );
  const resourceRoot = resolve(root, "content/resources");
  const resourceFiles = await findJsonFiles(resourceRoot);
  const additionalResources = await Promise.all(
    resourceFiles.map((path) => readContentRecord(path, root)),
  );

  return {
    ...catalog,
    modules: [...catalog.modules, ...additionalModules],
    resources: [...catalog.resources, ...additionalResources],
  };
}

// Every .json file under content/ is discovered and merged automatically, so a
// single malformed file takes down the catalog for all three sites. Name the
// file that caused it: an anonymous "Unexpected token '#'" from deep inside a
// site build costs hours to trace back to one bad content commit.
async function readContentRecord(path, root) {
  const where = relative(root, path).split("\\").join("/");
  let parsed;
  try {
    parsed = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`${where} is not valid JSON: ${error.message}`, {
      cause: error,
    });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${where} must hold a JSON object, found ${describe(parsed)}`);
  }
  return parsed;
}

function describe(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return `a ${typeof value}`;
}

async function findJsonFiles(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const paths = [];
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await findJsonFiles(path)));
    } else if (entry.isFile() && extname(entry.name) === ".json") {
      paths.push(path);
    }
  }
  return paths.sort();
}
