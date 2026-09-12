import { devices } from "@playwright/test";

/**
 * THE DEVICE MATRIX.
 *
 * One table, read by playwright.config.ts (which turns each row into a
 * project) and by device-matrix.spec.ts (which reads the running project to
 * name itself in failures). Keeping it in one place is what stops the config
 * and the spec drifting into disagreement about what "the matrix" is.
 *
 * Every row names a real device profile wherever Playwright ships one, so the
 * viewport, the device scale factor, the user agent and the touch flag are
 * Playwright's numbers rather than ours. Firefox has no device descriptors at
 * all -- the phone row there is an explicit viewport plus touch, and says so.
 *
 * WHY THESE ROWS
 *
 * The header collapses at 760px and the nav row carries `overflow-x: auto`
 * from 761px to 960px, so the interesting widths are not "phone, tablet,
 * desktop" -- they are the edges of those two rules. Rows that land INSIDE
 * 761-960 are marked below, because that band is where the About menu is
 * known to clip, and a matrix that stepped straight from 390 to 1280 would
 * walk over it without touching it.
 */

export type EngineName = "chromium" | "webkit" | "firefox";

export interface MatrixDevice {
  /** Project name. Appears verbatim in every failure this suite produces. */
  readonly name: string;
  readonly engine: EngineName;
  /** Context options, merged over the engine default in the config. */
  readonly use: Record<string, unknown>;
  /** Set when the viewport width falls in the 761-960 nav-scroll band. */
  readonly inNavScrollBand?: boolean;
  /** Set for a row that can resize itself: the width sweep runs on these. */
  readonly sweepsWidths?: boolean;
}

/** A descriptor minus `defaultBrowserType`, which belongs to the project. */
function profile(id: string): Record<string, unknown> {
  const descriptor = devices[id];
  if (!descriptor) {
    throw new Error(
      `The installed Playwright ships no device descriptor "${id}". Pick a profile it ` +
        "does ship rather than inventing a viewport, or the matrix stops measuring a real device.",
    );
  }
  const { defaultBrowserType: _ignored, ...rest } = descriptor;
  return rest;
}

export const DEVICE_MATRIX: readonly MatrixDevice[] = [
  // ---- Chromium: Android phones, an Android tablet, and two desktop widths.
  { name: "chromium-pixel-10", engine: "chromium", use: profile("Pixel 10") },
  {
    // 756x308. A phone in landscape lands INSIDE the nav-scroll band, which is
    // the cheapest proof that band is not a tablet-only curiosity.
    name: "chromium-pixel-10-landscape",
    engine: "chromium",
    use: profile("Pixel 10 landscape"),
  },
  { name: "chromium-galaxy-s24", engine: "chromium", use: profile("Galaxy S24") },
  {
    // 780x360 -- inside the band.
    name: "chromium-galaxy-s24-landscape",
    engine: "chromium",
    use: profile("Galaxy S24 landscape"),
    inNavScrollBand: true,
  },
  { name: "chromium-galaxy-tab-s9", engine: "chromium", use: profile("Galaxy Tab S9") },
  {
    name: "chromium-galaxy-tab-s9-landscape",
    engine: "chromium",
    use: profile("Galaxy Tab S9 landscape"),
  },
  {
    // 800x1280 -- an Android tablet held upright is inside the band.
    name: "chromium-nexus-10",
    engine: "chromium",
    use: profile("Nexus 10"),
    inNavScrollBand: true,
  },
  {
    name: "chromium-desktop-1280",
    engine: "chromium",
    use: { ...profile("Desktop Chrome"), viewport: { width: 1280, height: 800 } },
    sweepsWidths: true,
  },
  {
    name: "chromium-desktop-1440",
    engine: "chromium",
    use: { ...profile("Desktop Chrome"), viewport: { width: 1440, height: 900 } },
  },

  // ---- WebKit: the engine Mobile Safari actually uses.
  { name: "webkit-iphone-se", engine: "webkit", use: profile("iPhone SE") },
  { name: "webkit-iphone-14", engine: "webkit", use: profile("iPhone 14") },
  {
    // 750x340 -- inside the band.
    name: "webkit-iphone-14-landscape",
    engine: "webkit",
    use: profile("iPhone 14 landscape"),
  },
  {
    // 768x1024 -- an iPad held upright is inside the band.
    name: "webkit-ipad-portrait",
    engine: "webkit",
    use: profile("iPad Mini"),
    inNavScrollBand: true,
  },
  {
    name: "webkit-ipad-landscape",
    engine: "webkit",
    use: profile("iPad Mini landscape"),
  },
  {
    // 834x1194 -- the other iPad portrait width, also inside the band.
    name: "webkit-ipad-pro-11",
    engine: "webkit",
    use: profile("iPad Pro 11"),
    inNavScrollBand: true,
  },
  {
    name: "webkit-desktop-1280",
    engine: "webkit",
    use: { ...profile("Desktop Safari"), viewport: { width: 1280, height: 800 } },
    sweepsWidths: true,
  },

  // ---- Firefox: no device descriptors exist, so the phone row is built by
  // hand. `isMobile` is NOT supported in Firefox and must not appear here --
  // Playwright rejects the context outright. What is left is the viewport and
  // touch, which is what the layout and the tap handlers actually read.
  {
    name: "firefox-desktop-1280",
    engine: "firefox",
    use: { viewport: { width: 1280, height: 800 } },
    sweepsWidths: true,
  },
  {
    name: "firefox-phone-390",
    engine: "firefox",
    use: { viewport: { width: 390, height: 844 }, hasTouch: true },
  },
];

/** The widths a sweeping project walks. */
export const SWEEP_WIDTHS: readonly number[] = [
  // The floor of the supported set.
  320,
  360, 390, 412,
  // Just under, at, and just over the phone breakpoint (max-width: 760px).
  720, 759, 760, 761,
  // Inside the nav-scroll band: real tablet portrait widths plus the edges.
  768, 800, 834, 860, 900, 944, 960,
  // Just over the band, and the two desktop widths.
  961, 1024, 1280, 1440,
];

/** The lower and upper edge of `@media (max-width: 960px) .site-header nav`. */
export const NAV_SCROLL_BAND = { from: 761, to: 960 } as const;
