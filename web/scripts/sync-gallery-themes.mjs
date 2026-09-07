import { createHash } from "node:crypto";
import { access, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const themesRoot = path.join(root, "public", "themes");
const lockPath = path.join(root, "config", "theme-bundles.lock.json");
const args = process.argv.slice(2);
const checkOnly = args.includes("--check");
const sourceArg = args.indexOf("--source");
const sourceRoot = path.resolve(
  sourceArg >= 0 ? args[sourceArg + 1] : path.join(root, "..", "project42-gallery"),
);
const config = JSON.parse(await readFile(path.join(root, "project42.config.json"), "utf8"));
const themeIds = [...config.availableThemes].sort();

function assertSafeId(id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error(`Unsafe theme id: ${id}`);
}

function assertInside(parent, target) {
  const relative = path.relative(parent, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Unsafe theme target: ${target}`);
  }
}

async function filesUnder(directory, prefix = "") {
  const output = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isSymbolicLink()) throw new Error(`Theme bundles may not contain symlinks: ${entry.name}`);
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(absolute, relative));
    else if (entry.isFile()) output.push({ relative, absolute });
  }
  return output;
}

async function hashFile(file) {
  const bytes = await readFile(file);
  const extension = path.extname(file).toLowerCase();
  const content = [".css", ".json", ".svg"].includes(extension)
    ? bytes.toString("utf8").replace(/^\uFEFF/, "").replaceAll("\r\n", "\n")
    : bytes;
  return createHash("sha256").update(content).digest("hex");
}

async function inventoryTheme(id, directory) {
  const manifest = JSON.parse(await readFile(path.join(directory, "theme.json"), "utf8"));
  if (manifest.id !== id) throw new Error(`${id}: theme.json id mismatch`);
  const required = [
    manifest.assets?.tokens,
    manifest.assets?.components,
    manifest.assets?.mark,
    manifest.assets?.hero,
    ...Object.values(manifest.assets?.badges || {}),
  ];
  for (const relative of required) {
    if (typeof relative !== "string" || path.isAbsolute(relative) || relative.includes("..")) {
      throw new Error(`${id}: unsafe or missing asset reference`);
    }
    await access(path.join(directory, relative));
  }
  const files = {};
  for (const file of await filesUnder(directory)) files[file.relative] = await hashFile(file.absolute);
  return files;
}

// Layout bundles are versioned and hash-locked exactly like theme bundles.
// They previously lived only in the portal's public/ directory, unversioned
// and outside the lock, so a layout could change with nothing detecting it.
async function inventoryLayout(id, directory) {
  await access(path.join(directory, "layout.json"));
  await access(path.join(directory, "layout.css"));
  const files = {};
  for (const file of await filesUnder(directory)) files[file.relative] = await hashFile(file.absolute);
  return files;
}

const layoutsRoot = path.join(root, "public", "layouts");
const sourceLayouts = path.join(sourceRoot, "layouts");

// The Gallery checkout only exists when installing. Check mode verifies the
// INSTALLED bundles against the lock and must never read the source -- CI does
// not check the Gallery out at all, so touching it here fails the build with
// ENOENT rather than reporting anything useful about the lock.
if (checkOnly) {
  // The lock pins bundles a site chose to pull FROM THE GALLERY. It is not the
  // source of a site's appearance and never was a prerequisite for having one:
  // a theme folder dropped into themes/ in the site's own repository, and the
  // default the platform ships, are both outside it by design. So an absent
  // lock is a site that never went to the Gallery, not a broken site, and a
  // configured theme with no lock entry is a locally resolved theme.
  let lock;
  try {
    lock = JSON.parse(await readFile(lockPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    console.log(
      "No Gallery lock: this site's appearance resolves from its own themes/ " +
        "folder or from the bundles the platform ships. Nothing to verify.",
    );
    process.exit(0);
  }
  const lockedThemes = Object.keys(lock.themes ?? {}).sort();
  if (lockedThemes.includes(config.theme) && lock.selectedTheme !== config.theme) {
    throw new Error("Selected theme differs from theme lock");
  }
  for (const id of lockedThemes) {
    assertSafeId(id);
    const actual = await inventoryTheme(id, path.join(themesRoot, id));
    if (JSON.stringify(actual) !== JSON.stringify(lock.themes[id].files)) {
      throw new Error(`${id}: installed bundle differs from lock`);
    }
  }
  const lockedLayouts = Object.keys(lock.layouts ?? {}).sort();
  if (
    lockedLayouts.includes(config.layout.defaultPreset) &&
    lock.selectedLayout !== config.layout.defaultPreset
  ) {
    throw new Error("Selected layout differs from theme lock");
  }
  for (const id of lockedLayouts) {
    assertSafeId(id);
    const actual = await inventoryLayout(id, path.join(layoutsRoot, id));
    if (JSON.stringify(actual) !== JSON.stringify(lock.layouts[id].files)) {
      throw new Error(`${id}: installed layout bundle differs from lock`);
    }
  }
  const unlocked = themeIds.filter((id) => !lockedThemes.includes(id));
  console.log(
    `Verified ${lockedThemes.length} locked theme bundles and ${lockedLayouts.length} ` +
      `locked layout bundles at ${lock.gallery.commit}.` +
      (unlocked.length > 0 ? ` Resolved locally, outside the lock: ${unlocked.join(", ")}.` : ""),
  );
  process.exit(0);
}

const sourceThemes = path.join(sourceRoot, "themes");
const galleryCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceRoot, encoding: "utf8" }).trim();
const lock = {
  schemaVersion: 1,
  source: "https://github.com/project42dev/project42-gallery",
  gallery: { commit: galleryCommit },
  selectedTheme: config.theme,
  selectedLayout: config.layout.defaultPreset,
  themes: {},
  layouts: {},
};

await mkdir(themesRoot, { recursive: true });
for (const id of themeIds) {
  assertSafeId(id);
  const source = path.join(sourceThemes, id);
  const target = path.join(themesRoot, id);
  assertInside(sourceThemes, source);
  assertInside(themesRoot, target);
  await inventoryTheme(id, source);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true, errorOnExist: true });
  lock.themes[id] = { files: await inventoryTheme(id, target) };
}

const layoutIds = (await readdir(sourceLayouts, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

await mkdir(layoutsRoot, { recursive: true });
for (const id of layoutIds) {
  assertSafeId(id);
  const source = path.join(sourceLayouts, id);
  const target = path.join(layoutsRoot, id);
  assertInside(sourceLayouts, source);
  assertInside(layoutsRoot, target);
  await inventoryLayout(id, source);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true, errorOnExist: true });
  lock.layouts[id] = { files: await inventoryLayout(id, target) };
}

if (!layoutIds.includes(config.layout.defaultPreset)) {
  throw new Error(
    `Selected layout "${config.layout.defaultPreset}" is not published by the Gallery`,
  );
}

await mkdir(path.dirname(lockPath), { recursive: true });
await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf8");
console.log(
  `Installed ${themeIds.length} theme bundles and ${layoutIds.length} layout bundles from ${galleryCommit}.`,
);
