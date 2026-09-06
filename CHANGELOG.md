# Changelog

All notable reusable platform changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and released versions use
semantic versioning.

## [0.103.2] - 2026-09-06

### Fixed

Five more gates that could only ever pass for one deployment. Every one was
found by running a generated front end's own `npm run verify`, which is the
first time these files had been executed anywhere but `project-42.dev`.

- The route inventory disagreed with the application about instructor-led
  lessons. `link-integrity.mjs` built `/ondemand/<path>/<module>` from every
  rendering the curriculum declares, while `app/lib/instructorMedia.ts` (since
  v0.103.1) offers only the ones this deployment hosts. The static exporter
  then tried to export a route the app returns 404 for, and the build stopped.
  Both now read `content.instructorMedia`.
- `tests/workflow-governance.test.mjs` listed four workflow filenames, one of
  them `ado-sync.yml` -- one owner's private issue mirror. A repository without
  that file could not run the gate at all, and a repository that added a fifth
  workflow was never checked. It discovers every workflow instead, and decides
  which is a deployment workflow by whether it deploys rather than by its name.
- `tests/release-governance.test.mjs` asserted the version `0.19.0`, so the
  gate could pass only for one repository and only until its next release. It
  reads the version the repository declares.
- `tests/rendered-html.test.mjs` asserted `theme-color: #090d16` and a
  `short_name` of `Project 42` -- 06-galactic-guide's background and one
  operator's name. Both come from the selected bundle's tokens and
  `organization.name` now. It also required the retired-learning-path map to be
  non-empty, which failed a new deployment for having no history; that case is
  skipped rather than failed, and every ID the map does name is still checked.
- `tests/browser/account-progress.spec.ts` decided whether hosted identity was
  configured from the environment variable alone, so a deployment that declared
  `portal.apiOrigin` in configuration -- the supported way -- took the
  unconfigured branch and asserted a screen it does not render.

### Changed

- The scaffold template ships the release plumbing its own gates require: a
  `release.yml` whose tokens `release-governance.mjs` checks for, and a
  `RELEASE_NOTES.md` with the four sections it requires non-empty. Its CI and
  Pages workflows are rebuilt to the contract the workflow gate enforces --
  every action pinned to an immutable commit SHA, per-job permissions, and a
  separate validation job before anything is published.

## [0.103.1] - 2026-09-06

### Fixed

- A route was missing from the published package. `.gitignore` carried an
  unanchored `logs` pattern, which matched `web/app/admin/logs` -- a real
  route of the front-end application. `npm pack` here produced a complete
  tarball and the tarball npm builds when installing this package as a git
  dependency did not, so a consuming site 404ed a page its own link gate had
  inventoried, and nothing in either repository could see it. The pattern is
  anchored, and `tests/web-distribution.test.mjs` now asserts that no tracked
  file under `web/`, `bin/` or `schemas/` matches any ignore rule.
- Instructor-led lessons are offered only where the deployment hosts the media.
  The curriculum declares that a lesson was filmed; the media key is a bare
  filename, so an adopter inherits the manifest and no video, and the page
  published a player pointing at a 404. A deployment now lists the keys it
  serves under `content.instructorMedia` in `project42.config.json`, and the
  lookup fails closed: an absent or empty list means no instructor-led lessons.
- `generate-release-facts.mjs` can own the README fact block. The gate requires
  every generated fact to appear in the README, which a running deployment can
  satisfy and a freshly scaffolded one cannot -- the catalogue counts are not
  knowable until the platform is installed. A README may now delegate the block
  between two markers, which the generator rewrites. `--check` still only
  asserts, so CI still catches a README that drifted.

### Changed

- The scaffold template is complete enough to build unmodified: `package.json`
  carries the `repository` and `bugs` identity the release-facts gate
  cross-checks against `config/project-metadata.json`, that file gains
  `providerIds` and resolvable licence URLs, `CHANGELOG.md` uses the heading
  form the release-notes compiler parses, `config/link-check-exceptions.json`
  is seeded with the allowances a fresh scaffold needs, and `README.md` carries
  the release-facts markers.

## [0.103.0] - 2026-09-06

### Added

- The front end. `web/` now holds the entire rendering application - 149 files
  of routes, components, the design system, the Cloudflare Worker entry, the
  build toolchain and the twenty gates that police them. Until this release the
  platform had no front end at all: `web/` was two files, no React, no CSS and
  no route, while the whole application was vendored in one deployment's
  repository. The adopter path could not end in "a working front end" because
  the front end was not part of the product.
- `project42-portal`, the adopter CLI, shipped as this package's `bin`.
  `create` scaffolds a front-end repository and a content repository side by
  side with content inheritance wired between them; `materialise` installs the
  application into a front-end repository and is what that repository's
  `postinstall` runs; `doctor` reports what a repository is still missing.
  Materialise refuses to overwrite a git-tracked file, so a deliberate fork is
  an error rather than a silent clobber.
- A copy layer. Every user-visible sentence on the marketing and policy pages
  lives in `web/copy/`, one module per page, carrying the Project 42 wording
  verbatim as the default. An adopter overrides any leaf in
  `project42.copy.json` instead of forking the page that renders it.
  `{org}`, `{origin}`, `{adminOrigin}`, `{galleryUrl}`, `{tagline}` and
  `{supportUrl}` interpolate from configuration, and a bracketed label followed by a parenthesised URL inside a
  string renders as a link.
- `web/template/`, the seed `create` copies: a front-end repository holding
  only branding, configuration and release records, and a content repository
  that inherits `project42-content` into `upstream/` while keeping local
  material in `custom/`, merged by `mergeCatalogs`.
- `tests/web-distribution.test.mjs`, the gate for all of the above. It asserts
  the package ships the application, that materialise installs it and refuses to
  clobber a fork, that create produces two repositories with no unsubstituted
  tokens, and that no `project-42.dev` origin survives in product code.

