// The copy layer.
//
// The marketing and policy pages are product templates. Their prose is not:
// "Start curious. Become capable.", "Concepts before vendors", and the whole
// Legal & Transparency text are one operator's editorial voice and one
// operator's legal commitments. An adopter must be able to replace them
// without forking the page that renders them.
//
// So every user-visible sentence on those pages lives in copy/defaults.ts,
// which carries the Project 42 wording verbatim, and an adopter overrides any
// leaf of it in project42.copy.json. Defaults win wherever the override is
// silent, so an adopter who changes nothing gets the shipped site.
//
// Values are plain strings, arrays of strings, or nested objects -- nothing
// that cannot be expressed in the JSON override file. Two conveniences make
// that sufficient:
//
//   {org}, {tagline}, {supportUrl}, {origin}, {adminOrigin} and {galleryUrl}
//     are substituted from project42.config.json, so the operator's name and
//     origins are configured once and never typed into prose.
//
//   [label](href) inside a string renders as a link -- see RichText. Prose
//     carrying an inline citation therefore stays one editable string instead
//     of being split across JSX.
//
// Both files are imported statically. This module is evaluated in the Workers
// runtime during build, where there is no filesystem -- the same constraint
// that makes lib/themeBundles.generated.ts a generated module.

import config from "../project42.config.json";
import overrides from "../project42.copy.json";
import { copyDefaults } from "../copy/defaults";

type DeepPartial<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? U[]
    : { [K in keyof T]?: DeepPartial<T[K]> };

export type CopyOverrides = DeepPartial<typeof copyDefaults>;

const tokens: Record<string, string> = {
  org: config.organization.name,
  tagline: config.organization.tagline,
  supportUrl: config.organization.supportUrl,
  origin: config.portal.canonicalOrigin,
  adminOrigin: config.portal.adminOrigin,
  galleryUrl: (config as { galleryUrl?: string }).galleryUrl ?? config.portal.canonicalOrigin,
};

export function interpolate(value: string): string {
  return value.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? (tokens[key] as string) : match,
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Defaults define the shape; the override supplies replacements leaf by leaf.
// A string override replaces a string. An array override replaces the whole
// array -- an adopter listing four bullets must not inherit a fifth. An object
// override merges key by key, so replacing one sentence of a section does not
// delete the rest of it.
function merge(base: unknown, override: unknown): unknown {
  if (typeof base === "string") {
    return interpolate(typeof override === "string" ? override : base);
  }
  if (Array.isArray(base)) {
    const source: unknown[] = Array.isArray(override) ? override : base;
    return source.map((entry) => merge(entry, undefined));
  }
  if (isPlainObject(base)) {
    const patch = isPlainObject(override) ? override : {};
    const merged: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(base)) {
      merged[key] = merge(value, patch[key]);
    }
    // An adopter may add keys the defaults do not carry -- an extra list
    // entry, an extra section. Carrying them through costs nothing, and
    // refusing them would make the override file a closed vocabulary.
    for (const [key, value] of Object.entries(patch)) {
      if (!(key in merged)) merged[key] = merge(value, undefined);
    }
    return merged;
  }
  return override ?? base;
}

export const copy = merge(copyDefaults, overrides as unknown) as typeof copyDefaults;

export const orgName = config.organization.name;
export const orgTagline = config.organization.tagline;
export const supportUrl = config.organization.supportUrl;
export const canonicalOrigin = config.portal.canonicalOrigin;
export const adminOrigin = config.portal.adminOrigin;
export const galleryUrl = tokens["galleryUrl"] as string;
