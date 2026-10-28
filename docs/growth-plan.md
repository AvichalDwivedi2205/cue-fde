# Cue Growth: product research, integration and demo plan

Research date: October 11, 2026. This is an implementation plan; the Growth module is not built or deployed. Existing Cue/Bloom support, engineering and channel verification remains recorded separately.

## Recommendation

Build a small native Growth section in Cue (Q), using the existing X read connection, Gemini, Convex, Slack and standalone Bloom. It should own the complete journey from an explicit product need to a reviewed recommendation and an observed first useful action.

Start by acquiring end users for Bloom. Cue's initial buyer hypothesis is a founder or small consumer-app team with recurring customer feedback and limited engineering/support capacity. Selling Cue to those companies is a later campaign; it needs different signals and acceptance goals. Audience fit and conversion uplift are untested hypotheses.

Positioning to test: **Your app listens, improves, and earns its next customer.** The concrete product hypothesis is that a recommendation backed by a verified feature produces more activation, or less review work, than a short helpful reply with the same source context and budget.

## Relevant products and what they establish

The table summarizes first-party product/documentation descriptions, not independently tested coverage, delivery speed or revenue results. No vendor account was created and no paid subscription was enabled during this research.

| Product                                                                                  | Documented capability                                                                                        | Pattern useful to Cue                                                              | Integration decision                                                                                          |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| [Octolens](https://octolens.com/product)                                                 | Keyword monitoring, relevance/intent/sentiment tags, Slack delivery and API/webhooks across multiple sources | A contextual opportunity feed with source provenance and High/Medium/Low relevance | Optional later discovery adapter; keep Cue's qualification and engineering evidence native                    |
| [Syften](https://syften.com/)                                                            | Community keyword alerts with filtering and email, Slack, API and webhook delivery                           | Narrow problem/recommendation queries and tagged routing                           | Optional later feed, after checking actual platform coverage, terms and budget                                |
| [ReplyGuy](https://replyguy.com/how-it-works)                                            | Select relevant mentions, generate replies and support manual publication with published-status tracking     | Draft, copy, open original conversation, record publication                        | Build this small workflow in Cue with exact-draft approval and real permalink evidence                        |
| [Common Room](https://www.commonroom.io/product/product-led-sales/)                      | Combine product and other signals to prioritize prospects and prepare contextual outbound                    | Act on something the prospect actually did; preserve source context                | Adopt the signal-driven approach; company/person enrichment belongs to a later Cue sales campaign             |
| [Customer.io](https://docs.customer.io/messaging/send/automations/create-an-automation/) | Event/segment-triggered messaging workflows, goals and draft sending behavior                                | Activation goals, explicit next-step nudges and stopping when the goal is reached  | Implement one small journey using existing infrastructure; consider a connector when customers already use it |
| [Viral Loops](https://viral-loops.com/)                                                  | Unique referral links, referral templates, performance tracking and rewards                                  | Offer sharing after someone experiences value; attribute the resulting journey     | Later expansion after acquisition/activation works; rewards require reliable identity and reward rules        |

These products show adjacent workflow patterns. Their pages do not establish that the proposed Cue workflow increases growth or that no competitor offers the same combination. Cue's proposed distinguishing mechanism is linking a recommendation to the engineering work and current verification that makes the recommendation true.

A paid listening provider is unnecessary for the first demo. Octolens advertises a Pro rate of $159/month billed annually and a seven-day trial ([pricing](https://octolens.com/pricing)). Syften's published Standard plan includes API access at $49.95/month; its PRO plan includes webhooks at $119.95/month, with X monitoring listed as an add-on ([published plans](https://syften.com/slack-monitoring)). These are vendor-listed prices checked on the research date, not quotes or subscriptions. If a later customer wants broader coverage, evaluate one feed on a fixed set of relevant inquiries before committing.

## Product loop

1. A customer need enters Cue through an approved source.
2. Existing support/feature workflows handle defects and unmet needs.
3. A deployed acceptance check establishes a capability at a specific application release.
4. Growth finds an explicit inquiry that the capability answers.
5. Cue proposes a useful answer and a direct path to trying that capability.
6. Product reviews the exact draft; an operator publishes it through the allowed channel.
7. Bloom reports actual product actions, so Cue can measure whether the recommendation led to value.
8. New feedback returns to the existing Inbox/Feature requests workflow.

A support complaint does not automatically create marketing consent. An unsupported need can become a feature candidate, with its provenance retained, without producing a misleading recommendation.

## Integration inside Q

Add **Growth** below Feature requests in the current sidebar. Reuse the existing typography, green accents, compact list/detail presentation and approval controls. Keep the product named Cue; do not add invented leads or decorative revenue numbers.

Routes: `#/growth` for the workspace view and `#/growth/<opportunityId>` for an opportunity. Tabs inside Growth:

- **Opportunities:** source, original inquiry, age, explicit need, fit, matching capability and disposition. A detail pane shows the original text, why it matches, current verified capability and an editable draft. Actions: draft, request review, dismiss, open source and record publication.
- **Campaigns:** one initial campaign, Find older memories by caption. Show capability, allowed sources, narrow queries, activation goal, budget, pause state and last successful collection. A Run now action performs a bounded discovery job.
- **Results:** actual discovered/qualified opportunities, approved drafts, recorded publications, confirmed Bloom visits and activated browsers. Include a journey timeline rather than declaring an identified social author converted.

The existing Approvals dropdown gains typed Growth draft items. The Agent activity page records discovery, qualification, drafting, blocked attempts and event ingestion. Integrations show discovery health separately from support-mention health.

Opportunity details should show three separate facts: source need, supported product capability and proposed message. For example, a request for caption search can match Bloom; a request for PDF export must show Needs feature until PDF export is genuinely implemented and verified. High/Medium/Low is a ranking label with reasons, not a calibrated probability of purchase.

## Backend and ownership

Keep the existing architecture. Cue's Convex project owns growth records; Bloom's separate Convex project owns journals and an event outbox. Cue never needs access to the journal photos/captions to measure activation.

Proposed Cue records:

| Record                | Purpose                                                                                                                                  |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `growthCapabilities`  | App, supported need, public-safe claims, implementation/run reference when available, deployed release, acceptance evidence and validity |
| `growthCampaigns`     | App, selected capability, query/source policy, budget, goal and enabled/paused state                                                     |
| `growthOpportunities` | Canonical source ID, app/campaign, inquiry, explicit need, contact eligibility, fit reasons and disposition                              |
| `growthDrafts`        | Exact text, capability version, source context, draft hash, review decision and reviewer                                                 |
| `growthTouches`       | Approved version, campaign link, publication permalink or provider receipt, timestamps and publication/delivery status                   |
| `growthEvents`        | App, campaign/touch, pseudonymous browser, event ID, trusted event type, time and internal-traffic flag                                  |

Use the existing durable workpool for qualification and drafting. Keep separate discovery checkpoints and leases so Growth does not alter support mention collection. Canonical provider source IDs and event IDs provide transactional deduplication. Exhausted attempts remain visible and retryable.

An opportunity moves through discovered → qualified/needs-feature/dismissed → drafted → awaiting-review → approved → publication-recorded. Publication, visit and activation are distinct observations. A supplied permalink is initially operator-reported. Verify the actual post through a bounded official read or an independent native-platform check, matching the brand author, original thread, approved content and campaign-link destination before showing verified publication. Keep the verification method visible. Even verified publication does not establish that the intended recipient read it.

Capability validity requires a deployed acceptance check for the registered app and release. An approved PR alone is insufficient. The currently verified caption-search capability can be prepared as the first evidence record; do not pretend a new coding run happened during the growth demo. A release change requires re-verification before its facts can be used again.

Gemini extracts the stated need and proposes matches/drafts against this bounded capability list. Server rules enforce app scope, capability validity, permitted channel, exact draft approval and deduplication. An edited draft or changed evidence invalidates old approval. Source text and model output cannot change permissions or execute commands.

## Channels and approval roles

- **X discovery:** add a separate recent-search adapter to the existing official X client. The current client validates mentions pages of at most five posts; recent search needs its own response validator, query settings, pagination and budget handling. Do not reuse that validator or import discoveries as support cases. Begin with an operator-run bounded search, then add a paused-by-default hosted schedule.
- **X publication:** prepare a reviewed reply, provide Copy/Open source controls, record the actual reply URL and independently verify it. A wrong-thread, wrong-author or changed reply cannot satisfy publication verification. Keep API posting out of this first slice; the installed app-only token is a read connection.
- **Reddit:** continue assisted capture or explicit inbound inquiries. An optional provider feed can be evaluated later, only after confirming coverage and permitted use. Existing notification intake does not grant general prospecting access.
- **Slack:** extend the current Block Kit cards and signed interactive handler with Growth draft IDs/hashes. Show inquiry, fit reason, supported feature, exact proposed text and approve/request-changes/open-in-Cue actions. Route to the existing team channel for the first slice; no new workspace or bot is necessary.
- **Email:** reuse Resend for an explicitly requested or opted-in introduction/follow-up if included later. Anonymous Bloom visitors currently provide no marketing email address. The first demo needs no email capture or automated email sequence.

Ganesh verifies capability evidence once per release; Holly reviews the positioning/draft; Avichal controls publication; Aria handles inbound questions. Authorization uses saved member IDs/roles, not display names. Product review approves the exact content; it does not authorize bulk contact or automatically publish it.

X recent search supports keywords/phrases over the last seven days ([search documentation](https://docs.x.com/x-api/posts/search/introduction)). Automated unsolicited replies based on keyword searches are prohibited, and AI reply bots require prior written approval ([automation rules](https://help.x.com/en/rules-and-policies/x-automation)). Reddit requires approved API access and prohibits automated spam ([Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy)). These are practical channel constraints for this plan; another vendor's advertised automation is not proof that Cue's accounts have the required permissions.

## Bloom attribution and activation

A Cue campaign link redirects only to the registered Bloom origin with an opaque, signed attribution token. It contains no email, social handle or guest ID. Bloom exchanges and saves it server-side against its signed guest session. Reject wrong-app, modified, expired and unknown tokens; prevent arbitrary redirect targets.

A redirect click is not a product visit, because link previews can open it. Record a confirmed Bloom session separately. Define activation before building the dashboard: a new attributed browser saves its first memory, then performs a caption search that returns that memory. Existing returning guests count separately as reactivation. Our accounts/test traffic are excluded from organic acquisition metrics.

Memory creation records an event atomically with its journal mutation. Caption search currently runs in the browser; add an owned-journal server search path to verify that a search really returned a saved memory. Forward event type, opaque browser ID, campaign/touch, time and event ID, without query text, memory contents or photos.

Bloom's event outbox retries authenticated delivery to Cue. Use a dedicated app-scoped signing credential held only on the servers, with timestamp validation and event-ID deduplication. Do not share Cue's operator secret or rely on an unsigned browser request to claim activation. Browser page-view events are weaker telemetry; save/search milestones are verified server events.

Attribution establishes that a browser arrived through a campaign link, not that it is the same human as the social author. Link sharing and multiple devices limit inference. Results should display activated browsers and separate known internal traffic. Seven-day return remains pending until actually observed; never simulate elapsed days to show retention.

## Planned code changes

- `design/cue.html` and a dedicated `lib/browser/growth.js`: sidebar/router, Growth list/detail, campaign controls, results and typed approval integration.
- `app/api/growth/route.ts`: authenticated operator reads/actions with existing membership and role checks.
- `lib/growth/`: discovery adapter, capability rules, structured Gemini qualification/drafting, Slack message rendering and campaign-link validation.
- `convex/growth.ts` plus additive schema/indexes: growth records, decisions, deduplication and durable job entry points. Extend existing hosted job/Slack handlers without changing support routing.
- `app/go/[token]/route.ts` and an authenticated app-event gateway: constrained redirects and signed Bloom event intake.
- `apps/bloom/`: attribution exchange, owned-memory search endpoint and a journal event outbox in its own Convex backend. Share the existing caption-search semantics so displayed matches and verified matches agree.
- Targeted regression tests and `scripts/verify-growth.ts`: real provenance, exact review, publication evidence, cross-host attribution and server-verified activation.

This remains scoped to the configured workspace and registered Bloom app. General company onboarding, provider accounts and a universal activation SDK are separate work.

## Five-to-seven-minute demo

Prepare the genuine currently verified caption-search evidence and the separate participant browser beforehand. Keep the real source and screenshots, and use a fresh guest so previous memories cannot satisfy the activation goal.

| Beat | Action                                                                                        | What the audience sees                                                  |
| ---- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1    | Open the earlier caption-search request and current Bloom capability                          | A customer need became a feature that is now verified                   |
| 2    | A separate consenting participant posts an explicit photo-journal recommendation request on X | A real controlled source, not a fabricated lead                         |
| 3    | Run the saved narrow search in Growth                                                         | Actual API source/provenance, fit reason and matched feature            |
| 4    | Generate a reply and review it as Holly in Slack                                              | A helpful exact draft, evidence and a real role-based decision          |
| 5    | Publish once from Bloom through the native platform and record its permalink                  | Published state changes only after actual publication evidence          |
| 6    | Participant follows the campaign link, saves a memory and finds it by caption                 | Real actions in the independently hosted Bloom app                      |
| 7    | Return to Q's journey timeline                                                                | Confirmed visit, server-verified save/search and activated browser      |
| 8    | Open a separate request for unsupported PDF export                                            | Cue identifies an unmet need instead of promising a nonexistent feature |

Optional final beat: the new visitor asks for PDF export in Bloom support; the actual request appears in Cue's normal feature workflow. That closes the growth-to-product-feedback loop without pretending PDF export was shipped.

Indexing latency can make a new X post temporarily absent. Allow one bounded 90-second wait; if it is still absent, import the same genuine source with Manual capture provenance and report the automatic discovery check as failed. The downstream demo can continue, but it is not evidence that search collected the source. Reddit is an assisted-source demonstration until access is established.

Our participant is controlled verification traffic. Show its individual journey while keeping it out of organic-growth totals. One controlled activation proves integration, not independent customer acquisition, unique-human identity, retention or revenue.

## Build order, budget and fallback

| Order | Deliverable                                                               | Engineering estimate |
| ----- | ------------------------------------------------------------------------- | -------------------- |
| 1     | Capability record, growth schema/state rules and authenticated API        | 1.5–2 hours          |
| 2     | Q Growth list/detail, editable draft and exact-version Slack review       | 1.5–2 hours          |
| 3     | Bounded X search, source deduplication and Gemini qualification/drafting  | 1–2 hours            |
| 4     | Campaign links, Bloom attribution, verified search/save events and outbox | 2–3 hours            |
| 5     | Regression checks, deployment and full controlled live demonstration      | 1.5–2 hours          |

Estimate 7.5–11 hours for this bounded slice on the existing stack. These are engineering estimates, not a guaranteed deadline; provider availability and review can add time. Daily discovery automation is the last switch enabled, after its one-shot path and budget handling pass.

No paid vendor is needed. A proposed ceiling of 20 new X posts daily costs approximately $0.10 in post reads alone at the published $0.005/resource rate; author/profile reads, model calls and other endpoints add cost ([X pricing](https://docs.x.com/x-api/getting-started/pricing)). Do not enable the job merely because free credits previously existed: verify access, current grants and the existing $1 reserve before each bounded page. Keep auto-recharge off, account for expected page cost and pause on exhausted budget. This proposed budget is not a current balance claim or a purchase authorization.

If discovery fails or produces poor matches, keep the same qualification/review/activation flow using explicit inbound inquiries or supplied sources. If caption-search verification or event delivery fails, show pending/failed and do not mark activation. Optional listening vendors should remain adapters rather than dependencies for the core demo.

## Release gate and subsequent evaluation

First require a complete controlled journey on public Cue and Bloom, including one real source, exact-version Slack approval, actual publication evidence, a fresh attributed browser and server-verified save/search. Refresh both apps to prove persistence. Duplicate discovery, provider retry, outbox retry, repeated event delivery and link previews must not inflate counts.

Negative checks: unsupported feature claims, edited approvals, changed capability releases, forged/expired/wrong-app attribution, unapproved role actions, app-scope mismatches, wrong-author/wrong-thread/changed publication, unpublished drafts claiming delivery, private journal data in telemetry and an existing memory incorrectly satisfying new-user activation. Search failure and model failure must remain explicit rather than creating invented opportunities. Reconfirm the affected support and journal paths after deployment.

Then evaluate usefulness on 20 previously unseen eligible inquiries, frozen before prompt tuning. Compare a short helpful template against Cue's evidence-grounded draft under the same source context, facts, 20-inquiry budget and two-minute operator-review limit. Randomize presentation and review blind. Record unsupported claims, substantive corrections, relevance and review time. Do not contact anyone in this dry review.

Proceed only if all 20 avoid unsupported product claims, at least 16 need no substantive factual correction, and median review time is below two minutes. Zero failures in 20 is a limited smoke result, not a safety guarantee. If the richer workflow adds work without improving quality, keep the simpler template.

Next compare the fixed answer against the grounded answer plus demonstration using at least 20 eligible opt-in visitors per arm, with matched delivery/traffic budgets and attribution windows. Count actual publication/delivery, visits, activation and seven-day return; report uncertainty and exclude staff/verification traffic. This sample can expose gross failure, not establish a reliable revenue uplift. If people visit but do not activate, improve onboarding before increasing outreach volume. Later ablate personalization and proof separately only when enough real traffic justifies it.
