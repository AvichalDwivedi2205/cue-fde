# Cue implementation handoff — public-source workspace

Status: **Units B–H complete and committed. All local checks are green (numbers below are fresh).** Deployment, live provider verification, browser footage, narration, and hosted acceptance remain with the operator (Codex) and the user, per the delivery plan.

## 1. Branch, commits, and tree

- Repo: `/Users/avichaldwivedi/dev/Cue/cue-demo`, branch `feat/meta-latchgrid`.
- Base checkpoint: `8919d0f` (the plan's inspected checkpoint — unchanged below it).
- Work is eight atomic commits:

| Commit | Unit | Summary |
| --- | --- | --- |
| `3cc366a` | B | Specification generation receipts + stale model label fixes |
| `4af2374` | C | Signals contracts, validation, synthetic fixtures (v1, v2 held-out, v3 all-noise) |
| `ac4b327` | D | `signalBatches` persistence: claim token, terminal analysis, one retry, promotion |
| `1d0e41f` | E | Single bounded configured-route analysis call + operator feasibility harness |
| `954eaf7` | F | `/api/signals` HTTP boundary + Quiet signals workspace surface |
| `308daa4` | G | Batch-evidence projection, honest queued/claimed job states, batch-based spec regeneration |
| `e71abee` | B/F | Unused import cleanup |
| `e7c84d0` | G | syncCue keeps promoted signal features visible (regression fix + test; also carries the Unit H events index line) |
| (HEAD) | H | `demoEvidence.ts` + export CLI + sanitizer (run/signal evidence exports) |

- All commits authored as `AvichalDwivedi2205 <150160561+AvichalDwivedi2205@users.noreply.github.com>`.
- The working tree at handback contains only `CUE-IMPLEMENTATION-HANDOFF.md` (this file) if uncommitted; product code is fully committed.

## 2. Implemented behavior

### Unit B — model identity and receipts
- `generateSpec` returns `{ spec, generation }`; the generation receipt (requested model, served model, provider, token usage, duration) is stored on the issue as an additive `specGeneration` field — never inside the three-field spec payload.
- Receipt rules: generated text saves the receipt; re-saving identical text (e.g. approving the displayed spec) keeps it; any human edit without a new receipt clears it, so edited text is never mislabeled as model output.
- UI no longer claims Gemini where Meta serves: the feature "Generate with Gemini" button is route-neutral, the triage toast names the configured model, the growth card labels the `meta` provider, and feature detail renders a "Model receipt · requested X · served Y via Z" line.

### Units C–E — Quiet signals core
- One bounded `signalBatches` aggregate per batch (Convex): immutable posts, provenance (`synthetic-fixture` with fixture+version, or `operator-capture` with a note), app-scoped `requestKey`, canonical input fingerprint (order-independent, pure FNV-1a over a canonical form — recomputable in the Convex runtime without Node crypto), append-only attempt ledger, one analysis revision.
- Integrity: the same app/key with identical content reopens the same batch; a reused key with different content is a conflict. Inputs are frozen at import. The browser supplies intent (`expectedFingerprint`, `expectedAnalysisRevision`); the server re-derives everything from saved records.
- Exactly one analysis attempt owns the batch (`ready → analyzing → analyzed|failed`). The server mints an attempt token; completion must present it, match the fingerprint, and not be expired. Late results cannot replace a newer attempt. `analyzed` is terminal; one explicit retry is enforced server-side; expired claims must be failed explicitly before retrying.
- Analysis runs **outside** database mutations (`app/api/signals` claims → calls `lib/signals.ts` → completes/fails with the token). Model output is validated against saved posts before it can be stored: every input ID dispositioned exactly once, evidence needs a cluster + exact-substring quote, excluded posts can't carry quotes or clusters, invented IDs/fabricated quotes/cross-references are rejected, counts and `repeatedEvidence` (≥2 distinct authors) are derived, not trusted. A completed-but-invalid answer commits as a **failed attempt** with the rejection reason and preserves the paid receipt.
- The single model call uses `configuredRoute({ purpose: "triage" })` (so `CUE_AGENT_MODEL` governs it, same as specification generation), fails loudly when the route is unconfigured, never falls back to another provider, and treats post text as untrusted evidence (the prompt forbids following in-post instructions; the payload never names a target feature).

### Unit F — operator surface
- `POST/GET /api/signals` (same-origin, saved operator roles; import/analyze/promote gated to the `spec` permission, consistent with generateSpec).
- Quiet signals page (`#/signals`, entry from Requests → "Quiet signals →"): provenance banner shown before analysis; frozen input table with per-post dispositions, exact quotes, outcome chips, and synthetic-author labels; clusters with inferred need, rationale, author counts, single-report caveats, model-interpreted sentiment labelled as such, assumptions separated from customer demands, initial specification; "No supported need found" empty state; one-retry budget display; served-model receipt; "Create build handoff" per cluster.
- Selection survives reload via session storage; polling refresh keeps the view honest; role-gated buttons match server permissions.

### Unit G — governance connection
- Promotion atomically creates or returns **one ordinary feature issue per batch revision and cluster** at `spec_ready` (never approved), with `sourceSignals` lineage (batch ID, input fingerprint, analysis revision, cluster) and the analysis receipt as `specGeneration`.
- Batch evidence is projected into feature views: Requests list shows a "Signals" chip; feature detail replaces the empty requester list with the source provenance, post/author counts ("not counted as customer traction"), single-report caveat, and exact quotes. Synthetic evidence cannot inflate real-customer traction (no requesters, week 0, ranks below real requests).
- Implementation state derives from the **actual job**: `Queued for Muse Wonder · the worker has not claimed this job yet` until a claim exists; `Executing with Muse Wonder · claimed by …` only after a claim. No invented model receipts.
- Spec regeneration for a promoted feature builds its context from the saved validated cluster quotes, not from an empty case list. Ordinary intake's synthetic-case filter is unchanged.
- Product approval still requires the exact current specification (`decideSpec`), and any spec edit clears approval (pre-existing behavior, now receipt-aware).

## 3. Local verification results (fresh, this workspace)

| Command | Result |
| --- | --- |
| `npm run ui:build` | PASS (Tailwind + landing bundle build cleanly) |
| `npm run typecheck` | PASS (0 errors) |
| `npm run test:backend` | **855 passed / 0 failed** across 108 files (prior public checkpoint: 785 — new tests account for the difference; no old test was weakened or deleted) |
| `npm run lint` | 0 errors; 6 pre-existing warnings in untouched files |
| `npm run build` | PASS (Next.js production build) |

New test coverage: `tests/signals-schema.test.ts` (23), `tests/signals.test.ts` (12), `tests/signals-model.test.ts` (7), `tests/signals-route.test.ts` (6), `tests/signals-browser.test.ts` (7), `tests/signals-feature-detail.test.ts` (5), `tests/spec-generation-receipt.test.ts` (3), plus the syncCue projection regression in `tests/workspace-view.test.ts`. Unit H adds `tests/demo-evidence.test.ts`.

Existing protected checks (stale-SHA refusal, terminal-run guards, app-policy freeze, specification approval, preview-release) all pass unchanged.

## 4. Synthetic fixtures

- `public/quiet-signals-fixture-v1.json` — evaluation batch: 12 posts; indirect destructive-action complaints (5 evidence posts across 4 authors), one word-for-word duplicate, one repeated author (third post), two unrelated valid needs, one obvious spam, one off-topic, one insufficient, one instruction-injection attempt. Never names the target feature or a retention period.
- `public/quiet-signals-fixture-v2-heldout.json` — frozen held-out batch: paraphrases (crash/freeze cluster across 2 authors + a repeated author), opposing preferences (dark mode vs print-bright), spam, off-topic, unrelated valid feedback, and **no** recovery-need pattern at all (catches a model that forces the demo's expected answer).
- `public/quiet-signals-fixture-v3-all-noise.json` — all-noise batch: must yield zero clusters and no handoff.
- The UI imports these by version; pasted batches are recorded as operator-capture with a "not platform-verified" provenance note.

## 5. Operator feasibility harness (real Spark runs — Codex)

```sh
npx tsx scripts/evaluate-signals.ts --fixture public/quiet-signals-fixture-v1.json --route signals --out artifacts/signals-v1.json
npx tsx scripts/evaluate-signals.ts --fixture public/quiet-signals-fixture-v1.json --route baseline --out artifacts/baseline-v1.json
# acceptance decision: run the held-out fixture ONCE
npx tsx scripts/evaluate-signals.ts --fixture public/quiet-signals-fixture-v2-heldout.json --route signals --out artifacts/signals-heldout.json
npx tsx scripts/evaluate-signals.ts --fixture public/quiet-signals-fixture-v3-all-noise.json --route signals --out artifacts/signals-allnoise.json
```

- Fixed call budget of 10 total runs (the script refuses beyond it); every run records its real usage receipt.
- Route identity comes from `CUE_AGENT_MODEL` (see §6) — with `CUE_AGENT_MODEL=muse-spark-1.3` both the signals route and specification generation serve Meta Muse Spark.
- The baseline comparison uses the existing `generateSpec`; judge only supported-need/specification quality — the baseline legitimately lacks dispositions (structural, not a failure). The all-noise run must create no cluster.
- Failed runs are recorded attempts; reruns count against the same honesty rules as the product flow.

## 6. Configuration variables required by the new code (names only)

- `CUE_DEMO_SECRET` — Convex backend secret (existing, required by all new convex functions).
- `CUE_AGENT_MODEL` — governs the signals analysis route **and** specification generation (set to `muse-spark-1.3` for the demonstrated runtime). Fallback chain: `GEMINI_MODEL`, then Gemini default.
- `META_API_KEY`, `META_BASE_URL` — Meta route readiness (existing).
- No new env vars were introduced. Existing WorkOS/Convex/Slack/email/X variables are unchanged.

## 7. Local start/stop

```sh
npm run dev:local      # convex dev + next dev + worker on 127.0.0.1
npm run dev            # web + worker only (existing hosted Convex)
# stop: Ctrl-C the run-p process; no extra daemons are started by this work
```

`CUE_LOCAL_DEMO` is not used by the new surface; hosted verification must run through WorkOS as before.

## 8. Generic evidence query/export interfaces

- `convex/demoEvidence.ts` — three secret-authorized queries:
  - `runEvents` — paginated run-specific events via the new `events.by_runId_and_createdAt` index (numItems default 200, max 500; verifies the run exists).
  - `runEvidence` — decodes "Meta coding response" events, requires a contiguous 1..N chain, completed status, model agreement, and monotone cumulative usage; per-call deltas are derived **only** when the whole chain is valid; cross-checks final cumulative totals against the run's own recorded aggregates (`aggregateAgreement`); returns an `issues[]` list describing any validation problem instead of hiding it.
  - `signalEvidence` — allowlist projection of one analyzed batch shaped exactly like `signalsExportSchema` (receipt picked field-by-field so provider `requestId`/`traceId` never leave; stable `handoff-<n>` labels from the promotion ledger).
- `scripts/export-demo-evidence.ts` — operator CLI (`--run-id` / `--batch-id` / `--out`): writes validated `run.json` (status `complete-history` only when the chain is complete AND agrees with the aggregates; otherwise `aggregate-only` with no per-call rows — never invented timings) and `signals.json`; exits 1 loudly on any validation failure. `sanitizeCheckSummary` redacts local filesystem paths and URLs from before/after check output before export.
- Synthetic coverage in `tests/demo-evidence.test.ts`: pagination/ordering, the complete 17-call chain (deltas sum to the aggregates; no `repoPath`/`commit`/`prUrl`/`requestId` keys anywhere), broken-chain degradation, signals export before/after promotion, wrong-secret rejections, and path/URL redaction.

## 9. Suggested hosted acceptance steps for Codex (identifiers are placeholders)

1. Deploy the additive Convex functions first (`signalBatches`, `demoEvidence`, new indexes), then the web candidate — both backwards-compatible; old records load unchanged.
2. As a Product or Owner role: select the connected app → Requests → Quiet signals → import `quiet-signals-fixture-v1.json` → confirm the provenance banner and frozen input → **Analyze with Muse Spark** → verify the served-model receipt names the Meta model and every post has exactly one disposition with exact quotes.
3. Reload the page mid-review — selection, dispositions, and receipts must survive.
4. Promote one cluster → confirm the feature opens at `spec_ready` with batch evidence in place of requesters, a Signals chip in Requests, and no traction-count inflation.
5. Governance: edit the spec → approval clears; approve the exact spec; wrong-`expectedSpec` and stale-revision promotions must fail; **Implement** → feature shows "Queued for Muse Wonder" until the worker claims, then "Executing with Muse Wonder · claimed by …".
6. Replay/failure: re-import (same key+content reopens; changed content conflicts), double-click analyze/promote, force a provider failure → failed attempt keeps its receipt; retry once; second retry refused.
7. Scope: switch apps; non-`spec` roles must see import/analyze/promote disabled and get 400s.
8. Run `scripts/export-demo-evidence.ts` with real run/batch IDs; validate outputs against the schemas; sanitization review before anything leaves the operator workspace.

## 10. Known defects and omitted checks

- The analysis attempt TTL (10 minutes) is enforced at completion time only; there is no background reconciler that flips an expired `analyzing` batch to `failed` automatically — the operator must fail it explicitly (by design; no unknown-outcome replay).
- `getSignalBatch` is workspace-scoped (single-company boundary, like the existing snapshot); it does not take an appId argument. If multi-tenant onboarding ever lands, this needs app-scoping.
- Timeout-specific model failures are exercised via the completion-stage error path, not a literal timed-out socket test.
- The signals page assumes the selected app scope (`S.scopeApp`); with no app selected it falls back to the workspace app — acceptable for the single-company pilot.
- Per the plan, queueing beyond "Handoff ready" was intentionally left to the existing `startFeature` governance; no future-work binding or policy-revision mechanism was built.

## 11. Handback boundary

This workspace contains public product code, synthetic fixtures, and local tests only. No private customer evidence, run IDs, provider receipts from live calls, deployment records, or media. The private manifest, real exports, footage, narration, deployment, and hosted acceptance are owned by the operator per the delivery plan.
