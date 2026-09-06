// Learner-data page copy.
//
// Only authored prose lives here. Everything the page states as fact -- policy
// version, lifecycle states, consent purposes, retention windows, recovery
// objectives, authorization grants -- comes from the validated platform
// contract at runtime and must never be transcribed into copy.
//
// A few strings carry {minutes}, {days}, {states} or {count} placeholders that
// the page fills from that contract. They are not copy tokens: lib/copy.ts
// leaves unknown placeholders alone, so an adopter can move the number inside
// the sentence without touching the component.
export const learnerDataCopy = {
  metaTitle: "Learner data and account controls",
  metaDescription:
    "What {org} stores and the consent, retention, export, deletion, and recovery rules for learner accounts.",
  hero: {
    eyebrow: "Learner data",
    heading: "Your learning data, without fine print.",
    lede:
      "{org} uses account-backed learning records so approved learners can continue across browsers and devices. This page explains the controls and protections around those records.",
    legalLink: "Service, licensing, and AI transparency →",
  },
  status: {
    eyebrow: "Available today",
    heading: "Account-backed learning records",
    configured:
      "Approved accounts save progress, scores, badges, and transcripts through the account service.",
    notConfigured:
      "This deployment has not configured its account service, so course participation and durable progress are unavailable.",
    exportNote:
      "Approved learners can download a portable JSON backup or authoritative CSV transcript and manage the account record from [My progress](/profile).",
    recordsTerm: "Account-backed records",
    recordsAvailable: "Available",
    recordsNotEnabled: "Not enabled",
    policyVersionTerm: "Policy version",
    hostedCollectionTerm: "Hosted collection",
    hostedCollectionValue:
      "Account and learning data required to provide the service",
    hostedCollectionNotEnabled: "Not enabled",
  },
  identity: {
    eyebrow: "Identity",
    heading: "An email address is never your account key.",
    body:
      "Accounts use OpenID Connect Authorization Code with PKCE through the account API. Learn receives only an opaque HttpOnly session cookie and never stores provider tokens. {org} binds the provider's stable issuer and subject to an internal learner ID. Changing an email cannot create or merge accounts.",
    facts: [
      {
        number: "01",
        title: "Minimal profile",
        body:
          "Required records are an internal learner ID, tenant or installation, lifecycle state, and timestamps. Display name and accessibility preferences are optional.",
      },
      {
        number: "02",
        title: "Tenant boundaries",
        body:
          "Every command and query must name its tenant or installation and is denied by default outside that boundary.",
      },
      {
        number: "03",
        title: "Portable storage",
        body:
          "The hosted profile uses Sites-managed D1. The supported self-host reference uses PostgreSQL under the same contract tests.",
      },
    ],
  },
  lifecycle: {
    eyebrow: "Account lifecycle",
    heading: "Only explicit transitions are allowed.",
    body:
      "Deleted is terminal. Recovery cannot use an email address to replace, merge, or guess an identity.",
    mayMoveTo: "May move to {states}",
    terminalState: "Terminal state",
  },
  consent: {
    eyebrow: "Consent and choice",
    heading: "One purpose, one visible decision.",
    body:
      "Every decision records its purpose, policy version, choice, and time. Optional uses cannot be bundled into the learning service.",
    tableLabel: "Consent purposes",
    columnPurpose: "Purpose",
    columnRequired: "Required",
    columnEffect: "What it does",
    columnWithdrawn: "If withdrawn",
    requiredYes: "Yes",
    requiredNo: "No",
  },
  retention: {
    eyebrow: "Retention and recovery",
    heading: "Records have an end date.",
    body:
      "Active learning records remain while the account is active. Inactive account records expire after two years; diagnostics after 30 days; audit detail after one year; and deletion receipts after 90 days.",
    daysUnit: "days",
    cancellation: {
      title: "Deletion cancellation",
      body: "A confirmed request can be cancelled inside this window.",
    },
    activeStore: {
      title: "Active-store deletion",
      body:
        "Adapters must return verified receipts before the account is deleted.",
    },
    backupExpiry: {
      title: "Backup expiry",
      body: "Every restore replays the deletion ledger before serving records.",
    },
    recovery: {
      objective: "{rpo}h / {rto}h",
      title: "Recovery objective",
      body:
        "Initial recovery point and recovery time targets, tested every {days} days.",
    },
  },
  export: {
    eyebrow: "Export and deletion",
    heading: "Your record must remain movable and erasable.",
    exportTitle: "Export",
    exportItems: [
      "Portable {org} JSON and transcript CSV",
      "Authentication within the previous {minutes} minutes",
      "A single authenticated download, never a public object URL",
      "An audit event without retaining the exported payload",
    ],
    deletionTitle: "Deletion",
    deletionSteps: [
      "Explain scope and offer export.",
      "Require recent authentication and explicit confirmation.",
      "Issue a receipt and allow cancellation.",
      "Verify active-store deletion.",
      "Expire backups and replay deletion after every restore.",
    ],
  },
  roles: {
    eyebrow: "Authorization",
    heading: "Visibility is not permission.",
    body:
      "Hiding a button is never enough. Every server operation checks the actor, tenant, role, and requested record.",
    permissionCount: "{count} explicit permissions",
  },
  machineReadable: {
    eyebrow: "Open contract",
    heading: "Inspect the exact policy applications must follow.",
    body:
      "The machine-readable endpoint is generated from the same validated platform contract as this page.",
    action: "View policy JSON",
  },
};
