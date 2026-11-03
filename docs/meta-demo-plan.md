# Record Cue's customer-to-fix demo

Draft checked November 3, 2026. Target 2 minutes 55 seconds within the three-minute video requested by the authenticated [submission form](https://events.cerebralvalley.ai/e/meta-ai-developer-hackathon/hackathon/submit). Check the [submission checklist](meta-submission-checklist.md) before recording.

## Show one complete customer journey

Use one fresh LatchGrid visitor, one keyboard-deletion report, one coding run, one reviewed patch, and one verified preview. Cue is the public entry. LatchGrid is the existing private customer application. Record the preview acceptance scene only after the original action passes there. The demo does not establish a production release.

Add a clear on-screen contribution label. Present only the Cue features and changes built during the event as hackathon work. Use LatchGrid's existing canvas only as customer context and a test of the new workflow. Map the new contributions to actual commits. The [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details#4-hackathon-rules-8) requires clear separation and warns that unclear contributions can cause disqualification.

Keep the broken behavior until the recording's before scene is captured. The customer's keyboard deletion must disappear on screen, then reappear after reload. Menu deletion is the control that already persists.

| Time | Show | Say | Current status |
| --- | --- | --- | --- |
| 0:00–0:20 | Delete a LatchGrid node with the keyboard. Reload and show it return. | "Keyboard deletion looks successful, but the node returns after reload." | Live browser reproduction verified on synthetic data; video capture remains pending. |
| 0:20–0:40 | Open the installed Cue widget. Send the report and its screenshot. Show the report in Cue under the correct application. | "The customer reports the failure where it happens. Cue keeps the app context and evidence." | VERIFIED actual widget case, screenshot, and correct workspace URL. Fresh-tab iframe failure remains unresolved; native comparison and recording are pending. |
| 0:40–1:05 | Show Meta's diagnosis, cited authorized knowledge, and the engineering handoff. Keep uncertainty visible where evidence is missing. | "Meta reasons over this report. An acknowledged reproduction starts engineering work." | VERIFIED actual widget support reply, Spark classification, and hosted owner UI handoff. Cited-knowledge demonstration remains pending. |
| 1:05–1:40 | Show the actual run's requested and serving Meta model, baseline controls, and fresh-check results. Mask private execution identifiers. | "Meta proposes a scoped change. The supervisor preserves the checks and reruns them in a fresh sandbox." | VERIFIED actual product run: 17 completed Wonder calls, TypeScript, 238 default tests, and all eight protected acceptance checks pass in the fresh verifier. |
| 1:40–2:10 | Show the private draft PR's status and changed-file count with its repository and commit identifiers masked. Show the human review only after it exists. | "Engineering approves this exact commit. Approval alone does not release it." | VERIFIED private draft PR and matching head, one Canvas file with 49 added lines, and no new domain P1 or P2 findings. Human exact-commit approval is PENDING. |
| 2:10–2:45 | Show the approved preview deployment and its browser acceptance evidence. Return to the same customer action, delete with the keyboard, and reload on the preview. | "The approved change passes the original action on this preview. After reload, the node stays deleted." | PENDING authenticated preview build and deployment, browser retry, and saved-state proof. The GitHub-triggered preview has an unverified commit-account failure, not a failed code test. |
| 2:45–2:55 | Show the report, reviewed SHA, preview check, and customer outcome together. | "Cue keeps the report, reviewed commit, and preview acceptance together." | PENDING the complete linked preview record. |

Cut long waits only after recording their real start and finish. Label elapsed time or speed changes. Never imply that a several-minute coding or deployment step completed instantly.

## Record evidence that exists

- VERIFIED: dedicated Meta calls returned the requested Muse Spark 1.3 and Muse Wonder 1.0 identities and actual token usage.
- HISTORICAL: earlier Modal isolation checks passed, but Modal is now disabled after failed credit redemption. Current execution uses the verified local Docker path.
- VERIFIED: the actual product baseline installed locked Bun dependencies and passed TypeScript and all 238 default tests. Two menu controls passed and six keyboard acceptance checks failed.
- VERIFIED: selected local Docker isolation, running-check cancellation, controlled create/commit cancellation, and Bun cache placement. Ambiguous cleanup outcomes block further runs.
- VERIFIED: live synthetic browser keyboard deletion returned after reload, while menu deletion persisted.
- VERIFIED: actual installed-widget report, screenshot, Meta response/classification, application/workspace binding, and conversation persistence.
- VERIFIED: the third actual product run completed 17 Wonder calls with 673,361 reported input tokens and 9,497 output tokens. Its fresh verifier passed TypeScript, 238 default tests, and all eight protected acceptance checks before import and private draft PR creation.
- VERIFIED: the original seven-check file remained unchanged. The eighth navigation regression followed a matched failure check and was frozen before the product run.
- VERIFIED: the private PR head matches the frozen run. Only one Canvas file changed, with 49 added lines. Independent domain review found no new P1 or P2 issues.
- PENDING: native comparison for the unresolved fresh-tab blank iframe.
- PENDING: human exact-commit review, authenticated preview deployment, browser acceptance, customer preview evidence, and the recording. Production release remains separate.

Keep exact private SHAs, case and run IDs, raw logs, and private PR identifiers in the private delivery record. Use sanitized proof in public materials. Do not substitute the second run's forensic reconstruction for the third run's actual product evidence.

## Keep the recording concrete

Record a readable desktop view with legible product UI. Use a synthetic customer identity and authorized content. Close credentials, billing pages, raw private diffs, unrelated tabs, and notifications before capture.

Show actual provider receipts rather than an environment-variable screenshot. Separate agent-authored summaries from supervisor check output. Describe a preview as a preview, and a production release as production only when that deployment is verified.

Show one refusal briefly if time remains, such as stale-SHA approval denied. Keep the full negative checks in the written evidence. This is our presentation strategy, not a claimed judging requirement.

The [official waiver](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/waiver) supplies the project rubric. Use the video time to prove each part.

| Criterion | Weight | Evidence to show |
| --- | --- | --- |
| Impact | 30% | A real persistence defect in an existing customer application. Do not invent adoption or revenue. |
| Meta tooling | 25% | Actual Meta diagnosis and coding receipts, scoped tools, and the resulting change. |
| Technical execution | 20% | Protected checks, fresh verification, exact-commit review, and separate release evidence. |
| Demo | 25% | The original action succeeds after reload on the approved preview. |

## Preserve the actual build history

The inspected repository starts with [24af770](https://github.com/AvichalDwivedi2205/cue-fde/commit/24af7704de9f14e4771f792ad344803224459e07), dated October 27, 2026 at 09:02:51 +05:30 in Git. [18f00fe](https://github.com/AvichalDwivedi2205/cue-fde/commit/18f00fea6d476f682d6f7b50e39092fabb6e8fbb) records the scoped PR flow later that day. Commit metadata does not prove deployment, eligibility, or a completed customer journey.

Use the corrected [repository provenance](repository-and-build-provenance.md). Earlier October 10–13 development, verification, and submission claims are withdrawn. Do not reuse old footage as evidence for this Meta run.
