# Bloom hosting and backend separation — October 11, 2026

Bloom is a separate consumer application at [bloom-with-cue.vercel.app](https://bloom-with-cue.vercel.app). Cue remains at [cue.latchgrid.in](https://cue.latchgrid.in). Separating these applications does not establish multi-company Cue isolation or self-service onboarding.

## Deployed ownership

| Application | Hosting                         | Convex project | Production deployment | Data owned                                                                                             |
| ----------- | ------------------------------- | -------------- | --------------------- | ------------------------------------------------------------------------------------------------------ |
| Bloom       | Vercel project `bloom-with-cue` | `bloom`        | `accurate-pony-820`   | Journal entries, photos, temporary upload tickets and opaque support-session links                     |
| Cue         | Google Cloud Run service `cue`  | `cue`          | `tangible-kiwi-777`   | Support cases, conversations, evidence attachments, investigations, approvals and provider connections |

Bloom's source is `apps/bloom`. Its design and support assets are assembled from the existing shared design during the build. Bloom has its own package lock, Convex schema, server secret and signed host-only anonymous visitor cookie. It receives none of Cue's WorkOS, Slack, X, email or Google credentials.

Both applications report release `502529aec4cc042ae2a9efdb8f8abed9ea494b31`. Bloom's final ready Vercel deployment is `dpl_ADB6m1BoSqLYxr4eadL45sjoQ1V5`, aliased to its public URL. Cue's Cloud Run revision `cue-00013-q68` receives all traffic; successful Cloud Build `17345678-dfa4-461b-af3e-58119c03ff08` produced digest `sha256:5cba7124cefa96571aa7cc3926e5680201158bc385da85a4f3d6455f37507d3c`. Documentation commits do not replace these deployed artifacts.

The server fixes the Cue destination, registered application ID and allowed Bloom origin. A browser cannot override them. Visitor support sessions are canonicalized and stored in Bloom's backend; cases and replies remain in Cue. Journal photos use Bloom storage; support screenshots use Cue storage. Cue availability does not block reading a saved journal.

The registered app is `cue_app_5625fca3e391d92460528d8d`. Production origin is `https://bloom-with-cue.vercel.app`; the controlled local verifier uses `http://127.0.0.1:4401`. Vercel preview domains are not automatically allowed for journal mutations or support intake.

## Upload path and persistence

A ten-minute, single-use hashed upload ticket authorizes a photo upload directly to Bloom's Convex HTTP endpoint. A full 5 MiB image therefore avoids Vercel's function request-body limit. The server derives the ticket owner; the upload endpoint validates the origin, image MIME and byte limit. Vercel verifies the owned upload with Sharp, fully decodes its pixels and records actual dimensions before a memory can claim it. Reused and expired tickets, invented files, invalid dates, oversized images and cross-visitor claims are rejected. An hourly cleanup removes expired tickets and unused temporary uploads without deleting saved photos.

Support screenshots are separately limited to small JSON requests. The browser converts a local blob into actual image bytes before sending it, rather than sending a browser-local URL. The restored conversation exposes only bounded attachments belonging to the verified case owner.

The original journal at Cue's `/bloom` route remains intact. The new domain has a separate anonymous identity and does not automatically migrate its journal. There is no consumer account login, cross-device synchronization or guest-to-account migration in this implementation.

## Verification

Before deployment, Cue passed 229 tests across 30 files, TypeScript, ESLint and a production build. Bloom passed 11 tests across two files, TypeScript, ESLint and its production build. Both Convex deployments compile and push successfully. Bloom's production dependency audit reports zero vulnerabilities; the complete audit still reports five high-severity development dependency advisories, so this is not a claim that every dependency is clean.

The deployed HTTP verifier is `scripts/verify-bloom-hosting.ts`. It checks a new isolated journal, secure cookie attributes, the full 5 MiB upload, actual decoding, oversized/disguised-image rejection, ticket reuse, save/edit/delete/undo persistence, cross-visitor and cross-origin denial, a two-turn customer conversation, a diagnostic question, honest progress and screenshot persistence in Cue's storage. It also verifies the saved case's registered app and source origin. Temporary verifier memories are soft-deleted.

All seven grouped HTTP checks passed against the final release at 04:20 IST on October 11 (`2026-10-10T22:50:30Z`). The registered-app case is `j9764cr463s9t62ggkkhf3cxpn8g0mqz`; the persisted support screenshot is in Cue's storage, while the journal photo is in Bloom's storage. Earlier checks exposed a chat-only receipt and a browser-local screenshot URL; both were corrected before this final pass. The verifier's source-origin assertion also required canonicalizing the URL origin rather than comparing an optional trailing slash.

Native Chrome verification covers the actual file chooser, a saved photo and caption, reload persistence, matching and nonmatching caption search, editing, the recoverable deletion confirmation and Undo. It also exercises screenshot selection and support delivery from the actual Bloom interface. A controlled green-leaf memory belongs only to that test browser's guest; other visitors begin with an empty journal.

On the final release, the native support case `j97bkj0mdxxeraq7j4gp2h14q98g1rbx` retained its screenshot and answered the next turn with: “Both photos are getting stuck on the loading screen. Does the upload finish if you switch to a different network?” A full reload preserved that reply, screenshot, case identity and the honest Received stage. `artifacts/bloom-vercel-support-verified.png` records the restored interface; `artifacts/bloom-vercel-journal-verified.png` records the saved journal. Historical receipt-only messages were retained.

The real voice verifier is `scripts/verify-voice-conversation.ts`, run against Bloom with a separate output file. Three generated spoken turns pass through the hosted Gemini and Google Cloud Chirp services, retain one case, use previous answers, ask a follow-up, decode reply MP3s, deduplicate a repeated turn and exclude raw audio from the customer projection. Fixed synthetic sentences are provider integration evidence; they do not replace a new human microphone/speaker test or an evaluation of novel diagnostic quality. Voice remains turn-based.

All seven voice checks passed on the final release at 04:20 IST (`2026-10-10T22:50:35Z`), with case `j978ezt8w7axt1hq37d40et9vx8g1s8y`. Request-to-response latency was 4.5–4.8 seconds across the three turns, excluding input generation and actual playback time. The questions advanced from what failed, to a different photo, to a different network. This is a bounded observation, not a latency guarantee.

Private evidence files live under ignored `.cue/`. No provider credentials are checked into this report or Git.

## Source-upload correction

The initial Vercel source upload unexpectedly included local `.cue` configuration because Git ignore rules did not exclude it from the deployment upload. That deployment, `dpl_CVBmDnDCHnDht3NZScw9skLbAyqG`, was deleted while still building. Explicit `.vercelignore` rules now exclude all nested local configuration, environment files, Git directories and dependency/build output. The replacement and final deployment inventories were independently inspected; the final inventory contains 216 source files and zero private configuration files. Bloom's seven environment keys contain only its own backend configuration and the public Cue connection.

## Product boundary

This establishes an independently hosted Bloom application connected to the configured Cue workspace. Arbitrary company signup, company-scoped authorization and independent company provider connections remain unimplemented. Generic bug execution beyond the scoped Bloom fixture and customer acquisition are also incomplete. The release gate for a self-service Cue platform remains the two-company isolation and onboarding proof described in `platform-boundaries.md`.
