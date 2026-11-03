# Implementation handoff

Cue collects customer reports, supports investigation and review, and can delegate bounded changes to a configured repository. Bloom is the photo-journal example. The earlier handoff's timeline, approvals, deployment, and acceptance claims are withdrawn. Inspect the current tree and provider state before continuing. See [repository and build provenance](repository-and-build-provenance.md).

## Start with the current state

1. Read the applicable `AGENTS.md` files and inspect Git status and the current diff.
2. Read the [agent workspace specification](agent-workspace-feature-spec.md), [Growth plan](growth-plan.md), [platform boundaries](platform-boundaries.md), and [deferred platform work](platform-deferred.md).
3. Map the requested behavior to the current code and configuration. Separate implementation, local tests, provider checks, human decisions, and deployed acceptance in any progress report.
4. Before editing Convex or Next.js code, follow the applicable repository instructions and installed framework guidance.

App packs bind app identity and origins to widget settings and an optional coding policy. They support multiple apps in one configured workspace. They are not a substitute for independently authorized companies and tenant-scoped data. For coding, check the active app's repository, base branch, allowed paths, and test commands. The pipeline supports feature work and bug investigation, but a reviewed commit does not itself prove deployment.

## Implementation entry points

- `design/cue.html` and `lib/browser/cue.js` contain the supplied UI and browser bridge.
- `lib/app-pack.ts`, `lib/app-pack-schema.ts`, and `convex/appPacks.ts` define app registration and configuration.
- `convex/triageQueue.ts`, `convex/background.ts`, and `lib/hosted-background.ts` handle background work.
- `lib/x-api.ts` and `lib/x-poller.ts` handle official X reads and collection.
- `lib/slack-events.ts`, `lib/slack-messages.ts`, and `lib/slack.ts` handle Slack intake and decisions.
- `lib/runner.ts`, `lib/feature-runner.ts`, `scripts/worker.ts`, and `convex/releases.ts` handle coding work and release records.
- `apps/bloom/` contains the separate Bloom application. `demo/bloom/` and `demo/generic/` contain controlled test fixtures.

For changed Cue behavior, choose relevant tests and run the required checks, including `npm run test:backend`, `npm run typecheck`, `npm run lint`, and `npm run build` when applicable. Run Bloom's checks from `apps/bloom` for changes to that app. Test permission boundaries, retries, concurrency, and evidence failures where they affect the change.

Read each live verifier before running it. Provider checks can create records, incur charges, or send messages. Local or mocked tests do not prove provider access or customer delivery. Do not treat old documentation as authorization to publish, contact people, commit, push, or deploy.
