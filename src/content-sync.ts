import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import type { Catalog, LearningModule, LearningPath, Resource } from "./schema.js";
import { generatedCatalog } from "./generated/catalog.js";

export interface ContentSyncOptions {
  contentRoot?: string;
  customOverlayRoots?: string[];
  fallbackToGenerated?: boolean;
}

export interface ContentSyncSummary {
  source: string;
  pathsCount: number;
  modulesCount: number;
  resourcesCount: number;
  overlayCount: number;
  syncedAt: string;
}

/**
 * Loads and merges curriculum catalog from local directories, remote sync mounts,
 * and optional custom enterprise organizational overlays.
 */
export async function loadDynamicCatalog(options: ContentSyncOptions = {}): Promise<Catalog> {
  const root = options.contentRoot ?? process.env.PROJECT42_CONTENT_DIR;
  
  let baseCatalog: Catalog;
  if (root) {
    baseCatalog = await loadCatalogFromPath(root);
  } else if (options.fallbackToGenerated !== false) {
    baseCatalog = generatedCatalog;
  } else {
    throw new Error("No contentRoot specified and fallbackToGenerated is disabled");
  }

  const overlays: Catalog[] = [];
  const customRoots = options.customOverlayRoots ?? (
    process.env.PROJECT42_CUSTOM_CONTENT_DIR ? process.env.PROJECT42_CUSTOM_CONTENT_DIR.split(";").filter(Boolean) : []
  );

  for (const customRoot of customRoots) {
    try {
      const overlay = await loadCatalogFromPath(customRoot);
      overlays.push(overlay);
    } catch (err: any) {
      console.warn(`[ContentSync] Skipping unavailable custom overlay ${customRoot}: ${err.message}`);
    }
  }

  if (overlays.length === 0) {
    return baseCatalog;
  }

  return mergeCatalogs(baseCatalog, overlays);
}

/**
 * Reads a catalog structure from a specified folder (like project42-content).
 */
export async function loadCatalogFromPath(dir: string): Promise<Catalog> {
  const catalogFile = resolve(dir, "catalog.json");
  const rawCatalog = await readJsonFile(catalogFile);

  const modulesDir = resolve(dir, "modules");
  const moduleFiles = await findJsonFiles(modulesDir);
  const loadedModules: LearningModule[] = await Promise.all(
    moduleFiles.map(async (file) => (await readJsonFile(file)) as LearningModule)
  );

  const resourcesDir = resolve(dir, "resources");
  const resourceFiles = await findJsonFiles(resourcesDir);
  const loadedResources: Resource[] = await Promise.all(
    resourceFiles.map(async (file) => (await readJsonFile(file)) as Resource)
  );

  return {
    ...rawCatalog,
    modules: [...(rawCatalog.modules ?? []), ...loadedModules],
    resources: [...(rawCatalog.resources ?? []), ...loadedResources],
  };
}

/**
 * Merges the primary Project 42 catalog with custom enterprise organization overlays,
 * deduplicating modules by ID and aggregating custom learning paths.
 */
export function mergeCatalogs(base: Catalog, overlays: Catalog[]): Catalog {
  let merged: Catalog = {
    ...base,
    paths: [...base.paths],
    modules: [...base.modules],
    resources: [...(base.resources ?? [])],
    providers: [...(base.providers ?? [])],
  };

  for (const overlay of overlays) {
    // Merge providers
    if (overlay.providers) {
      for (const p of overlay.providers) {
        if (!merged.providers.some((ep) => ep.id === p.id)) {
          merged.providers.push(p);
        }
      }
    }

    // Merge paths
    if (overlay.paths) {
      for (const path of overlay.paths) {
        const existingIdx = merged.paths.findIndex((ep) => ep.id === path.id);
        if (existingIdx >= 0) {
          // Merge module IDs in path
          const existingPath = merged.paths[existingIdx]!;
          merged.paths[existingIdx] = {
            ...existingPath,
            ...path,
            moduleIds: Array.from(new Set([...existingPath.moduleIds, ...path.moduleIds])),
          };
        } else {
          merged.paths.push(path);
        }
      }
    }

    // Merge modules (overlay overrides or adds)
    if (overlay.modules) {
      for (const mod of overlay.modules) {
        const existingIdx = merged.modules.findIndex((em) => em.id === mod.id);
        if (existingIdx >= 0) {
          merged.modules[existingIdx] = mod;
        } else {
          merged.modules.push(mod);
        }
      }
    }

    // Merge resources
    if (overlay.resources) {
      for (const res of overlay.resources) {
        const existingIdx = merged.resources.findIndex((er) => er.id === res.id);
        if (existingIdx >= 0) {
          merged.resources[existingIdx] = res;
        } else {
          merged.resources.push(res);
        }
      }
    }
  }

  return merged;
}

async function readJsonFile(filePath: string): Promise<any> {
  try {
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error: any) {
    throw new Error(`Failed to parse JSON file at ${filePath}: ${error.message}`, { cause: error });
  }
}

async function findJsonFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error: any) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const paths: string[] = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      paths.push(...(await findJsonFiles(full)));
    } else if (entry.isFile() && extname(entry.name) === ".json") {
      paths.push(full);
    }
  }
  return paths.sort();
}
