// Legal & Transparency page copy.
//
// This page is almost entirely operator-specific: it names the responsible
// people, the operating company, the licences the operator grants, the review
// status of the wording, and the limits the operator accepts. An adopter must
// replace nearly all of it, so every sentence is a leaf here.
export const legalCopy = {
  metaTitle: "Legal & Transparency",
  metaDescription:
    "How {org} is operated, licensed, built with AI assistance, governed by people, and limited as a free educational service.",
  version: "0.1-review-draft",
  hero: {
    eyebrow: "Legal & Transparency",
    heading: "Open on purpose. Honest about the limits.",
    lede:
      "{org} is a free, open-source learning project about AI. This page explains who is responsible for the hosted service, how AI contributes, what you may reuse, what can go wrong, and where to exercise your choices.",
  },
  toc: {
    eyebrow: "Page guide",
    heading: "On this page",
    items: [
      "Review status",
      "People and responsibility",
      "Open-source and reuse",
      "Service expectations",
      "External services",
      "Accounts, privacy, and choice",
      "Acceptable use",
      "Warranty and liability",
      "Version and sources",
    ],
  },
  review: {
    eyebrow: "Review status",
    heading: "Owner-accepted review draft",
    body:
      "This wording is not yet effective legal terms. The {org} owner accepted this review draft on July 28, 2026. Qualified legal review, the final effective version and date, and the recurring review date remain pending.",
    versionLabel: "Draft version",
    versionNote: "Owner accepted July 28, 2026",
    effectiveLabel: "Effective date",
    effectiveValue: "Pending qualified legal review",
    authorityLabel: "Publication authority",
    authorityValue: "Human approval only",
  },
  people: {
    eyebrow: "People and responsibility",
    heading: "AI helps make {org}. People govern it.",
    intro:
      "{org} was created by Kristopher Turner. The hosted {org} service is operated by Hybrid Cloud Solutions LLC. These statements remain subject to the owner and counsel verification gate identified above.",
    facts: [
      {
        number: "01",
        title: "AI-assisted production",
        body:
          "AI systems substantially assist research, drafting, editing, coding, test creation, accessibility review, and factual review.",
      },
      {
        number: "02",
        title: "Independent checks",
        body:
          "Different model families may serve research, writing, verification, and adversarial-review roles. Automated checks reject unsupported, stale, inaccessible, or internally inconsistent candidates.",
      },
      {
        number: "03",
        title: "Human publication authority",
        body:
          "AI cannot approve or publish {org} content by itself. People set policy, review evidence, resolve disagreements, approve releases, and remain accountable for the hosted service.",
      },
    ],
    caution:
      "Multi-model and human review reduce risk; they do not guarantee that every statement is accurate, complete, current, or appropriate for your situation. See [AI content practices](https://github.com/project42dev/project-42.dev/blob/main/docs/ai-content-practices.md) for the human-gate, review, publish-time, and source-tracking detail behind these claims, including what is not yet automated.",
  },
  licenses: {
    eyebrow: "Open-source and reuse",
    heading: "Free to use does not mean ownerless.",
    intro:
      "Each kind of material keeps its own license and ownership boundary. A repository license controls the files it covers; it does not relicense third-party services, source material, trademarks, or learner records.",
    cards: [
      {
        title: "Software",
        body:
          "{org} application code is offered under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). Reuse must follow that license, including applicable notice and attribution requirements.",
      },
      {
        title: "Curriculum and guides",
        body:
          "{org} curriculum and original learning material are offered under [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/). Give appropriate credit, link the license, and indicate changes.",
      },
      {
        title: "Third-party material",
        body:
          "Provider names, product names, quotations, linked documentation, screenshots, and other third-party material remain subject to their owners' rights and terms. Citation or linking does not transfer ownership or imply endorsement.",
      },
      {
        title: "Marks and private records",
        body:
          "Open-source licenses do not grant trademark rights. Accounts, learner records, private operations, credentials, and personal data are not open-licensed content.",
      },
    ],
    caution:
      "Draft copyright notice for review: © 2026 Hybrid Cloud Solutions LLC; {org} created by Kristopher Turner. The final claimant and wording require owner and qualified legal verification. Any copyright notice applies only to protectable human-authored expression and creative human selection, coordination, arrangement, or modification. {org} does not claim copyright in material that is purely AI-generated and not protectable under applicable law.",
  },
  service: {
    eyebrow: "Service expectations",
    heading: "Useful, not infallible or uninterrupted.",
    intro:
      "{org} is an educational resource and experimental open-source service. Use it as a starting point, verify important decisions against authoritative sources, and obtain qualified advice when the stakes require it.",
    columns: [
      {
        title: "Content and professional decisions",
        items: [
          "Content may contain errors, omissions, outdated claims, or broken links.",
          "Examples and assessments are educational, not legal, medical, financial, security, employment, or other professional advice.",
          "A score, badge, transcript, or mastery record is {org} evidence, not professional certification or a guarantee of performance.",
          "You remain responsible for how you use commands, code, models, and tools.",
        ],
      },
      {
        title: "Availability and recovery",
        items: [
          "The sites, identity service, APIs, and records may be unavailable.",
          "Sign-in providers may change, suspend, or lose access to an identity.",
          "Accounts and progress can be delayed, corrupted, or lost despite backups.",
          "Recovery objectives are targets, not promises of perfect restoration.",
          "Export important learner evidence and retain your own copy.",
        ],
      },
    ],
  },
  thirdParty: {
    eyebrow: "External services",
    heading: "Their services, their terms.",
    intro:
      "{org} relies on and links to services outside its control, including identity, hosting, infrastructure, model, documentation, source-control, and content providers.",
    cards: [
      {
        title: "Identity and hosting",
        body:
          "The hosted service uses Microsoft Entra External ID, GitHub Pages, and Cloudflare services. Their availability and processing are governed by their respective terms and notices.",
      },
      {
        title: "Models and providers",
        body:
          "{org} is provider-neutral. References to Anthropic, OpenAI, Google, Microsoft, xAI, DeepSeek, open-weight projects, or others do not imply sponsorship, endorsement, or a service guarantee.",
      },
      {
        title: "External links",
        body:
          "A link records provenance or helps a learner continue research. {org} does not control the destination, its security, its accuracy, or later changes.",
      },
    ],
  },
  account: {
    eyebrow: "Accounts, privacy, and choice",
    heading: "Consent is a control, not a buried checkbox.",
    intro:
      "Acceptance of legal information does not replace a separate consent decision where consent is required. Optional consent is not preselected or bundled with access to public learning material.",
    learnerData: {
      title: "Learner data",
      description: "Storage, retention, consent, export, deletion, and recovery",
    },
    accountControls: {
      title: "Account controls",
      description: "Sign-in status, consent history, export, and deletion requests",
    },
    security: {
      title: "Security reporting",
      description: "Report a vulnerability through the private security process",
    },
    roadmap: {
      title: "Roadmap and support",
      description: "Follow delivery or report a non-sensitive product issue",
    },
  },
  acceptableUse: {
    eyebrow: "Acceptable use",
    heading: "Learn and build without harming others.",
    body:
      "Do not use {org} to violate law, invade privacy, bypass access controls, distribute malware, harass people, misrepresent identity or credentials, disrupt the service, or infringe another person's rights. Repository contribution rules and third-party provider terms continue to apply.",
  },
  warranty: {
    eyebrow: "Warranty and liability",
    heading: "The legal limit still has limits.",
    intro:
      "To the maximum extent permitted by applicable law, {org} software, curriculum, hosted features, and related materials are provided \"as is\" and \"as available,\" without warranties of accuracy, availability, fitness for a particular purpose, non-infringement, or uninterrupted or error-free operation.",
    caution:
      "To the maximum extent permitted by applicable law, Kristopher Turner, Hybrid Cloud Solutions LLC, {org} contributors, and licensors are not liable for indirect, incidental, special, consequential, exemplary, or similar losses arising from use of or inability to use the service or materials. Nothing on this page excludes rights or liability that cannot lawfully be excluded. This paragraph requires qualified legal approval before it becomes effective.",
  },
  history: {
    eyebrow: "Version and sources",
    heading: "Reviewable words, not invisible fine print.",
    changesTitle: "Change history",
    changes: [
      {
        version: "0.1-review-draft",
        detail:
          "· 2026-07-28 · Owner accepted this review draft; qualified legal review and an effective version and date remain pending.",
      },
    ],
    referencesTitle: "Reference texts",
    references: [
      "Apache License 2.0",
      "Creative Commons Attribution 4.0 legal code",
      "U.S. Copyright Office AI initiative and reports",
      "FTC guidance on AI privacy and transparency commitments",
    ],
  },
};
