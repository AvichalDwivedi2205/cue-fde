# Repository and build provenance

Updated October 12, 2026.

## Canonical public source

[AvichalDwivedi2205/cue-b2c](https://github.com/AvichalDwivedi2205/cue-b2c)
is the authoritative repository for development and submission. Its 145
development commits were preserved, with their original identifiers and dates,
when the repository was made public. This documentation update is a subsequent
commit. No snapshot commits were presented as the full development history and
no artificial commit splitting or backdating was performed.

The earlier `cue-neathack-2026` public snapshot contained nine commits and did
not contain the full history. It is retired with a redirect to the canonical
repository. Existing historical links remain available.

Before publication, 962 reachable Git blobs, including source branches and the
existing Entire checkpoint, were checked against eight configured secret values.
No matches were found. Gitleaks 8.30.1 also scanned the complete reachable
history. Its six findings were inspected: two test-only fixtures and four
occurrences of explanatory prose, including copies in the redacted transcript.
No real credential was identified. Runtime environment files and private local
artifacts remain ignored. This is a publication check, not a security audit.

## Current deployed release

- Cue source: `0a96ead73323d3cc340afaf4f687826b522bf167`.
- Cue deployment: Cloud Run `cue-00042-max`, serving 100% of traffic when verified.
- Workspace: <https://cue.latchgrid.in/cue#/home>.
- Bloom: <https://bloom-with-cue.vercel.app>.
- Bloom source: `02c24e50d71457fc872c8f08f8b3735495b7478d`.

The release includes the integrated workspace design and Tailwind, published
company context and brand voice, shared knowledge retrieval for widget replies
and Growth drafts, customer answer outcomes, and an app-scoped knowledge-gap
queue. Voice and typed turns share the same customer conversation. Support and
qualification use Gemini; Growth writing uses Claude Sonnet 4.6 through LiteLLM.

The current release adds the supplied signal logo to the public landing,
workspace, React shell, favicon and Apple icon. Lint, typecheck, local and cloud
production builds passed. Five read-only checks passed on both preview and
production; the icons matched the supplied files exactly and operator endpoints
remained authenticated. Native Chrome inspection verified all three application
surfaces. See [the logo release record](verification-cue-logo-2026-10-12.md).

Verification retained for the underlying product release
`70033e31cd60bebb610d6953a3fb097f19325ec0`:

- 408 tests across 64 files, lint, typecheck, and the production build passed.
- 17 hosted release, stylesheet, authentication, and WorkOS PKCE checks passed.
- Six live widget checks passed: speech and audio, grounded typed follow-up in
  the same conversation, persistent negative feedback, retry idempotency,
  visitor/origin denial, and knowledge-gap handoff. Controlled records are
  excluded from customer counts.
- Ten live model calls completed without fallback: six Growth calls in three
  matched Gemini/Claude pairs and four support calls in two matched pairs.
  These calls verify functioning model routes and factual guards, not that one
  model is better than another.

The documentation commit does not redeploy or change the running application.
Private OAuth sync, verified customer account lookups, general multi-company
onboarding, and arbitrary-app autonomous fixes remain outside this release.
Organic Growth acquisition remains zero. A fresh full recording rehearsal has
not been certified, and no new demo video was created by this repository update.

## Entire

The official Entire CLI captures the genuine Codex build session. The checkpoint
documentation commit `878fb7b` carries its ID in an `Entire-Checkpoint`
trailer, and its checkpoint Git ref is published alongside the source.

Checkpoint ID: **`01M4R2NJSBS811SF9BFG13YA4F`**. The refresh captured 112 genuine
Codex session turns on October 12, 2026 at 12:51 UTC (18:21 IST), including the
latest product build and repository consolidation work available at capture.
It is one cumulative session capture, not a claim that all 145 development
commits were captured automatically.

- [Entire captured session](https://entire.io/gh/AvichalDwivedi2205/cue-b2c/session/01a129c7-7f3e-7e00-80a5-dbdbea47cf3c)
- [Published checkpoint record](https://github.com/AvichalDwivedi2205/cue-b2c/commit/6c13ec961da9d5c6348b6d34d7cb8e6e623fc361)

The six refreshed checkpoint blobs passed the configured-secret scan before
publication. Five generic-key scanner findings were copies of explanatory
prose, checked against the source documentation. Entire's configured credential
and PII redaction was applied to the exported transcript.

The GitHub App remains restricted to `cue-b2c`. Automatic Codex hooks still
require approval in `/hooks`; this refresh uses the official manual session
attachment command and does not claim automatic per-commit capture.
