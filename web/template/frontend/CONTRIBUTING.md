# Contributing to {{ORGANIZATION}}

This repository holds the branding, configuration, copy overrides, and release
records for the {{ORGANIZATION}} front end at <{{ORIGIN}}>. The application
itself is installed from `@project42/platform` (v{{PLATFORM_VERSION}}) and is
not tracked here, so most contributions are changes to configuration, copy, or
governance rather than to product code.

## Before opening a change

1. Search this repository's existing issues and pull requests for related work.
2. Open an issue before adding a public route, changing a compatibility
   boundary, removing a redirect, or introducing a new dependency.
3. Keep the change inside this repository's ownership boundary. Product
   behaviour that is shared by every deployment belongs upstream in the
   platform, not in a local fork of an installed file.
4. Use primary sources for factual claims that can change, and record the date
   they were checked.
5. Do not include credentials, tenant or resource identifiers, private planning
   material, learner records, or personal information.

## Develop and verify

Use the Node.js version named in `package.json` and the committed lockfile:

```bash
npm ci
npm run dev
```

Run the complete gate before requesting review:

```bash
npm run verify
```

`npm run verify` audits dependencies, then validates the theme boundary, token
completeness, surface isolation, generated facts and assets, lint and type
safety, the production build, rendered routes, link integrity, the browser
suite, the static export artifact, and this repository's governance and release
documentation. A change that cannot pass the gate is not ready for review.

## Pull requests

- Keep a pull request focused, and explain the user impact, the root cause, and
  the validation you performed.
- Include tests for behaviour changes, and update documentation with the code.
- Preserve keyboard, screen-reader, reduced-motion, forced-color, mobile, and
  zoom behaviour.
- Preserve former public routes through the redirect inventory unless a
  reviewed compatibility decision explicitly replaces them.
- Prefer configuration and copy overrides to editing an installed platform
  file. Tracking a product file is a deliberate fork that you then own.
- Disclose material AI assistance, and remain accountable for sources,
  licensing, security, accessibility, and correctness.

At least one qualified reviewer must approve the change. Security, legal,
identity, learner-data, dependency, and compatibility changes require a
reviewer who owns that boundary.

## Content and licensing

Application code is Apache-2.0; see `LICENSE`. Reusable curriculum is
maintained upstream under CC BY 4.0 and should not be duplicated here. By
submitting a contribution you confirm that you have the right to contribute it
under the applicable licence.

Report vulnerabilities through the private process in [SECURITY.md](SECURITY.md),
never in a public issue. Supported versions and deprecation expectations are in
[SUPPORT.md](SUPPORT.md), and support requests belong at <{{SUPPORT_URL}}>.
