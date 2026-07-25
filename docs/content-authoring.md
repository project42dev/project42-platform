# Content authoring

Project 42 keeps catalog metadata and the original curriculum in
[`content/catalog.json`](../content/catalog.json). New modules live as individual
JSON documents under `content/modules/<path>/`. The build merges those files into
one typed catalog consumed by hosted and self-hosted applications, so adding
ordinary learning content does not require an application-code change.

## Choose the content type

Use a **resource** for a standalone reference, checklist, template, or how-to.
Use a **module** for guided instruction with objectives and a knowledge check.
Add modules to a **path** when they form a deliberate sequence and badge outcome.

Every published module must include:

- a stable lowercase ID with words separated by hyphens;
- audience level, provider scope, time estimate, and objectives;
- zero or more prerequisite module IDs;
- one or more lesson sections;
- a scored knowledge check with explanations; and
- at least one primary source with its verification date.

Substantive curriculum modules also include a hands-on `activity` with observable
evidence and an `instructorScript`. The script is canonical content for future
virtual-instructor packages; it does not require a player. It contains versioned,
stable cues for narration, visuals, learner prompts, checkpoints, and the assessment
handoff. Visual cues require an accessibility alternative.

Use instructor-script schema `1.1` for new substantive modules. In addition to the
cue sequence, it requires a complete text transcript, ordered caption segments, and
a reduced-motion alternative. Captions must have non-overlapping integer
`startSeconds` and `endSeconds` within the declared duration. Each caption references
its source cue through `cueId` and repeats that cue's text verbatim. Every narration
cue must have a caption and appear verbatim in the transcript so a future player can
prove that its spoken, captioned, and text alternatives describe the same lesson.

A culminating module can also include a `capstone`. Define stable required-artifact
labels and a rubric whose criteria total 100 points. Each criterion names the
evidence a reviewer needs, and the module declares the passing percentage. A
capstone module completes only after both its knowledge check and one capstone
submission pass. Submissions are versioned learning evidence in portable JSON
records and CSV transcripts.

Set `requiresCriterionEvidence` when every rubric score must name its supporting
artifact or assessment result. Artifact references must appear in the submission;
assessment references use `assessment:<attempt-id>` and must name a recorded
attempt for the same capstone module and path. Set `requiresCalibrationExemplars`
and provide exactly one
passing `complete` exemplar and one failing `flawed` exemplar when reviewers need
machine-validated scoring anchors. Each exemplar carries complete artifact content,
criterion scores, evidence references, reviewer notes, and its expected result.

Every resource needs the same stable identity, sections, providers, source
metadata, and search tags. Resources do not create learner completion records.

## Authoring workflow

1. Add or edit catalog metadata in `content/catalog.json`, or create one module
   document under `content/modules/<path>/`.
2. Reuse an existing provider ID. Add a new provider only when the platform type
   and site presentation are ready for it.
3. Use a registered primary source from `content/source-registry.json`. When a
   new publisher is required, record its trust tier, review cadence, and owner.
4. Increase `contentVersion` when published content changes.
5. Run:

   ```bash
   npm run check
   ```

The check generates the typed catalog, compiles the package, validates
references and prerequisite graphs, runs assessment and learner-record tests,
and enforces source review cadences.

## Knowledge checks

Questions should test an objective, not trivia. Use plausible choices, one
unambiguous answer, and an explanation that teaches why the answer is correct.
Keep pass criteria explicit. An ordinary module is marked complete only after its
check passes. A capstone module also requires a passing rubric submission; neither
piece alone completes it.

Changing question meaning after release should use a new question ID. Do not
silently reuse an ID for different evidence.

## Source and freshness rules

Prefer the organization that owns the standard, product, or claim. A current
provider behavior belongs in a provider-specific module or resource. General
concepts should stay provider-neutral.

`lastVerified` records when a person confirmed that the source still supports
the content. It is not the publication date. The freshness check warns near the
registered review deadline and fails after it.

## Compatibility

Do not rename or delete released path, module, question, or badge IDs casually.
Portable learner records restore across catalog versions when all referenced
path and module IDs still exist. Removing an ID requires a documented migration
or retirement policy.

Educational content in `content/` is licensed under CC BY 4.0. Code and
contracts are licensed under Apache-2.0.
