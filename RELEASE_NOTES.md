# Project 42 platform v0.104.2

A fresh clone failed its own lock check having changed nothing.

Cloning a scaffolded content repository on Windows and running `npm run content:check` — the first two steps of the adopter path — reported 41 differences against the hash lock:

```
Error: upstream/ differs from the curriculum locked at 55cce487…: changed 41
(training/ai-foundations/agents-and-guardrails/captions/en-US.vtt, …)
```

Nothing had been edited. The lock normalises line endings before hashing, precisely so a checkout difference is never mistaken for a content difference, but it decides what is text from a list of extensions and `.vtt` was not on it. The 40 caption files were therefore hashed as raw bytes, and git rewrote their line endings on checkout.

The list now covers every text form the curriculum is authored in — `.csv .json .md .mmd .py .svg .txt .vtt .yaml .yml` — and the same list in the platform's own `scripts/sync-content.mjs` is corrected with it.

Belt and braces: the content scaffold now ships a `.gitattributes` marking `upstream/**` as not-text, so the bytes the lock covers survive a checkout unchanged rather than relying on the normaliser to undo the damage afterwards. `project42-portal create` renames it on the way out, as it already did for `gitignore`, because npm will not publish either under its real name.

## For an already-generated content repository

The scripts are scaffolded files that repository owns, so this release does not reach them. Copy `scripts/sync-upstream.mjs` from the new scaffold, or add `".vtt"` to its `TEXT_EXTENSIONS`.

## Migrations

No file under `migrations/` was added or changed since v0.104.1.

## Breaking changes

None.

## Known limitations

Unchanged from v0.104.0: publishing a content change to a site is three commands, and a generated site's browser suite passes on `06-galactic-guide` but not on `05-open-orbit` or `07-quiet-lantern`.

## Rollback

Revert consuming sites to v0.104.1. The defect this fixes is in a scaffolded file rather than in anything a site installs, so a rollback changes nothing a running site does.
