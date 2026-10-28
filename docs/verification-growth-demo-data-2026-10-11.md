# Growth demonstration data verification — October 11, 2026

Growth Results now offers an explicit Demo scenario with six editable sample counts: 48 discovered, 12 qualified, 8 approved, 6 published, 24 visits and 7 activated (29.2%). Every card is labeled as a demo figure. Counts persist only in this browser, scoped to the registered application; reload selects Live results. They never enter Convex, attribution, live analytics or agent context. The supplied `design/cue.html` remains byte-identical to commit `453f6c6`.

Application release: `7e0344c4d6f6b0c9b411dcfe25b8daf9afdf1a1c`. Frozen-source Cloud Build `28b0da5c-ce5e-496f-aef2-b0612c0a0f40` succeeded at `2026-10-11T06:34:44.822512Z`; image digest `sha256:26f19ca9b24fe9a3cc5e204b20baddaf23565ae7d92a3d9df5e229f5e77ac5b5`. Cloud Run revision `cue-00023-5vz` receives 100% of traffic. Existing runtime configuration was preserved; only the application release identifier changed. The subsequent backend-only qualification fix, commit `8eb75d9`, was deployed to `tangible-kiwi-777` at 12:12 IST. It does not change the web release identifier. Bloom's existing release and capability evidence were preserved.

## Actual source discovery

The deployed Campaigns editor saved this bounded query and paused scheduling:

```text
("photo journal" OR "photo diary" OR "photo journaling") (recommend OR app OR looking OR wish OR search) -is:retweet -from:bloomwithcue lang:en
```

Changing the query clears only its discovery checkpoint, preserving evidence, existing outcomes, cooldowns and the day's reserved-read budget. One explicit Run now used the existing official X integration through the hosted workpool. It returned two real posts, with the actual query retained in their Agent discovery provenance:

- [Graphicfort](https://x.com/Graphicfort/status/2108219354445668440): a photo-diary product promotion.
- [USAThroughTime](https://x.com/USAThroughTime/status/2109008948686684658): a Washington history-book promotion.

Both were correctly dismissed because neither contains an explicit consumer request. They are real discovered posts, not qualified prospects. Native X inspection also verified [timgels's March 4, 2019 request](https://x.com/timgels/status/1102406810609348608) for a photo journal with audio captions. Official single-post capture retained its original date and Operator-assisted provenance. It remains pending qualification and must not be presented as a fresh lead or verified caption-search match.

Live Results shows three noncontrolled discovered records, zero qualified, approved, published, visits and activations. Scheduling remains paused at 20/20 reserved reads. No new outreach, reply or approval was created. No purchase, recharge or paid-plan change was made; provider calls used existing free credits and the configured guards.

## Qualification explanation correction

Real provider testing exposed a discrepancy: the hard gate dismissed promotional posts, but the model's explanation could still claim high fit and invent an explicit request. The backend now makes failed hard gates own the displayed need, fit and reasons as well as eligibility. Unsupported sources retain their original text, Low fit and a factual rejection reason. Qualification receipts carry policy version 2, allowing one explicit refresh of an older policy without invalidating capability checks or automatically rewriting saved evidence. Both promotional records were explicitly refreshed through the hosted provider and verified as Low fit with their original source text and the no-explicit-request explanation.

## Verification completed

- 295 tests across 42 files, lint, typecheck and production build passed after the final code change. Backend tests cover query authorization, active-work guards, cursor reset, preservation of saved evidence and budgets, factual hard-gate explanations, policy refresh and capability validity. Browser-bridge tests cover opt-in sample mode, application isolation, persistence, validation, corrupt saved values, reset and absence of backend writes or live-count contamination.
- Production Convex compilation and deployment passed with typechecking enabled.
- Five public verifier checks passed against the exact web release above: public landing, workspace links, protected operator APIs, WorkOS PKCE/callback and health release identity.
- Native Chrome exercised the actual deployed query editor, Run now, provider discovery, source capture and qualification display. Both refreshed promotional records retain Agent discovery provenance with the actual query; the historical source retains assisted provenance and its original date.
- On the actual deployed Results screen, saving 8 activations displayed 33.3%. Reload selected Live results; returning to Demo scenario restored the saved 8. Attempting 25 activations with 24 visits was rejected without changing the cards. Reset example restored 7 activations and 29.2%.
- Local desktop and 393 × 852 mobile views were inspected. All six sample cards remained usable without horizontal overflow. The temporary viewport override was reset.
- Deep comparison of production snapshots confirmed the original two controlled opportunities, approved draft, review delivery, verified publication/touch, capability, one controlled browser and three trusted events were unchanged. Organic traffic and activation remain zero.

Deployed screenshots: `artifacts/cue-growth-demo-7e0344c.png` and `artifacts/cue-growth-source-8eb75d9.png`. Private snapshots and deployment metadata remain ignored under `.cue/`. Existing platform deferrals and quality limits remain in their separate reports. These checks establish this implementation and its observed results; they do not establish organic growth or complete platform readiness.
