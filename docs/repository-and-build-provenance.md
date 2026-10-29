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

- Cue source: `b49c358187454c2bf4cd287cdf3d6f8f6eef7345`.
- Cue deployment: Cloud Run `cue-00048-kic`, serving 100% of traffic when verified.
- Cloud Build: `1437f7fe-1a31-4507-9e90-62edefd833c4`, succeeded.
- Workspace: <https://cue.latchgrid.in/cue#/home>.
- Bloom: <https://bloom-with-cue.vercel.app>.
- Bloom source: `4a9481f11528621aae7c636f1b529996e5f0b560`.

The release includes the integrated workspace design and Tailwind, published
company context and brand voice, shared knowledge retrieval for widget replies
and Growth drafts, customer answer outcomes, and an app-scoped knowledge-gap
queue. Voice and typed turns share the same customer conversation. Support and
qualification use Gemini; Growth writing uses Claude Sonnet 4.6 through LiteLLM.

The supplied signal logo appears on the public landing, workspace, React shell,
favicon and Apple icon, and the existing Slack app now uses that logo. The
earlier workspace fixes passed 419 tests across 68 files, lint, typecheck and a
production build. The subsequent Growth prompt-budget fix passed its 45 relevant tests,
lint and typecheck. Its cloud build succeeded, and seven read-only checks passed
on both preview and production, including exact stylesheet and icon bytes and
authenticated operator endpoints. A genuine hosted Sonnet draft completed
without fallback after deployment. See [the original logo release record](verification-cue-logo-2026-10-12.md)
and [the recording plan](demo-recording-plan-final.md).

The latest Cue release fixes selected-case conversation history. It loads real
stored messages through the case index, checks the parent case's app scope, and
retains the legacy Bloom scope for cases without an app ID. Its verification
passed 43 scoped tests, typecheck, scoped lint and diff checks.
The earlier 419-test suite was not rerun for `b49c358`. The frozen source archive
passed its cloud production build; the exact built browser asset, release commit
and unauthenticated endpoint denials were verified before and after promotion.
Native authenticated browser checks then confirmed the original Email and Slack
reports, customer follow-ups and actual replies load in both legacy conversations.
The previous `cue-00046-tuj` release remains available as the fallback.

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
Organic Growth acquisition remains zero. The earlier native engineering
rehearsals a and b remain genuine historical evidence. The fresh recording-c run
`jn7c88jp2xnkqkvvphwrdq09x58g5ymx` also completed its actual widget report, Codex
patch, eight independent HTTP tests, exact-commit Slack approval and scoped
release. Its fixture fix is `ee431005102dbfed46ebaa71cae21b71997e85e2`, with
[PR #5](https://github.com/AvichalDwivedi2205/cue-bloom-demo/pull/5) and native
Slack approval receipt `p1791820226411299`. The original 3 MiB photo then passed
the journal retry, memory save and reload. These controlled runs are excluded
from customer and organic acquisition counts. Growth publication and the
same-browser first-save/caption-search activation are verified controlled
evidence. Video rendering and publication are separate from this evidence update.

## Entire

The official Entire CLI captures the genuine Codex building session. Commit
`08132130c457420586d0ec5704e42e057e4c28e9` carries the checkpoint ID in its
`Entire-Checkpoint` trailer. Its checkpoint ref is published alongside main.

Checkpoint ID: **`01M4RAVQZBH96V76R2QHD6GKZR`**. The refresh captured **152 genuine
Codex session turns** on October 12, 2026 at **15:14:30 UTC (20:44:30 IST)**.
The native session snapshot ends at 15:14:02 UTC and its application source is
`26e30384e0ddec0c24dc1953dadfb38fec42df90`. It is a cumulative session capture;
automatic capture of every development commit is not claimed. This checkpoint
precedes the latest `b49c358` release.

- [Entire captured session](https://entire.io/gh/AvichalDwivedi2205/cue-b2c/session/01a129c7-7f3e-7e00-80a5-dbdbea47cf3c)
- [Published checkpoint record](https://github.com/AvichalDwivedi2205/cue-b2c/commit/1eb9e9722c6cce153c2e47c436b771e2b137ca4b)
- Ref: `refs/entire/checkpoints/ZR/01M4RAVQZBH96V76R2QHD6GKZR`

The seven exported blobs passed a private scan for ten configured credential
values. Seven generic-key scanner findings were reviewed repetitions of
explanatory documentation prose, with no actual credential findings. Official
redaction was applied after a privacy-filtered native export replaced embedded
images and authentication-link queries with explicit omission markers. All
original native records, user messages and timestamps were retained before
redaction. The raw local Codex session was not modified or published.

The GitHub App remains restricted to `cue-b2c`. This refresh uses official manual
session attachment. It does not claim automatic per-commit capture.
