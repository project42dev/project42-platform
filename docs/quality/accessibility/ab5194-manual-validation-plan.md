# AB#5194 manual accessibility and usability validation plan

**Status:** Ready for execution; no human session claimed

**Work item:** AB#5194

**Target:** WCAG 2.2 AA plus moderated task comprehension

**Applies to:** `project-42.dev`, `learn.project-42.dev`, and
`guide.project-42.dev`

## Purpose and claim boundary

This plan turns the remaining Project 42 accessibility gate into reproducible,
evidence-bearing work. It covers:

- moderated newcomer and practitioner journeys;
- keyboard-only navigation and visible-focus review;
- real screen-reader use across headings, landmarks, forms, feedback, progress,
  tables, dialogs, and live announcements;
- contrast, zoom, narrow reflow, reduced motion, forced colors, target size,
  touch, and orientation;
- finding severity, Bug creation, remediation, and verification; and
- a redacted release report with accountable approval.

The package does **not** claim that any moderated, keyboard-only, screen-reader, or
physical-device session has occurred. Automated HTTP, markup, browser, or Axe checks
cannot establish comprehension or actual assistive-technology behavior.

## Authoritative package

| Artifact | Purpose |
|---|---|
| `deployment/accessibility/ab5194-validation-manifest.json` | Versioned routes, environments, scenarios, tasks, and assertions |
| `deployment/accessibility/ab5194-result.schema.json` | Fail-closed anonymized result contract |
| `deployment/accessibility/fixtures/ab5194-manual-result.valid.json` | Copyable, deliberately `not-run` manual result template |
| `deployment/Invoke-Project42AccessibilityPreflight.ps1` | Read-only production HTTP and static-markup preflight |
| `deployment/Test-Project42AccessibilityResultSet.ps1` | Schema, manifest, privacy, and aggregate approval validation |
| `deployment/Test-Project42AccessibilityValidation.ps1` | Offline redirect, manifest binding, privacy, evidence-path, fixture, and behavior tests |
| `templates/ab5194-accessibility-bug.md` | Public-safe accessibility Bug evidence |
| `templates/ab5194-redacted-release-report.md` | Cross-repository release decision |

The machine-readable manifest is authoritative when this prose and the manifest
disagree. Update both in the same reviewed change.

## Preconditions

Do not begin a human session until all applicable conditions are true:

1. Record the exact root, Learn, and Field Guide release facts.
2. Run the production preflight and retain its schema-valid JSON privately.
3. Confirm the participant cohort and anonymous ID without storing a direct
   identifier in the repository.
4. Record informed consent outside the repository and reference it only by an
   opaque private record path.
5. Use dedicated approved learner, owner, and non-owner test accounts. Never use a
   participant's personal account.
6. Obtain separate production-change authorization before an owner-console task can
   mutate an account, domain, identity link, merge, consent, or deletion record.
7. Confirm rollback and recovery for every authorized production mutation.
8. Verify that test notes and tools will not capture tokens, cookies, learner
   records, direct identifiers, or response bodies.
9. Make AB#5194 and its current execution tasks Active. Do not mark the Story
   Resolved until every acceptance criterion is evidenced.

Run the preflight from PowerShell 7:

```powershell
$privateEvidenceRoot = Read-Host 'Absolute private evidence root outside Git'

./deployment/Invoke-Project42AccessibilityPreflight.ps1 `
  -PrivateEvidenceRoot $privateEvidenceRoot `
  -OutputPath 'preflight/ab5194-preflight.json'
```

The explicit root and the `preflight` parent directory must already exist. The
script rejects relative roots, every root inside a Git repository or worktree,
absolute output paths, path traversal, missing parents, and an existing output file.
It does not create a parent, overwrite evidence, or silently fall back to the current
directory. A passing result proves only route availability and declared static
markers.

## Participants and roles

### Minimum participant coverage

Use at least:

- one newcomer who has not previously used Project 42; and
- one practitioner who already understands basic AI concepts.

At least one session should be conducted with a participant who regularly uses the
assistive technology under evaluation. If that is unavailable, label the result as
an evaluator smoke test, record the limitation, and do not represent it as
representative assistive-technology validation.

### Session roles

