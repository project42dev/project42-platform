# Virtual-instructor content and media production

Project 42 treats the teaching script as the product and voice, avatar, and player
technology as replaceable presentation layers. A short list of talking points is not
a class-ready script.

## Two public contracts

The `schemas/training` directory contains:

- `class-script-package.schema.json` for complete read-aloud content, stage
  directions, demonstrations, learner interaction, feedback, source mapping,
  accessibility requirements, model-role provenance, and human approvals;
- `virtual-instructor-media-manifest.schema.json` for immutable pre-rendered media,
  voice/avatar profile references, disclosure, artifact digests, accessibility
  alternatives, and release approvals.

The TypeScript validators enforce semantic rules that JSON Schema cannot express:

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

Voice and avatar profiles are auditioned, versioned configuration—not permanent brand
assumptions. Avatar video is optional. Text and transcript remain canonical, audio is
the first media enhancement, and a text-only/reduced-motion experience always remains
available. Model, speech, and avatar keys never enter the learner browser or request
path.

## Representative fixture

`examples/training/language-models-and-generation/class-script.json` is a substantial
interactive class script tied to the existing module. Its deterministic transcript,
WebVTT captions, text-only route, reduced-motion direction, and integrity manifest are
published with the package. The media manifest is deliberately `draft`: placeholder
digests and qualification references prove the contract without pretending that voice
audition, pronunciation review, human approvals, or final media generation occurred.

The fixture becomes releasable only after real qualified role profiles, artifact
digests, review evidence, and every required approval replace the examples.