### Changed

- `schemas/portal-config.schema.json` gains optional `portal.apiOrigin` and a
  `branding` block naming this deployment's own brand source filenames.
  Both were hard-coded in product code: the account API defaulted to one
  deployment's host, so an adopter who forgot an environment variable pointed
  their learners at somebody else's account service.
- `governance-docs-validation.mjs` derives the security-advisories URL from
  `config/project-metadata.json` and accepts any `# Contributing ...` heading,
  so a repository that is not `project-42.dev` can pass its own gate.

### Removed

- `scripts/build-portal.mjs`, a static portal generator that read a third copy
  of the theme bundles out of `docs/branding/concepts/` and modelled a theme as
  five colour strings. Principle 3 of the architecture makes a theme a
  version-locked Gallery bundle selected by ID; the generator contradicted it
  and would have become a rival to the front end this release ships. `npm run
  portal:build` is replaced by `project42-portal create`.
- `web/src/lib/config.ts` and `web/src/lib/storage.ts`, a rival `PortalConfig`
  and a second learner-progress store. Neither was imported anywhere.

## [0.102.0] - 2026-09-06

### Added

- Instructor renderings are part of the content contract. A filmed lesson is
  declared in `project42-content` at
  `training/<path>/<module>/instructor-rendering.json`, beside the class script
  it was rendered from. The platform validates each manifest against that
  script - same id, same version, no more segments than the script has - and
  exports `instructorRenderings` and `getInstructorRendering`. Consuming sites
  no longer keep their own list of which lessons exist.
- `InstructorRenderingManifest` and `validateInstructorRenderingManifest`. This
  is the preview tier, distinct from `VirtualInstructorMediaManifest`, which
  describes a released lesson and requires provenance a preview render does not
  have. A rendering must disclose that the instructor is synthetic, and its
  media key must be a bare filename so no deployment's directory layout reaches
  the shared contract.

### Changed

- `content/training/coverage.json` gains `renderedModuleCount` and marks the
  entry for any module that has been filmed.
- The curriculum is synced to `project42-content@bb00b9a`, which corrects five
  module citations that did not support their module and adds a content-side
  validator for instructor scripts.

## [0.101.0] - 2026-09-05

### Changed

- The curriculum is now installed from `project42-content`, the canonical
  content repository, rather than from a copy vendored in this repository.
  `config/content.lock.json` records the upstream commit and a hash of every
  installed file; `content:check` verifies the tree without network access, so
  an air-gapped build still works while editing curriculum here fails the build.
- `content-sync.yml` checks out the content repository and no longer swallows a
  failed sync.
- The catalogue this ships is now the six-domain structure: 14 learning paths
  where v0.100.0 had 13, and a catalogue roughly twice the size.

## [0.100.0] - 2026-08-23

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.99.0.

## [0.99.0] - 2026-08-23

### Added

- `content/modules/advanced-rag-engineering/advanced-rag-capstone.json`
- `content/modules/advanced-rag-engineering/chunking-strategies-in-practice.json`
- `content/modules/advanced-rag-engineering/graph-rag-and-knowledge-graphs.json`
- `content/modules/advanced-rag-engineering/hybrid-search-and-reranking.json`
- `content/modules/advanced-rag-engineering/rag-evaluation-and-triad.json`
- `content/modules/adversarial-ai-security-and-red-teaming/adversarial-security-capstone.json`
- `content/modules/adversarial-ai-security-and-red-teaming/jailbreaking-and-prompt-injection.json`
- `content/modules/adversarial-ai-security-and-red-teaming/llm-red-teaming-methodology.json`
- `content/modules/adversarial-ai-security-and-red-teaming/owasp-top-10-for-llms.json`
- `content/modules/deepseek-in-practice/deepseek-api-and-cost-optimization.json`
- `content/modules/deepseek-in-practice/deepseek-reasoning-and-moe-patterns.json`
- `content/modules/deepseek-in-practice/navigate-deepseek-ecosystem.json`
- `content/modules/mistral-in-practice/mistral-function-calling-and-codestral.json`
- `content/modules/mistral-in-practice/mistral-multimodal-and-embeddings.json`
- `content/modules/mistral-in-practice/navigate-mistral-ecosystem.json`
- `content/modules/model-customization-and-fine-tuning/customization-decision-matrix.json`
- `content/modules/model-customization-and-fine-tuning/dataset-curation-and-dpo.json`
- `content/modules/model-customization-and-fine-tuning/fine-tuning-eval-and-quantization.json`
- `content/modules/model-customization-and-fine-tuning/lora-and-qlora-tuning.json`
- `content/modules/model-customization-and-fine-tuning/model-customization-capstone.json`

### Changed

- `content/catalog.json`
- `content/source-registry.json`

## [0.98.0] - 2026-08-23

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.97.1.

## [0.97.0] - 2026-08-23

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.96.0.

## [0.96.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.95.0.

## [0.95.0] - 2026-08-22

### Changed

