# Project 42 platform v0.115.0

Asking for an account is something you can find, and the owner hears that you asked.

**Requesting an account is one step from the signed-out header.** The request had always existed, on `/account`, and nothing in the site named it. Signed out, the route was: open the profile menu, read past "Sign in" — which starts the same flow but reads as something only an account holder does — choose "Account", then scroll past the card addressed to existing learners. Four steps, none of them named for the thing being looked for. "Request access" now sits in the header and in the profile menu, both going to that same section, which the page leads with when you are signed out and which says what happens next, how long it takes and how you find out. It is not a second path; it is the path that was already there, finally named. The offer appears only when the site is certain that nobody is signed in: an unknown session, or a self-host with no account service, does not show it, because inviting an approved learner to request an account tells them their account does not exist.

**An approved learner was shown the request form again.** When an owner approves or declines a request, the waiting browser's receipt is revoked, so its next status check returns a 401 — the same answer a browser that never asked would get. The page resolved that toward "never asked" and offered a fresh request form to somebody whose answer had already arrived. It now remembers that this browser has an open request, in a marker holding no identity and no secret, and tells an approved learner to sign in. The marker is written by any browser that successfully reads a receipt, so it no longer matters whether the person pressed "Sign in" or "Request an account": both start the identical flow, and both leave you just as pending.

**The owner is told that a request exists.** Creating a request enqueued a notification for the owner, but nothing drained that outbox except an owner opening the Admin console and dispatching by hand — which is almost certainly why the pending queue had never been used. The Worker's daily tick now drains owner-directed notifications, so that cadence is the longest an owner waits. Learner-directed notifications are still deliberately not sent: `/account` promises a learner that nothing is sent to them automatically and that signing in again is the answer, and that promise is kept.

This release also wires in two test surfaces that existed and ran nowhere — including `test:pages`, the only thing that exercises the service worker and the manifest against the artifact a site actually ships — and deletes two files that nothing anywhere referenced.

## Breaking changes

None.

## Migrations

None.

## Known limitations

Owner alerts are delivered only where `ACCOUNT_NOTIFICATION_DELIVERY` is configured. On a self-host, and on any hosted deployment that never set delivery up, the drain logs that fact and does nothing, so the Admin console remains the way a request is noticed. Learners are still told nothing automatically, by design. The `test:pages` wiring reaches new adopters and re-materialised sites; `project-42.dev`'s own `package.json` is hand-maintained in a different repository and needs the same line added there. `web/tests/device-local-progress.test.mjs` and `web/tests/progress-reconciliation.test.mjs` stay unwired here: both import a catalog file that only a materialised install has, and the platform deliberately does not build `web/`.

## Rollback

Pin 0.114.2.

---

# Project 42 platform v0.114.2

Follows 0.114.1. The device matrix carried an assertion marked as a known failure because no surface offered the last-opened module back. Resume shipped in 0.114.0, so that assertion started passing and Playwright failed it on all eighteen devices for passing — which is precisely what the annotation existed to do. The annotation is gone and the assertion now gates the feature on every device.

The one remaining annotated failure is genuine and unchanged: on a phone in landscape the open navigation fills the viewport, so the About panel opens below the fold. That is an information-architecture decision, not a defect a test should settle.

## Breaking changes

None.

## Migrations

None.

## Rollback

Pin 0.113.0.

---

# Project 42 platform v0.114.1

A one-word fix on top of 0.114.0: the new device-matrix spec named a local variable `module`, and Next's lint refuses that in any file it checks. The site materialises these specs into its own tree, so 0.114.0 could not pass the site's verify at all. Nothing else changed.

## Breaking changes

None.

## Migrations

None.

## Rollback

Pin 0.113.0; 0.114.0 cannot be consumed by the site.

---

# Project 42 platform v0.114.0

The site keeps your place, and keeps your work.

**One learner's account could be overwritten with another's empty record.** Reset progress, sign out while the save is still pending, and the next person to sign in on that browser had their account written over with an empty one. Every per-learner reference stayed armed at sign-out, so the pending save survived the change of learner and React never re-rendered to cancel it. Deterministic, not a race.

**Work no longer dies on the way out.** Answering a question and immediately closing the tab, navigating away, or switching apps lost whatever sat inside the 800ms save delay, because nothing flushed on unload. It flushes now, on `pagehide` and on the page being hidden, with a transport that survives the document. A save the server rejects for a reason worth retrying is retried with backoff and on reconnect; one it rejects on content is not.

