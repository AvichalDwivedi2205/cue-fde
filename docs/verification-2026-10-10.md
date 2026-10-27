# Cue and Bloom verification — October 10, 2026

This record distinguishes live provider/browser evidence from isolated tests and unfinished external checks. Passing one layer does not establish the others.

## Live deployment

- [Bloom journal](https://cue-987049542259.us-central1.run.app/bloom#/journal)
- [Cue dashboard](https://cue-987049542259.us-central1.run.app/cue#/inbox)
- [Setup](https://cue-987049542259.us-central1.run.app/setup)
- [Installed public widget](https://cue-987049542259.us-central1.run.app/widget-playground?app=cue_app_8e64efa1d434c92d2efe209e)

Cloud Run service `cue`, region `us-central1`, revision `cue-00003-2c2`, serves release `1cb9bd59ee0f2c63148cb4df449404eb10e14a6a`. Cloud Convex deployment is `tangible-kiwi-777`. WorkOS has the public callback registered and native sign-in passed as the saved Owner. Signed-out `/cue` redirects through the reachable callback. Public operator APIs reject unauthenticated requests; there is no hosted local-operator bypass.

The website, storage and Convex do not require localhost. Slack Socket Mode, receiving-email polling and Codex implementation jobs still require the persistent local worker. Keep `npm run dev` running on the configured machine. Personal Codex and GitHub login credentials were not copied into Cloud Run.

## Verification matrix

| Path | Result | Evidence and limit |
| --- | --- | --- |
| Isolated backend/gateway suite | Passed: 163 tests across 22 files | Actual Convex handlers use `convex-test`; these tests do not contact live providers. |
| TypeScript, lint, production build | Passed | Production image built successfully and the final revision is ready. |
| Local gateway against cloud Convex | Passed: core 18, widget 9, voice 8, Slack 11, team 8, email 6, Reddit intake 4 | Live checks use actual provider records where stated; some controlled negative checks run through trusted server functions. |
| Public HTTPS contracts | Passed: core 18, widget 9, voice 8, hosting 5 | Real cloud image storage, size boundary, origin/visitor rejection, secure signed cookie, WorkOS redirect, Gemini transcription and durable voice turns. |
| Public Bloom conversation | Passed in native Chrome | Report appears in Cue; reviewed tags survive reload; staff reply returns to Bloom; private operator note stays absent. |
| Public installed widget | Passed in native Chrome | New allowed-origin registration and install snippet, report creation, reload persistence, operator reply, private-note isolation; independent browser profile sees an empty conversation. |
| Public dashboard → Slack | Passed | Reply appears in the original native Slack thread with tags and verified-fix card; provider receipt also persisted. |
| Public dashboard → branded support email | Passed | Gmail shows the actual reply in the original thread from `support@cue.latchgrid.in`; Resend reports delivered. |
| Slack roles and approval routing | Passed in the existing live workflow | Holly's Product decision and Ganesh's exact-commit Engineering decision persisted; Aria's disallowed Product decision was denied. The four personas are user-owned test accounts. |
| Codex implementation and release | Passed for the scoped upload fixture and approved caption search | Product feature PR #1 was reviewed and explicitly merged. This is not a general automatic deployment adapter for arbitrary repositories. |
| X operator-assisted capture and reply | Passed | Separate request captured, tags/draft persisted; brand reply independently visible to the tester. This does not prove automatic collection. |
| X automatic tagging intake | Unverified | Held-out `CUE-X-AUTO-1010` mention exists, but no real notification email had arrived at the recorded native Gmail check. It was not manually captured or replaced with a fixture email. |
| Reddit automatic tagging intake | Passed | Native mention email → selective Gmail forwarding → Resend → Cue case, with receipt and deduplication. Notification excerpt and author are marked unverified; Cue did not fetch the full comment. |
| Reddit public comment/reply delivery | Failed visibility check | Reddit removed the public test comment. Author-visible text is insufficient delivery evidence. API access is not connected. |
| Real microphone and speakers | Unfinished | Fixed speech WebM validates the hosted audio/Gemini path. Owner permission, speaking into the microphone and confirming audible playback remain needed. |
| Chrome file-chooser automation | Unfinished | Extension requires “Allow access to file URLs.” Actual upload HTTP endpoints, valid image decoding, limits and cloud persistence passed; those are separate from the native chooser. |
| Website at `cue.latchgrid.in` | Unfinished | Google root-domain ownership verification awaits approval. Use the working HTTPS Cloud Run URL. The approved email DNS records are complete. |
| New mail sent directly to branded support address | Not configured | Outbound sender is verified; Reply-To routes to the managed receiving inbox. Start support mail at `support@tenuetkel.resend.app`. |
| Growth/customer acquisition | Planned | `growth-plan.md` defines a measured experiment; no automatic prospecting or acquisition outcome is claimed. |

## Native public browser evidence

Bloom case `j97fmn0sbg0jw2kfdpetamn6258g0n7h` records the dark-mode request and tags `Feature request`, `Dark mode`, `hosted-verified`. The customer received the reviewed reply explaining that it was saved for Product review and not approved or scheduled. The private operator verification note remained absent from Bloom after reload.

The public widget app `cue_app_8e64efa1d434c92d2efe209e` is bound to the exact public HTTPS origin. Case `j979wjwth3d6vabj4ht7z4qj2n8g0kjq` records the PDF export request. The dashboard reply correctly distinguishes an approved specification from an unreleased feature. Reply and report persisted across reload; internal triage and the private marker stayed absent. A separate Chrome profile showed only the empty support prompt.

Hosted Slack marker `CUE-HOSTED-SLACK-1010` was sent to case `j97cza3ds6k2ya3kx833g6jt818g0aq3`. The native thread showed the reply at 23:31 IST; receipt `C0C8A9JSCGH:1791655318.855059` is stored. Hosted email marker `CUE-HOSTED-EMAIL-1010` was sent to case `j970dm2716cdz0yn4kgv8ergnn8g1nsr`, reached Gmail at 23:29 IST, and has receipt `01a126f8-49b8-7c94-a452-e670c94aa9a0`.

Local evidence is private and ignored by Git:

- `.cue/hosting-verification.json`, `.cue/hosted-verification.json`, `.cue/hosted-widget-verification.json`, `.cue/hosted-voice-verification.json`
- `.cue/hosting-browser-verification.json`, `.cue/email-verification.json`, `.cue/slack-verification.json`, `.cue/team-verification.json`, `.cue/social-verification.json`
- `artifacts/public-bloom-chat-verified.jpg`, `artifacts/public-cue-tags-and-private-note.jpg`, `artifacts/public-widget-install-snippet.jpg`, `artifacts/public-widget-reply-persisted.jpg`
- `artifacts/hosted-slack-native-thread.jpg`, `artifacts/hosted-email-delivered-gmail.jpg`, `artifacts/reddit-removal-verified.jpg`

## Reproduction

The isolated suite, type checking, lint and production build do not need a provider/browser session:

```sh
npm run test:backend
npm run typecheck
npm run lint
npm run build
```

The live scripts require this installation's private configuration. They create controlled records, except the social verifier which reads actual received records. Do not use a synthetic notification to pass the held-out X check.

```sh
CUE_VERIFY_ORIGIN=https://cue-987049542259.us-central1.run.app npx tsx scripts/verify-hosting.ts
CUE_VERIFY_ORIGIN=https://cue-987049542259.us-central1.run.app npm run verify
CUE_VERIFY_ORIGIN=https://cue-987049542259.us-central1.run.app npx tsx scripts/verify-widget.ts
CUE_VERIFY_ORIGIN=https://cue-987049542259.us-central1.run.app npx tsx scripts/verify-voice.ts
npx tsx scripts/verify-slack.ts
npx tsx scripts/verify-team.ts
npx tsx scripts/verify-email.ts
```

Follow the README's current Reddit verification environment values for `verify-social.ts`; it must point at the actual notification receipt and source. Native sign-in, customer/reply journeys, public social visibility and hardware checks remain separate from these HTTP/CLI checks.