| Role | Responsibility |
|---|---|
| Moderator | Reads the task without leading, records assistance and comprehension |
| Observer | Records focus, announcements, errors, recovery, timing, and findings |
| Environment operator | Verifies browser, OS, AT, zoom, color, motion, and device facts |
| Accessibility lead | Classifies severity and WCAG impact; confirms retest scope |
| Owner or release manager | Accepts or rejects the final release report |

One person may hold multiple internal roles, but the moderator should not silently
complete tasks for the participant.

## Privacy and evidence handling

The committed result contract permits only anonymous participant IDs matching
`P42-[A-Z0-9]{6,12}`. It rejects undeclared participant properties, including an
email field.

Never commit:

- a participant name, email, phone, address, username, account ID, identity
  subject, or tenant ID;
- audio, video, raw screen recordings, authentication material, cookies, or
  tokens;
- production learner records, profile photos, exports, deletion receipts, or
  account data; or
- private Azure DevOps URLs or private operational identifiers in a public Bug.

Store raw authorized evidence outside Git in the approved private evidence system.
Commit only a redacted structured result, digest, relative evidence reference, and
public-safe summary. The validator recursively scans every string in a result for
email addresses, bearer or JWT material, named secrets, private keys, and identity
identifiers. That automated scan is a guardrail, not a substitute for human
redaction: a reviewer must still inspect every result and evidence reference before
repository publication. Record whether a recording was used, but never store it in
this repository.

## Environment matrix

The manifest defines the exact minimum:

| ID | Operating system and browser | Assistive technology | Primary purpose |
|---|---|---|---|
| `windows-keyboard` | Windows 11, current Chrome or Edge | None | Keyboard, focus, zoom, forced colors, reduced motion |
| `windows-nvda-chrome` | Windows 11, current Chrome | Current NVDA | Chrome screen-reader journey |
| `windows-nvda-firefox` | Windows 11, current Firefox | Current NVDA | Firefox screen-reader journey |
| `macos-voiceover-safari` | Current macOS and Safari | VoiceOver | Apple desktop screen-reader journey |
| `ios-voiceover-safari` | Physical current iOS device and Safari | VoiceOver | Touch, orientation, reflow, dialog behavior |
| `android-talkback-chrome` | Physical current Android device and Chrome | TalkBack | Touch, orientation, reflow, dialog behavior |

Record exact versions at execution time. “Current” in the manifest is a selection
rule, not sufficient result evidence.

## Session procedure

For every session:

1. Copy the valid manual result fixture and replace the template timestamps,
   release lines, anonymous participant ID, environment, and scenario. Retain the
   manifest's exact scenario, environment, and task IDs.
2. Confirm consent before recording any observation.
3. Reset browser state according to the scenario. Keep required authenticated
   fixtures isolated from participant data.
4. Read the task exactly as written. Do not name the control the participant is
   expected to find.
5. Record task status, attempts, elapsed seconds, and assistance:
   `none`, `prompt`, `direct-help`, or `not-applicable`.
6. Record what was announced, where focus moved, and what the participant understood.
7. Stop the task if it could expose private data, change an unapproved production
   record, or leave the participant unable to recover.
8. Record each distinct issue immediately. Do not combine unrelated failures.
9. Run the result through the JSON schema before accepting it as evidence.
10. Hash the approved private evidence and record only its redacted reference and
    digest.

## Scenario matrix

| Scenario | Cohort | Required behavior |
|---|---|---|
| `root-keyboard-legal` | Newcomer and practitioner | Skip, primary navigation, footer, legal table of contents, focus, zoom, forced colors, reduced motion |
| `learn-newcomer-foundations` | Newcomer | Find first path, fail and retry a check, understand feedback, find progress/transcript/export |
| `learn-practitioner-agent` | Practitioner | Find advanced path, navigate table/code/disclosure/check, explain mastery evidence |
| `learn-authenticated-account` | Approved test learner | Profile/photo, preferences, consent, identity link, exports, deletion/recovery |
| `learn-owner-administration` | AT evaluator using owner and non-owner fixtures | Authorization, accounts/audit, pagination, review forms, safe cancellation or authorized mutation |
| `guide-resource-discovery` | Newcomer and practitioner | Search/filter/no-result recovery, provenance, freshness, copy feedback |
| `visual-guide-dialog` | AT evaluator on desktop and physical mobile | Dialog name, focus, zoom, scroll, Escape/Close, restoration, text alternative |

