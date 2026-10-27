# Cue and Bloom verification update — October 11, 2026

This updates the October 10 record. It separates provider evidence, isolated regression tests and customer-reported hardware behavior. It does not establish that every possible issue or external platform path works.

## Deployed changes

Cloud Run revision `cue-00006-pqf`, container release `c047a91`, serves [Bloom](https://cue.latchgrid.in/bloom#/journal) and [Cue](https://cue.latchgrid.in/cue#/inbox). Build `b86b6b44-eab4-4ca5-a028-75bc9bf131ee` succeeded, and the revision receives all service traffic. The Convex workflow fix in `99c0fda` was subsequently deployed to production `tangible-kiwi-777`; it changes the backend without replacing the container.

Google Search Console domain ownership is verified. The approved GoDaddy `cue` CNAME points to `ghs.googlehosted.com`; Cloud Run reports Ready and CertificateProvisioned. Normal TLS requests, the WorkOS PKCE callback, authenticated operator access and the five hosting checks passed at the custom domain. Bloom's registered widget permits the custom origin as well as the existing Cloud Run origin. Existing root-domain DNS records were preserved.

The owner reported that the earlier voice interface transcribed microphone speech, saved the report and played an audible reply, but that the voice sounded robotic and did not ask a follow-up. The supplied vague failure was added as a failing regression before the reply policy was changed. Google Cloud Chirp 3 HD Aoede now supplies spoken replies. The new panel shows recording, thinking and speaking states, consent, transcript history, replay, mute, interruption and end-session controls. This remains one short recorded turn at a time rather than an always-open real-time call.

Customer progress now derives from trusted issue/run evidence. Saving a report alone displays Received; it does not advance the card to Investigating. Approved specifications, implementation and verified releases remain separate stages. Older saved replies are retained as historical messages, not rewritten.

## Verification matrix

| Path | Result | Evidence and limits |
| --- | --- | --- |
| Isolated regression suite | Passed: 190 tests, 26 files | Includes reply-history guards, speech failures, signed webhook health, honest progress and preservation of reviewed feature workflows. Does not contact providers. |
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
| X automatic intake | Still unverified | A second native mention from the authorized tester was published after notification settings were checked; no mention email arrived at the recorded Gmail check. Do not substitute manual capture or synthetic mail for this held-out check. |
| Reddit automatic intake | Previously passed | Native forwarded notification reached Cue. Public comment visibility failed because Reddit removed it; the webhook test does not resolve that moderation outcome. |
| Website at `cue.latchgrid.in` | Passed | Valid public TLS, authenticated operator page and five hosting checks, including upload boundary, storage persistence, foreign-origin denial, secure customer cookies and custom-domain WorkOS callback. |

## Hosted Slack and workflow regression

The existing Cue Slack app has its signed events and interactive-action URL saved as `https://cue-987049542259.us-central1.run.app/api/webhooks/slack`. Native Socket Mode is disabled; shared encrypted configuration selects webhook delivery. Connection status requires a recent persisted, signature-verified event tied to the current workspace, channels and signing secret. Saved credentials alone cannot produce Connected, and stale proof is shown explicitly.

Native controlled report `CUE-CLOUD-SLACK-1011` created case `j974rxfm3syma6f1x4p25nkfhn8g1j8w`, linked to FR-16 (`jh74bz05d8j66rw2kfsby8h3t98g1cqh`). A composed dashboard question reached its original Slack thread at receipt `C0C8A9JSCGH:1791662001.602389`. The Product review card has receipt `C0C86DRQVML:1791662210.123559`. Owner Avichal confirmed the exact specification through the native card; the decision receipt is `C0C86DRQVML:1791662245.813339`. No implementation run was created. A fresh hosted event was logged on revision `cue-00006-pqf` with HTTP 200 and 0.167-second acknowledgment latency; this is one observed request, not a latency guarantee.

The final verifier caught a real regression: follow-up classification reset an approved feature to Requested while leaving its spec and approval metadata intact. Eight isolated checks reproduced lifecycle reset or unsafe relinking before the fix. Triage now reads current workflow state transactionally, promotes only unreviewed reports and keeps reviewed/active case links. Legacy inconsistent Requested status is reconciled only when a specification, original reviewer and approval timestamp remain and no implementation run exists, with a distinct recovery audit event. It does not create a new decision or job. Ten regression checks cover this behavior and its recovery boundaries.

After deployment, native follow-up `CUE-CLOUD-SLACK-AFTER-FIX-1011` persisted once. The live verifier confirmed the same spec SHA-256 `e6f10efcb74657ffbe8a3f18c5f2a1cb5e8bc392c3f372a94e18fa0646ab2494`, reviewer `Avichal · Slack U0C8C15CFBN`, original approval time `1791662244649`, one review/decision receipt and zero implementation runs. The public custom-domain dashboard displays Spec approved with that reviewer and time.

## Fresh X experiment

The authorized `dwivediavichal926` Chrome profile's account menu showed `@ConfusedAF2205` before posting. The fresh public [tagging test](https://x.com/ConfusedAF2205/status/2109012253718773827), marker `CUE-X-AUTO-1011`, visibly links `@bloomwithcue`. Brand email notifications were enabled, advanced notification mutes were off, and the quality filter was disabled for the test. The brand's X tab was closed after saving these preferences. Gmail's all-folder sender search still showed only X's welcome email at the recorded check, and no automatic case for this source was present. This isolates the unverified step to native notification arrival; it does not prove X will never deliver a delayed digest. X documents incomplete mention email coverage, so this remains best-effort intake, not comprehensive brand monitoring. Manual capture remains available as an explicit fallback.

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
- `.cue/hosting-verification.json`: five checks at the custom domain.
- `.cue/hosted-widget-verification.json`: nine live gateway checks at the custom domain.
- `artifacts/slack-hosted-events-verified.png`, `artifacts/slack-hosted-interactivity-saved.png`, `artifacts/slack-socket-disabled.png`: native provider configuration.
- `artifacts/slack-hosted-spec-approved.png`, `artifacts/slack-post-fix-followup.png`, `artifacts/cue-domain-approved-spec-preserved.png`: native decision, follow-up and custom-domain state.
- `artifacts/latchgrid-domain-ownership-verified.png`, `artifacts/cue-domain-dns-saved.png`: completed domain ownership and DNS changes.
- `artifacts/x-native-tagging-test-1011.png`, `artifacts/x-quality-filter-off.png`, `artifacts/x-email-notifications-enabled.png`: real tagging and saved notification preferences.

## Reproduction and remaining constraints

```sh
npm run test:backend
npm run typecheck
npm run lint
npm run build
CUE_VERIFY_ORIGIN=https://cue.latchgrid.in npx tsx scripts/verify-hosting.ts
CUE_VERIFY_ORIGIN=https://cue.latchgrid.in npx tsx scripts/verify-widget.ts
CUE_VERIFY_ORIGIN=https://cue.latchgrid.in npx tsx scripts/verify-voice-conversation.ts
CUE_VERIFY_ORIGIN=https://cue.latchgrid.in npx tsx scripts/verify-email-webhook.ts
npx tsx scripts/verify-slack-webhook.ts
```

The voice verifier creates a labelled synthetic verification case using the real services. The email verifier is read-only: it requires a uniquely marked real report, actual provider replay and sent dashboard reply already present. For a fresh email use `CUE_VERIFY_EMAIL_MARKER`, send it to the configured support inbox, replay its event in Resend and send a reviewed reply from Cue. It does not manufacture an event or establish that a worker was stopped. Cloud speech requires an enabled Text-to-Speech API, ADC and service-usage permission in the billable AI project. A failed provider request cannot authorize an unsupported claim that a fix is released or that investigation has begun.

The Slack verifier reads this controlled native fixture and requires its original exact spec version and decision timestamp, plus all three marked follow-ups. It does not post messages, approve anything or manufacture proof. Native card visibility, disabled Socket Mode and actual HTTPS request logs are independently recorded. Recent event proof is not a continuous liveness guarantee.

Receiving webhooks save intake before acknowledgment. Asynchronous Gemini classification uses Next.js `after()` and has no durable retry queue yet; the successful paused-worker observation is not a crash-recovery guarantee. Personal Codex jobs still need the configured local worker. Slack uses hosted HTTPS delivery; retained app-level credentials permit a future explicit Socket Mode fallback. Incoming mail should start at `support@tenuetkel.resend.app`; verified outbound identity does not provide an MX receiving route at `support@cue.latchgrid.in`. The forwarded notification path processes provider excerpts and does not fetch platform content or publish social replies. Growth/customer acquisition remains a plan in `docs/growth-plan.md`, not an implemented or verified feature.
