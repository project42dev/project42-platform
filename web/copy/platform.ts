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
      title: "Reference Self-Hosting",
      description:
        "Scaffold your site and curriculum repository, then use the documented service profiles for the web application, account API, identity, and persistent records. The Docker Compose reference runs these as separate services.",
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
      "With Node.js 22.18 or later and Git installed, scaffold a site and build its content first. These commands build the public portal; configure identity and the account API using the deployment guide before enabling accounts.",
    commandsLabel: "Self-hosting quickstart commands",
    commands: `# 1. Clone the Open-Source Platform
git clone https://github.com/project42dev/project42-platform.git
cd project42-platform

# 2. Install dependencies & build
npm ci
npm run build

# 3. Create a site and its content repository
node bin/project42-portal.mjs create "Your Academy" --dir ..
cd ../your-academy-content
npm install
npm run content:sync
npm run content:build

# 4. Install and preview the site with its default theme
cd ../your-academy
npm install
npm run bootstrap
npm run pages:build
npm run pages:serve`,
  },
  documentation: {
    heading: "Public Documentation & Specifications",
    links: [
      {
        href: "https://github.com/project42dev/project42-platform/blob/main/docs/README.md",
        title: "Documentation Index ↗",
        description: "Installation, architecture, accounts, content synchronization, operations, and reference contracts.",
        external: "true",
      },
      {
        href: "https://github.com/project42dev/project42-platform/blob/main/docs/getting-started.md",
        title: "Getting Started ↗",
        description: "Build a site and its content repository in the correct order, then choose a deployment profile.",
        external: "true",
      },
      {
        href: "https://github.com/project42dev/project42-platform/blob/main/docs/self-hosting/portal-and-theming.md",
        title: "Installing Themes & Choosing Layouts ↗",
        description: "Install customer themes in your site, switch appearance, and select Standard, Compact, Wide, or Enterprise independently.",
        external: "true",
      },
      {
        href: "https://github.com/project42dev/project42-platform/blob/main/docs/self-hosting/docker-compose.md",
        title: "Self-Hosting & Identity ↗",
        description: "Separate evaluation and HTTPS browser-session profiles, service configuration, backups, and operational checks.",
        external: "true",
      },
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