**Resume where you left off, signed in or not.** The site remembers the module you were on and offers to continue it, and finishing a module offers the next one rather than the one just passed. A signed-out visitor's place lives in their browser and merges into their account when they sign in. Their account record is never written to the device.

**Every learning path can be found by clicking.** Six paths and twenty-two modules — including everything authored on 11 September — existed, rendered and sat in the sitemap, but the paths page grouped by a field no path set and fell back to a hardcoded list that omitted them.

**The About menu opens on tablets.** The header's nav row clipped its panel between 761 and 960 pixels in every browser: every tablet held upright.

This release also carries an eighteen-project device matrix — Chromium, WebKit and Firefox across phones, tablets and desktop — that asserts the menus open unclipped, nothing scrolls sideways, tap targets are reachable and the installed-app surface resolves.

## Breaking changes

None.

## Migrations

None.

## Known limitations

Signing out inside the save delay still loses that record: the sign-out destroys the session server-side before the flush could land. A failed write followed by a reload can still lose work once the device copy has been cleared; the retry, the reconnect listener and the unload flush narrow that window rather than closing it. `keepalive` behaviour is held by a source assertion, not an end-to-end test — a browser harness cannot answer a request issued from a document being torn down.

## Rollback

Pin 0.113.0.

---

# Project 42 platform v0.113.0

Signing in lasts, the header stops guessing, and work done during a session renewal is kept.

**The seven-day sliding window never slid.** The read path updated only `last_seen_at`; the only thing that extended a session was a timer scheduled seven days ahead, which requires the tab to stay open for a week. So every learner was hard-expired a week after signing in no matter how often they came back. Reading the session now extends it, capped by its absolute expiry, writing only when the gain is worth a write, and re-issues the cookie. The token is not rotated, so two tabs cannot race.

**The header claimed "signed out" whenever it did not know.** The session lives in an HttpOnly cookie no script can read, so the front end must ask the API — and any failed read, including a 502 or a dropped connection, set an error state that the profile menu rendered as signed out. Worse, the route guard started a sign-in from that same error state, and the sign-in request forces a full credential prompt. A single failed read was enough to be thrown at a login screen while holding a perfectly valid session. The account state is three-valued now: signed in, signed out, or unknown, and unknown offers "Try again" rather than destroying the session.

**Progress recorded during a renewal survives it.** When a session renews mid-visit, the app re-reads the account; that response used to replace local state and cancel the pending write of whatever had just been answered. It merges now, through the same function the offline flush uses.

## Breaking changes

None.

## Migrations

None.

## Known limitations

iOS 16.4 and later give a home-screen app its own cookie store, so a sign-in performed in Safari does not reach the installed app; signing in once inside the installed app is the mitigation, and nothing in this repository can change that. A 401 `account_not_registered` — a session that resolves against no active identity row — still presents to the client as signed out.

## Rollback

Pin 0.112.3. The session extension is a Worker change: rolling back the Worker restores the old expiry behaviour without data loss.

---

# Project 42 platform v0.112.3

The header menus open on an iPhone.

The profile menu did nothing on iOS: the button reported itself expanded and the panel never appeared. `.site-header` carried `overflow-x: clip`, and the panels hang 188 pixels below a 67-pixel header. Chromium and Gecko clip only the axis named, so every desktop journey passed; WebKit clips both, so on iOS the panel was cut to nothing. The rule had been there since the front end first shipped and bought nothing — no header content reaches the right edge at any width from 320 to 1440.

The mobile journeys now run on WebKit at iPhone SE and iPhone 14 sizes, tap with real touch events, and assert that no ancestor of a menu panel clips on either axis. The behavioural half of those tests passes even on the broken CSS, which is precisely how this reached a phone; the clip assertion is the one that fails.

## Breaking changes

None.

## Migrations

None.

## Known limitations

Verified by emulation and by the documented WebKit behaviour, not on a physical handset. A related rule, `.site-header nav { overflow-x: auto }`, still clips the About menu between 761px and 960px in every engine; that nav row is a deliberate horizontal scroller and wants its own change.

## Rollback

Pin 0.112.2.

---

# Project 42 platform v0.112.2

The borders the site actually draws are visible enough to see.