- `content/catalog.json`
- `content/modules/agentic-ai-literacy/agentic-ai-layers.json`
- `content/modules/agentic-ai-literacy/agentic-classification-capstone.json`
- `content/modules/agentic-ai-literacy/agentic-control-flow.json`
- `content/modules/agentic-ai-literacy/agentic-product-comparison.json`
- `content/modules/agentic-ai-literacy/agentic-tools-state-authority.json`
- `content/modules/ai-foundations/agents-and-guardrails.json`
- `content/modules/ai-foundations/ai-foundations-capstone.json`
- `content/modules/ai-foundations/ai-systems-and-use-cases.json`
- `content/modules/ai-foundations/coding-and-analysis-workflow.json`
- `content/modules/ai-foundations/context-and-evidence-construction.json`
- `content/modules/ai-foundations/context-tokens-and-modalities.json`
- `content/modules/ai-foundations/examples-and-output-contracts.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/ai-foundations/privacy-safety-and-responsibility.json`
- `content/modules/ai-foundations/prompt-anatomy-and-success-criteria.json`
- `content/modules/ai-foundations/prompt-with-purpose.json`
- `content/modules/ai-foundations/research-with-evidence.json`
- `content/modules/ai-foundations/safe-tool-use-workflow.json`
- `content/modules/ai-foundations/verification-and-iterative-improvement.json`
- `content/modules/ai-foundations/what-ai-does.json`
- `content/modules/ai-foundations/writing-and-transformation-workflow.json`
- `content/modules/anthropic-claude-practice/anthropic-ecosystem-and-interfaces.json`
- `content/modules/anthropic-claude-practice/claude-api-and-sdk-workflows.json`
- `content/modules/anthropic-claude-practice/claude-evaluation-and-observability.json`
- `content/modules/anthropic-claude-practice/claude-prompting-in-practice.json`
- `content/modules/anthropic-claude-practice/claude-safety-and-trust-boundaries.json`
- `content/modules/anthropic-claude-practice/claude-tools-and-agent-loops.json`
- `content/modules/anthropic-claude-practice/migrating-to-and-from-claude.json`
- `content/modules/google-gemini-practice/gemini-api-and-sdk-workflows.json`
- `content/modules/google-gemini-practice/gemini-ecosystem-and-interfaces.json`
- `content/modules/google-gemini-practice/gemini-evaluation-and-observability.json`
- `content/modules/google-gemini-practice/gemini-prompting-in-practice.json`
- `content/modules/google-gemini-practice/gemini-safety-and-trust-boundaries.json`
- `content/modules/google-gemini-practice/gemini-tools-and-agent-loops.json`
- `content/modules/google-gemini-practice/migrating-to-and-from-gemini.json`
- `content/modules/openai-practice/migrating-to-and-from-openai.json`
- `content/modules/openai-practice/openai-ecosystem-and-interfaces.json`
- `content/modules/openai-practice/openai-evaluation-and-observability.json`
- `content/modules/openai-practice/openai-prompting-in-practice.json`
- `content/modules/openai-practice/openai-responses-api-and-sdk-workflows.json`
- `content/modules/openai-practice/openai-safety-and-trust-boundaries.json`
- `content/modules/openai-practice/openai-tools-and-codex-agent-loops.json`
- `content/modules/provider-comparison/compare-provider-capabilities.json`
- `content/modules/provider-comparison/execute-cross-provider-cutover.json`
- `content/modules/provider-comparison/plan-cross-provider-migration.json`
- `content/modules/reliable-agent-workflows/agent-evaluation.json`
- `content/modules/reliable-agent-workflows/agent-observability.json`
- `content/modules/reliable-agent-workflows/context-engineering.json`
- `content/modules/reliable-agent-workflows/mcp-architecture.json`
- `content/modules/reliable-agent-workflows/mcp-trust-and-security.json`
- `content/modules/reliable-agent-workflows/memory-boundaries.json`
- `content/modules/reliable-agent-workflows/multi-agent-handoffs.json`
- `content/modules/reliable-agent-workflows/orchestration-patterns.json`
- `content/modules/reliable-agent-workflows/reliable-agent-capstone.json`
- `content/modules/self-hosted-model-operations/deployment-shape-and-operating-model.json`
- `content/modules/self-hosted-model-operations/endpoint-identity-network-and-secrets.json`
- `content/modules/self-hosted-model-operations/evaluate-the-exact-serving-build.json`
- `content/modules/self-hosted-model-operations/hardware-runtime-and-capacity-planning.json`
- `content/modules/self-hosted-model-operations/model-artifact-integrity.json`
- `content/modules/self-hosted-model-operations/model-identity-license-and-provenance.json`
- `content/modules/self-hosted-model-operations/model-incident-response-and-recovery.json`
- `content/modules/self-hosted-model-operations/model-update-and-rollback-lifecycle.json`
- `content/modules/self-hosted-model-operations/observability-cost-and-performance.json`
- `content/modules/self-hosted-model-operations/scaling-failure-and-capacity-controls.json`
- `content/modules/self-hosted-model-operations/self-hosted-model-operations-capstone.json`
- `content/modules/self-hosted-model-operations/serving-api-and-compatibility-contracts.json`

## [0.94.0] - 2026-08-22

### Changed

