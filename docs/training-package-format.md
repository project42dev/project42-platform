# Training package format

Project 42 splits virtual-instructor content into two portable contracts: a
canonical class script that contains everything a human or synthesized
instructor would say and do, and a media manifest that points at
publish-time-generated audio, video, captions, and transcripts derived from
that script. A private, governed model and media execution environment can
execute qualified roles and produce artifacts, but it is not a
learner-runtime dependency: everything a learner's browser needs is either
checked in or generated ahead of time into this repository. See
[Virtual-instructor content and media production](virtual-instructor-production.md)
for the production workflow, role sequence, and coverage-registry concepts
that sit around these two contracts.

## What exists today

Two schemas and one TypeScript validator module define the implemented
format:

- `schemas/training/class-script-package.schema.json`
  (`schemaVersion: "2.0"`).
- `schemas/training/virtual-instructor-media-manifest.schema.json`
  (`schemaVersion: "1.0"`).
- `src/training-package.ts`, which exports `CLASS_SCRIPT_SCHEMA_VERSION`,
  `VIRTUAL_INSTRUCTOR_MEDIA_SCHEMA_VERSION`, the corresponding TypeScript
  types, and `validateClassScriptPackage` /
  `validateVirtualInstructorMediaManifest`, which enforce rules JSON Schema
  cannot express: word counts, spoken pacing, segment and section coverage,
  and provider-family independence between roles.
- `scripts/generate-training-packages.mjs`, which discovers every canonical
  class script, generates its deterministic accessibility artifacts, and
  writes `content/training/coverage.json`.

There is no code anywhere in this repository that renders or produces
virtual-instructor media. Nothing synthesizes speech, generates video, or
drives an avatar. What exists is the class-script schema and validator, the
media-manifest schema and validator, and a fixture generator that produces
text-based accessibility artifacts (captions, transcript, and text-only and
reduced-motion routes) directly from a class script's own content, with no
model call involved.

## Package layout

A canonical class script lives at:

```text
content/training/<path-id>/<module-id>/class-script.json
```

or, for the one representative compatibility fixture, at:

```text
examples/training/<module-id>/class-script.json
```

Running `npm run training:generate` (or checking with `npm run
training:check`, which fails the build on anything missing or stale) writes
four deterministic accessibility artifacts and an integrity manifest next to
each class script:

```text
<module-id>/
├── class-script.json
├── captions/
│   └── en-US.vtt
├── transcripts/
│   └── en-US.md
├── alternatives/
│   ├── en-US-reduced-motion.md
│   └── en-US-text-only.md
└── integrity.json
```

`scripts/training-package-catalog-lib.mjs` enforces that layout: exactly
three path segments under `content/training/`
(`<path-id>/<module-id>/class-script.json`), no duplicate module or package
IDs, and a module directory that matches the script's own `moduleId`.
`content/training/coverage.json` is a generated, checked-in registry
(`schemaVersion: "1.0"`) distinguishing `class-ready-draft` modules, where a
validated class script exists, from `outline-only` modules, where only a
short instructor cue exists. Regenerate it with `npm run training:generate`
and treat it as the current source of truth for how many modules are
class-ready rather than any count quoted in prose.

## Canonical class script (`schemaVersion: "2.0"`)

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | Lowercase kebab-case |
| `version` | string | Semantic version `x.y.z` |
| `moduleId` | string | Must match the containing directory and an existing catalog module |
| `locale` | string | |
| `title`, `audience` | string | |
| `learningObjectives` | string[] | At least one; validated against the module's own objectives when a module is supplied |
| `plannedDurationSeconds` | integer | 300 to 14400; must equal the sum of every segment's `estimatedSeconds` |
| `spokenWordCount` | integer | At least 900; must equal the sum of words in every `spoken` segment's `spokenText` |
| `segments` | array | At least 8; see below |
| `accessibility` | object | Four fields, each `const: true`: `transcriptRequired`, `captionsRequired`, `textOnlyEquivalentRequired`, `reducedMotionRequired` |
| `provenance` | object | `canonicalContentVersion`, `evidenceReviewedAt`, at least 5 `contributions`, and `approvals` |
| `releaseStatus` | `"draft"` or `"approved"` | |

A segment's `kind` is one of `welcome`, `narration`, `demonstration`,
`learner-prompt`, `pause`, `checkpoint`, `feedback`, `transition`,
`assessment-handoff`, or `closing`. The validator rejects a class script
missing at least one segment of kind `welcome`, `narration`,
`demonstration`, `learner-prompt`, `checkpoint`, `feedback`,
`assessment-handoff`, and `closing`. A `narration` segment must cite at least
one source URL. `delivery` is `spoken` or `silent`; a spoken segment needs
`spokenText`, and a silent one must not have any. The validator computes
spoken pace from `spokenText` word counts against spoken-segment
`estimatedSeconds` and rejects anything outside 90 to 180 words per minute.

