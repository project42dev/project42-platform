import config from "../project42.config.json";

// Brand source artwork is INSTANCE data -- an adopter supplies their own --
// but the paths to it were product literals: app/layout.tsx named
// /brand/project-42-mark-mono.svg for the Safari mask icon, and
// scripts/generate-brand-assets.mjs stat'ed four project-42-*.svg filenames.
// An adopter whose wordmark is not called "project-42-wordmark.svg" could not
// build. The filenames are configuration now, defaulting to the names this
// deployment already uses so nothing moves for the existing site.
export interface BrandAssets {
  wordmark: string;
  mark: string;
  markMono: string;
  markReversed: string;
  social: string;
  /** Safari pinned-tab icon. Must be a single-colour SVG. */
  maskIcon: string;
}

const defaults: BrandAssets = {
  wordmark: "/brand/project-42-wordmark.svg",
  mark: "/brand/project-42-mark.svg",
  markMono: "/brand/project-42-mark-mono.svg",
  markReversed: "/brand/project-42-mark-reversed.svg",
  social: "/brand/project-42-social.svg",
  maskIcon: "/brand/project-42-mark-mono.svg",
};

export function getBrandAssets(): BrandAssets {
  const configured = (config as { branding?: Partial<BrandAssets> }).branding ?? {};
  return { ...defaults, ...configured };
}