- `content/catalog.json`
- `content/modules/agentic-ai-literacy/agentic-ai-layers.json`
- `content/modules/agentic-ai-literacy/agentic-classification-capstone.json`
- `content/modules/agentic-ai-literacy/agentic-control-flow.json`
- `content/modules/agentic-ai-literacy/agentic-product-comparison.json`
- `content/modules/agentic-ai-literacy/agentic-tools-state-authority.json`
- `content/modules/agentic-systems-and-mcp/agent-architecture-spectrum.json`
- `content/modules/agentic-systems-and-mcp/agent-safety-and-spend-brakes.json`
- `content/modules/agentic-systems-and-mcp/model-context-protocol-mcp.json`
- `content/modules/agentic-systems-and-mcp/multi-agent-orchestration.json`
- `content/modules/ai-foundations/agents-and-guardrails.json`
- `content/modules/ai-foundations/ai-foundations-capstone.json`
- `content/modules/ai-foundations/ai-systems-and-use-cases.json`
- `content/modules/ai-foundations/coding-and-analysis-workflow.json`
- `content/modules/ai-foundations/context-and-evidence-construction.json`
- `content/modules/ai-foundations/context-tokens-and-modalities.json`
- `content/modules/ai-foundations/examples-and-output-contracts.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/ai-foundations/privacy-safety-and-responsibility.json`
- `content/modules/ai-foundations/prompt-anatomy-and-success-criteria.json`
- `content/modules/ai-foundations/prompt-with-purpose.json`
- `content/modules/ai-foundations/research-with-evidence.json`
- `content/modules/ai-foundations/safe-tool-use-workflow.json`
- `content/modules/ai-foundations/verification-and-iterative-improvement.json`
- `content/modules/ai-foundations/what-ai-does.json`
- `content/modules/ai-foundations/writing-and-transformation-workflow.json`
- `content/modules/ai-literacy-and-mental-models/ai-mental-models.json`
- `content/modules/ai-literacy-and-mental-models/prompt-architecture.json`
- `content/modules/ai-literacy-and-mental-models/token-economics-and-limits.json`
- `content/modules/ai-security-and-governance/ai-compliance-and-crypto-receipts.json`
- `content/modules/ai-security-and-governance/guardrails-and-sandboxing.json`
- `content/modules/ai-security-and-governance/owasp-top-10-llm-attacks.json`
- `content/modules/anthropic-claude-practice/anthropic-ecosystem-and-interfaces.json`
- `content/modules/anthropic-claude-practice/claude-api-and-sdk-workflows.json`
- `content/modules/anthropic-claude-practice/claude-evaluation-and-observability.json`
- `content/modules/anthropic-claude-practice/claude-prompting-in-practice.json`
- `content/modules/anthropic-claude-practice/claude-safety-and-trust-boundaries.json`
- `content/modules/anthropic-claude-practice/claude-tools-and-agent-loops.json`
- `content/modules/anthropic-claude-practice/migrating-to-and-from-claude.json`
- `content/modules/developer-and-practitioner-ai/function-calling-and-tools.json`
- `content/modules/developer-and-practitioner-ai/provider-sdk-patterns.json`
- `content/modules/developer-and-practitioner-ai/structured-outputs-mastery.json`
- `content/modules/developer-and-practitioner-ai/vector-embeddings-and-pgvector.json`
- `content/modules/google-gemini-practice/gemini-api-and-sdk-workflows.json`
- `content/modules/google-gemini-practice/gemini-ecosystem-and-interfaces.json`
- `content/modules/google-gemini-practice/gemini-evaluation-and-observability.json`
- `content/modules/google-gemini-practice/gemini-prompting-in-practice.json`
- `content/modules/google-gemini-practice/gemini-safety-and-trust-boundaries.json`
- `content/modules/google-gemini-practice/gemini-tools-and-agent-loops.json`
- `content/modules/google-gemini-practice/migrating-to-and-from-gemini.json`
- `content/modules/openai-practice/migrating-to-and-from-openai.json`
- `content/modules/openai-practice/openai-ecosystem-and-interfaces.json`
- `content/modules/openai-practice/openai-evaluation-and-observability.json`
- `content/modules/openai-practice/openai-prompting-in-practice.json`
- `content/modules/openai-practice/openai-responses-api-and-sdk-workflows.json`
- `content/modules/openai-practice/openai-safety-and-trust-boundaries.json`
- `content/modules/openai-practice/openai-tools-and-codex-agent-loops.json`
- `content/modules/provider-comparison/compare-provider-capabilities.json`
- `content/modules/provider-comparison/execute-cross-provider-cutover.json`
- `content/modules/provider-comparison/plan-cross-provider-migration.json`
- `content/modules/rag-and-fine-tuning-engineering/advanced-rag-and-hybrid-search.json`
- `content/modules/rag-and-fine-tuning-engineering/dpo-and-model-evaluation.json`
- `content/modules/rag-and-fine-tuning-engineering/graph-rag-and-knowledge-graphs.json`
- `content/modules/rag-and-fine-tuning-engineering/lora-qlora-fine-tuning.json`
- `content/modules/reliable-agent-workflows/agent-evaluation.json`
- `content/modules/reliable-agent-workflows/agent-observability.json`
- `content/modules/reliable-agent-workflows/context-engineering.json`
- `content/modules/reliable-agent-workflows/mcp-architecture.json`
- `content/modules/reliable-agent-workflows/mcp-trust-and-security.json`
- `content/modules/reliable-agent-workflows/memory-boundaries.json`
- `content/modules/reliable-agent-workflows/multi-agent-handoffs.json`
- `content/modules/reliable-agent-workflows/orchestration-patterns.json`
- `content/modules/reliable-agent-workflows/reliable-agent-capstone.json`
- `content/modules/self-hosted-and-aiops/hardware-and-vram-calculator.json`
- `content/modules/self-hosted-and-aiops/open-weights-and-quantization.json`
- `content/modules/self-hosted-and-aiops/production-vllm-and-ollama.json`
- `content/modules/self-hosted-and-aiops/semantic-caching-and-ai-tracing.json`
- `content/modules/self-hosted-model-operations/deployment-shape-and-operating-model.json`
- `content/modules/self-hosted-model-operations/endpoint-identity-network-and-secrets.json`
- `content/modules/self-hosted-model-operations/evaluate-the-exact-serving-build.json`
- `content/modules/self-hosted-model-operations/hardware-runtime-and-capacity-planning.json`
- `content/modules/self-hosted-model-operations/model-artifact-integrity.json`
- `content/modules/self-hosted-model-operations/model-identity-license-and-provenance.json`
- `content/modules/self-hosted-model-operations/model-incident-response-and-recovery.json`
- `content/modules/self-hosted-model-operations/model-update-and-rollback-lifecycle.json`
- `content/modules/self-hosted-model-operations/observability-cost-and-performance.json`
- `content/modules/self-hosted-model-operations/scaling-failure-and-capacity-controls.json`
- `content/modules/self-hosted-model-operations/self-hosted-model-operations-capstone.json`
- `content/modules/self-hosted-model-operations/serving-api-and-compatibility-contracts.json`
- `content/training/coverage.json`

