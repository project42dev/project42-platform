import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import {
  canonicalizeSvgSource,
  sourceSha256,
} from "./brand-source-integrity.mjs";

const root = resolve(import.meta.dirname, "..");
const checkOnly = process.argv.includes("--check");
const portalConfig = JSON.parse(
  await readFile(resolve(root, "project42.config.json"), "utf8"),
);
const selectedTheme = portalConfig.theme;
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(selectedTheme)) {
  throw new Error(`Invalid configured theme id: ${selectedTheme}`);
}
const faviconUrl = `/themes/${selectedTheme}/mark.svg`;
const themeIconPath = resolve(root, "public", faviconUrl.slice(1));
// Brand source filenames are this deployment's, not the product's. They
// default to the names Project 42 uses so nothing moves here, and an adopter
// whose wordmark has a different filename sets "branding" in
// project42.config.json instead of editing this script.
const brandDefaults = {
  wordmark: "/brand/project-42-wordmark.svg",
  mark: "/brand/project-42-mark.svg",
  markMono: "/brand/project-42-mark-mono.svg",
  markReversed: "/brand/project-42-mark-reversed.svg",
  social: "/brand/project-42-social.svg",
};
const branding = { ...brandDefaults, ...(portalConfig.branding ?? {}) };
for (const [key, value] of Object.entries(branding)) {
  if (typeof value !== "string" || !value.startsWith("/") || value.includes("..")) {
    throw new Error(`Unsafe branding.${key}: ${value}`);
  }
}
const socialName = branding.social.slice("/brand/".length);
const socialPath = resolve(root, "public", branding.social.slice(1));
const manifestPath = resolve(root, "public/brand/asset-manifest.json");

const themeIcon = canonicalizeSvgSource(await readFile(themeIconPath));
const social = canonicalizeSvgSource(await readFile(socialPath));
const rasterAssets = [
  ["favicon-16x16.png", 16, 16, themeIcon],
  ["favicon-32x32.png", 32, 32, themeIcon],
  ["favicon-48x48.png", 48, 48, themeIcon],
  ["apple-touch-icon.png", 180, 180, themeIcon],
  ["icon-192x192.png", 192, 192, themeIcon],
  ["icon-512x512.png", 512, 512, themeIcon],
  ["icon-maskable-512x512.png", 512, 512, themeIcon],
  ["og.png", 1200, 630, social],
];

if (checkOnly) {
  await validateCommittedAssets();
  console.log(`Validated ${portalConfig.organization.name} brand sources, raster assets, manifest, and ICO.`);
} else {
  const generated = new Map();
  for (const [filename, width, height, source] of rasterAssets) {
    const buffer = await sharp(source, { density: 384 })
      .resize(width, height, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .toBuffer();
    generated.set(filename, buffer);
    await writeFile(resolve(root, "public", filename), buffer);
  }

  const icoSizes = [16, 32, 48, 256];
  const icoFrames = [];
  for (const size of icoSizes) {
    icoFrames.push(
      await sharp(themeIcon, { density: 384 })
        .resize(size, size, { fit: "fill" })
        .png({ compressionLevel: 9 })
        .toBuffer(),
    );
  }
  const ico = createIco(icoSizes, icoFrames);
  generated.set("favicon.ico", ico);
  await writeFile(resolve(root, "public/favicon.ico"), ico);

  const manifest = {
    schemaVersion: "2.0",
    sources: {
      selectedTheme,
      faviconUrl,
      faviconSha256: sourceSha256(themeIcon),
      [socialName]: sourceSha256(social),
    },
    generated: Object.fromEntries(
      [...generated].map(([filename, buffer]) => [
        filename,
        { bytes: buffer.length, sha256: sha256(buffer) },
      ]),
    ),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await validateCommittedAssets();
  console.log(`Generated and validated ${generated.size} Project 42 brand assets.`);
}

async function validateCommittedAssets() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== "2.0") {
    throw new Error("Unsupported brand asset manifest");
  }
  if (
    manifest.sources.selectedTheme !== selectedTheme ||
    manifest.sources.faviconUrl !== faviconUrl ||
    manifest.sources.faviconSha256 !== sourceSha256(themeIcon)
  ) {
    throw new Error("Configured theme favicon changed without regenerating assets");
  }
  if (manifest.sources[socialName] !== sourceSha256(social)) {
    throw new Error("Social source changed without regenerating assets");
  }
  for (const [filename, width, height] of rasterAssets) {
    const filePath = resolve(root, "public", filename);
    const file = await readFile(filePath);
    const metadata = await sharp(file).metadata();
    if (metadata.width !== width || metadata.height !== height) {
      throw new Error(
        `${filename} is ${metadata.width}x${metadata.height}; expected ${width}x${height}`,
      );
    }
    validateManifestEntry(manifest, filename, file);
  }

  const ico = await readFile(resolve(root, "public/favicon.ico"));
  validateIco(ico, [16, 32, 48, 256]);
  validateManifestEntry(manifest, "favicon.ico", ico);
  for (const key of ["wordmark", "mark", "markMono", "markReversed"]) {
    await stat(resolve(root, "public", branding[key].slice(1)));
  }
}

function validateManifestEntry(manifest, filename, file) {
  const entry = manifest.generated[filename];
  if (!entry || entry.bytes !== file.length || entry.sha256 !== sha256(file)) {
    throw new Error(`${filename} does not match the committed asset manifest`);
  }
}

function createIco(sizes, frames) {
  const directory = Buffer.alloc(6 + sizes.length * 16);
  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(sizes.length, 4);
  let offset = directory.length;
  for (const [index, size] of sizes.entries()) {
    const entry = 6 + index * 16;
    directory.writeUInt8(size === 256 ? 0 : size, entry);
    directory.writeUInt8(size === 256 ? 0 : size, entry + 1);
    directory.writeUInt8(0, entry + 2);
    directory.writeUInt8(0, entry + 3);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(frames[index].length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += frames[index].length;
  }
  return Buffer.concat([directory, ...frames]);
}

function validateIco(buffer, expectedSizes) {
  if (
    buffer.readUInt16LE(0) !== 0 ||
    buffer.readUInt16LE(2) !== 1 ||
    buffer.readUInt16LE(4) !== expectedSizes.length
  ) {
    throw new Error("favicon.ico has an invalid directory header");
  }
  for (const [index, expected] of expectedSizes.entries()) {
    const entry = 6 + index * 16;
    const width = buffer.readUInt8(entry) || 256;
    const height = buffer.readUInt8(entry + 1) || 256;
    if (width !== expected || height !== expected) {
      throw new Error(
        `favicon.ico frame ${index} is ${width}x${height}; expected ${expected}x${expected}`,
      );
    }
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
