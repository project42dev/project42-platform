import type { Metadata, Viewport } from "next";
import config from "../project42.config.json";
import "./globals.css";
import { SiteFooter } from "./components/SiteFooter";
import { SiteHeader } from "./components/SiteHeader";
import { ProgressProvider } from "./components/ProgressProvider";
import { AuthProvider } from "./components/AuthProvider";
import { ProfilePreferencesProvider } from "./components/ProfilePreferencesProvider";
import { CanonicalOriginEnforcer } from "./components/CanonicalOriginEnforcer";
import { ServiceWorkerRegistration } from "./components/ServiceWorkerRegistration";
import { getThemeAssets } from "../lib/theme";
import { getLayoutAssets } from "../lib/layout";
import { getThemeBrandColors } from "../lib/themeBrand";
import { copy, orgName, canonicalOrigin } from "../lib/copy";
import { getBrandAssets } from "../lib/branding";

const configuredTheme = config.theme;
const configuredLayout = config.layout.defaultPreset;
const themeAssets = getThemeAssets(configuredTheme);
const layoutAssets = getLayoutAssets(configuredLayout);
const brand = getThemeBrandColors(configuredTheme);
const meta = copy.meta;
const siteTitle = `${orgName} — ${meta.titleSuffix}`;
const maskIconHref = getBrandAssets().maskIcon;

export const metadata: Metadata = {
  metadataBase: new URL(canonicalOrigin),
  title: {
    default: siteTitle,
    template: meta.titleTemplate,
  },
  description: meta.description,
  applicationName: orgName,
  manifest: "/manifest.webmanifest",
  // iOS has no install prompt and ignores the manifest when deciding how an
  // added-to-home-screen page behaves. These meta tags are the only thing that
  // makes the installed result a standalone app there rather than a bookmark.
  appleWebApp: {
    capable: true,
    title: orgName,
    // "black-translucent" paints the page behind the status bar AND forces the
    // clock, signal and battery glyphs to white. The shipped default theme is
    // a white ground with a light header, so on an installed home-screen app
    // that put white glyphs on white -- an invisible status bar. "default"
    // follows the system appearance instead, so it stays legible on a light
    // bundle and on a dark one. viewport-fit=cover still lets the page fill
    // the cutout and home-indicator areas; the env() padding in globals.css
    // still does the work.
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      {
        url: themeAssets.mark,
        type: "image/svg+xml",
      },
    ],
    shortcut: themeAssets.mark,
    apple: [
      {
        url: "/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    other: [
      {
        rel: "mask-icon",
        url: maskIconHref,
        color: brand.mask,
      },
    ],
  },
  keywords: meta.keywords,
  openGraph: {
    type: "website",
    siteName: orgName,
    title: siteTitle,
    description: meta.openGraph.description,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: meta.openGraph.imageAlt,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteTitle,
    description: meta.openGraph.description,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  // Browser and OS chrome tint comes from the configured theme bundle, so an
  // installed app never keeps the previous theme's splash screen and status
  // bar after the config field changes.
  themeColor: brand.theme,
  // Paint into the display cutout and home-indicator areas instead of sitting
  // inside letterboxes. Only safe with the safe-area padding in globals.css.
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme={configuredTheme} data-layout={configuredLayout} suppressHydrationWarning>
      <head>
        <link data-project42-theme-tokens rel="stylesheet" href={themeAssets.tokensCss} />
        <link data-project42-theme-components rel="stylesheet" href={themeAssets.componentsCss} />
        <link data-project42-layout rel="stylesheet" href={layoutAssets.stylesheet} />
        <script
          dangerouslySetInnerHTML={{
            // Theme is DEPLOYMENT-owned: it comes from project42.config.json
            // and nothing else, which is what makes "change one config field"
            // the whole interface for changing the site's identity. A stale
            // browser value must never override the configured presentation,
            // so any leftover key is cleared rather than read.
            //
            // Layout density IS a per-visitor preference and is read from
            // storage with the configured preset as the fallback. The two
            // axes are independent, and they are deliberately NOT symmetric.
            __html: `(function(){try{var defaultTheme="${configuredTheme}";var defaultLayout="${configuredLayout}";var l=localStorage.getItem("project42.layout.v1")||defaultLayout;localStorage.removeItem("project42.theme.v1");document.documentElement.setAttribute("data-theme",defaultTheme);document.documentElement.setAttribute("data-layout",l);}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <CanonicalOriginEnforcer
          canonicalOrigin={config.portal.canonicalOrigin}
          legacyOrigins={config.portal.legacyOrigins}
        />
        <ServiceWorkerRegistration canonicalOrigin={config.portal.canonicalOrigin} />
        <a className="skip-link" href="#main-content">
          {copy.chrome.skipToContent}
        </a>
        <AuthProvider>
          <ProfilePreferencesProvider>
            <ProgressProvider>
              <SiteHeader />
              <div id="main-content" tabIndex={-1}>
                {children}
              </div>
              <SiteFooter />
            </ProgressProvider>
          </ProfilePreferencesProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
