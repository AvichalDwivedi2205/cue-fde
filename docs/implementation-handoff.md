# Cue and Bloom implementation handoff

Prepared October 11, 2026. Paste the prompt below into a new chat, or tell the new agent to read this file in full. This records inspected repository state and historical verification; it is not a fresh certification of the deployed product.

---

Continue building Cue and Bloom in `/Users/avichaldwivedi/dev/Cue/cue-demo`. Finish the approved Agent Workspace and Growth scope, address the remaining quality gaps, and retain the later platform backlog. Act on the existing work; do not restart the applications or stop after proposing a plan.

## Objective and working preferences

Cue brings the Forward Deployed Engineer model to consumer apps: collect customer problems, investigate them, group related reports, delegate supported implementations, obtain the appropriate approvals, and verify deployed resolution before updating customers. Bloom is the separate photo-journal consumer app connected to Cue. The new Growth loop should help Bloom earn users through useful recommendations backed by real, verified capabilities.

The user wants fast execution, real integrations, good contextual replies and thorough end-to-end verification. They explicitly requested atomic GitHub commits. Preserve unrelated work and commit/push coherent changes separately. Keep progress updates concise; only call a feature complete when its acceptance path actually passed. Distinguish implemented, deployed, verified, limited and pending behavior. Never make sample records, mock provider events or decorative activity look like live work.

The user owns visual design. Integrate their supplied screens and implement the behavior underneath them. The approved primary interface is named agents with conversations, task details and shared activity. An infinite canvas is deferred. Do not introduce a new visual direction or workflow builder.

Use existing GCP/Gemini/Google Cloud speech, Convex, WorkOS, Slack, Resend, X and the personal Codex companion where appropriate. No additional paid service is required for the initial Growth scope. Reuse recorded authorizations for their actual scope; do not repeatedly ask permission for routine authorized work. New purchases, auto-recharge, unrelated account actions and unsolicited outreach are not authorized by this handoff.

For strategy and evaluation, follow the user's AGENTS instructions: inspect implementations, use primary sources for changing provider facts, distinguish observations from hypotheses, compare a simple baseline, preserve held-out evaluation, and define success/failure criteria before tuning.

## Start here

1. Read `AGENTS.md`, `apps/bloom/AGENTS.md`, `README.md` and these documents:
   - `docs/agent-workspace-feature-spec.md`: approved agent behavior and acceptance criteria.
   - `docs/growth-plan.md`: researched acquisition loop, data contracts, permissions and demo.
   - `docs/platform-boundaries.md`: present single-company boundaries and future SaaS requirements.
   - `docs/bloom-separation-2026-10-11.md`: separate hosting/backends and latest application release evidence.
   - `docs/verification-2026-10-11.md` and `docs/verification-2026-10-10.md`: actual provider/workflow observations and failures. Read chronological updates; earlier pending states may have been resolved later.
2. Inspect Git status and current diffs before edits. At handoff, `main` is at `d40a343` and has uncommitted changes in `design/cue.html` and `lib/browser/cue.js`. The design now contains substantial Growth and agent screens. The live bridge explicitly empties Growth records/conversations/tasks and marks agent health unknown because those backends are not connected. Preserve this work; design interactions are not proof of live functionality. These files may continue changing in another chat.
3. Check current deployments, provider health and the configured local worker without printing secrets. Decide which acceptance gaps need new evidence. Documentation commits do not deploy applications.
4. Establish a short implementation order, then build. Ask only for information or actions that actually block dependent work; continue independent work meanwhile.

Before editing Convex code, read the applicable `convex/_generated/ai/guidelines.md` and the installed Convex expert skill. Before Next.js edits, read the relevant installed `next/dist/docs` guides, as required by the repository. Consult WorkOS guidance when changing its integration.

## Existing product and infrastructure