`portal-default` is the bundle the portal serves, and eight of its border pairs failed the 3:1 non-text contrast minimum — a card edge at 1.23:1 against the card it sits on. The Gallery's seven themes were raised to 3:1 on 2026-09-11; nothing measured this one, because the Gallery's validator only scans the Gallery. The platform now runs that same validator over every bundle it ships, including the frozen `06-galactic-guide` copy, which carried seven more failures of its own. Only lightness and alpha changed; no hue moved.

## Breaking changes

None.

## Migrations

None.

## Known limitations

The `@layer p42-fallback` card border in `globals.css` is 1.68:1. It is the pre-theme last-resort value rather than a bundle, so this gate does not measure it, and it is owned by the boundary gate instead.

## Rollback

Pin 0.112.1.

---

# Project 42 platform v0.112.1

Code samples in the OpenAI and Gemini practice paths teach what each section says.

Fourteen modules had one generated sample — a `chat.completions` call with `gpt-4o` and `json_object`, or a single `generateContent` call — pasted into every section. All 63 are rewritten against documentation read on 2026-09-11: tool routing by execution owner, bounded tool loops matched by call id, strict schemas, side-effect safety, Codex sandboxing and approvals, evaluation contracts, moderation, and migration from Chat Completions to Responses. The Gemini modules move to the Interactions API, which Google made generally available in June 2026, and the Gemini API module explains when the legacy `generateContent` is still the right choice.

## Breaking changes

None.

## Migrations

None.

## Known limitations

As in 0.112.0: the hosted persistence gate needs its smoke account, secrets and variables before it can pass.

## Rollback

Pin 0.112.0.

---

# Project 42 platform v0.112.0

Every module a learner can reach is real curriculum, and self-hosted installs save progress.

**The last 21 template modules are written.** Six learning paths — AI literacy and mental models, agentic systems and MCP, developer and practitioner AI, self-hosted AIOps, RAG and fine-tuning engineering, and AI security and governance — were made entirely of generated placeholder text. Each module now has sourced technical content, an instructor script whose captions and transcript match its cues, and at least five knowledge checks. Every citation was fetched and read on 2026-09-11 against the text that cites it. Two sources had moved on since the templates were written, and the modules follow the current versions: OWASP's 2026 Top 10 for LLM applications, and the EU AI Act dates as amended by Regulation (EU) 2026/1744.

**Self-hosted PostgreSQL accepts the front end's saves.** D1 migration `0020` widened the `progress_imports` source `CHECK`; PostgreSQL never got the equivalent, so every signed-in save on a self-hosted install aborted on the constraint. Migration `014` brings it level, and a parity test fails if the two stores, the Worker and the learning-event contract disagree again.

**The progress-flush regression is now caught here.** `planUnsyncedProgressFlush` holds the decision `ProgressProvider` makes when an account read finally succeeds, and a test replays the seven-page-load sequence that lost data in 0.110.0 and 0.111.0.

## Breaking changes

None.

## Migrations

PostgreSQL self-host: `014_account_backed_progress_source.sql`. D1: none beyond `0020`.

## Known limitations

The hosted persistence gate needs a password-capable smoke account, the `PROJECT42_HOSTED_SMOKE_*` secrets and the `PROJECT42_HOSTED_*` variables. Until they exist it fails on schedule by design. Keycloak `26.7.3` carries a deferred Netty advisory that is not reachable in the shipped topologies; see `self-host/.trivyignore.yaml`.

## Rollback

Pin 0.111.1. Do not roll back to 0.110.0 or 0.111.0. PostgreSQL `014` only widens a constraint and is safe to leave in place.

---

# Project 42 platform v0.111.1

Progress completed while an account read is still pending is added to the learner's record instead of replacing it.

0.110.0 fixed a real defect -- one failed `GET /v1/me/progress` ended every later write for the session -- by buffering what the learner did until a read succeeded. The flush was wrong. When the read came back, the provider applied the buffer with `setProgress(buffered.progress)`, and the buffer had been built on the empty progress the provider holds before its first read. The learner's hydrated record was thrown away and that partial record was written over it. Opening a module and answering before the read returns is enough: a learner who completed seven modules on seven page loads kept only the seventh.

The flush now merges with `mergeLearnerProgress`, the same function account merges use, so every attempt, completion and badge the read returned is kept and only the evidence recorded while the session was not yet writable is added. The Project 42 portal's provider-journey and reliable-agent browser journeys fail on 0.110.0 and 0.111.0 and pass on this release.

