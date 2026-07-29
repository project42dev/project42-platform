# Authoritative learner transcripts

Project 42 exposes two intentionally different transcript boundaries:

- browser-local portable records describe progress held by the current browser;
- authoritative account transcripts describe the durable records held by an
  approved learner account.

Neither boundary turns a learning achievement into an issued credential.
Durable badge credentials require the separate versioned definition, evidence,
issuer, and append-only lifecycle contract documented in
[`badge-credentials.md`](badge-credentials.md).

## Hosted API

`GET /v1/me/transcript.csv` returns the authenticated learner's authoritative
account transcript. The endpoint:

- is self-scoped and rejects account selectors;
- requires an approved account and authentication no older than 15 minutes;
- uses the existing secure browser-session cookie or an authorized non-browser
  identity boundary;
- emits a `data.transcript.export` audit event without retaining the export;
- returns `Cache-Control: private, no-store` and
  `X-Content-Type-Options: nosniff`; and
- never creates a public object URL.

The CSV schema version is `1.0`. Every row carries
`record_authority=durable-account-record` and one of these record types:

| Record type | Meaning |
|---|---|
| `path_progress` | Current durable path projection |
| `module_progress` | Durable visited or completed module record |
| `assessment_attempt` | Immutable assessment attempt and result |
| `learning_achievement` | Learning-progress achievement, not an issued credential |

Achievement rows carry
`credential_status=not_issued_credential`. This remains true even when the
achievement is synchronized across devices.

## Spreadsheet safety

Every field is quoted using RFC 4180-style escaping. Values whose first
meaningful character is `=`, `+`, `-`, or `@` are prefixed with an apostrophe
before CSV quoting. This neutralizes spreadsheet formulas while preserving the
original text for a human reader.

Consumers should still treat all transcript values as untrusted learner or
content data. Importers must not execute formulas, macros, URLs, or external
data connections from a transcript.

## JSON export types

The hosted JSON export retains schema version `1` and now publishes explicit,
provider-neutral contracts for:

- module progress;
- assessment attempts;
- transcript entries;
- learning achievements; and
- account approval decisions.

The JSON export, account deletion, and authorization semantics are unchanged.
Both JSON and CSV exports require recent authentication, and only the CSV
transcript requires the account to be approved.