## [0.93.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.92.0.

## [0.92.0] - 2026-08-22

### Added

- `content/modules/agentic-systems-and-mcp/agent-architecture-spectrum.json`
- `content/modules/agentic-systems-and-mcp/agent-safety-and-spend-brakes.json`
- `content/modules/agentic-systems-and-mcp/model-context-protocol-mcp.json`
- `content/modules/agentic-systems-and-mcp/multi-agent-orchestration.json`
- `content/modules/ai-literacy-and-mental-models/ai-mental-models.json`
- `content/modules/ai-literacy-and-mental-models/prompt-architecture.json`
- `content/modules/ai-literacy-and-mental-models/token-economics-and-limits.json`
- `content/modules/ai-security-and-governance/ai-compliance-and-crypto-receipts.json`
- `content/modules/ai-security-and-governance/guardrails-and-sandboxing.json`
- `content/modules/ai-security-and-governance/owasp-top-10-llm-attacks.json`
- `content/modules/developer-and-practitioner-ai/function-calling-and-tools.json`
- `content/modules/developer-and-practitioner-ai/provider-sdk-patterns.json`
- `content/modules/developer-and-practitioner-ai/structured-outputs-mastery.json`
- `content/modules/developer-and-practitioner-ai/vector-embeddings-and-pgvector.json`
- `content/modules/rag-and-fine-tuning-engineering/advanced-rag-and-hybrid-search.json`
- `content/modules/rag-and-fine-tuning-engineering/dpo-and-model-evaluation.json`
- `content/modules/rag-and-fine-tuning-engineering/graph-rag-and-knowledge-graphs.json`
- `content/modules/rag-and-fine-tuning-engineering/lora-qlora-fine-tuning.json`
- `content/modules/self-hosted-and-aiops/hardware-and-vram-calculator.json`
- `content/modules/self-hosted-and-aiops/open-weights-and-quantization.json`
- `content/modules/self-hosted-and-aiops/production-vllm-and-ollama.json`
- `content/modules/self-hosted-and-aiops/semantic-caching-and-ai-tracing.json`

### Changed

