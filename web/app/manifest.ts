import type { MetadataRoute } from "next";
import config from "../project42.config.json";
import { getThemeBrandColors } from "../lib/themeBrand";
import { copy } from "../lib/copy";

const brand = getThemeBrandColors();
const meta = copy.meta;

export default function manifest(): MetadataRoute.Manifest {
  return {
    // A stable id keeps this the same installed app across deploys even if
    // start_url ever changes; without it the browser derives the app identity
    // from start_url, and changing it would strand the existing install.
    id: "/",
    name: `${config.organization.name} — ${meta.titleSuffix}`,
    short_name: config.organization.name,
    description: meta.appDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    lang: "en",
    dir: "ltr",
    categories: ["education", "productivity"],
    // Appearance belongs to the configured theme, not to core.
    background_color: brand.background,
    theme_color: brand.theme,
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-maskable-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    // Chrome shows its richer install dialog only when both a wide and a
    // narrow screenshot are declared.
    screenshots: [
      {
        src: "/og.png",
        sizes: "1200x630",
        type: "image/png",
        form_factor: "wide",
        label: meta.manifest.wideScreenshotLabel,
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        form_factor: "narrow",
        label: meta.manifest.narrowScreenshotLabel,
      },
    ],
    shortcuts: [
      {
        name: "Learning paths",
        short_name: "Learn",
        url: "/learn",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Field guide",
        short_name: "Guide",
        url: "/guide",
        icons: [{ src: "/icon-192x192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
