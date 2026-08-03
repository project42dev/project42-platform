# Virtual-instructor content and media production

Project 42 treats the teaching script as the product and voice, avatar, and player
technology as replaceable presentation layers. A short list of talking points is not
a class-ready script.

See the [training package format](training-package-format.md) for the field-level
reference on both schemas below, the real generated package layout, and what a
player and top-level package manifest would need before either is implemented.

## Two public contracts

The `schemas/training` directory contains:

- `class-script-package.schema.json` for complete read-aloud content, stage
  directions, demonstrations, learner interaction, feedback, source mapping,
  accessibility requirements, model-role provenance, and human approvals;
- `virtual-instructor-media-manifest.schema.json` for immutable pre-rendered media,
  voice/avatar profile references, disclosure, artifact digests, accessibility
  alternatives, and release approvals.

The TypeScript validators enforce semantic rules that JSON Schema cannot express:

- a class-ready package contains at least 900 spoken words;
- every canonical lesson section has sourced read-aloud narration;
- the declared word count and segment timing reconcile;
- spoken pacing remains between 90 and 180 words per minute;
- demonstrations, learner prompts, checkpoints, corrective feedback, assessment
  handoff, and closing are present;
- script writing and factual verification use different qualified provider families;
- approved scripts require editorial, subject-matter, and accessibility approvals;
- learner media is pre-rendered and uses safe relative paths;
- audio always has captions, transcript, text-only, and reduced-motion equivalents;
- approved media requires editorial, factual, accessibility, and media-release
  approval.

## Canonical package registry and migration status

Complete packages live at
`content/training/<path-id>/<module-id>/class-script.json`. The representative
compatibility fixture remains under `examples/training/`. The generator discovers
both roots, rejects duplicate IDs, path escapes, module/path mismatches, undeclared
sources, and broken activity or question handoffs, then emits
`content/training/coverage.json`.

Coverage is intentionally explicit:

- `class-ready-draft` means the complete machine-readable teaching package exists
  but has not passed all independent model and human publication gates;
- `outline-only` means the module has short instructor cues, not a complete class;
- `complete` is reported only when every substantive module has a class-ready
  package.

The first class-ready draft wave covers `ai-systems-and-use-cases`,
`language-models-and-generation`, and `context-tokens-and-modalities`. The second
adds `prompt-anatomy-and-success-criteria`, `examples-and-output-contracts`, and
`context-and-evidence-construction`. Run `npm run training:generate` after authoring
and `npm run training:check` to fail on missing or stale captions, transcripts,
alternatives, integrity files, or coverage.

## Model, voice, and avatar policy

The public package never names a private deployment or stores a credential. It records
only versioned role-profile and adapter references. A deployment qualifies for a role
through measured held-out evaluation; the strongest writing model is not assumed to
be the strongest researcher, verifier, learning designer, accessibility reviewer, or
speech producer.

The minimum production sequence is:

1. collect evidence from authoritative sources;
2. draft the class with a qualified curriculum-writing model;
3. verify every factual claim with a different qualified provider family;
4. review learning design, assessment alignment, and accessibility;
5. obtain accountable human publication approval;
6. synthesize media at publish time through a replaceable adapter;
7. audit pronunciation, pacing, disclosure, licensing, accessibility, and output
   integrity;
8. publish immutable assets only after the media-release gate passes.

Each contribution records `planned` or `completed`. A completed contribution must
include its completion time, and an approved script requires every role to be
completed. Draft packages use planned role-profile references until actual Foundry
execution evidence exists; placeholder qualifications are never represented as
completed work. The writer and factual verifier must use different provider
families.

Voice and avatar profiles are auditioned, versioned configuration—not permanent brand
assumptions. Avatar video is optional. Text and transcript remain canonical, audio is
the first media enhancement, and a text-only/reduced-motion experience always remains
available. Model, speech, and avatar keys never enter the learner browser or request
path.

## Representative fixture and first wave

`examples/training/language-models-and-generation/class-script.json` is a substantial
interactive class script tied to the existing module. Its deterministic transcript,
WebVTT captions, text-only route, reduced-motion direction, and integrity manifest are
published with the package. The media manifest is deliberately `draft`: placeholder
digests and qualification references prove the contract without pretending that voice
audition, pronunciation review, human approvals, or final media generation occurred.

The fixture and first-wave packages become releasable only after real qualified role
profiles, execution evidence, review evidence, and every required approval replace
the planned entries. The generated accessibility artifacts are usable draft outputs;
synthesized voice or avatar media is not implied.
