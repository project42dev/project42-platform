# Handoff

## Active branch

`feat/foundations-class-scripts-wave2-ab6244`

## In progress

- Added the first two complete AI Foundations class-script waves for
  `ai-systems-and-use-cases`, `language-models-and-generation`, and
  `context-tokens-and-modalities`, plus `prompt-anatomy-and-success-criteria`,
  `examples-and-output-contracts`, and `context-and-evidence-construction`.
- Added deterministic class-package discovery, coverage reporting, transcript,
  WebVTT, text-only, reduced-motion, and integrity generation.
- Added exact activity/question handoff validation, honest planned/completed
  model-role provenance, and fail-closed human publication gates.
- Prepared package `0.50.0` and content `0.37.0`.
- Kept all three packages `draft`; Foundry role execution and accountable human
  approvals are still required before publication.

## Verification

- `npm run check` — passed: 88 tests, 1 optional PostgreSQL integration test
  skipped, 11 resource packs / 86 resources, and 464 current source references.
- `npm run api:check` — passed, including Worker dry-run.
- `npm audit --audit-level=high` — passed with zero vulnerabilities.
- `npm pack --dry-run --json` — confirmed class scripts and generated accessible
  artifacts are included in the reusable package.
- `git diff --check` — passed.

## Next steps

1. Review draft PR #53 and the dependent wave-2 pull request and CI evidence.
2. Run the declared independent Foundry research, writing, factual-verification,
   learning-design, and accessibility roles.
3. Record real contribution evidence and complete human editorial,
   subject-matter, and accessibility approvals.
4. Continue the coverage migration for the 43 modules currently classified
   `outline-only`.
5. Reconcile package `0.50.0` with any earlier self-host release branch before
   merge.

No secrets, deployment identifiers, learner data, or private PMO material belong
in this repository.