- `content/catalog.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/discovery/cost.json`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/executive.json`
- `content/modules/discovery/fine-tuning.json`
- `content/modules/discovery/langchain.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/rag.json`
- `content/modules/discovery/vector.json`
- `content/modules/discovery/voice-agent.json`
- `content/training/coverage.json`

## [0.91.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.90.0.

## [0.90.0] - 2026-08-22

### Changed

- `content/modules/ai-foundations/agents-and-guardrails.json`
- `content/modules/ai-foundations/ai-foundations-capstone.json`
- `content/modules/ai-foundations/ai-systems-and-use-cases.json`
- `content/modules/ai-foundations/coding-and-analysis-workflow.json`
- `content/modules/ai-foundations/context-and-evidence-construction.json`
- `content/modules/ai-foundations/context-tokens-and-modalities.json`
- `content/modules/ai-foundations/examples-and-output-contracts.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/ai-foundations/privacy-safety-and-responsibility.json`
- `content/modules/ai-foundations/prompt-anatomy-and-success-criteria.json`
- `content/modules/ai-foundations/prompt-with-purpose.json`
- `content/modules/ai-foundations/research-with-evidence.json`
- `content/modules/ai-foundations/safe-tool-use-workflow.json`
- `content/modules/ai-foundations/verification-and-iterative-improvement.json`
- `content/modules/ai-foundations/writing-and-transformation-workflow.json`
- `content/modules/reliable-agent-workflows/agent-evaluation.json`
- `content/modules/reliable-agent-workflows/agent-observability.json`
- `content/modules/reliable-agent-workflows/context-engineering.json`
- `content/modules/reliable-agent-workflows/mcp-architecture.json`
- `content/modules/reliable-agent-workflows/mcp-trust-and-security.json`
- `content/modules/reliable-agent-workflows/memory-boundaries.json`
- `content/modules/reliable-agent-workflows/multi-agent-handoffs.json`
- `content/modules/reliable-agent-workflows/orchestration-patterns.json`
- `content/modules/reliable-agent-workflows/reliable-agent-capstone.json`
- `content/modules/self-hosted-model-operations/deployment-shape-and-operating-model.json`
- `content/modules/self-hosted-model-operations/endpoint-identity-network-and-secrets.json`
- `content/modules/self-hosted-model-operations/evaluate-the-exact-serving-build.json`
- `content/modules/self-hosted-model-operations/hardware-runtime-and-capacity-planning.json`
- `content/modules/self-hosted-model-operations/model-artifact-integrity.json`
- `content/modules/self-hosted-model-operations/model-identity-license-and-provenance.json`
- `content/modules/self-hosted-model-operations/model-incident-response-and-recovery.json`
- `content/modules/self-hosted-model-operations/model-update-and-rollback-lifecycle.json`
- `content/modules/self-hosted-model-operations/observability-cost-and-performance.json`
- `content/modules/self-hosted-model-operations/scaling-failure-and-capacity-controls.json`
- `content/modules/self-hosted-model-operations/self-hosted-model-operations-capstone.json`
- `content/modules/self-hosted-model-operations/serving-api-and-compatibility-contracts.json`
- `content/training/coverage.json`

## [0.89.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.88.0.

## [0.88.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.87.0.

## [0.87.0] - 2026-08-22

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.86.0.

## [0.86.0] - 2026-08-22

### Changed

- `content/modules/agentic-ai-literacy/agentic-ai-layers.json`
- `content/modules/agentic-ai-literacy/agentic-classification-capstone.json`
- `content/modules/agentic-ai-literacy/agentic-control-flow.json`
- `content/modules/agentic-ai-literacy/agentic-product-comparison.json`
- `content/modules/agentic-ai-literacy/agentic-tools-state-authority.json`
- `content/modules/ai-foundations/agents-and-guardrails.json`
- `content/modules/ai-foundations/ai-foundations-capstone.json`
- `content/modules/ai-foundations/ai-systems-and-use-cases.json`
- `content/modules/ai-foundations/coding-and-analysis-workflow.json`
- `content/modules/ai-foundations/context-and-evidence-construction.json`
- `content/modules/ai-foundations/context-tokens-and-modalities.json`
- `content/modules/ai-foundations/examples-and-output-contracts.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/ai-foundations/privacy-safety-and-responsibility.json`
- `content/modules/ai-foundations/prompt-anatomy-and-success-criteria.json`
- `content/modules/ai-foundations/prompt-with-purpose.json`
- `content/modules/ai-foundations/research-with-evidence.json`
- `content/modules/ai-foundations/safe-tool-use-workflow.json`
- `content/modules/ai-foundations/verification-and-iterative-improvement.json`
- `content/modules/ai-foundations/writing-and-transformation-workflow.json`
- `content/modules/anthropic-claude-practice/anthropic-ecosystem-and-interfaces.json`
- `content/modules/anthropic-claude-practice/claude-api-and-sdk-workflows.json`
- `content/modules/anthropic-claude-practice/claude-evaluation-and-observability.json`
- `content/modules/anthropic-claude-practice/claude-prompting-in-practice.json`
- `content/modules/anthropic-claude-practice/claude-safety-and-trust-boundaries.json`
- `content/modules/anthropic-claude-practice/claude-tools-and-agent-loops.json`
- `content/modules/anthropic-claude-practice/migrating-to-and-from-claude.json`
- `content/modules/google-gemini-practice/gemini-api-and-sdk-workflows.json`
- `content/modules/google-gemini-practice/gemini-ecosystem-and-interfaces.json`
- `content/modules/google-gemini-practice/gemini-evaluation-and-observability.json`
- `content/modules/google-gemini-practice/gemini-prompting-in-practice.json`
- `content/modules/google-gemini-practice/gemini-safety-and-trust-boundaries.json`
- `content/modules/google-gemini-practice/gemini-tools-and-agent-loops.json`
- `content/modules/google-gemini-practice/migrating-to-and-from-gemini.json`
- `content/modules/openai-practice/migrating-to-and-from-openai.json`
- `content/modules/openai-practice/openai-ecosystem-and-interfaces.json`
- `content/modules/openai-practice/openai-evaluation-and-observability.json`
- `content/modules/openai-practice/openai-prompting-in-practice.json`
- `content/modules/openai-practice/openai-responses-api-and-sdk-workflows.json`
- `content/modules/openai-practice/openai-safety-and-trust-boundaries.json`
- `content/modules/openai-practice/openai-tools-and-codex-agent-loops.json`
- `content/modules/reliable-agent-workflows/agent-evaluation.json`
- `content/modules/reliable-agent-workflows/agent-observability.json`
- `content/modules/reliable-agent-workflows/context-engineering.json`
- `content/modules/reliable-agent-workflows/mcp-architecture.json`
- `content/modules/reliable-agent-workflows/mcp-trust-and-security.json`
- `content/modules/reliable-agent-workflows/memory-boundaries.json`
- `content/modules/reliable-agent-workflows/multi-agent-handoffs.json`
- `content/modules/reliable-agent-workflows/orchestration-patterns.json`
- `content/modules/reliable-agent-workflows/reliable-agent-capstone.json`
- `content/modules/self-hosted-model-operations/deployment-shape-and-operating-model.json`
- `content/modules/self-hosted-model-operations/endpoint-identity-network-and-secrets.json`
- `content/modules/self-hosted-model-operations/evaluate-the-exact-serving-build.json`
- `content/modules/self-hosted-model-operations/hardware-runtime-and-capacity-planning.json`
- `content/modules/self-hosted-model-operations/model-artifact-integrity.json`
- `content/modules/self-hosted-model-operations/model-identity-license-and-provenance.json`
- `content/modules/self-hosted-model-operations/model-incident-response-and-recovery.json`
- `content/modules/self-hosted-model-operations/model-update-and-rollback-lifecycle.json`
- `content/modules/self-hosted-model-operations/observability-cost-and-performance.json`
- `content/modules/self-hosted-model-operations/scaling-failure-and-capacity-controls.json`
- `content/modules/self-hosted-model-operations/self-hosted-model-operations-capstone.json`
- `content/modules/self-hosted-model-operations/serving-api-and-compatibility-contracts.json`

## [0.83.0] - 2026-08-21

### Changed

- `content/catalog.json`
- `content/modules/agentic-ai-literacy/agentic-ai-layers.json`
- `content/modules/agentic-ai-literacy/agentic-classification-capstone.json`
- `content/modules/agentic-ai-literacy/agentic-control-flow.json`
- `content/modules/agentic-ai-literacy/agentic-product-comparison.json`
- `content/modules/agentic-ai-literacy/agentic-tools-state-authority.json`
- `content/modules/ai-foundations/agents-and-guardrails.json`
- `content/modules/ai-foundations/ai-foundations-capstone.json`
- `content/modules/ai-foundations/ai-systems-and-use-cases.json`
- `content/modules/ai-foundations/coding-and-analysis-workflow.json`
- `content/modules/ai-foundations/context-and-evidence-construction.json`
- `content/modules/ai-foundations/context-tokens-and-modalities.json`
- `content/modules/ai-foundations/examples-and-output-contracts.json`
- `content/modules/ai-foundations/language-models-and-generation.json`
- `content/modules/ai-foundations/privacy-safety-and-responsibility.json`
- `content/modules/ai-foundations/prompt-anatomy-and-success-criteria.json`
- `content/modules/ai-foundations/prompt-with-purpose.json`
- `content/modules/ai-foundations/research-with-evidence.json`
- `content/modules/ai-foundations/safe-tool-use-workflow.json`
- `content/modules/ai-foundations/verification-and-iterative-improvement.json`
- `content/modules/ai-foundations/what-ai-does.json`
- `content/modules/ai-foundations/writing-and-transformation-workflow.json`
- `content/modules/anthropic-claude-practice/anthropic-ecosystem-and-interfaces.json`
- `content/modules/anthropic-claude-practice/claude-api-and-sdk-workflows.json`
- `content/modules/anthropic-claude-practice/claude-evaluation-and-observability.json`
- `content/modules/anthropic-claude-practice/claude-prompting-in-practice.json`
- `content/modules/anthropic-claude-practice/claude-safety-and-trust-boundaries.json`
- `content/modules/anthropic-claude-practice/claude-tools-and-agent-loops.json`
- `content/modules/anthropic-claude-practice/migrating-to-and-from-claude.json`
- `content/modules/discovery/fine-tuning.json`
- `content/modules/discovery/vector.json`
- `content/modules/google-gemini-practice/gemini-api-and-sdk-workflows.json`
- `content/modules/google-gemini-practice/gemini-ecosystem-and-interfaces.json`
- `content/modules/google-gemini-practice/gemini-evaluation-and-observability.json`
- `content/modules/google-gemini-practice/gemini-prompting-in-practice.json`
- `content/modules/google-gemini-practice/gemini-safety-and-trust-boundaries.json`
- `content/modules/google-gemini-practice/gemini-tools-and-agent-loops.json`
- `content/modules/google-gemini-practice/migrating-to-and-from-gemini.json`
- `content/modules/openai-practice/migrating-to-and-from-openai.json`
- `content/modules/openai-practice/openai-ecosystem-and-interfaces.json`
- `content/modules/openai-practice/openai-evaluation-and-observability.json`
- `content/modules/openai-practice/openai-prompting-in-practice.json`
- `content/modules/openai-practice/openai-responses-api-and-sdk-workflows.json`
- `content/modules/openai-practice/openai-safety-and-trust-boundaries.json`
- `content/modules/openai-practice/openai-tools-and-codex-agent-loops.json`
- `content/modules/provider-comparison/compare-provider-capabilities.json`
- `content/modules/provider-comparison/execute-cross-provider-cutover.json`
- `content/modules/provider-comparison/plan-cross-provider-migration.json`
- `content/modules/reliable-agent-workflows/agent-evaluation.json`
- `content/modules/reliable-agent-workflows/agent-observability.json`
- `content/modules/reliable-agent-workflows/context-engineering.json`
- `content/modules/reliable-agent-workflows/mcp-architecture.json`
- `content/modules/reliable-agent-workflows/mcp-trust-and-security.json`
- `content/modules/reliable-agent-workflows/memory-boundaries.json`
- `content/modules/reliable-agent-workflows/multi-agent-handoffs.json`
- `content/modules/reliable-agent-workflows/orchestration-patterns.json`
- `content/modules/reliable-agent-workflows/reliable-agent-capstone.json`
- `content/modules/self-hosted-model-operations/deployment-shape-and-operating-model.json`
- `content/modules/self-hosted-model-operations/endpoint-identity-network-and-secrets.json`
- `content/modules/self-hosted-model-operations/evaluate-the-exact-serving-build.json`
- `content/modules/self-hosted-model-operations/hardware-runtime-and-capacity-planning.json`
- `content/modules/self-hosted-model-operations/model-artifact-integrity.json`
- `content/modules/self-hosted-model-operations/model-identity-license-and-provenance.json`
- `content/modules/self-hosted-model-operations/model-incident-response-and-recovery.json`
- `content/modules/self-hosted-model-operations/model-update-and-rollback-lifecycle.json`
- `content/modules/self-hosted-model-operations/observability-cost-and-performance.json`
- `content/modules/self-hosted-model-operations/scaling-failure-and-capacity-controls.json`
- `content/modules/self-hosted-model-operations/self-hosted-model-operations-capstone.json`
- `content/modules/self-hosted-model-operations/serving-api-and-compatibility-contracts.json`

## [0.82.0] - 2026-08-20

### Changed

- Release cut by Orchard. No file under `content/` was added or changed since v0.81.0.

## [0.80.0] - 2026-08-20

### Added

- `content/modules/discovery/cost.json`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/executive.json`
- `content/modules/discovery/langchain.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/voice-agent.json`

