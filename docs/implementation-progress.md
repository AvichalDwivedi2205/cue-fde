# Agent Workspace and Growth implementation progress

Updated October 11, 2026. This is an acceptance ledger, not a completion certificate.

## Agent Workspace

Implemented first slice: named agent definitions and factual connection health, app-bound Agent component threads, persisted operator exchanges, typed server-authorized instructions, command replay fences, shared issue/run ownership, task events, bounded X collection with receipts, Slack addressing/thread context, and a global one-companion coding slot. Existing runs remain the source of truth for engineering progress. The supplied `design/cue.html` screens retain their visual design.

Local validation: 235 tests across 31 files, type checking, lint and production build passed. Six new coordinator tests cover real Convex handlers, including question-only persistence, content/context-bound replay, wrong-role/app denial, concurrent Q/Slack deduplication, concurrent coding claims and canceled/stale callbacks. These are isolated tests, not provider proof.

Cue Convex functions and additive schema have been pushed to production `tangible-kiwi-777`. Application deployment, fresh hosted Slack exchange, authenticated public UI persistence, and complete agent acceptance remain pending. Public Cue and Bloom still reported application release `502529aec4cc042ae2a9efdb8f8abed9ea494b31` during initial inspection.

Remaining agent scope: natural multi-turn contextual answers beyond deterministic state questions, complete task retry/dependency/handoff behavior, discovery/drafting actions, role-specific Home reviews, complete activity filters and evidence links, current-run import, and fresh public cross-surface verification.

## Growth

Pending: capability release verification, campaigns and opportunities, bounded independent official recent search, Gemini qualification/drafting, exact-version Product review, Owner-reported publication with independent provider verification, signed campaign links, trusted Bloom attribution/events/outbox, and controlled real publication-to-activation demonstration. No design sample establishes acquisition or provider delivery.

Release gate remains `growth-plan.md`: real source, exact Slack review, independently verified publication, fresh attributed browser, server-confirmed first save and matching caption search, replay/preview exclusions, unsupported PDF export rejection, private-data isolation, and persistence after reload on exact deployed commits.

## Quality gaps

- Semantic grouping: retain unchanged 0.95 gate and original missed-merge evidence; add false-merge/missed-merge evaluation and operator review fallback.
- Voice: evaluate novel diagnostic exchanges; replacement voice naturalness still requires human listening.
- Dependencies: investigate five historical high-severity development advisories and compatible fixes.
- Receiving email: branded inbound route requires deliberate configuration preserving root-domain MX. Managed receiving route remains available.
- Reddit: general discovery/API access unavailable. Assisted provenance remains explicit.

## Separately deferred platform work

Follow `platform-boundaries.md` for company workspaces/membership, tenant migration, per-company encrypted provider connections and webhook routing, self-service onboarding/invites, scoped repository installations, and independent coding credentials/budgets. Gate: two real companies with cross-company denial and onboarding without manual server edits.

Also deferred: consumer login/sync/migration, lifecycle/referrals, Cue-buyer campaigns, full real-time voice, operator-agent voice, custom agents, separate Slack identities, and canvas. Generic bug execution, general release adapters and Claude Code are not connected capabilities.
