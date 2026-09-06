// Site-wide metadata copy: the browser title, the description search engines
// and social cards show, and the PWA install strings.
export const metaCopy = {
  /** Appended after the organization name in <title>. */
  titleSuffix: "Learn AI with confidence",
  /** Used for every route that does not set its own title. */
  titleTemplate: "%s · {org}",
  description:
    "Free, open, provider-neutral AI learning paths, knowledge checks, and practical activities.",
  /** Shorter description used by the installed app's manifest. */
  appDescription:
    "Free, open, provider-neutral AI learning paths and practical assessments.",
  keywords: [
    "AI learning",
    "agentic AI",
    "Anthropic",
    "OpenAI",
    "Claude",
    "ChatGPT",
    "free training",
  ],
  openGraph: {
    description: "Free learning paths from first principles to reliable agents.",
    imageAlt: "{org} — Start curious. Become capable.",
  },
  manifest: {
    wideScreenshotLabel: "{org} learning paths",
    narrowScreenshotLabel: "{org}",
  },
};