Each of the (at least five) entries in `provenance.contributions` records a
`role` (`evidence-research`, `curriculum-writing`, `factual-verification`,
`learning-design-review`, or `accessibility-review`), a `roleProfileRef`, a
`providerFamily`, and a `status` of `planned` or `completed`. The validator
rejects a script whose `curriculum-writing` and `factual-verification`
contributions share the same `providerFamily`, and rejects a script with
`releaseStatus: "approved"` that has any contribution still `planned`.
`provenance.approvals` records `editorial`, `subject-matter`, and
`accessibility` sign-off; an approved script needs all three.

The published representative example is
`examples/training/language-models-and-generation/class-script.json`, a
substantial (986-word) script tied to the `language-models-and-generation`
module. Read that file directly rather than a trimmed excerpt here: it is the
executable ground truth, and this repository's own test suite validates it.

## Generated accessibility artifacts

`scripts/training-fixture-lib.mjs` derives four artifacts and an integrity
manifest from a class script's own segments, with no model call:

- `captions/<locale>.vtt`: WebVTT captions, chunked to roughly ten words or
  42 characters per cue, timed against each spoken segment's
  `estimatedSeconds`.
- `transcripts/<locale>.md`: a Markdown transcript with every segment's
  spoken text, expected learner action, and feedback, in order.
- `alternatives/<locale>-reduced-motion.md`: static text for every segment
  that declares a `visual`, using that segment's `reducedMotionDescription`
  and `altText`.
- `alternatives/<locale>-text-only.md`: the complete class in text, usable
  without audio, video, or animation.
- `integrity.json`: binds the class script's own SHA-256 digest and the
  SHA-256 digest of each of the four artifacts above. Its actual shape is:

```json
{
  "schemaVersion": "1.0",
  "classScript": { "id": "...", "version": "...", "sha256": "..." },
  "artifacts": [
    { "path": "captions/en-US.vtt", "sha256": "..." }
  ]
}
```

`npm run training:check` recomputes every artifact and fails the build if a
committed artifact does not match, so these four files and `integrity.json`
cannot drift from the class script that produced them.

## Virtual-instructor media manifest (`schemaVersion: "1.0"`)

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `version` | string | Kebab-case ID, semantic version |
| `classScript` | object | `id`, `version`, and `sha256` of the exact class script this media renders |
| `production` | object | See below |
| `artifacts` | array | At least 5 |
| `approvals` | array | Required when `releaseStatus` is `approved` |
| `releaseStatus` | `"draft"` or `"approved"` | |

`production.mode` is `const: "pre-rendered"`: media is always generated
ahead of time and checked in or published as an immutable artifact, never
rendered live in front of a learner. `production` also requires
`generatedAt`, an `adapter` ID, a `modelProfileRef`, a `voiceProfileRef`, an
optional `avatarProfileRef`, a `pronunciationReviewEvidenceRef`, and a
`disclosure` string. None of those fields may contain a private deployment
name or credential; only versioned role-profile and adapter references.

Each entry in `artifacts` has a `kind` (`audio`, `video`, `captions`,
`transcript`, `poster`, `text-only`, or `reduced-motion`), a safe relative
`path`, a `mediaType`, a `sha256` digest, and a `locale`. The validator
requires at least one artifact of kind `audio`, `captions`, `transcript`,
`text-only`, and `reduced-motion`; if any `video` artifact is present, a
`poster` artifact is also required. A manifest with `releaseStatus:
"approved"` needs `editorial`, `factual`, `accessibility`, and
`media-release` approvals.

The one published representative media manifest, paired with the
representative class script above, is deliberately `draft`: its digests and
qualification references are placeholders that prove the contract's shape
without claiming that voice audition, pronunciation review, human approval,
or real media generation ever happened. Treat every field in that fixture as
illustrative, not as evidence of a real production run.

## Package manifest and player boundary (design contract, not implemented)

The two schemas above are the entire implemented package format. This
repository contains no top-level package manifest schema, no validator for
one, and no code that renders a package inside a player. The rest of this
section describes the intended learner-facing boundary as architecture
direction, not as something you can build against today.

The intended top-level manifest, `project42-training.json`, would sit beside
a package's entrypoint and declare the learner-facing contract a player
needs without exposing production internals:

```json
{
  "schemaVersion": "1.0",
  "id": "agent-loop-foundations",
  "version": "1.0.0",
  "title": "Agent Loop Foundations",
  "entrypoint": "index.html",
  "durationSeconds": 420,
  "defaultLocale": "en",
  "locales": ["en"],
  "captions": { "en": "captions/en.vtt" },
  "transcripts": { "en": "transcripts/en.md" },
  "capabilities": ["progress", "checkpoints", "completion", "reduced-motion"],
  "integrity": { "algorithm": "sha256", "digest": "<package digest>" }
}
```

No file matching this shape exists in this repository, no schema validates
it, and no generator emits it. Do not depend on it. Its field names also do
not match the real, shipped `integrity.json` shown above (`algorithm` and
`digest` versus `classScript` and `artifacts`).

WebVTT is the intended timed-caption interchange for a future player, for
the same reason it already is for the generated fixture captions: it is
designed for external text tracks, captions, chapters, and time-aligned
metadata ([W3C WebVTT](https://www.w3.org/TR/webvtt1/)).

The intended default execution model is an iframe on an isolated origin with
the smallest possible sandbox and Permissions Policy, communicating through
validated, versioned `postMessage` envelopes:

| Event | Intended data |
| --- | --- |
| `project42.ready` | Package ID/version and supported protocol version |
| `project42.progress` | Stable activity ID and percentage or position |
| `project42.checkpoint` | Stable checkpoint ID and completion evidence |
| `project42.complete` | Completion ID, evidence IDs, and package digest |
| `project42.error` | Stable error code and recoverability |

Every envelope would carry a protocol version, a session nonce, the package
ID/version, a message ID, and a timestamp. The host would validate origin,
source window, nonce, schema, and allowed event type before treating a
package message as a learning command; the intent is that a package can
never write a learner record directly. [Content Security
Policy](https://www.w3.org/TR/CSP3/) is meant as defense in depth, not a
replacement for package validation: a package that needs scripts should be
served from a separate origin, and `allow-scripts` and `allow-same-origin`
should not be combined against same-origin untrusted content.

No code implementing an iframe host, a `postMessage` listener, origin
validation, or a session nonce exists in this repository today. A search of
this repository for `postMessage`, `project42.ready`, `project42.progress`,
`project42.checkpoint`, `project42.complete`, and `project42.error` outside
of generated dependency directories returns no matches.

## Accessibility gate

Every package, once a player exists, must provide:

- full keyboard operation with visible focus;
- captions and a readable transcript for speech or audio;
- pause, replay, seek, and volume controls where media is used;
- a meaningful non-motion or reduced-motion mode;
- no required time limit without an extension or disable mechanism;
- no flashing that violates seizure thresholds;
- text alternatives for instructional visuals;
- programmatic names, roles, states, and error messages; and
- an equivalent route when an interaction cannot be made accessible.

Completion may not depend on autoplay, pointer-only gestures, audio-only
cues, or animation timing. Two of these are already enforced today,
independent of any player: the class-script validator requires a complete
`reducedMotionDescription` and `altText` on every declared `visual`, and the
fixture generator produces a text-only route for every class script
regardless of release status.

## Standards position

xAPI 2.0 can be offered as an export adapter for organizations that already
run a Learning Record Store; it is not Project 42's core event model. The
core event model stays smaller and maps outward only after its own
semantics are proven, rather than adopting xAPI's shape upfront. Open Badges
3.0 is similarly reserved for durable issued credentials later, not for a
device-local MVP badge.

## Discrepancies with earlier architecture material

Earlier architecture drafts of this contract described a package shape that
does not match what is actually implemented. If you are building against
this repository, the two schemas listed above are authoritative. Specific
discrepancies:

- The described package root (`project42-training.json`, `index.html`,
  `assets/`, `captions/en.vtt`, `transcripts/en.md`) does not exist. The
  real, shipped layout is
  `content/training/<path-id>/<module-id>/class-script.json` plus generated
  `captions/<locale>.vtt`, `transcripts/<locale>.md`,
  `alternatives/<locale>-reduced-motion.md`,
  `alternatives/<locale>-text-only.md`, and `integrity.json`, with
  locale-tagged filenames (`en-US.vtt`) rather than a bare `en.vtt`.
- There is no `project42-training.json` schema, validator, or generator
  anywhere in this repository. The two schemas that do exist and are
  enforced, `class-script-package.schema.json` and
  `virtual-instructor-media-manifest.schema.json`, use an entirely
  different field set: neither has `entrypoint`, `durationSeconds`,
  `defaultLocale`, `locales`, or `capabilities`.
- The generated `integrity.json` file's real shape
  (`{schemaVersion, classScript: {id, version, sha256}, artifacts: [{path,
  sha256}]}`) is narrower than the illustrative `integrity: {algorithm,
  digest}` field shown in the player-manifest sketch above.
- The `postMessage` player protocol and its iframe/CSP boundary remain
  design-only; no schema or code exists for them yet, as noted above.
