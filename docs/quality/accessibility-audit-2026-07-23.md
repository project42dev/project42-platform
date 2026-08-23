# Accessibility Audit: Project 42 MVP

**Standard:** WCAG 2.2 AA target
**Date:** 2026-07-23
**Scope:** Source, rendered HTML, semantics, and calculated color contrast
**Limitation:** This is not a conformance claim; browser, assistive-technology, zoom,
and moderated testing remain required.

## Summary

The automated/source review found four related contrast failures and several semantic
or target-size improvements. These were corrected in the hosted-site source. No known
critical blocker remains in the reviewed markup.

## Corrected findings

| Area | Finding | WCAG | Resolution |
|---|---|---|---|
| Perceivable | Several 0.63–0.73rem muted labels measured 3.85–4.24:1 | 1.4.3 | Darkened to `#606979`, measuring at least 4.99:1 on paper |
| Operable | Primary navigation links lacked an explicit target height | 2.5.8 | Added a 44px minimum target height |
| Operable | Skip target was not programmatically focusable | 2.4.1 | Added `tabIndex=-1` to the main-content target |
| Robust | Transcript progress was visual only | 1.3.1, 4.1.2 | Added progressbar role, label, min/max/current values |
| Understandable | Empty search results had no direct recovery action | 3.3.3 | Added a keyboard-operable clear-filters action |
| Robust | Resource result changes needed explicit relationship | 1.3.1, 4.1.3 | Connected search to the live results summary |
| Operable | Motion transitions continued for reduced-motion users | 2.3.3 | Existing reduced-motion rule suppresses transitions and smooth scrolling |

## Contrast evidence

| Element | Foreground | Background | Ratio | Required | Result |
|---|---:|---:|---:|---:|---|
| Body text | `#111827` | `#f6f3eb` | 16.00:1 | 4.5:1 | Pass |
| Secondary text | `#455066` | `#f6f3eb` | 7.31:1 | 4.5:1 | Pass |
| Muted small text after correction | `#606979` | `#f6f3eb` | 4.99:1 | 4.5:1 | Pass |
| Lime accent on navy | `#c9f25f` | `#0b1225` | 14.50:1 | 4.5:1 | Pass |
| Cyan accent on navy | `#63d7e4` | `#0b1225` | 10.97:1 | 4.5:1 | Pass |
| Assessment choice text | `#d7deea` | `#0b1225` | 13.77:1 | 4.5:1 | Pass |

WCAG 2.2 requires visible focus at AA and introduces focus-obscured and minimum
target-size criteria. The site uses a 3px focus outline and 44px primary targets,
exceeding the 24×24 CSS pixel minimum described by
[W3C’s target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum).

## Existing accessible behavior

- Semantic header, navigation, main sections, footer, headings, lists, labels, and
  fieldsets/legends.
- Native radio controls and buttons for knowledge checks.
- Live result counts and status announcement after assessment submission.
- Keyboard focus indicator with high-contrast orange outline.
- Labeled progress bars and form controls.
- Reduced-motion behavior.
- No autoplay, timeout, drag-only, or pointer-path interaction.

## Manual test gate

Before public cutover, complete and record:

1. Keyboard-only traversal at desktop and mobile widths.
2. NVDA + Firefox/Chrome and VoiceOver + Safari smoke tests.
3. 200% and 400% zoom/reflow checks.
4. Touch target and orientation checks on a physical mobile device.
5. Assessment error/result announcement with screen readers.
6. Download behavior and filename announcement.
7. Forced-colors/high-contrast mode.
