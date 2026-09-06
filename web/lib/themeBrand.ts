import config from "../project42.config.json";
import { themeBundles } from "./themeBundles.generated";

// Browser chrome colours -- the manifest's theme_color and background_color,
// the meta theme-color, and the mask-icon colour -- are appearance, so they
// belong to the theme like every other colour. They used to be #090d16 and
// #f59e0b literals in core, which are 06-galactic-guide's values: switch the
// configured theme and the installed app's splash screen, task-switcher card
// and iOS status bar would still have worn the old theme's colours.
//
// The theme-boundary gate only scans CSS, so it could not have caught this.
// Reading the values from the installed bundle closes the hole at the source.
//
// The bundles are imported statically rather than read from disk because this
// module is evaluated in the Workers runtime during build, where there is no
// filesystem. The import list used to be six hand-written lines naming the six
// Project 42 theme IDs -- product code that could only ever serve one
// operator's theme set. themeBundles.generated.ts is written by
// `project42-portal materialise` from this deployment's own availableThemes,
// so an adopter with different bundles gets a correct module rather than a
// build error. sync-gallery-themes keeps the files in step with the Gallery
// and hash-locks them, and tokens:check asserts the vocabulary is complete.
export interface ThemeBrandColors {
  /** Page background: the installed app's splash and status-bar ground. */
  background: string;
  /** Browser/OS chrome tint. */
  theme: string;
  /** Safari pinned-tab mask icon. */
  mask: string;
}

export function getThemeBrandColors(themeId?: string): ThemeBrandColors {
  const active = themeId || config.theme;
  const tokens = themeBundles[active]?.tokens;
  if (!tokens) throw new Error(`Unknown theme bundle: ${active}`);
  return {
    background: tokens["--p42-bg"] as string,
    theme: tokens["--p42-bg"] as string,
    mask: tokens["--p42-primary"] as string,
  };
}
