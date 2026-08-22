export interface PortalConfig {
  branding: {
    organizationName: string;
    portalTitle: string;
    portalTagline: string;
    logoUrl?: string;
    faviconUrl?: string;
    copyright?: string;
    supportUrl?: string;
    privacyPolicyUrl?: string;
    termsUrl?: string;
  };
  theme: {
    colorMode: 'system' | 'dark' | 'light';
    primaryColor: string;
    accentColor: string;
    headerBackground: string;
    fontFamily: string;
  };
  features: {
    enableFieldGuide: boolean;
    enableVisualGuides: boolean;
    enableKnowledgeChecks: boolean;
    enableBadges: boolean;
    enableTranscripts: boolean;
    enableFeedback: boolean;
  };
}

export const defaultPortalConfig: PortalConfig = {
  branding: {
    organizationName: "Project 42",
    portalTitle: "Project 42 — Open-Source AI Academy",
    portalTagline: "Self-Paced Curriculum, Hands-on Labs & Verified AI Engineering Guides",
    logoUrl: "/assets/logo.svg",
    copyright: "© 2026 Project 42 Open-Source Initiative. Apache-2.0 & CC BY 4.0 Licensed.",
    supportUrl: "https://github.com/project42dev/project42-platform/issues"
  },
  theme: {
    colorMode: "system",
    primaryColor: "#0F62FE",
    accentColor: "#0043CE",
    headerBackground: "#161616",
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
  },
  features: {
    enableFieldGuide: true,
    enableVisualGuides: true,
    enableKnowledgeChecks: true,
    enableBadges: true,
    enableTranscripts: true,
    enableFeedback: false
  }
};