## Breaking changes

None.

## Migrations

None beyond 0.111.0. Deployments coming from 0.109.0 or earlier still need D1 migration `0020`.

## Known limitations

The platform's own suite does not exercise this path; the regression is caught by the portal's browser journeys. A platform-level test for the provider's hydration and flush ordering is owed.

## Rollback

Do not roll back to 0.110.0 or 0.111.0. Pin 0.109.0 if this release must be withdrawn.

---

# Project 42 platform v0.111.0

The review dates the site shows are the ones the curriculum actually earned, and every one of them is current.

**Served dates were ones the content repository had already disowned.** On 2026-08-22 a commit set every citation's review date to `2026-08-23` with no review behind it. `project42-content` rolled that back on 2026-09-06, but the platform's installed copy was synced the day before, so production kept telling learners that 598 sources were checked on a day nobody checked them. The platform now installs content that carries the true dates, and `content:currency` compares what the platform serves against `project42-content` directly, so the two copies cannot quietly diverge again. A null review date is rejected as malformed rather than read as "unknown".

**Every stale claim was re-read, not re-dated.** Honest dates made 373 citations fail their review cadence. Each cited page was fetched and read against the text of the module or resource citing it; 390 citations were confirmed, 26 were repointed to where the same page now lives, two retired registry hosts were updated (`cursor.com/docs`, `owasp.github.io/API-Security`), and prose that a source no longer supports was corrected: MCP deprecated the sampling and logging client primitives in protocol `2026-07-28`, and Anthropic no longer documents a Console Evaluation tool. `content:freshness` reports 599 current, 0 stale, against `project42-content@d1fcc2b`.

**Learner progress saves.** 0.110.0 accepted the front end's `account-backed-v1` source in the API contract, but a `CHECK` constraint on `progress_imports` still refused it inside the same D1 batch that writes `module_progress`, so every save failed with a 500. Migration `0020` rebuilds `progress_imports` in place with a `CHECK` that also admits `account-backed-v1`, `legacy-hosted-v1` and `account-merge-v1`, preserving existing rows, and the Worker now validates sources against the single exported `PROGRESS_IMPORT_SOURCES` list and names the supported values when it refuses one.

**Also in this release**

- `model-context-protocol-mcp` is authored: sourced technical content, a full instructor script, and four knowledge checks in place of template text.
- The six acceptance criteria are written down in `docs/definition-of-done.md`, and `docs/decisions/` records the four architecture decisions that were previously only in session history.
- The self-hosting theming guide describes the three-layer theme model that actually ships.
- Hardcoded radius and tracking values in core fell from 102 to 53; the theme ramp steps core wrote by hand are published tokens.
- Diagram step transitions keep text contrast.

## Breaking changes

None.

## Migrations

Apply `migrations/0020_account_backed_progress_source.sql` before deploying this Worker. Without it, every account-backed progress save is refused by the database. Hosted production already has `0017` through `0020` applied.

## Known limitations

The progress fix is D1-only. The PostgreSQL self-host schema (`self-host/postgres/001_initial.sql`) carries the same two-value `CHECK` on `progress_imports` and no PostgreSQL migration widens it yet, so account-backed saves on a PostgreSQL deployment are still refused.

`0.110.0` was tagged without moving `self-host/compatibility.json`, the changelog or these notes past `0.109.0`, so its release job could not pass `release:check`. Its changes ship here.

A 30-day review cadence covers 31 of 61 registered sources, so the dates confirmed on 2026-09-11 begin to fall due on 2026-10-11. `docs.vllm.ai` serves a Cloudflare challenge to automated readers; its citation was verified from the page's source in `vllm-project/vllm`. 21 modules in six learning paths are still template text.

## Rollback

Pin the previous platform version. The content and documentation changes revert with the package. Migration `0020` only admits additional source values and preserves every row, so it is safe to leave in place under 0.110.0.

---

# Project 42 platform v0.109.0

The site is usable on a phone.

It had a manifest, a service worker, `apple-mobile-web-app-capable` and `viewport-fit=cover`. Every box was ticked and it was still bad on an iPhone, because the tags were never what was wrong. What follows was measured on real iPhone SE, iPhone 15 and iPhone 15 Pro Max profiles, portrait and landscape, under WebKit -- the engine Mobile Safari actually uses.

