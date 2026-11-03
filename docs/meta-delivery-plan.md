# Cue and LatchGrid delivery plan

## Objective

Deliver Cue's Meta-powered customer-to-fix workflow with LatchGrid as the private
customer application. Verify a real report, diagnosis, reviewed patch, preview
release, and original customer action after reload before recording the demo.

## Work status

- [x] Inspect current implementation and baseline checks.
- [x] Assign separate model, execution, and LatchGrid architecture reviews.
- [x] Compare design candidates and freeze shared contracts.
- [x] Verify dedicated Meta API credentials and selected models live.
- [x] Implement Meta routing and actual-provider evidence.
- [ ] Install Cue in LatchGrid and publish reviewed product knowledge.
- [x] Support LatchGrid's nested Bun application in the coding runner.
- [ ] Verify isolated execution and preview release acceptance.
- [ ] Verify the full browser journey and refusal paths.
- [x] Publish the initial implementation and bounded component verification.
- [ ] Report readiness for the user's demo recording.

## Delivery gates

1. Meta authentication and selected model work with a bounded live call.
2. A new LatchGrid widget report and screenshot persist under the correct app.
3. Diagnosis uses authorized evidence and preserves missing-evidence states.
4. A real reproducible LatchGrid defect fails an independent acceptance check.
5. Meta's coding agent proposes a scoped patch in a separate checkout.
6. Unchanged checks pass. Exact-commit approval and release remain separate.
7. Preview acceptance passes and the original user action persists after reload.
8. Wrong-origin/app access, protected edits, stale approvals, and failed release
   checks remain denied. Retried work does not duplicate customer actions.

## Verification baseline

Before implementation, 454 local tests across 77 files and TypeScript passed.
These results establish a local baseline only. Provider calls, hosted services,
approval events, preview releases, and customer outcomes require fresh evidence.

## Repository policy

Root serializes commits and pushes after inspecting each scoped diff. Cue changes
go to the public Cue repository. LatchGrid changes stay in its private repository.
Credentials, raw private-source diffs, and customer data stay outside public Git.
The existing documentation corrections remain part of the authorized work.

## Model and execution choices

Selected design: shared typed generation port, a Meta Responses coding loop,
and Modal workspaces managed by the trusted supervisor. Legacy coding runs retain
their recorded executor. New generic runs freeze Meta and the repository policy
when created. LatchGrid uses a small public widget installed at the root layout;
its source remains private.

On November 3, the dedicated server key returned HTTP 200 from both live probes:
Muse Spark 1.3 produced strict-schema JSON, and Muse Wonder 1.0 emitted the
requested function call through the Responses API. Both reported the requested
model and nonzero token usage. These probes establish model access, not product
readiness. The Meta dashboard's billing restriction banner remained visible.

Modal credentials were created with a 30-day lifetime. The approved $100 credit
redemption was submitted; application of those credits remains unverified.
The user-provided Baseten key returned HTTP 200 from Muse Spark Open with actual
usage. It is a tested optional route, not an automatic application fallback or
proof of an open-weight project. Fireworks is unused.

The private LatchGrid baseline has 238 passing default tests, type checking and
linting. A separate acceptance harness uses the real React Flow deletion engine
and application callbacks: menu deletion persists, while keyboard deletion fails
the saved-state reload assertion. The defect is still present; browser and live
database verification remain required.

Workers follow [the delivery contract](meta-build/SKILL.md). Root records design
selection and release evidence here as each gate passes.

## Hosted checkpoint: November 3, 2026

Public Cue source [1136763](https://github.com/AvichalDwivedi2205/cue-fde/commit/1136763)
is pushed in a draft pull request. At this checkpoint, 565 tests across 87 files,
TypeScript, lint, and a production build passed. Lint retains six warnings.
The production dependency audit reported zero known vulnerabilities. This is a
point-in-time audit, not a guarantee against unknown vulnerabilities.

The hosted gateway serves this source with the Meta configuration. A separate
IAM-protected coding worker is online. Live tests deny wrong origins, unknown
apps, forged visitor sessions, malformed images, and anonymous operator access;
these rejected requests created no cases.

The controlled private customer preview uses the registered customer subdomain.
Its fixed source passes locked Bun installation, TypeScript, and 238 default
tests in a network-blocked Modal workspace. The separate keyboard-deletion
acceptance check fails its saved-state reload assertion; the menu control passes.
These checks do not establish a real browser deletion or a verified fix.

The embedded widget currently appears blank in the automated Chrome session.
The same widget URL renders correctly at the top level, and the server returns
HTTP 200 with the preview origin allowed by its framing policy. Native browser
inspection is pending because the computer tool reports the Mac is locked.
No cause is established. The fresh widget case, actual Meta patch, exact-commit
review, released acceptance, and customer retry remain incomplete.
