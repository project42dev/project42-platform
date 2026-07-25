import { readdir, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

export async function loadCatalog(root) {
  const catalog = JSON.parse(
    await readFile(resolve(root, "content/catalog.json"), "utf8"),
  );
  const moduleRoot = resolve(root, "content/modules");
  const moduleFiles = await findJsonFiles(moduleRoot);
  const additionalModules = await Promise.all(
    moduleFiles.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );
  const resourceRoot = resolve(root, "content/resources");
  const resourceFiles = await findJsonFiles(resourceRoot);
  const additionalResources = await Promise.all(
    resourceFiles.map(async (path) => JSON.parse(await readFile(path, "utf8"))),
  );

  return {
    ...catalog,
    modules: [...catalog.modules, ...additionalModules],
    resources: [...catalog.resources, ...additionalResources],
  };
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