**Headings could not get smaller than a desktop size.** Every heading family is sized with a `clamp()` whose FLOOR is a desktop measurement -- `clamp(3.4rem, 7vw, 7.3rem)` cannot resolve below 54.4px, because on any phone the `7vw` term is smaller than the floor and the floor wins. A module page rendered a 54px heading with -0.075em tracking into a 226px column: one word per line, `document.scrollWidth` at 344px against a 320px viewport, and the last word clipped off the right edge. Phone type ramps now sit under `(max-width: 760px)`, and each is chosen to resolve to exactly the floor it replaces AT 760px -- so the seam is continuous and nothing at 761px or wider renders differently.

**The navigation was the first screen.** At phone width the primary nav wrapped into a two-column block occupying roughly 330 of the 568 visible pixels on an iPhone SE, and "Start learning" was `display:none` on every phone. You landed on the site and saw the site map. The nav now collapses behind a 44px disclosure with the action restored as its first item. The links stay in the served HTML and are hidden with CSS, never conditionally rendered, so the link checker, the Pages export and crawlers still see every destination.

**Nothing you had to tap was big enough to tap.** Nine footer links per page at 23.2px tall -- core declared the 44px minimum and `portal-default` reset it to 0 for a tighter desktop footer. The Field Guide card's only action at 45x18px. Module citations at 19px. Breadcrumbs at 18px. All are 44px on a phone now, and the footer minimum is restated in the bundle that gave it away.

**The installed app had an invisible status bar.** `apple-mobile-web-app-status-bar-style: black-translucent` forces the clock and battery glyphs white, and `portal-default` paints a white ground. It is `default` now, which follows the system appearance on a light bundle and on a dark one; `viewport-fit=cover` still lets the page fill the cutout. `<body>` and `.site-footer` were each applying `safe-area-inset-bottom`, stacking two insets under the home indicator; the footer applies it once.

**The home page cost 432.7 KB on cellular.** 90.6 KB of that was a decorative `hero.png`, fetched on the home page and on `/learn/`, and 99.9 KB was a `/guide/` RSC prefetch on every first paint for a link most readers never tap. A phone now gets the hero plate without the picture, and no `/guide/` link prefetches.

**A gate so it cannot come back.** `web/tests/browser/mobile-viewport.spec.ts` runs under WebKit on an iPhone SE, from a new `mobile-webkit` Playwright project. It fails on horizontal overflow, on a heading wider than its own box, on any control under 44x44 CSS px, on a missing safe-area rule for a pinned element, on a nav that is not a disclosure at phone width, and on a text field small enough to make iOS zoom on focus. The chromium project ignores that file and the new project runs nothing else, so neither suite can pass at a width where it proves nothing.

## Breaking changes

None. Every rule added is scoped to `(max-width: 760px)` or is a new class that only renders at phone width, so no viewport of 761px or wider changes.

Adopters running the browser suite in CI must install WebKit alongside Chromium: `npx playwright install --with-deps webkit`.

## Migrations

None. No database, API or content change.

## Known limitations

The safe-area half of the gate reads the CSSOM rather than computed styles. `env(safe-area-inset-*)` resolves to `0px` in every engine under Playwright -- there is no notch to emulate -- so a computed-style assertion would pass on a page with no safe-area handling at all. Whether the installed app genuinely clears the notch can only be confirmed on a device.

`/guide/` still serves a 100 KB HTML document. That is a content-structure question, not a phone one, and is left.

The hosted Entra sign-in page reached from `/profile/` carries controls below 44px. It is Microsoft's markup, not the portal's, and is excluded from the gate.

## Rollback

Pin the previous platform version. Nothing outside the package changes, so a site reverts by reinstalling.

---

# Project 42 platform v0.106.1

The default theme stops being somebody else’s brand.

v0.105.0 made the product ship its own appearance, and that was right. What it shipped as the default was `06-galactic-guide` -- a Gallery theme, copied into the package. So every fresh install rendered in one operator’s livery, and "the default look" and "the Galactic look" became the same sentence. A Gallery theme is a CHOICE. It cannot also be the thing you get when you have not chosen.

**The platform now ships `portal-default`.** A white page, hairline rules, one slate-blue action colour, system type, no ornament. It is the stock theme in the sense Hugo and Jekyll mean it: what a brand-new site renders with before anybody has decided anything, complete enough that the first thing an operator sees is a finished site rather than an unstyled one. It is not in the Gallery and never will be.

