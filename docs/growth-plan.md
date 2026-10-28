# Cue growth loop: improve the app, then earn the next customer

## Decision

Build growth for connected apps such as Bloom first. Cue's advantage is knowing which customer needs the app demonstrably solves, because it owns intake, engineering work and release verification. Use that evidence to help the right person try the app. Prospecting for companies that might buy Cue is a separate sales workflow and should not share the customer-support state machine.

Positioning to test: **“Your app improves itself—and turns improvements into customers.”** “An app that sells itself” is a direction, not a conversion or revenue claim we have established. Today we have engineering and support evidence, not customer-acquisition evidence.

Cue's initial buyer hypothesis is a founder or small team operating a consumer app with recurring feedback and limited support/engineering capacity. The Growth module serves that company's end users; it should first demonstrate acquisition for Bloom. Selling Cue to app companies is a separate campaign using Cue's verified workflow as its evidence. Audience fit remains a hypothesis until real teams participate.

The proposed loop is:

1. Learn the need from customer requests and permitted, relevant inquiries.
2. Fix or build the capability, with Product and Engineering review.
3. Verify the released behavior and record its limits.
4. Produce a useful demonstration, answer or product page grounded in that proof.
5. Offer a clear next step to an interested person.
6. Measure first useful action and later retention, then feed failures back into Cue.

## First demo implementation

Add one Growth page showing the original inquiry, source link, explicit need, matching verified capability, draft, review state and measured result. Keep unsupported matches visible as rejected opportunities; do not invent a capability to justify outreach. A lead is a potential fit, not a customer, and a support requester is not automatically eligible for marketing.

Start with one verified capability: Bloom saves photo memories and finds them through caption search. The first controlled demonstration should be an explicit, voluntary product-recommendation inquiry from a separate participant. Cue matches that inquiry to the capability, generates a proposed helpful answer and a campaign link, requests Product review, then records the operator's actual publication permalink. The participant visits standalone Bloom, saves a memory and finds it using caption search. Those first-party events advance the opportunity to activated. Mark our own test accounts as controlled verification; do not count them as real customer acquisition.

Reuse Convex, Gemini, Slack review cards and the existing application identity boundary. Implement the opportunity/draft records, versioned capability evidence and approval, campaign redirect, visitor-linked activation events and source-to-outcome dashboard as one slice. Journal photos and captions must not enter growth analytics. Avoid exposing a visitor identity in public links. Deduplicate source records, invalidate approvals after edits, honor opt-outs and preserve unknown delivery rather than treating a saved draft as sent.

For the current roles, Ganesh verifies the capability once per release, Holly reviews the positioning/draft, Avichal controls publication and Aria handles inbound interest. A reviewed draft is still pending until a genuine provider receipt or operator-recorded permalink establishes publication.

The first release gate is one complete controlled flow, plus tests rejecting unsupported claims, edited approvals, cross-app records and duplicate activation events. Subsequent real-user evaluation follows the held-out review and matched experiment below. This module is proposed; no Growth interface, acquisition worker or conversion event pipeline has been implemented.

This also improves retention: the person who originally requested caption search can try the released feature. That is a reactivation outcome; it must not be counted as a newly acquired customer.

## Smallest first experiment

Start with one Bloom need: finding older memories by their captions. Publish one owner-approved demonstration of working caption search on an owned page, with a direct path into standalone Bloom. Use an approved opt-in audience or relevant inbound inquiries. A social search API is not necessary for this first controlled experiment. Social publication stays manual until a supported connector is approved and configured.

Define activation before collecting results: a new signed visitor saves their first real memory, then successfully finds it using caption search. Standalone Bloom's signed guest cookie identifies a browser, not a verified unique human or a cross-device account. Synthetic fixtures, our four Slack test personas and staff accounts are excluded. A retained session returns and uses the journal after seven days. A support requester trying a release is tracked separately from new acquisition.

First, run a dry review on 20 previously unseen, eligible requests. Freeze the evaluation set before prompt tuning. Compare a short fixed helpful template against Cue's evidence-grounded draft, with the same source context, product facts, 20-request budget and two-minute maximum operator review per request. Randomize presentation order; review without showing which method generated the draft. Measure unsupported capability claims, relevance, corrections needed and review time. Do not contact anyone during this dry review.

Proceed only if all 20 drafts avoid unsupported release claims, at least 16 need no substantive factual correction, and median review time stays below two minutes. Zero claims in 20 examples is a limited smoke result, not a safety guarantee. Stop to repair grounding if a draft invents capabilities, quotes private customer information, ignores an opt-out or misrepresents a moderated source.

