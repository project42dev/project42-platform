# Cosmic Answer publish-fidelity prototypes

These prototypes are browser-rendered production targets, not generative UI
illustrations. They preserve the current Public, Learn, Field Guide, and Profile
information architecture while applying the selected Cosmic Answer identity.

## Owner direction captured

- Use the cleaner Editorial Journey structure.
- Use the larger Learning Universe artwork from concept 03: a central star
  surrounded by six icon-led domains for data foundations, models, tools,
  agents, evaluation, and ethics/safety. Do not replace it with a numbered
  `42` centerpiece.
- Use the compact orbiting `42` header mark.
- Keep the profile/account icon at the top right.
- Use the profile icon as an accessible account-menu trigger. Support click,
  keyboard focus, and desktop hover; group Profile, My Progress, transcript,
  badges, learner-data export, authorized owner administration, and Sign out.
- Limit the primary header to Learn, Field Guide, Visual Guides, and About.
  Keep Legal, Privacy, and other policy destinations in the footer.
- Carry the Cosmic Answer starfield through the full page, with clean,
  high-contrast light cards and restrained translucent panels.
- Preserve the concept journey icons: first question, core-ideas planet,
  hands-on system, and mastery star.
- Do not show personal progress on the public gateway.
- Show progress on Learn and Profile.
- Preserve this product promise verbatim:

  > Project 42 makes artificial intelligence understandable from your first
  > question to your first reliable agent. Learn at your pace, check what you
  > know, and keep a record of your progress.

## Fidelity contract

| View | Preserved production capabilities |
| --- | --- |
| Public gateway | Three hero destinations, four trust promises, learning journey, Learn/Field Guide distinction, featured paths, provider-neutral coverage, final learning CTA, About/Legal/Privacy/GitHub footer |
| Learn | Learning entry points, account/profile access, signed-in progress snapshot, paths, lessons, exercises, demonstrations, knowledge checks, capstones, badges, transcript and portable records |
| Field Guide | Search, topic/provider/level/format/freshness filters, result count, resource metadata, provider labels, ownership, freshness and verification date |
| Profile | Account synchronization, learner identity and photo entry point, learning statistics, transcript, JSON/CSV portability, assessment attempts, capstone evidence and badges |

The prototype files are plain semantic HTML and responsive CSS. Production will
implement the same visual system in the existing Next.js components; generated
art is limited to the reusable Cosmic Answer hero asset.

## Files

- `prototype/index.html` — public gateway
- `prototype/learn.html` — signed-in Learn landing
- `prototype/guide.html` — Field Guide landing
- `prototype/profile.html` — learner profile and progress
- `prototype/styles.css` — shared responsive visual system