It is a complete bundle, not a placeholder. All 48 tokens core reads, every component treatment the portal renders, the heading ramp bound to the layout track tokens, and the four surfaces core stopped painting in v0.105.0 -- the hero plate, the landing ornament, the footer tap target, and the primary action fill. Every foreground/background pair it declares is at or above 4.5:1.

**`project42-portal create` selects it,** with no `--theme` flag needed. `06-galactic-guide` still ships and is still a theme anyone can select; it is simply no longer what you get by default.

**One fix made the swap a one-line change.** `materialise` resolved `availableThemes` and nothing else. `availableThemes` is the switcher’s menu; `theme` is what the site renders, and the two are not the same list -- a site that offers the six Gallery bundles but renders the shipped default names that default in `theme` alone. Such a site installed six bundles and not the one it had actually selected, then rendered on fallback values with every gate green. The selected theme is now always resolved, and `tests/web-distribution.test.mjs` fails if that regresses.

Verified by building a real site both ways and reading computed styles off `/`, `/learn`, `/learn/paths` and `/about`, all 200: changing the one `"theme"` field moves the page ground, the body and heading typefaces, every heading colour, the primary action fill and shape, the eyebrow treatment and the card surface -- and changing it back restores the Galactic rendering exactly.

## Fixed after the first cut (v0.106.1)

Building the real site on `portal-default` found three things the first cut missed, all of them the same shape: a decision core hands the bundle, which a light-accented theme never has to make.

Core fills `.cta`, `.pillar-reference` and `.pillar-ondemand` with the accent, then chooses every text colour inside them for the PAGE ground, and dims the card index to 0.65 and the list to 0.75 without restoring either. On Galactic mint accent with dark text that reads fine. On any accent dark enough to need light text the whole panel falls below 4.5:1 -- 309 axe violations across three suites. `portal-default` now names `--p42-accent-fg` on those panels and takes the opacity back. Core also leaves `justify-content` unset on the header disclosure, so its links compute `normal`; the bundle sets `flex-start`.

And one gate: the browser conformance suite derived every colour and the heading face from the selected bundle, but still asserted `toContain("Inter")` for the body face -- 06-galactic-guide’s own. Any bundle naming another body face failed a required gate for no reason beyond not being that theme, which is the very defect that suite was rewritten to remove. It now reads `--p42-font-body` like the rest.

## Breaking changes

None for an existing site: it names its theme explicitly and keeps rendering it.

A NEW scaffold now renders `portal-default` instead of `06-galactic-guide`. Pass `--theme 06-galactic-guide` to `project42-portal create`, or set the `theme` field afterwards, to get the previous behaviour.

A site whose `theme` is not listed in `availableThemes` now installs that bundle, where before it silently did not. Nothing that worked stops working.

## Migrations

None. No database, API or content change.

## Known limitations

`portal-default` lands in `public/themes/` on every install, like `app/`. A consuming repository must git-ignore it: tracking a platform-shipped bundle makes `materialise` read it as vendored and refuse to refresh it, freezing the default at the version first committed. The scaffolder template already ignores `/public/themes/`; a site predating that template needs the entry added.

The Gallery preview matrix does not yet carry `portal-default`, because the Gallery holds Gallery themes and this one is not one. Previewing the product default beside the themes on offer is unsolved.

## Rollback

Pin v0.105.0 and set `"theme": "06-galactic-guide"`. Nothing outside the package changes.

---

# Project 42 platform v0.105.0

The product ships its own look, and core stops painting one.

A Project 42 site could not have an appearance without reaching for the Gallery. The theme and layout bundles lived only in project42-gallery, arrived through a sync script, and were pinned by a hash lock the build verified -- so a fresh scaffold rendered unstyled until someone checked the Gallery out, and a running site could change appearance underneath its owner when a bundle was re-synced. At the same time core CSS was painting things a theme is supposed to own, so a theme could not actually change them.

Both halves are the same defect: appearance had no single owner.

**The product now ships a complete appearance.** A theme bundle and the three layout bundles live in the package. Installing the platform installs a finished look, with no Gallery checkout, no sync step, no lock file and no network.

**A theme is a folder.** Download one, drop it in at `themes/<id>/` in your own repository, and name it in the single `"theme"` field of `project42.config.json`. Nothing else changes -- not the code, not a build script, not a manifest, not a lock entry. Resolution is: your own folder, then a bundle you already pulled from the Gallery, then the platform default. A theme nothing provides fails the install and says which folder to create.

