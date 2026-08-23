# Legal and transparency requirements

> **Orchard deployment reality: see [How Orchard works](../../docs/design/orchard-two-track/how-orchard-works.md).**
> Verified 2026-08-13. The discovery engine has no schedule and ends by
> opening a GitHub issue. **Approvals ARE read, by a mechanism the design forbids** (see below). Item gates, ADO binding, publication and live verification are
> designed and not built.

**Status:** Draft; qualified legal review required before publication  
**ADO:** AB#6186–AB#6190  
**Surfaces:** `project-42.dev`, `learn.project-42.dev`, and
`guide.project-42.dev`

## Product intent

Project 42 needs one canonical, plain-language destination that tells a reasonable
visitor:

- who created and operates the project;
- what is free and open source;
- which licenses apply to software, curriculum, and third-party material;
- how AI models contribute to research, drafting, review, and maintenance;
- which decisions remain accountable human decisions;
- what users should expect from educational content, authentication, accounts,
  learner records, external links, and service availability; and
- how to find privacy, security-reporting, support, and source repositories.

The global footer label is **Legal & transparency**. The canonical page belongs on
the public site. Learn and Field Guide link to that page and provide contextual links
from account, consent, content-provenance, and reuse surfaces.

## Required truth claims

The final page should communicate these facts after the owner verifies the exact
legal names and ownership relationship:

1. Project 42 is a free, open-source AI learning project. Using a self-hosted copy
   can still incur infrastructure, model, network, or support costs.
2. The project was created by Kristopher Turner with Hybrid Cloud Solutions LLC.
   Counsel must confirm the precise creator, operator, copyright-owner, and
   attribution wording before publication.
3. Project 42 makes substantial use of AI models to discover changes, research
   primary sources, draft original material, review assessments, and independently
   check factual claims and citations.
4. AI output is not presumed correct and no model can approve, merge, deploy, or
   publish. Named humans remain accountable for review and publication.
5. Software is distributed under Apache License 2.0 unless a file says otherwise.
   Original curriculum is distributed under Creative Commons Attribution 4.0 unless
   a resource says otherwise. Third-party material and trademarks remain subject to
   their owners' terms.
6. A copyright notice applies only to protectable human-authored, selected, arranged,
   or modified contributions and other rights the claimant actually owns. It must not
   imply exclusive copyright in facts, ideas, methods, public-domain material, or
   purely AI-generated expression.

The AI disclosure should be a differentiator, not a claim of infallibility. Phrases
such as “published by AI” or “fact-checked by AI” are incomplete on their own because
they hide the human approval boundary and may imply unsupported reliability.

## Required service expectations

Subject to qualified legal review and applicable law, the page must clearly explain:

- the software, curriculum, guides, assessments, scores, badges, and service are
  provided **as is** and **as available**;
- content may be incomplete, stale, inaccurate, or unsuitable despite automated and
  human review;
- Project 42 is educational information, not legal, medical, financial, security, or
  other professional advice;
- access can be interrupted and features, routes, identity providers, model
  providers, or external links can change or disappear;
- an account may become unavailable because of identity-provider, email, policy,
  security, suspension, deletion, recovery, or operational events;
- reasonable backup and recovery controls do not guarantee that every account,
  attempt, score, transcript, badge, import, or other learner record can always be
  recovered;
- users remain responsible for exporting evidence they need and protecting their
  credentials, devices, recovery methods, and local copies;
- third-party providers operate under their own terms, privacy notices, service
  levels, licenses, and trademarks; and
- warranty disclaimers and limitations of liability protect the verified operator,
  creator, contributors, and licensors only to the maximum extent permitted by
  applicable law.

The page must not promise that legal text eliminates all risk or liability. Exact
limitation-of-liability language, governing law, venue, age requirements, dispute
terms, and any required consumer notices are counsel-owned decisions.

## Account and learner-data links

The legal page does not replace the privacy notice or consent flow. It links to the
implemented explanations and controls for:

- identity provider and sign-in;
- pending, approved, rejected, suspended, and revoked account states;
- profile and learner records;
- consent and policy versions;
- export and portability;
- deletion, retention, recovery, and backups;
- security reporting and incident communication; and
- acceptable use and account administration.

Optional consent must remain separate from acceptance of required service terms.
Neither surface may use preselected optional consent or a dark pattern.

## Accessibility and release behavior

- The footer link appears consistently on all public pages and works with keyboard,
  screen reader, zoom, reflow, high contrast, and reduced-motion settings.
- The legal page uses headings, short sections, a table of contents, and plain
  language, with the controlling license texts linked separately.
- The page shows an effective date and version. Material changes receive a change
  summary and, where required, renewed notice or consent.
- Routes, links, rendered output, keyboard behavior, and WCAG critical states are
  tested in every affected repository.
- Release evidence records the approved text version, production URLs, checks,
  reviewer disposition, and rollback point without publishing privileged advice.

## Approval gate

Publication is blocked until:

1. the owner verifies the operator, creator, copyright claimant, contact, and entity
   facts;
2. repository license and third-party-notice inventories are reconciled;
3. privacy/account language matches the deployed system;
4. a qualified attorney reviews the jurisdiction-dependent wording;
5. each affected pull request passes its full release gate; and
6. a named human approves the production publication.

## Authoritative references

- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- [Creative Commons Attribution 4.0 legal code](https://creativecommons.org/licenses/by/4.0/legalcode)
- [U.S. Copyright Office: Copyright and Artificial Intelligence](https://www.copyright.gov/ai/)
- [FTC advertising guidance for small businesses](https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business)

These references inform the requirements but are not a substitute for legal advice.
