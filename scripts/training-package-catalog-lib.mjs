import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const classScriptFilename = "class-script.json";
const instructorRenderingFilename = "instructor-rendering.json";

export async function loadCanonicalClassScripts(root) {
  const trainingRoot = resolve(root, "content/training");
  const files = await findNamedFiles(trainingRoot, classScriptFilename);
  const entries = [];

  for (const file of files) {
    const relativePath = relative(trainingRoot, file);
    if (
      isAbsolute(relativePath) ||
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`)
    ) {
      throw new Error(`Class-script path escapes the training root: ${file}`);
    }

    const path = relativePath.split(sep).join("/");
    const parts = path.split("/");
    if (parts.length !== 3 || parts[2] !== classScriptFilename) {
      throw new Error(
        `Canonical class scripts must use <path>/<module>/class-script.json: ${path}`,
      );
    }

    const script = JSON.parse(await readFile(file, "utf8"));
    if (parts[1] !== script.moduleId) {
      throw new Error(
        `Class-script directory ${parts[1]} does not match module ${script.moduleId}`,
      );
    }
    entries.push({
      absolutePath: file,
      classScriptPath: `content/training/${path}`,
      pathId: parts[0],
      script,
    });
  }

  const exampleRoot = resolve(root, "examples/training");
  for (const file of await findNamedFiles(exampleRoot, classScriptFilename)) {
    const relativePath = relative(exampleRoot, file);
    if (
      isAbsolute(relativePath) ||
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`)
    ) {
      throw new Error(`Class-script path escapes the example root: ${file}`);
    }
    const path = relativePath.split(sep).join("/");
    const parts = path.split("/");
    if (parts.length !== 2 || parts[1] !== classScriptFilename) {
      throw new Error(
        `Example class scripts must use <module>/class-script.json: ${path}`,
      );
    }
    const script = JSON.parse(await readFile(file, "utf8"));
    if (parts[0] !== script.moduleId) {
      throw new Error(
        `Example class-script directory ${parts[0]} does not match module ${script.moduleId}`,
      );
    }
    entries.push({
      absolutePath: file,
      classScriptPath: `examples/training/${path}`,
      script,
    });
  }

  return entries.sort((left, right) =>
    left.script.moduleId.localeCompare(right.script.moduleId),
  );
}

// Which lessons have actually been filmed. Authored upstream in
// project42-content beside the class script each was rendered from, so a
// consumer inherits the list with the curriculum instead of maintaining its own
// copy. project-42.dev previously held this in config/, which made "which
// lessons exist" a fact about one deployment's front end rather than about the
// curriculum -- the thing ADR-0020 says it is.
export async function loadInstructorRenderings(root) {
  const trainingRoot = resolve(root, "content/training");
  const files = await findNamedFiles(trainingRoot, instructorRenderingFilename);
  const renderings = [];

  for (const file of files) {
    const relativePath = relative(trainingRoot, file);
    if (
      isAbsolute(relativePath) ||
      relativePath === ".." ||
      relativePath.startsWith(`..${sep}`)
    ) {
      throw new Error(`Instructor rendering escapes the training root: ${file}`);
    }
    const path = relativePath.split(sep).join("/");
    const parts = path.split("/");
    if (parts.length !== 3 || parts[2] !== instructorRenderingFilename) {
      throw new Error(
        `Instructor renderings must use <path>/<module>/${instructorRenderingFilename}: ${path}`,
      );
    }
    const manifest = JSON.parse(await readFile(file, "utf8"));
    if (parts[1] !== manifest.moduleId) {
      throw new Error(
        `Instructor rendering directory ${parts[1]} does not match module ${manifest.moduleId}`,
      );
    }
    // pathId is derived from where the manifest sits rather than authored, so
    // it cannot disagree with the tree it lives in.
    renderings.push({ ...manifest, pathId: parts[0] });
  }

  return renderings.sort((left, right) => left.moduleId.localeCompare(right.moduleId));
}

