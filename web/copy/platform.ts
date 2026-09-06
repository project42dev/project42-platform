// Open-source platform page copy.
export const platformCopy = {
  hero: {
    kicker: "Open Source Platform · Apache-2.0 & CC-BY-4.0",
    heading: "The Open-Source Platform & Documentation",
    lede:
      "{org} is provider-neutral AI learning infrastructure designed for self-hosting, enterprise deployment, and verifiable learner credentials. Built with AI, for humans learning AI.",
    repoAction: "GitHub Repository ↗",
    galleryAction: "Theme Gallery & Studio ↗",
  },
  pillarsLabel: "Platform capabilities",
  pillars: [
    {
      index: "01",
      title: "Turnkey Self-Hosting",
      description:
        "Run the entire Project 42 stack in a single container or Kubernetes cluster with Keycloak OIDC, Postgres/D1 persistence, and rate-limiting.",
    },
    {
      index: "02",
      title: "Theme & Layout Engine",
      description:
        "Use declarative organization branding and layout configuration with automated JSON validation.",
    },
    {
      index: "03",
      title: "Cryptographic Transcripts",
      description:
        "Keep learner progress, assessment evidence, and milestone badges in durable, tamper-evident records.",
    },
  ],
  quickstart: {
    heading: "Quickstart Guide",
    lede:
      "Run {org} locally or deploy it to private infrastructure using the official platform package @project42/platform:",
    commandsLabel: "Self-hosting quickstart commands",
    commands: `# 1. Clone the Open-Source Platform
git clone https://github.com/project42dev/project42-platform.git
cd project42-platform

# 2. Install dependencies & build
npm install
npm run build

# 3. Launch Self-Host Server
npm run self-host`,
  },
  documentation: {
    heading: "Public Documentation & Specifications",
    links: [
      {
        href: "https://github.com/project42dev/project42-gallery/blob/main/docs/THEME_AUTHORING_GUIDE.md",
        title: "Theme Authoring Guide ↗",
        description:
          "Rules, guidelines, and token definitions for creating custom organization themes.",
        external: "true",
      },
      {
        href: "https://github.com/project42dev/project42-gallery/blob/main/docs/THEME_SCHEMA.md",
        title: "Theme JSON Schema ↗",
        description:
          "Strict schema specification for validating theme manifest files.",
        external: "true",
      },
      {
        href: "/legal-transparency",
        title: "Legal & Transparency",
        description:
          "Open licenses, data privacy commitments, and provider-neutral governance policies.",
        external: "false",
      },
      {
        href: "/roadmap",
        title: "Public Roadmap",
        description:
          "Now, Next, and Later milestones across the platform and curriculum.",
        external: "false",
      },
    ],
  },
};