- Repository: `https://github.com/AvichalDwivedi2205/cue-b2c` (private).
- Cue: `https://cue.latchgrid.in/cue#/inbox`; setup at `https://cue.latchgrid.in/setup`. Hosting is Cloud Run service `cue`; Cue Convex project `cue`, production `tangible-kiwi-777`.
- Bloom: `https://bloom-with-cue.vercel.app`, source `apps/bloom`; Vercel project `bloom-with-cue`, independent Convex project `bloom`, production `accurate-pony-820`.
- Bloom's registered Cue app is `cue_app_5625fca3e391d92460528d8d`. Its journal/photos belong to Bloom; support cases/screenshots/provider work belong to Cue. Do not collapse these backends.
- Last recorded application release for both is `502529aec4cc042ae2a9efdb8f8abed9ea494b31`; Cue revision `cue-00013-q68`. Check the actual current release before testing or deploying. The verification document contains an older `CUE_VERIFY_RELEASE` example; do not copy it blindly.
- The legacy Cue `/bloom` journal remains separate. Bloom uses signed host-only anonymous guest sessions; consumer login, cross-device sync and legacy/guest migration are not implemented.
- Provider credentials are encrypted server-side. Ignored `.cue/` files contain private configuration/evidence. Never copy keys/passwords into Git, this handoff, logs or client bundles. Keep `.vercelignore` exclusions intact: an earlier source-upload problem was corrected and private build inventories checked.

The latest documented release passed Cue's 229 tests across 30 files and Bloom's 11 tests across two files, plus type checks, lint and builds. These are historical counts, not current passes.

Historically verified paths include journal photo upload/save/edit/delete/Undo/reload and caption search; visitor/app/origin boundaries; widget conversations and screenshot persistence; WorkOS operator login; contextual Gemini follow-ups; hosted Slack intake/thread replies and exact-version approvals; real receiving email/replay/threaded outbound replies; official hosted X mention intake; and the scoped approved-feature/Codex workflow. Re-check changed paths rather than assuming uninterrupted health.

Important operational distinctions:

- Hosted Slack uses signed HTTPS Events and Interactivity. Socket Mode is disabled. Keep it that way for hosted delivery; account setup should not be repeated.
- Hosted X collection runs every minute through Convex, with shared lease and compare-and-swap cursor. The local collector skips hosted mode. Preserve checkpoints, initial history cutoff, bounded pagination, cooldown and spending reserve.
- X notification-email tests failed. Official API intake later passed a fresh native `@ConfusedAF2205` → `@bloomwithcue` tagging test with the local worker stopped. Reviewed brand replies were manually published and independently visible; automatic posting is not implemented.
- Reddit notification intake passed Gmail → Resend → Cue. Reddit removed the public test comment. This does not establish general Reddit API access, public reply visibility or prospecting access.
- Incoming support mail starts at `support@tenuetkel.resend.app`; social notification forwarding uses `mentions@tenuetkel.resend.app`. Verified outbound sender is `support@cue.latchgrid.in`. A new email sent directly to that branded sender has no configured receiving/MX route.
- Durable triage uses a Convex workpool, two parallel jobs, five transient retries and receipt/latest-message fences. Personal Codex implementation jobs still need the user's local companion. Hosted Slack/email/X intake does not require that local worker.
- Voice now uses Google Cloud `en-US-Chirp3-HD-Aoede`, consent, short recording turns, contextual replies, replay/mute/interruption/end controls. Real-service three-turn checks passed. This is turn-based voice, and the replacement voice's perceived naturalness still needs human listening.
- The supported engineering path creates isolated changes, runs fixed independent checks, opens a draft PR and binds review to the exact spec/commit. It does not generally merge or deploy PRs. Generic bug execution beyond the scoped Bloom upload fixture remains unsupported. `CUE_GITHUB_REPO` for that fixture refers to `AvichalDwivedi2205/cue-bloom-demo`; do not replace it with the product repository by mistake.

## Priority 1: Agent Workspace

Implement the full behavior in `docs/agent-workspace-feature-spec.md` using the supplied UI. Initial agents are **X, Reddit, Growth and Engineering**, with stable identities, purposes, allowed tools, real connection health and current work. Agent identity is separate from its Gemini model. Collectors receive/read data without needing an LLM for every event.

Persist operator conversations with explicit app and optional task context. Selecting an agent lets the operator ask about actual work, inspect evidence and issue typed instructions. Read-only questions must read recorded state. Commands pass through server authorization and queue bounded work; model output never grants permission. Repeated instructions should attach to eligible existing work instead of starting duplicate implementation runs.