### Changed

- `content/catalog.json`

## [0.79.0] - 2026-08-20

### Added

- `content/modules/discovery/rag.json`

### Changed

- `content/catalog.json`

## [0.78.0] - 2026-08-20

### Changed

- `content/training/ai-foundations/what-ai-does/alternatives/en-US-reduced-motion.md`
- `content/training/ai-foundations/what-ai-does/alternatives/en-US-text-only.md`
- `content/training/ai-foundations/what-ai-does/transcripts/en-US.md`

## [0.77.0] - 2026-08-20

### Changed

- `content/diagrams/multi-agent.mmd`
- `content/diagrams/retrieval-pipeline.mmd`

## [0.76.0] - 2026-08-20

### Added

- `content/modules/discovery/fine-tuning.json`
- `content/modules/discovery/vector.json`

### Changed

- `content/catalog.json`

## [0.75.0] - 2026-08-19

### Changed

- `content/catalog.json`
- `content/diagrams/multi-agent.mmd`
- `content/diagrams/retrieval-pipeline.mmd`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/rag.json`
- `content/modules/discovery/vector.json`
- `content/modules/discovery/voice-agent.json`

## [0.74.0] - 2026-08-19

### Added

- `content/diagrams/multi-agent.mmd`
- `content/diagrams/retrieval-pipeline.mmd`
- `content/modules/discovery/evaluation.json`
- `content/modules/discovery/mcp.json`
- `content/modules/discovery/microsoft-foundry.json`
- `content/modules/discovery/orchestration.json`
- `content/modules/discovery/rag.json`
- `content/modules/discovery/vector.json`
- `content/modules/discovery/voice-agent.json`

## [0.72.1] - 2026-08-06

### Added

- Pending account requests can persist required terms acceptance through their
  private registration receipt without receiving a learner session.

### Fixed

- Current terms acceptance is now idempotent and database-enforced as one grant
  per learner and policy version across registration and signed-in retries.

## [0.72.0] - 2026-08-04

### Added

- Centralized Mermaid diagram sources and catalogue under `content/diagrams/`,
  with a `catalogue.json` export for downstream consumers.

### Changed

- All 66 Learn modules now carry explicit `reviewCadenceDays` and `lastVerified`
  currency fields.
- Recovery contract version bumped to 1.2.

## [0.71.0] - 2026-08-01

### Added

- An `ACCOUNT_NOTIFICATION_DELIVERY` Worker provides a provider-neutral delivery
  adapter for account notifications, with a Resend implementation behind
  `POST /v1/deliver`. The account service reaches it through a service binding,
  so the delivery provider can be replaced without changing account logic.
- Learners can complete, fetch the receipt for, and roll back their own account
  reconciliation through `/v1/me/account-merges/:id/{complete,receipt,rollback}`.
  Each route requires the caller to be the source or survivor of that merge.
  Owner involvement is no longer required for a learner to resolve their own
  duplicate account.
- An optional `SESSION_COOKIE_DOMAIN` variable scopes the browser session cookie
  across sibling subdomains. Leaving it unset preserves the previous host-only
  behavior exactly.

### Changed

- The browser session cookie is named `__Secure-project42_session` rather than
  `__Host-project42_session`. A `__Host-` cookie carrying a `Domain` attribute is
  rejected outright by the browser under RFC 6265bis §4.1.3, so the prefix had to
  change for `SESSION_COOKIE_DOMAIN` to be usable at all. `__Secure-` is still
  browser-enforced to require `Secure`. The one-time OIDC transaction and
  registration receipt cookies remain `__Host-`; they are single-flow and never
  need cross-subdomain scope.

### Fixed

- Completing a merge no longer fails with a `NOT NULL` constraint violation on
  `user_profiles.reduced_motion` when neither account has ever opened profile
  settings. The merge built an explicit insert that bound `NULL` over the
  column's own SQL default; it now falls back to that default. This path was
  reachable in the new learner-initiated flow, where two freshly registered
  duplicate accounts can be merged before either has profile settings.

## [0.70.2] - 2026-07-30

### Fixed

- Browser OIDC ID-token validation now allows a bounded 60-second clock-skew
  tolerance when both nonce validation and fresh-authentication evidence are
  required. Bearer access-token validation remains strict.
- Tokens outside that bound, or with an invalid signature, issuer, audience,
  authorized party, nonce, or authentication time, continue to fail closed.

## [0.70.1] - 2026-07-30

### Fixed

- Cloudflare D1 migration checksums now use a line-ending-neutral LF contract
  while accepting equivalent legacy LF- and CRLF-bound ledger records without
  rewriting production history.
- Substantive migration changes remain fail-closed and checksum-bound byte for
  byte apart from line-ending normalization.

## [0.70.0] - 2026-07-30

### Added

- Privacy-safe signed-token diagnostics for accepting or rejecting the verified-email
  claim contract without recording identity values.
- A secure HTTPS Compose profile that proves the Learn-to-identity-to-API browser
  journey with API-owned `HttpOnly` sessions, trusted local TLS, backup and restore,
  deterministic configuration checks, and container vulnerability gates.
- Encrypted, authenticated continuation cursors for bounded owner account and audit
  administration queries.

### Changed

- Secure Compose validation consumes the redirect-safe Learn release and verifies
  sign-in, callback, session use, sign-out, and recovery from a clean browser.
- Release artifact upload and download steps use immutable Node 24-compatible GitHub
  Actions revisions.
- Secure backup checksum verification is portable across the supported Alpine-based
  utility images.

### Security

- Secure self-host images were rebuilt on remediated Caddy, curl, PostgreSQL, API,
  and browser-smoke bases and the release gate now rejects critical image
  vulnerabilities.
- Browser smoke and API containers run as non-root with constrained capabilities and
  an explicit browser seccomp profile.
- Administration cursors fail closed after tampering, secret rotation, or reuse
  across installations, query types, or account-state filters.

### Known limitations

- The self-host compatibility level remains `evaluation`.
- Real provider token claims and owner administration journeys still require
  deployment-specific validation before a hosted production promotion is accepted.
- Identity providers, email delivery, domains, secrets, and first-owner authority
  remain deployment-owner responsibilities.

## [0.69.0] - 2026-07-30

### Added

- Tenant-aware authorization boundaries with explicit owner, administrator, and
  learner enforcement.
- Versioned release-governance contracts for platform, content, migration,
  compatibility, checksum, and provenance artifacts.
- A credential-independent release rehearsal covering local publication, integrity
  verification, consumption, rollback, and cleanup.

### Changed

- Browser OIDC callbacks can recover safely after an expired browser transaction
  without weakening nonce, state, PKCE, or recent-authentication checks.
- PostgreSQL profile and learner-export timestamps use portable database semantics.

### Security

- Release workflows use immutable action references, least job permissions, Sigstore
  keyless signing, GitHub artifact attestations, and a validation-only manual path.

### Known limitations

- The self-host compatibility level remains `evaluation`.
- Identity-provider configuration and real user journeys remain deployment-owner
  responsibilities.

[0.71.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.71.0
[0.70.2]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.2
[0.70.1]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.1
[0.70.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.70.0
[0.69.0]: https://github.com/project42dev/project42-platform/releases/tag/v0.69.0
