// About-page copy.
export const aboutCopy = {
  metaTitle: "About",
  metaDescription:
    "Why {org} exists and how the open-source learning platform works.",
  hero: {
    eyebrow: "About {org}",
    heading: "A free place to become fluent in AI.",
    lede:
      "{org} is for the person asking their first AI question and the practitioner building their hundredth workflow. It pairs a practical field guide with learning paths that show what you understand—not just what you clicked.",
  },
  principles: [
    {
      number: "01",
      title: "Beginner first, no ceiling",
      body:
        "Every subject begins in plain language, then opens into practical and advanced material. Accessible does not mean shallow.",
    },
    {
      number: "02",
      title: "Concepts before vendors",
      body:
        "We teach ideas that transfer across commercial APIs, open-weight models, and local tools. Compare providers and deployment options against the task, evidence, privacy needs, and operating cost.",
    },
    {
      number: "03",
      title: "Evidence before freshness claims",
      body:
        "Volatile material carries sources and verification dates. Scheduled maintenance checks discover gaps and propose corrections. Human review and release checks govern publication; a proposal is not a published update.",
    },
    {
      number: "04",
      title: "Hosted now, portable by design",
      body:
        "Project42dev operates this instance. The open-source platform includes an adopter scaffold and reference deployment profiles so teams can run their own site, identity service, and learner-record store.",
    },
    {
      number: "05",
      title: "One course, two ways to take it",
      body:
        "Written modules are available throughout the curriculum. Instructor-led video is available where media has been produced; scripts and transcripts do not mean a video is published. Both delivery modes use the same module objectives, knowledge check, sources, and learning record.",
    },
  ],
  facts: {
    eyebrow: "Release facts",
    heading: "One source, no mystery numbers.",
    summary:
      "Versions, catalog totals, provider coverage, licenses, and project links come from the tagged software and curriculum packages—not hand-maintained marketing copy.",
    versionsLabel: "Current {org} versions",
    countsLabel: "Current curriculum totals",
    versions: {
      site: "Hosted site",
      platform: "Open-source platform",
      content: "Curriculum content",
      policy: "Learner-data policy",
    },
    counts: {
      paths: "Learning paths",
      modules: "Assessed modules",
      activities: "Evidence activities",
      questions: "Reviewed questions",
      providers: "Curriculum provider tags",
    },
    providerSection: {
      eyebrow: "Curriculum metadata",
      heading: "Provider tags in this release.",
      summarySuffix:
        "named provider tags sit beside the provider-neutral tag. These catalogue tags are not a complete inventory of the models and tools discussed in the material.",
      coverageLabel: "Current provider coverage",
    },
    links: {
      softwarePrefix: "Software:",
      curriculumPrefix: "Curriculum:",
      site: "Hosted site source",
      platform: "Reusable platform source",
      issues: "Report or follow an issue",
    },
  },
  openSource: {
    eyebrow: "Built in public",
    heading: "Use it. Improve it. Teach with it.",
    bodyTemplate:
      "Software uses {softwareLicense}. {org} curriculum uses {curriculumLicense}. Private learner data and internal operations are never part of the public repositories.",
    platformAction: "Platform source",
    learnAction: "Start learning",
  },
  future: {
    eyebrow: "Run your own deployment",
    heading: "Deploy {org} for your own people—and keep it current.",
    body:
      "Organizations can scaffold and operate their own {org} deployment using the documented reference profiles. Identity, site configuration, themes, private learner records, and custom content stay under the operator's control. Upstream software and curriculum updates are versioned and reviewed before adoption. Production operations and support remain the operator's responsibility.",
    asideLabel: "How {org} is made",
    asideHeading: "AI learning, created and maintained with AI.",
    asideBody:
      "The same class of technology taught here helps research, draft, test, fact-check, and refresh the platform and its lessons. Independent models, deterministic checks, and accountable human approval stand between an AI proposal and publication.",
  },
};