**Core declares no brand.** Measured over `web/app/globals.css`: 4,106 declarations, 2,667 structure, 1,338 appearance. The appearance that was pinned to a value core had no business choosing has moved to tokens the bundle owns -- 27 places an accent or brand fill was read as text, 31 typefaces named inline, 28 pill radii, nine ramp tracking values, nine `white` fills. `--p42-text-accent` and `--p42-text-emphasis` are the substantive pair: an accent is a fill colour, and read as body copy it can fail contrast while passing its own contract -- which is how near-black text landed on a near-black panel at 1.04:1 in production. Both default to the fill in use today.

**A gate keeps it out.** `npm run theme:boundary` fails on a colour literal, a brand colour used as text, a typeface named inline, a token pinned to a literal outside the fallback layer, and any new hardcoded radius or letter-spacing. Run against core as it stood before this release it reports 65 violations; against core as it stands now, none.

Verified unchanged: 121,231 computed style values across 15 routes, captured from real builds before and after, differ in one place -- an in-flight transition opacity sampled microseconds apart.

## Breaking changes

None for a site that vendors its Gallery bundles: those keep resolving from where they already are.

A site that names a theme no folder provides now fails `npm install` instead of building an unstyled page. Drop the theme folder in at `themes/<id>/`, or name one the platform ships.

Theme bundles must declare seven further tokens -- `--p42-text-accent`, `--p42-text-emphasis`, `--p42-font-body`, `--p42-font-mono`, `--p42-font-mono-display`, `--p42-font-serif` and `--p42-surface-inverse` -- or `tokens:check` fails for them. The bundle the platform ships declares all seven; a Gallery bundle must be republished with them.

## Migrations

None. No database, API or content change.

## Known limitations

Core still carries 102 hardcoded radius and letter-spacing values, 38 distinct. None matches a step in any published layout ramp, so collapsing them would change the rendered page; they are recorded in `web/scripts/appearance-debt.json` and the gate lets the list shrink but never grow.

The Google Fonts `@import` at the top of `web/app/globals.css` still loads the brand typefaces from core, and is the one network dependency the build has. Moving it into the bundle risks a visible change in how type loads, so it is left.

## Rollback

Pin the previous platform version. Nothing outside the package changes, so a site reverts by reinstalling.

---

# Project 42 platform v0.104.3

The curriculum stops being downloaded by browsers that never render it.

Three client components track a learner's progress — `ProgressProvider`, `ProfileDashboard`, `ProgressSnapshot` — and each was handed the whole catalogue. The progress API reads eight fields from it: `contentVersion`, a path's `id`, `title`, `moduleIds` and `badge`, and a module's `id`, `title` and `capstone`. Every module body, knowledge check and source list travelled with them into the browser as the single largest chunk in the bundle.

It had been that way as long as those components have existed. Splitting the catalogue into its own module in v0.104.0 made it visible rather than causing it, by putting the same 1.3 MB in two chunks at once.

Projecting at run time would not have helped: a projection computed from the full object still has the full object in the module graph. So `materialise` generates the projection — the curriculum's shape without its content — into `lib/progressCatalog.generated.ts`, which imports nothing, and `lib/progressCatalog` is what a client component reads.

Measured on the generated template, same build, same content:

| | before | after |
| --- | --- | --- |
| client total | 3,535,749 bytes | 993,821 bytes |
| largest chunk | 1,306,327 bytes | 199,967 bytes |
| projection | — | 48 KiB of the catalogue's 1,625 KiB |

A gate in `tests/web-distribution.test.mjs` fails any `"use client"` module that imports `lib/catalog` directly. It is a direct-import check; the performance budget in a consuming repository is what catches a client component reaching the catalogue through an intermediate module.

## Adding a field

The projection is one function in `bin/project42-portal.mjs`. A progress feature that needs a field the projection does not carry must add it there, and the type cast on the generated value is why that is a deliberate act rather than something that happens by accident.

## Migrations

No file under `migrations/` was added or changed since v0.104.2.

## Breaking changes

None.

## Known limitations

Unchanged from v0.104.0: publishing a content change to a site is three commands, and a generated site's browser suite passes on `06-galactic-guide` but not on `05-open-orbit` or `07-quiet-lantern`.

## Rollback

Revert consuming sites to v0.104.2. They regain 2.5 MB of client payload and lose nothing else.
