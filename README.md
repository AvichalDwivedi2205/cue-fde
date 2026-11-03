# Cue

Cue helps app teams turn customer reports into investigated and reviewed product changes. It combines support intake, company knowledge, agent tasks, and a governed coding workflow. Bloom is a photo-journal example app; Generic Notes is a second controlled fixture.

Cue is new work for the current Meta Global AI Developer Hackathon. The current repository is [cue-fde](https://github.com/AvichalDwivedi2205/cue-fde). Earlier documentation incorrectly claimed October 10–13 development, verification, and a neatHack submission. Those claims are withdrawn. See [repository and build provenance](docs/repository-and-build-provenance.md) for the verified commit timeline and the limits of the available evidence.

## Run locally

Copy `.env.example` to `.env.local` and set the values for your environment. Initialize a local Convex deployment and set the same randomly generated `CUE_DEMO_SECRET` in `.env.local` and in Convex. Keep secrets and local configuration out of Git. The example enables `CUE_LOCAL_DEMO` for loopback development only; disable that bypass for a shared host and configure WorkOS.

```sh
npm install
CONVEX_AGENT_MODE=anonymous npx convex dev
npx convex env set CUE_DEMO_SECRET
npm run dev
```

`npm run dev` starts the Next.js web process and local worker. Open `http://127.0.0.1:3000/cue#/inbox` for Cue or `http://127.0.0.1:3000/bloom#/journal` for the local Bloom example. Use the same loopback hostname to retain the customer cookie. `npm run dev:local` also starts Convex; use it only with a separately configured local deployment. Stop the processes with Ctrl-C.

For Gemini, configure `GOOGLE_CLOUD_PROJECT` and Application Default Credentials with Vertex AI enabled, or set `GEMINI_API_KEY`. For coding jobs, authenticate the Codex CLI and set `CUE_CODEX_PATH` if it is not on `PATH`. A GitHub repository binding requires the appropriate GitHub authentication and repository access. The worker handles personal-account Codex jobs; it must be running to execute them. Check current provider settings and costs before running live workflows.

## Register an app and install the widget

In **Setup**, register the app and its exact allowed website origins. Complete the install check and activate the app before using features that require an active app pack. Generate the widget snippet at `/setup#widget` and paste it before the host page's closing body tag. Set `CUE_PUBLIC_URL` to a reachable HTTPS origin for a shared deployment. A remote website cannot reach a localhost widget URL.

The install script embeds a support iframe with an app- and origin-bound visitor session. The widget supports customer conversations and optional screenshots. Internal notes and unsent drafts are excluded from the visitor response. Visitor-supplied display names are not verified identities. `demo/widget-host` contains a local example host:

```sh
python3 -m http.server 4400 --bind 127.0.0.1 --directory demo/widget-host
```

The example's app ID is installation-specific. Generate a new snippet for another installation.

## App packs and coding

An app pack stores a registered app's origins, status, widget settings, routing, and optional engineering policy. An active app can bind a trusted repository, base branch, allowed paths, and fixed verification commands in `/setup#coding`. The coding pipeline supports both approved feature specifications and bug investigations with acknowledged reproduction context. It uses an isolated checkout, limits changes to the configured paths, protects existing tests and policy files, and runs the configured checks independently. A draft pull request can be opened when GitHub is configured. Review applies to the exact commit; approval alone does not merge or deploy it. Inspect the actual job, diff, checks, and release evidence before reporting an outcome.

The [Bloom fixture](demo/bloom/README.md) and [Notes fixture](demo/generic/README.md) provide controlled failure cases. The [engineering rehearsal guide](docs/engineering-rehearsal.md) describes the Bloom flow. These examples do not establish that arbitrary third-party repositories are safe to execute or that a production deployment has passed.

App packs support multiple registered applications within the configured workspace. They do not by themselves provide independent company membership, company-scoped data authorization, or per-company provider isolation. See [platform boundaries](docs/platform-boundaries.md) for the isolation plan and release gate.

## Support, knowledge, and integrations

Cue stores cases, messages, issues, tasks, coding runs, reviews, and receipts in Convex. The trusted Next.js gateway handles authentication and provider credentials. WorkOS supplies operator identity; Cue checks configured membership and roles. Support can triage and reply, Product can review specifications, and Engineering can review coding work. Review and release are separate actions.

The knowledge workflow accepts FAQs, text, supported files, public pages, and public GitHub documents. Staff review and publish sources for a registered app. Customer-facing answers can cite published sources; internal sources are limited to staff retrieval. See [company knowledge](docs/company-knowledge.md) for file limits and the evaluation protocol.

Setup supports Slack and email connections. For Slack, use the manifest at `/setup#slack`, install the app, and configure the bot token, signing secret, workspace and channel IDs. Hosted Events and Interactivity require a reachable HTTPS webhook. Local Socket Mode is an alternative that uses the worker. For email, configure a Resend receiving address, sender, and credentials at `/setup#email`. Provider acceptance and actual recipient delivery are distinct checks. Review setup and scripts before using them: live integrations can send messages or create records.

Voice uses short recorded turns with consent, Gemini transcription, and Google Cloud Text-to-Speech. Compressed browser audio requires FFmpeg on the server; set `CUE_FFMPEG_PATH` when it is not on `PATH`. Enable the required cloud service and permissions before testing speech. Voice is turn-based, not a full-duplex phone call.

Growth qualification and drafting use published knowledge and capability records. The [Growth plan](docs/growth-plan.md) describes proposed evaluations and the distinction between controlled activity and organic acquisition. The [Cue plugin](plugins/cue/README.md) provides read-only issue inspection.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
npm run test:backend
npm run test:regression
npm run preflight
```

The Bloom regression fixture is intentionally broken at baseline, so `npm run test:regression` is expected to fail until that fixture is fixed. Tests and preflight cover different scopes; inspect their scripts and configuration before running them. Live verifier scripts may call providers, create data, or send messages. A passing local test does not establish a hosted deployment or an end-to-end provider workflow.
