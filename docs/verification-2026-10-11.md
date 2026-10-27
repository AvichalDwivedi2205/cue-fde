# Cue and Bloom verification update — October 11, 2026

This updates the October 10 record. It separates provider evidence, isolated regression tests and customer-reported hardware behavior. It does not establish that every possible issue or external platform path works.

## Deployed changes

Cloud Run revision `cue-00004-679`, release `2bb8f19`, serves [Bloom](https://cue-987049542259.us-central1.run.app/bloom#/journal) and [Cue](https://cue-987049542259.us-central1.run.app/cue#/inbox). Build `3d55812a-12b8-40f5-bc99-8755ef3b381a` succeeded and the revision received all service traffic.

The owner reported that the earlier voice interface transcribed microphone speech, saved the report and played an audible reply, but that the voice sounded robotic and did not ask a follow-up. The supplied vague failure was added as a failing regression before the reply policy was changed. Google Cloud Chirp 3 HD Aoede now supplies spoken replies. The new panel shows recording, thinking and speaking states, consent, transcript history, replay, mute, interruption and end-session controls. This remains one short recorded turn at a time rather than an always-open real-time call.

Customer progress now derives from trusted issue/run evidence. Saving a report alone displays Received; it does not advance the card to Investigating. Approved specifications, implementation and verified releases remain separate stages. Older saved replies are retained as historical messages, not rewritten.

## Verification matrix

| Path | Result | Evidence and limits |
| --- | --- | --- |
| Isolated regression suite | Passed: 174 tests, 24 files | Includes reply-history guards, speech service failure behavior, webhook routing and honest progress. Does not contact providers. |
| TypeScript, lint, production build | Passed | Completed before the image build and deployment. |
| Hosted three-turn voice conversation | Passed: seven checks | Controlled audio passes through the live Gemini and Cloud TTS services, one case and persisted transcript/replies. Reply MP3s decode. This is not a substitute for human review of novel complaints or voice naturalness. |
| Retry of a completed voice turn | Passed | Same turn key returns the saved case and reply plus Cloud audio; no duplicate customer or Cue messages. |
| Native Chrome photo chooser | Passed | Selected a synthetic 3.2 MB PNG, uploaded, saved title/caption, reloaded and saw the same memory. Soft-deleted the disposable test memory afterward. |
| Hosted incoming support email without local polling | Passed | Paused the idle local worker, sent a real Gmail message, observed signed Resend delivery with HTTP 200 and `imported=1`, one persisted case and hosted Gemini classification. Worker was resumed and Slack/polling health recovered. |
| Actual Resend replay | Passed | A second provider delivery returned HTTP 200 and `imported=0`; the case retained one customer message. |
| Hosted dashboard support reply | Passed provider and native Gmail delivery | Sent from the public dashboard; Resend reports delivered from `support@cue.latchgrid.in` to the owned Gmail account. Native Gmail displays the reply in the same two-message thread. |
| Slack Socket Mode and coding worker | Running after controlled pause | Existing native role-routing and reply checks remain valid. Hosted HTTP event delivery is still unfinished. |
| X automatic intake | Still unverified | A native mention notification email did not arrive. Do not substitute manual capture or synthetic mail for this held-out check. |
| Reddit automatic intake | Previously passed | Native forwarded notification reached Cue. Public comment visibility failed because Reddit removed it; the webhook test does not resolve that moderation outcome. |
| Website at `cue.latchgrid.in` | Awaiting domain ownership approval | Working public HTTPS Cloud Run URL is available. Outbound email DNS verification is already complete. |

## Actual voice exchange

1. Vague report: “So I don't think this platform is working. Can you check once?” → “What were you trying to do, and what happened instead?”
2. Customer supplies a 3 MB photo, Pixel, Chrome and a loading screen that never finishes → Cue acknowledges those details and asks whether a different photo succeeds.
3. Customer says a different small photo also hangs with no error → Cue asks whether the upload finishes on a different network.

Observed request-to-response latency was 4.3–5.4 seconds for these three turns, excluding local generation of the synthetic test input and actual playback time. There is no latency or semantic-quality guarantee beyond those samples. The history guards address explicit repeat patterns; they are not a general proof that the model never repeats a question. If speech synthesis fails, the saved text remains available and the UI reports playback failure.

## Email and browser evidence

Hosted email case `j9743dnnemrtgrs3ca8nh8yg458g141b` came from `CUE-CLOUD-INTAKE-1011`. Receiving email ID `33ca06a5-efa9-47c7-a381-d62498cfeaab` has an actual Resend webhook success at 00:51:59 IST with `imported=1`. Provider replay at 00:52:35 returned `imported=0`. The hosted Gemini suggestion grouped the dark-mode request with FR-4. Reply receipt `01a12745-0293-7a8e-b2c4-2a9ef6231c84` reports delivered.

Private local evidence:

- `.cue/hosted-voice-conversation.json`: transcripts, replies, bounded latency and seven checks.
- `.cue/hosted-email-intake-verification.json`: actual provider event and attempt IDs, imported counts, classification and delivered reply.
- `artifacts/hosted-cue-voice-panel.png`, `artifacts/cue-voice-mobile.png`: the new live/phone UI.
- `artifacts/hosted-bloom-upload-passed.png`: saved title, caption and uploaded photo after reload.
- `artifacts/hosted-email-intake-case.png`: retained incoming message, private triage note and composed reply.
- `artifacts/hosted-email-webhook-reply-gmail.png`: real branded reply in the original Gmail thread.

## Reproduction and remaining constraints

```sh
npm run test:backend
npm run typecheck
npm run lint
npm run build
CUE_VERIFY_ORIGIN=https://cue-987049542259.us-central1.run.app npx tsx scripts/verify-voice-conversation.ts
CUE_VERIFY_ORIGIN=https://cue-987049542259.us-central1.run.app npx tsx scripts/verify-email-webhook.ts
```

The voice verifier creates a labelled synthetic verification case using the real services. The email verifier is read-only: it requires a uniquely marked real report, actual provider replay and sent dashboard reply already present. For a fresh email use `CUE_VERIFY_EMAIL_MARKER`, send it to the configured support inbox, replay its event in Resend and send a reviewed reply from Cue. It does not manufacture an event or establish that a worker was stopped. Cloud speech requires an enabled Text-to-Speech API, ADC and service-usage permission in the billable AI project. A failed provider request cannot authorize an unsupported claim that a fix is released or that investigation has begun.

Receiving webhooks save intake before acknowledgment. Asynchronous Gemini classification uses Next.js `after()` and has no durable retry queue yet; the successful paused-worker observation is not a crash-recovery guarantee. Personal Codex jobs and current Slack Socket Mode still need the configured local worker. Incoming mail should start at `support@tenuetkel.resend.app`; verified outbound identity does not provide an MX receiving route at `support@cue.latchgrid.in`. The forwarded notification path processes provider excerpts and does not fetch platform content or publish social replies.
