# Cue and Bloom verification update — October 11, 2026

This updates the October 10 record. It separates provider evidence, isolated regression tests and customer-reported hardware behavior. It does not establish that every possible issue or external platform path works.

## Deployed changes

Cloud Run revision `cue-00009-dzt`, container release `0207447`, serves [Bloom](https://cue.latchgrid.in/bloom#/journal) and [Cue](https://cue.latchgrid.in/cue#/inbox). Build `72a9751e-fe71-4948-aafb-238967dd83cc` compiled the application at `13cb36c`; build `2e2f002a-eb57-433e-a4c7-b3c9c32839f0` copied the sole browser-source change at `0207447` onto that verified image. Both succeeded, and the revision receives all service traffic. The public API reports the full release SHA `02074472a88383d2addfa3b27e84ec036fd3b1c6`, which the five final public checks required before making any disposable test mutations. The production Convex deployment `tangible-kiwi-777` also includes workflow preservation (`99c0fda`) and native X receipt validation (`ff1d65d`). Later verifier/documentation commits do not replace the container.

Google Search Console domain ownership is verified. The approved GoDaddy `cue` CNAME points to `ghs.googlehosted.com`; Cloud Run reports Ready and CertificateProvisioned. Normal TLS requests, the WorkOS PKCE callback, authenticated operator access and the five hosting checks passed at the custom domain. Bloom's registered widget permits the custom origin as well as the existing Cloud Run origin. Existing root-domain DNS records were preserved.

The owner reported that the earlier voice interface transcribed microphone speech, saved the report and played an audible reply, but that the voice sounded robotic and did not ask a follow-up. The supplied vague failure was added as a failing regression before the reply policy was changed. Google Cloud Chirp 3 HD Aoede now supplies spoken replies. The new panel shows recording, thinking and speaking states, consent, transcript history, replay, mute, interruption and end-session controls. This remains one short recorded turn at a time rather than an always-open real-time call.

Customer progress now derives from trusted issue/run evidence. Saving a report alone displays Received; it does not advance the card to Investigating. Approved specifications, implementation and verified releases remain separate stages. Older saved replies are retained as historical messages, not rewritten.

## Verification matrix

| Path | Result | Evidence and limits |
| --- | --- | --- |
| Isolated regression suite | Passed: 205 tests, 27 files | Includes reply-history guards, speech failures, signed webhook health, honest progress and preservation of reviewed feature workflows. Does not contact providers. |
| TypeScript, lint, production build | Passed | Completed before the image build and deployment. |
| Hosted three-turn voice conversation | Passed: seven checks | Controlled audio passes through the live Gemini and Cloud TTS services, one case and persisted transcript/replies. Reply MP3s decode. This is not a substitute for human review of novel complaints or voice naturalness. |
| Widget gateway at the custom domain | Passed: nine checks | Separate visitors, app/request origin rejection, forged-token denial, one conversation across follow-ups, real screenshot storage, stripped query strings, private-note isolation and restricted iframe embedding. Native installed-widget/browser checks remain separate earlier evidence. |
| Retry of a completed voice turn | Passed | Same turn key returns the saved case and reply plus Cloud audio; no duplicate customer or Cue messages. |
| Native Chrome photo chooser | Passed | Selected a synthetic 3.2 MB PNG, uploaded, saved title/caption, reloaded and saw the same memory. Soft-deleted the disposable test memory afterward. |
| Hosted incoming support email without local polling | Passed | Paused the idle local worker, sent a real Gmail message, observed signed Resend delivery with HTTP 200 and `imported=1`, one persisted case and hosted Gemini classification. Worker was resumed and Slack/polling health recovered. |
| Actual Resend replay | Passed | A second provider delivery returned HTTP 200 and `imported=0`; the case retained one customer message. |
| Hosted dashboard support reply | Passed provider and native Gmail delivery | Sent from the public dashboard; Resend reports delivered from `support@cue.latchgrid.in` to the owned Gmail account. Native Gmail displays the reply in the same two-message thread. |
| Hosted Slack intake, replies and specification decision | Passed: nine checks | Native mention and three follow-ups reached one case through signed HTTPS events. Dashboard reply, exact-spec review and Owner decision have real provider receipts. Socket Mode is disabled. Original approval survived the post-fix follow-up. Earlier native Product/Engineering routing and Support denial remain separate evidence. |
| Personal Codex worker and email polling fallback | Running | Local worker is idle and notification polling is healthy. Personal-account coding jobs still depend on this machine; hosted Slack and receiving-email webhooks do not. |
| X automatic intake | Passed through the official API: four live checks | Fresh @ConfusedAF2205 mention after activation produced one official API case with exact source/author, Gemini feature classification, caption/search tags, unique messages and completed worker cursor. Notification email failed its bounded checks; API polling needs this local worker and available free credits. |
| Reddit automatic intake | Passed; four checks re-run after the backend update | Native forwarded notification reached Cue. Public comment visibility failed because Reddit removed it; the receipt test does not resolve that moderation outcome. |
| Website at `cue.latchgrid.in` | Passed again on `0207447` | Five hosting checks required the exact release and verified upload boundary, storage persistence, foreign-origin denial, secure customer cookies and the WorkOS callback. Authenticated native Cue showed the new source label and actual customer case count. Nine widget checks remain separate evidence from `e21122b`; their server code is unchanged. |

## Hosted Slack and workflow regression

The existing Cue Slack app has its signed events and interactive-action URL saved as `https://cue-987049542259.us-central1.run.app/api/webhooks/slack`. Native Socket Mode is disabled; shared encrypted configuration selects webhook delivery. Connection status requires a recent persisted, signature-verified event tied to the current workspace, channels and signing secret. Saved credentials alone cannot produce Connected, and stale proof is shown explicitly.

Native controlled report `CUE-CLOUD-SLACK-1011` created case `j974rxfm3syma6f1x4p25nkfhn8g1j8w`, linked to FR-16 (`jh74bz05d8j66rw2kfsby8h3t98g1cqh`). A composed dashboard question reached its original Slack thread at receipt `C0C8A9JSCGH:1791662001.602389`. The Product review card has receipt `C0C86DRQVML:1791662210.123559`. Owner Avichal confirmed the exact specification through the native card; the decision receipt is `C0C86DRQVML:1791662245.813339`. No implementation run was created. A fresh hosted event was logged on revision `cue-00006-pqf` with HTTP 200 and 0.167-second acknowledgment latency; this is one observed request, not a latency guarantee.

The final verifier caught a real regression: follow-up classification reset an approved feature to Requested while leaving its spec and approval metadata intact. Eight isolated checks reproduced lifecycle reset or unsafe relinking before the fix. Triage now reads current workflow state transactionally, promotes only unreviewed reports and keeps reviewed/active case links. Legacy inconsistent Requested status is reconciled only when a specification, original reviewer and approval timestamp remain and no implementation run exists, with a distinct recovery audit event. It does not create a new decision or job. Ten regression checks cover this behavior and its recovery boundaries.

After deployment, native follow-up `CUE-CLOUD-SLACK-AFTER-FIX-1011` persisted once. The live verifier confirmed the same spec SHA-256 `e6f10efcb74657ffbe8a3f18c5f2a1cb5e8bc392c3f372a94e18fa0646ab2494`, reviewer `Avichal · Slack U0C8C15CFBN`, original approval time `1791662244649`, one review/decision receipt and zero implementation runs. The public custom-domain dashboard displays Spec approved with that reviewer and time.

## Fresh X experiment

The authorized `dwivediavichal926` Chrome profile's account menu showed `@ConfusedAF2205` before posting. The fresh public [tagging test](https://x.com/ConfusedAF2205/status/2109012253718773827), marker `CUE-X-AUTO-1011`, visibly links `@bloomwithcue`. Brand email notifications were enabled, advanced notification mutes were off, and the quality filter was disabled for the test. The brand's X tab was closed after saving these preferences. Gmail's all-folder sender search still showed only X's welcome email at the recorded check, and no automatic case for this source was present. A later native check, signed in as `@bloomwithcue`, also showed an empty Mentions timeline. The unverified step is X's own notification delivery; this does not prove X will never deliver a delayed digest. X documents incomplete mention email coverage, so this remains best-effort intake, not comprehensive brand monitoring. Manual capture remains available as an explicit fallback.

### Official API fallback

Commits `ff1d65d` and `e21122b` add a disabled-by-default official X connector with encrypted credentials, exact brand validation, five-post bounded polling, a first-enablement history cutoff, a private restart cursor, rate-limit cooldown and transactional cross-transport deduplication. The existing worker now exposes X polling health independently of notification-email health. Fifteen new isolated checks passed; the complete suite passed 205 checks across 27 files, followed by TypeScript and lint. Convex's native API receipt validation was deployed to production. These tests use mocks for X and do not establish provider access or a real captured mention.

The user approved X developer terms and submission of the accurate support use case. Signup briefly returned “This account already has a project on this product.” After the same browser extension reconnected, the existing Bloom developer account (`2109018601000686072`) and app (`33521926`) were visible. The displayed OAuth access was Read; Project Access was initially Not connected. The prepared Default Project offers Development, Staging and Production connections. At that early checkpoint, the account showed $0 total/free credits, no saved payment method, and a concrete offer of $20 free credits after adding a first card without a purchase. No card was saved, credit purchased, auto-recharge enabled or bearer token generated at this recorded point. The owner subsequently approved the Default Project Development connection, and X visibly confirms Connected. Token generation opened a credential-replacement confirmation; the owner was asked to perform that final action directly. At that checkpoint, credential storage and owner-entered card setup were pending and official intake stayed disabled. The public setup page visibly showed X API intake disabled, with no saved X credential. The deployed dashboard loaded real provider state: Slack connected, email configured and X notification inbox connected with an explicit delivery caveat.

Before every mentions page Cue checks free credit availability, a $1 reserve and unexpired grants. It cannot buy credits or configure auto-recharge, and paid balance alone cannot enable collection. The [first-card offer](https://docs.x.com/x-api/getting-started/free-credits) is conditional and expiring. A separate process spending the same account can defeat a client-side reserve; this is not an absolute provider billing cap. Public reply posting remains an operator action. The new `verify-x-api.ts` requires a native receipt, re-reads the actual source/author, and verifies tags, classification, deduplication and the worker cursor before writing live success evidence. The first live success file was written only after the fresh source, classification and completed cursor checks passed; see the final API evidence below.

The brand can open the tester's public post in native X, confirming that it is visible to Bloom. Bloom followed the authorized tester for a fresh notification-filter experiment; Following was verified. The tester reopened the authorized profile. Its native account menu again showed @ConfusedAF2205 before publishing [CUE-X-AUTO-FOLLOW-1011](https://x.com/ConfusedAF2205/status/2109024955195330986) at 02:25 IST. The public post visibly tags @bloomwithcue. Bloom's X tab was closed before publishing. The first real-case check found zero matching cases; Gmail's marker search found no message and its platform-sender search still showed only the welcome email. A final inbox refresh after 02:33 IST again showed only that welcome email; the final real-case verifier still found zero cases. Email intake failed this bounded delivery experiment. A delayed digest remains possible, so this is not evidence that X can never send an email. Selective forwarding remains visibly enabled in the dedicated inbox. Earlier held-out posts remain uncaptured manually. Screenshots `artifacts/x-followed-tester.png`, `artifacts/x-native-followed-tagging-test.png`, `artifacts/x-developer-app-ready.png` and `artifacts/x-free-credit-offer.png` record these observations. `artifacts/x-project-access-prepared.png` and `artifacts/hosted-x-setup-ready.png` show the project preparation and live paused connector.

After the owner approved regeneration in chat, a fresh dialog check still showed the pending “Yes, regenerate” button. Chat approval did not complete that browser action; the required owner handoff was still open at that checkpoint. The account's first-card offer led to an empty card-entry form (`artifacts/x-owner-card-entry.png`), with no card entered or saved by the agent. The form explicitly says no charge will be made and that saving allows future payments under X's terms. No token value was captured, no X configuration saved, and no provider API polling enabled at this checkpoint.

The owner subsequently saved a payment method directly in X. Native Payments showed a Succeeded $20.00 Voucher at October 11, 2026, 02:38 IST (the console displays October 10, 21:08 UTC). The first Credits view still showed zero; returning after inspecting that transaction showed $20.00 remaining, all $20.00 identified as Free credits, expiry January 8, 2027, and Auto Recharge Off. Screenshot `artifacts/x-free-credits-confirmed.png` records the settled state. No credit purchase or auto-recharge was performed by the agent. The app tab still showed the pending regeneration confirmation and Cue showed Setup needed with an empty bearer field; no X key was captured or saved and no API polling was enabled. Preflight confirmed the local worker services and notification intake were reachable, with X collection disabled. Live X verification was pending at this checkpoint; the completed token handoff and subsequent API test are recorded below.

## Live official X API verification

The owner completed the credential-replacement action directly in X. The visible generated token was transferred to Cue through its password field and saved in encrypted server configuration; it was never printed, copied into Git or stored in plaintext evidence. The native token dialog was closed after the save succeeded. Cue first saved collection paused, then enabled it only after the actual credit endpoint and exact brand lookup passed. The brand user ID is `2108878745746677760`, not developer account `2109018601000686072`.

The authorized tester account menu visibly showed `@ConfusedAF2205` before publishing [CUE-X-API-1011-A](https://x.com/ConfusedAF2205/status/2109030401444606341) at 02:46 IST on October 11. This new post was published after activation and was not manually captured or sent as synthetic notification email. It automatically created case `j978cxd9njabbn4re9w5mn5ekx8g06yd`, external receipt `x-api:x:2109030401444606341`, with the actual API author and permalink. Gemini classified it as a feature request; its saved tags include `search`, `caption`, `photo` and `memory`.

Four read-only live verifier checks passed at 02:48 IST: native API provenance and one case after activation; actual X source text, author and exact brand mention; one customer message with persisted Gemini classification/tags; and a completed durable cursor with healthy worker status. The first read found intake and classification complete while the bounded pagination cursor was still pending; final success was recorded only after the worker completed its next page. The checkpoint is private, mode 0600, and final `sinceId` covers this post. Evidence is `.cue/x-api-verification.json` and `artifacts/x-native-api-tagging-test.png`.

Cue generated and saved a reviewed reply for this automatically imported case. The exact saved draft was published through Bloom's native X session as [reply 2109031549559771601](https://x.com/bloomwithcue/status/2109031549559771601), then opened in the separate tester session whose account menu showed @ConfusedAF2205. The exact brand response was visibly present in that thread. A private Cue note records the permalink and independent visibility check. Screenshot `artifacts/x-api-reply-independently-visible.png` records this delivery; this was an operator action, not autonomous API posting.

A refreshed native Credits page and the actual credit endpoint both reported **$19.98 free credits remaining** after the live test. The console displays $0.02 current spend, January 8, 2027 expiry and Auto Recharge Off. Screenshot `artifacts/x-credits-after-live-test.png` records the settled balance. This is free-credit consumption, not a new purchase. Cue's guard checks each bounded page and pauses below its $1 reserve; the local worker remains required and public replies remain reviewed native-browser actions.

## Final deployed UI and release checks

Commit `13cb36c` displays source-specific provenance on X cards: official API, notification email or operator capture. Commit `0207447` derives the Other cases count from saved app-bound customer identities, excluding the current case; anonymous widget guests are not grouped merely by their display names. A full native reload of the automatically imported X case showed “Collected via X API” and one other saved case for @ConfusedAF2205. Screenshot `artifacts/cue-live-x-api-verified.png` records the customer message, source, saved tags and correct count. The public Integrations page shows active official API polling and one collected post in `artifacts/cue-connected-integrations-final.png`.

Lint, TypeScript and the production build passed for the provenance change; lint and syntax checks passed for the browser count change. The final hosting check caught an outdated `CUE_RELEASE_COMMIT`: the new code was already live, but its runtime configuration reported the preceding release. The private configuration was corrected without changing the image. `verify-hosting.ts` now accepts `CUE_VERIFY_RELEASE` and rejects a mismatched release before uploading or saving test data. It failed against the old label, then passed all five public checks on revision `cue-00009-dzt` with the exact `0207447` SHA. TypeScript, verifier lint and formatting also passed. Later verifier and report commits do not change the deployed application image.

## Actual voice exchange

1. Vague report: “So I don't think this platform is working. Can you check once?” → “What were you trying to do, and what happened instead?”
2. Customer supplies a 3 MB photo, Pixel, Chrome and a loading screen that never finishes → Cue acknowledges those details and asks whether a different photo succeeds.
3. Customer says a different small photo also hangs with no error → Cue asks whether the upload finishes on a different network.

The original hosted run observed request-to-response latency of 4.3–5.4 seconds. The custom-domain repeat at 01:50 IST passed all seven checks with latencies of 4.1, 4.0 and 12.5 seconds; it again asked what failed, tested a different photo, then advanced to a network check. These measurements exclude local generation of synthetic input and actual playback time. They are bounded observations, not a latency or semantic-quality guarantee. The history guards address explicit repeat patterns; they are not a general proof that the model never repeats a question. If speech synthesis fails, the saved text remains available and the UI reports playback failure.

## Email and browser evidence

Hosted email case `j9743dnnemrtgrs3ca8nh8yg458g141b` came from `CUE-CLOUD-INTAKE-1011`. Receiving email ID `33ca06a5-efa9-47c7-a381-d62498cfeaab` has an actual Resend webhook success at 00:51:59 IST with `imported=1`. Provider replay at 00:52:35 returned `imported=0`. The hosted Gemini suggestion grouped the dark-mode request with FR-4. Reply receipt `01a12745-0293-7a8e-b2c4-2a9ef6231c84` reports delivered.

Private local evidence:

- `.cue/hosted-voice-conversation.json`: transcripts, replies, bounded latency and seven checks.
- `.cue/hosted-email-intake-verification.json`: actual provider event and attempt IDs, imported counts, classification and delivered reply.
- `artifacts/hosted-cue-voice-panel.png`, `artifacts/cue-voice-mobile.png`: the new live/phone UI.
- `artifacts/hosted-bloom-upload-passed.png`: saved title, caption and uploaded photo after reload.
- `artifacts/hosted-email-intake-case.png`: retained incoming message, private triage note and composed reply.
- `artifacts/hosted-email-webhook-reply-gmail.png`: real branded reply in the original Gmail thread.
- `.cue/hosted-slack-verification.json`: nine read-only checks of real receipts, thread messages and preserved approval.
- `.cue/hosting-verification.json`: five checks at the custom domain, requiring the exact final application release.
- `.cue/hosted-widget-verification.json`: nine live gateway checks at the custom domain.
- `artifacts/slack-hosted-events-verified.png`, `artifacts/slack-hosted-interactivity-saved.png`, `artifacts/slack-socket-disabled.png`: native provider configuration.
- `artifacts/slack-hosted-spec-approved.png`, `artifacts/slack-post-fix-followup.png`, `artifacts/cue-domain-approved-spec-preserved.png`: native decision, follow-up and custom-domain state.
- `artifacts/latchgrid-domain-ownership-verified.png`, `artifacts/cue-domain-dns-saved.png`: completed domain ownership and DNS changes.
- `artifacts/x-native-tagging-test-1011.png`, `artifacts/x-quality-filter-off.png`, `artifacts/x-email-notifications-enabled.png`: real tagging and saved notification preferences.
- `artifacts/x-brand-mentions-empty-1011.png`: the brand's empty native mention timeline after the visible tagged post.
- `artifacts/bloom-domain-voice-panel.png`: the updated voice UI on the public custom domain.

## Reproduction and remaining constraints

```sh
npm run test:backend
npm run typecheck
npm run lint
npm run build
CUE_VERIFY_ORIGIN=https://cue.latchgrid.in CUE_VERIFY_RELEASE=02074472a88383d2addfa3b27e84ec036fd3b1c6 npx tsx scripts/verify-hosting.ts
CUE_VERIFY_ORIGIN=https://cue.latchgrid.in npx tsx scripts/verify-widget.ts
CUE_VERIFY_ORIGIN=https://cue.latchgrid.in npx tsx scripts/verify-voice-conversation.ts
CUE_VERIFY_ORIGIN=https://cue.latchgrid.in npx tsx scripts/verify-email-webhook.ts
npx tsx scripts/verify-slack-webhook.ts
# After first enablement and a fresh native mention, with verified free credits:
npx tsx scripts/verify-x-api.ts <fresh-post-url> <unique-marker> <bug-or-feature> [expected-tags...]
```

The voice verifier creates a labelled synthetic verification case using the real services. The email verifier is read-only: it requires a uniquely marked real report, actual provider replay and sent dashboard reply already present. For a fresh email use `CUE_VERIFY_EMAIL_MARKER`, send it to the configured support inbox, replay its event in Resend and send a reviewed reply from Cue. It does not manufacture an event or establish that a worker was stopped. Cloud speech requires an enabled Text-to-Speech API, ADC and service-usage permission in the billable AI project. A failed provider request cannot authorize an unsupported claim that a fix is released or that investigation has begun.

The Slack verifier reads this controlled native fixture and requires its original exact spec version and decision timestamp, plus all three marked follow-ups. It does not post messages, approve anything or manufacture proof. Native card visibility, disabled Socket Mode and actual HTTPS request logs are independently recorded. Recent event proof is not a continuous liveness guarantee.

Receiving webhooks save intake before acknowledgment. Asynchronous Gemini classification uses Next.js `after()` and has no durable retry queue yet; the successful paused-worker observation is not a crash-recovery guarantee. Personal Codex jobs still need the configured local worker. Slack uses hosted HTTPS delivery; retained app-level credentials permit a future explicit Socket Mode fallback. Incoming mail should start at `support@tenuetkel.resend.app`; verified outbound identity does not provide an MX receiving route at `support@cue.latchgrid.in`. The forwarded notification path processes provider excerpts and does not fetch platform content or publish social replies. Growth/customer acquisition remains a plan in `docs/growth-plan.md`, not an implemented or verified feature.