Use the complete task and assertion text from the manifest.

Before approval, validate the complete result set against the manifest. Every
scenario must have a passed human result, every required environment must be
represented in a passed human result, and newcomer, practitioner, and AT-evaluator
cohorts must be covered. A passed scenario must include every declared task exactly
once, passed task observations, announcement observations, focus observations, and
comprehension evidence. JSON Schema validation alone does not establish those
cross-record requirements.

Run the approval gate over the redacted result files:

```powershell
./deployment/Test-Project42AccessibilityResultSet.ps1 `
  -ResultPath $redactedResultPaths `
  -RequireApprovalCoverage
```

The validator still reports that human redaction is required. A machine pass does
not authorize publication.

## Observation rules

### Keyboard and focus

Pass only when:

- every interactive control is reachable and operable without a pointer;
- focus is visible and not obscured;
- focus order follows the content and task;
- no component traps focus except a correctly bounded modal dialog; and
- focus after submit, error, cancel, close, pagination, or download is predictable.

### Screen reader

Record actual announcements rather than inferring from ARIA source. Verify:

- page title, headings, landmarks, lists, and navigation;
- label, description, required state, validation, and error association;
- assessment question, selected answer, score, correction, and retry state;
- progress, badge, transcript, table, pagination, and download purpose;
- dialog name, instructions, zoom status, containment, and close behavior; and
- live changes without duplicate, missing, or excessively verbose announcements.

### Zoom, reflow, contrast, motion, and touch

Observe 200 and 400 percent browser zoom, a 390 CSS-pixel narrow viewport, forced
colors, increased contrast where supported, and reduced motion. Use physical iOS
and Android devices for touch target, orientation, screen-reader touch navigation,
and pinch-zoom checks.

## Severity and Bug rules

| Severity | Definition | Release effect |
|---|---|---|
| Critical | Blocks a core journey for an AT user, exposes private data, or causes an unsafe irreversible action | Stop testing; release blocked |
| High | Prevents independent completion of a required journey with no reasonable workaround | Release blocked |
| Medium | Material friction, ambiguity, or incomplete announcement with a viable workaround | Fix or explicitly disposition before approval |
| Low | Minor usability or consistency issue that does not block task completion | Track and schedule |

Every Critical or High finding, and every serious Medium finding selected by the
accessibility lead, requires:

1. a public GitHub-master Bug in the affected repository using the Bug template;
2. an ADO Bug linked to AB#5194 and the public Bug reference;
3. severity, affected release, generalized environment, WCAG criteria, and
   reproducible steps;
4. private evidence references without private URLs or identifiers;
5. remediation PR/commit and test evidence; and
6. a retest in the environment that exposed the issue.

Do not close the AB#5194 Story as a substitute for tracking a defect.

## Acceptance gates

AB#5194 may move to Resolved only after:

- representative newcomer and practitioner keyboard journeys pass;
- the required screen-reader environment matrix is recorded;
- contrast, 200 and 400 percent zoom, narrow reflow, reduced motion, forced
  colors, target size, physical touch, and orientation are dispositioned;
- every serious finding has linked Bug and remediation evidence;
- fixes are retested against the exact affected environment;
- the redacted report records participant counts, environments, results,
  findings, fixes, accepted limitations, and accountable approval;
- privacy validation proves no direct identifier, authentication material,
  learner record, or recording was committed; and
- ADO, GitHub, release facts, repository evidence, and production state agree.

Story closure remains an owner acceptance action after Resolved.

## Owner and external actions

The package can be implemented and preflighted without participant activity. These
steps require external action or authority:

- recruit or approve representative participants;
- approve consent and evidence-retention handling;
- provide authorized learner, owner, and non-owner test fixtures;
- authorize any production mutation and rollback;
- supply physical macOS, iOS, and Android AT environments;
- approve accepted limitations; and
- record the accountable release decision.

Until those actions and sessions occur, report AB#5194 as **Active, validation
package implemented; human execution pending**.