export function buildTrainingCoverage(catalog, entries, renderings = []) {
  const modulesById = new Map(catalog.modules.map((module) => [module.id, module]));
  const pathsByModule = new Map();
  for (const path of catalog.paths) {
    for (const moduleId of path.moduleIds) {
      const pathIds = pathsByModule.get(moduleId) ?? [];
      pathIds.push(path.id);
      pathsByModule.set(moduleId, pathIds);
    }
  }

  const entriesByModule = new Map();
  const packageIds = new Set();
  for (const entry of entries) {
    const { script } = entry;
    const module = modulesById.get(script.moduleId);
    if (!module) {
      throw new Error(`Class script references missing module ${script.moduleId}`);
    }
    if (!module.activity || !module.instructorScript) {
      throw new Error(
        `Class script ${script.id} references non-substantive module ${script.moduleId}`,
      );
    }
    if (entriesByModule.has(script.moduleId)) {
      throw new Error(`Duplicate class script for module ${script.moduleId}`);
    }
    if (packageIds.has(script.id)) {
      throw new Error(`Duplicate class-script package ID ${script.id}`);
    }
    const modulePathIds = pathsByModule.get(script.moduleId) ?? [];
    if (entry.pathId && !modulePathIds.includes(entry.pathId)) {
      throw new Error(
        `Class script ${script.id} is stored under unrelated path ${entry.pathId}`,
      );
    }
    entriesByModule.set(script.moduleId, entry);
    packageIds.add(script.id);
  }

  const renderingsByModule = new Map(
    renderings.map((rendering) => [rendering.moduleId, rendering]),
  );
  for (const rendering of renderings) {
    const entry = entriesByModule.get(rendering.moduleId);
    if (!entry) {
      throw new Error(
        `Instructor rendering ${rendering.id} has no class script to be a rendering of`,
      );
    }
    if (
      rendering.classScriptId !== entry.script.id ||
      rendering.classScriptVersion !== entry.script.version
    ) {
      throw new Error(
        `Instructor rendering ${rendering.id} was filmed from ` +
          `${rendering.classScriptId}@${rendering.classScriptVersion}, not ` +
          `${entry.script.id}@${entry.script.version}`,
      );
    }
    if (rendering.renderedSegments > entry.script.segments.length) {
      throw new Error(
        `Instructor rendering ${rendering.id} claims ${rendering.renderedSegments} of ` +
          `${entry.script.segments.length} segments`,
      );
    }
    if (entry.pathId && rendering.pathId !== entry.pathId) {
      throw new Error(
        `Instructor rendering ${rendering.id} is stored under ${rendering.pathId}, ` +
          `its class script under ${entry.pathId}`,
      );
    }
  }

  const substantiveModules = catalog.modules
    .filter((module) => module.activity && module.instructorScript)
    .sort((left, right) => left.id.localeCompare(right.id));
  const modules = substantiveModules.map((module) => {
    const entry = entriesByModule.get(module.id);
    const pathIds = [...(pathsByModule.get(module.id) ?? [])].sort();
    if (pathIds.length === 0) {
      throw new Error(`Substantive module ${module.id} is not assigned to a path`);
    }
    const rendering = renderingsByModule.get(module.id);
    return entry
      ? {
          moduleId: module.id,
          pathIds,
          status: "class-ready-draft",
          instructorSchemaVersion: module.instructorScript.schemaVersion,
          classScriptId: entry.script.id,
          classScriptVersion: entry.script.version,
          classScriptPath: entry.classScriptPath,
          ...(rendering
            ? {
                rendering: {
                  releaseStatus: rendering.releaseStatus,
                  renderedSeconds: rendering.renderedSeconds,
                  renderedSegments: rendering.renderedSegments,
                },
              }
            : {}),
        }
      : {
          moduleId: module.id,
          pathIds,
          status: "outline-only",
          instructorSchemaVersion: module.instructorScript.schemaVersion,
        };
  });
  const classReadyModuleCount = modules.filter(
    (module) => module.status === "class-ready-draft",
  ).length;

  return {
    schemaVersion: "1.0",
    canonicalContentVersion: catalog.contentVersion,
    substantiveModuleCount: modules.length,
    classReadyModuleCount,
    outlineOnlyModuleCount: modules.length - classReadyModuleCount,
    renderedModuleCount: modules.filter((module) => module.rendering).length,
    coverageStatus:
      classReadyModuleCount === modules.length ? "complete" : "migration-active",
    modules,
  };
}

async function findNamedFiles(root, filename) {
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
      paths.push(...(await findNamedFiles(path, filename)));
    } else if (entry.isFile() && entry.name === filename) {
      paths.push(path);
    }
  }
  return paths.sort();
}
