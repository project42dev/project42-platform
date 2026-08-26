# Repo intent — project42-platform

**The open-source learning core and content model powering Project 42.**

## What this repo is

Contains the reusable contracts for Project 42 — not the private PMO records or
production configuration. Designed for people learning AI for the first time and
practitioners needing trustworthy, current references. Ships a standalone,
host-agnostic, white-label learning portal (Learn + Field Guide + Transcripts +
Admin) that can run with zero backend (static build) or via a turnkey Docker
Compose stack (web portal, Platform API, Keycloak identity/SSO).

## Shape

- `content/`, `schemas/` — the versioned content model (12 learning paths, 94
  assessed modules, 83 field guide resources as of this writing)
- `self-host/` — Docker Compose turnkey deployment
- `web/`, `src/` — the portal application
- `migrations/` — data model migrations
- White-label theming via `project42.config.json`

## How it relates to other repos

- **`project-42.dev`**, **`learn.project-42.dev`**, **`guide.project-42.dev`** —
  all three sites consume this repo's versioned content/contracts rather than
  duplicating them
- **`project42-gallery`** — themes for sites built on this core

## Status

Active — the canonical open-source core everything else in the org builds on.