Build shared task records/coordinator behavior: owners, stages, dependencies, blockers, deduplication, leases, bounded concurrency, retries, cancellation and evidence references. Initially propose two AI reasoning jobs and one personal Codex run, with separately bounded collectors. Integrate existing workpool/job state rather than creating competing orchestration systems. X and Reddit reports about one problem should link to one issue and one implementation.

Wire Home decisions, contextual task details and Agent Activity to real records. Keep agent health distinct from task failure/source removal. Activity should group factual events by task, provide filters and searchable IDs, and expose redacted details without internal secrets or hidden reasoning.

Use the existing Slack Cue bot: `@Cue x …`, `@Cue reddit …`, `@Cue growth …`, `@Cue engineering …`. Route these operator commands before generic support intake. Verify sender/team/channel; persist thread → app/agent/task context. Slack and Q must share decisions and exact-version approvals. Separate native agent bots and Slack DMs are deferred.

Human roles are **Ganesh: Engineering**, **Holly: Product**, **Avichal: Owner/publication**, **Aria: Support**. Authorize saved member IDs/roles, not display names. Preserve role-denial behavior and invalidate approvals after relevant content/version changes.

## Priority 2: Growth

Build `docs/growth-plan.md` end to end. First target Bloom end users; finding companies to buy Cue is a later, separate campaign. “An app that sells itself” is a hypothesis to validate through activation, not an automatic revenue claim.

Implement capabilities, campaigns, opportunities, exact-version drafts/reviews, publication records and trusted outcome events. A capability requires acceptance evidence from the current deployed app release; an approved PR alone is insufficient. Prepare caption search from existing real evidence, without inventing a new coding run. PDF export must remain Needs feature until implemented and verified.

Add a separate bounded official X recent-search adapter, response validator, checkpoints, lease and budget. Existing mention polling is not Growth discovery, and its five-post response assumptions must not be reused blindly. Start with operator-run discovery and a paused-by-default schedule. Re-check available unexpired credits before enabling it. Last historical X balance was $19.98 free, expiring January 8, 2027; this is not a current balance. Keep the $1 reserve and auto-recharge off.

Qualification must retain source provenance, explicit need, eligibility and fit reasons. Generate helpful drafts grounded in verified capabilities. Holly reviews the exact content; Avichal controls native/manual publication. The current X token is app-only read access. A supplied reply permalink starts as operator-reported; independently verify author, original thread, approved content and campaign destination before marking publication verified. Respect platform permissions and community rules. No API access means an honest assisted mode, not scraping around denied access or reposting moderated material.

Build signed opaque campaign links restricted to the registered Bloom origin. Bloom exchanges attribution server-side against its signed guest session. Record confirmed sessions separately from redirect clicks/link previews. Activation means **a new attributed browser saves its first memory and finds it through caption search**. Returning visitors count separately; controlled staff/test traffic is excluded from organic results. Do not infer a human's identity from a browser or send journal captions/photos/search queries as analytics.

Add trusted Bloom events/outbox with app-scoped authentication, event-ID deduplication and replay/time checks. Move caption search's verification into an owned-journal server path while preserving current ALL-query-term matching semantics. Display real discovery → qualification → review → publication → visit → activation evidence in Q/Slack.

Run the controlled demo described in the plan: real authorized X inquiry, actual discovery, Holly review, Bloom publication, fresh browser visit/save/search, visible activation; also demonstrate unsupported PDF export being blocked. If search indexing misses the bounded window, label assisted capture honestly and retain the automatic discovery failure. Use the plan's held-out reply baseline and activation experiment before claiming better quality or growth.

## Remaining quality work and later backlog

Address or explicitly retain these limitations:

- Semantic grouping is mixed: two held-out paraphrased calendar requests were not merged. A diagnostic repeat scored 0.90 below the unchanged 0.95 gate; the original score was not saved. Preserve evidence, add meaningful false-merge/missed-merge evaluation and manual review fallback. Do not lower a threshold solely to manufacture a pass.
- Human listening review of the replacement voice and evaluation of novel diagnostic conversations remain needed. Synthetic audio tests cannot confirm perceived voice quality or the user's actual hardware.
- Branded receiving email needs a deliberate route if required; preserve existing root-domain MX. General Reddit discovery/API access remains unavailable unless provider approval changes.
- Full dependency audit reported five high-severity development advisories despite a clean Bloom production audit. Investigate compatible fixes and actual applicability; avoid blind upgrades.
- Generic investigation/bug execution, release adapters and a reliable company coding runner need additional work. Claude Code is not connected.

