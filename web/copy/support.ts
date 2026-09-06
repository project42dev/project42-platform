// Support and content-request page copy.
export const supportCopy = {
  metaTitle: "Support & Content Requests — {org}",
  metaDescription:
    "Get assistance with {org}, request curriculum, report issues, and explore community support resources.",
  hero: {
    eyebrow: "Help, community, and contributions",
    heading: "Support & content requests",
    lede:
      "{org} is a community-driven, open-source AI learning platform. Get technical help, propose curriculum, or report a defect through the route that reaches the right maintainers.",
  },
  options: [
    {
      index: "01",
      title: "Request new content",
      description:
        "Propose an AI topic, orchestration pattern, or interactive exercise for the learning paths and field guide.",
      // The curriculum lives in the content repository; the platform repo is
      // the product. A request filed on the platform repo reached nobody who
      // could act on it. The template is not decoration either: its field
      // labels are parsed straight into an authoring proposal, so a request
      // filed through the form needs no human to retype it.
      href: "https://github.com/project42dev/project42-content/issues/new?template=content-request.yml",
      label: "Submit content request",
      external: "true",
    },
    {
      index: "02",
      title: "Self-hosting and docs",
      description:
        "Review deployment, identity, learner-data, configuration, and theming guidance for the reusable platform.",
      href: "/platform",
      label: "View platform docs",
      external: "false",
    },
    {
      index: "03",
      title: "Report a defect",
      description:
        "Tell us about a broken link, visual flaw, accessibility problem, or runtime error with clear reproduction steps.",
      href: "{supportUrl}",
      label: "Open bug report",
      external: "true",
    },
  ],
  policy: {
    eyebrow: "Community support policy",
    heading: "Open source, without a commercial SLA.",
    bodyTemplate:
      "{org} is provided under {softwareLicense} and {curriculumLicense} licenses. Issues, enhancements, and roadmap priorities are tracked publicly; community support does not include guaranteed uptime or response times.",
    navLabel: "Support policies",
    legal: "Legal & transparency",
    roadmap: "Public roadmap",
    releases: "Release notes",
  },
};
