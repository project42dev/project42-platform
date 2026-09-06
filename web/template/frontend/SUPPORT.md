# Support, compatibility, and deprecation

## Supported surface

The supported surface is the current deployment at <{{ORIGIN}}> and the latest
commit on this repository's default branch. Local development uses the Node.js
version named in `package.json` and the committed lockfile.

Raise a reproducible defect, accessibility problem, broken redirect, or
documentation correction at <{{SUPPORT_URL}}>. Include the affected route, the
browser or assistive technology, the expected behaviour, the observed
behaviour, and sanitized reproduction steps. Use the private process in
[SECURITY.md](SECURITY.md) for vulnerabilities — never the public tracker.

## Compatibility boundary

- This repository owns branding, configuration, copy overrides, and release
  records. Application behaviour shared by every deployment belongs upstream in
  `@project42/platform`.
- The deployment consumes a reviewed platform release resolved to an exact
  commit by the lockfile. Theme and layout bundles are pinned by SHA-256.
- Production output is a static artifact. The DNS and CDN layer in front of it
  is not an application runtime for this repository.
- Current Chrome, Edge, Firefox, and Safari releases are the browser target.
  Keyboard-only, screen-reader, reduced-motion, forced-color, 200% zoom, and
  narrow-viewport behaviour are release gates.
- Public routes listed in the redirect inventory are compatibility
  commitments. Removing a redirect requires an explicit migration decision and
  link validation.

The published release-facts file reports the deployed site, platform, and
content versions. A fork must validate its own platform dependency, domains,
redirects, branding, accessibility, and deployment configuration.

## Deprecation policy

{{ORGANIZATION}} favours additive changes and redirects. A planned breaking
change must:

1. document the affected route, integration, or supported environment;
2. provide a replacement or migration path;
3. state the first release that warns and the release that removes support;
4. update release notes, compatibility facts, tests, and rollback guidance; and
5. preserve a redirect when a stable public destination exists.

Emergency security removals may use a shorter notice period. The reason,
affected surface, mitigation, and recovery path must still be documented.

Unless stated otherwise for this deployment, the site is community-supported
and carries no uptime or response-time service level agreement.