Previously deferred SaaS work stays a separate phase unless the user expands scope: authenticated company workspaces/memberships, tenant-scoped data migration, per-company encrypted connections/webhook routing/cursors, self-service join/invites/app registration/widget setup, scoped repository installations, independent coding credentials and budgets. The release gate is two companies with proven cross-company denial plus real onboarding without manual server edits. Separate Bloom hosting does not establish this.

Other deferred work: consumer login/sync/migration, opt-in lifecycle/referrals, Cue-buyer acquisition, full real-time voice, operator-agent voice, custom agents, separate Slack agent identities and a canvas. Do not silently add these to the first slice. The earlier 7.5–11 hour estimate covered Growth alone, not this entire backlog.

## Accounts and test boundaries

Bloom X is `@bloomwithcue` in Chrome profile `avichaldwivedi2005`. Authorized X tester is `@ConfusedAF2205` in profile `dwivediavichal926`. **Never use avichaldwivedi4's X account.** Inspect the native account menu before publishing tests; wrong-profile selection was a repeated problem. Reddit is `u/bloomwithcue`. Dedicated setup Gmail is `e34396372@gmail.com`. Use existing signed-in accounts and encrypted credentials; do not request passwords in chat.

Prior human approvals covered setting up these services, their named test accounts, scoped integration credentials, Slack participants and relevant DNS changes. Preserve them; new unrelated permissions are not implied. Inspect scripts before execution: some send messages or mutate data. Keep live tests small, uniquely marked and restricted to authorized accounts/recipients. Do not bulk contact strangers to make the demo look populated.

## Useful implementation seams and verification

Inspect actual source before deciding changes:

- `design/cue.html`, `lib/browser/cue.js`: supplied UI and live bridge.
- `convex/triageQueue.ts`, `convex/background.ts`, `lib/hosted-background.ts`: workpool, durable background work and X lease/cursor.
- `lib/x-api.ts`, `lib/x-poller.ts`: official X reads/budget.
- `lib/slack-events.ts`, `lib/slack-messages.ts`, `lib/slack.ts`: intake, Block Kit, decisions and thread delivery.
- `lib/runner.ts`, `lib/feature-runner.ts`, `scripts/worker.ts`, `convex/releases.ts`: scoped coding and deployed acceptance.
- `apps/bloom/app/api/bloom/route.ts`, `lib/memory-search.ts`: Bloom BFF/guest boundary and search semantics.

For changed Cue behavior, run appropriate tests and required checks: `npm run test:backend`, `npm run typecheck`, `npm run lint`, `npm run build`. For Bloom, run its `npm run test`, typecheck, lint and build from `apps/bloom`. Add tests for actual permission, retry, concurrency and evidence failures rather than tests that mirror implementation.

Inspect and use applicable live verifiers: `scripts/verify-hosting.ts`, `verify-bloom-hosting.ts`, `verify-widget.ts`, `verify-voice-conversation.ts`, `verify-email-webhook.ts`, `verify-slack-webhook.ts`, `verify-x-api.ts`. Read-only checks of historical fixtures do not prove a new Slack decision/email delivery. Mocked tests do not prove provider access. For changed integrations, capture fresh native receipts and inspect restored UI/task state. Deploy the exact tested application commits, confirm reported releases, then verify public behavior.

Acceptance must include wrong-role/app access, edited approval invalidation, duplicate events/commands, stale callbacks, concurrent lease behavior, transient and exhausted failures, unsupported capability claims, forged attribution, link-preview exclusions and private-data isolation. Update verification notes with exact release, observation, evidence and remaining limits. Push atomic commits while preserving unrelated UI changes.

Start by inspecting the current tree and mapping the supplied screens to these backend contracts. Then implement the smallest complete vertical slice through an agent conversation, shared task, Slack command and real evidence, followed by the Growth activation loop. Finish each accepted slice before declaring it complete.