After that, test two randomly assigned variants with at least 20 eligible opt-in visitors per arm: the fixed helpful answer versus the grounded answer plus verified demonstration. Match channel, need and delivery budget. Count delivered messages, unique eligible sessions, first useful action, activation and seven-day return. Report counts and uncertainty; this sample only identifies gross failure and cannot establish a reliable conversion uplift. A failed delivery is a failed delivery, not a non-response. Keep attribution windows identical. If the proof adds review time without improving activation, retain the simpler baseline. If people visit but do not activate, investigate onboarding before increasing outreach volume.

A later ablation separates (a) personalization and (b) proof: fixed answer; personalized answer; fixed answer plus proof; personalized answer plus proof. Run it only if the first experiment shows enough traffic to justify it.

## Backend implementation after the core release

Use the existing Next.js gateway, Convex records/jobs, Gemini structured outputs, app-bound repository policies, Slack reviews and delivery ledger. Keep support cases and growth opportunities separate; a complaint must never silently become a sales target.

Add:

- `capabilityEvidence`: app ID, need, approved feature/fix run, exact implementation and release commits, verification evidence, limitations, public-safe explanation and validity state. Retire evidence when a regression or later release invalidates it.
- `growthOpportunities`: app ID, permitted source reference, observed need, explicit contact eligibility, provenance, confidence and disposition. Distinguish source text from inferred intent. Avoid creating contact records from arbitrary mentions alone.
- `growthDrafts`: opportunity, capability-evidence IDs, factual claims, helpful answer, proposed channel/CTA, current version, Product review and Owner publication decision. An edited draft invalidates its old approval.
- `growthTouches`: versioned approval, provider receipt or manual publication permalink, delivered/unknown/failed state, timestamps and stop/opt-out status. Use idempotency keys and avoid retrying ambiguous sends blindly.
- `growthEvents`: first-party pseudonymous visitor, app/campaign/touch references, first memory saved, successful caption search, return event and fixture flag. Do not collect journal photos/captions into growth analytics.

States: observed → eligible → matched to verified capability → draft → reviewed → published → delivered/unknown/failed → activated/closed. An independent hard gate checks source eligibility, capability freshness, app boundary, recipient/channel match and exact draft approval before publication. Gemini proposes matches and text; its confidence never authorizes contact.

Product owns positioning and claim review. Engineering validates capability evidence. Support handles inbound interest and continued problems. Owner approves publishing/channel access. Existing role checks apply on every action; Slack names alone confer no access.

The first slice should provide an opportunity queue, a public-safe proof card, one reviewed draft and first-party activation events. Estimate one focused implementation session of 4–6 hours using the existing stack, plus an hour of live verification; conversion evaluation requires real usage over subsequent days. Scope is an estimate, not a promised deadline. Do not start platform scraping or a multi-channel autonomous outbound engine as part of this slice.

## Channel realities and fallback

Observed in this installation: Reddit notification email reached Gmail, Resend and Cue automatically; public test comments were subsequently removed. X's bounded notification-email tests failed, but subsequent official API mention collection passed, including hosted collection with the local worker stopped. That connector currently collects brand mentions, not general growth opportunities. Notification intake is not comprehensive discovery, and support notification access does not establish permission for a broader growth use case. Manual captures preserve source links and reported text but do not prove the source was fetched or that a reply was delivered.

For later X discovery, the official [Recent Search endpoint](https://docs.x.com/x-api/posts/search/introduction) supports keywords and phrases over the last seven days. Add narrow queries expressing a relevant product need, with separate discovery state and bounded requests; do not quietly broaden the existing support collector. As checked October 11, the [published pricing](https://docs.x.com/x-api/getting-started/pricing) lists general post reads at $0.005 per returned resource. A proposed ceiling of 20 new posts daily is approximately $0.10 in post-read cost alone; model calls, profile reads and other endpoints are additional. This is a proposed budget, not an enabled job, spending authorization or a refreshed account-balance claim. Preserve the existing free-credit reserve and auto-recharge setting. Validate actual endpoint access and usage before scheduling it. If discovery access or budget fails, use voluntary inbound inquiries and operator-supplied sources for the same review and attribution flow.

X prohibits non-API website scripting and unsolicited automated keyword replies; AI reply bots require prior written approval. Use operator-reviewed drafts and manual publication for this installation. [X automation rules, updated April 2026](https://help.x.com/en/rules-and-policies/x-automation).

Reddit API access remains subject to its access and builder requirements. An account or a noncommercial demonstration does not itself establish approved Data API access. Preserve approved email intake and operator capture as the fallback; do not replace denied access with covert scraping or repeatedly repost content removed by Reddit. [Reddit Responsible Builder Policy](https://support.reddithelp.com/hc/en-us/articles/42728983564564-Responsible-Builder-Policy).

The dependable starting channels are the app widget, the support inbox and owned product pages. Even with social connectors unavailable, the app can improve, generate verified demonstrations, answer inbound interest and measure whether people reach their first useful action. That is the first version worth testing.
