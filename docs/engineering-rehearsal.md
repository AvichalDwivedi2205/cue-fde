# Fresh engineering rehearsal

This is an owned, controlled Bloom upload regression. The journal is the existing
product UI, and its installed Cue widget sends real typed/voice turns through the
registered-app integration. Its protected upload service runs an intentionally
broken fixture on dedicated loopback ports. The healthy public Bloom backend and
old reports, runs, approvals, PRs and releases remain intact.

Preparation creates a new app and issue, freezes the fixture Git baseline, checks
that its unchanged independent test reproduces the 3 MiB failure, and reserves a
unique scenario key. Preparation creates no customer report or coding job.
Repeating a key fails; a fresh rehearsal needs a fresh app/key and unoccupied ports.
All test records identify the controlled scenario. Copied context is setup data,
not evidence of new discovery. Native external-channel receipts are required to
claim native email, Slack or X delivery; replayed reports remain fixtures.

After the coordinated backend/web deployment and worker restart, run from the
repository root (the script reads saved environment without printing secrets):

```sh
CUE_REHEARSAL_CUE_ORIGIN=https://cue.latchgrid.in \
CUE_REHEARSAL_FRONTEND_ORIGIN=http://127.0.0.1:4402 \
CUE_REHEARSAL_BACKEND_ORIGIN=http://127.0.0.1:4320 \
npx tsx scripts/rehearsal.ts prepare rehearsal-20261012-a
npx tsx scripts/rehearsal.ts start rehearsal-20261012-a
npx tsx scripts/rehearsal.ts status rehearsal-20261012-a
```

`CUE_GITHUB_REPO` should remain the dedicated `cue-bloom-demo` fixture, whose
baseline has the controlled 2 MiB limit. It must not point at the product repo.
The script checks the baseline rather than assuming the remote remains broken.
Without GitHub configuration, preparation creates an explicitly local fixture
commit and the coding run retains local patch/review evidence without a PR.

Open the reported frontend origin. In the normal journal, choose the generated
controlled 3 MiB PNG: it must fail. Use its actual registered Cue widget to report
the failure and the documented 5 MiB promise. The report joins only the newly
registered issue. Investigation in Cue/Engineering uses the existing startRun
API; registration is checked server-side and one durable job is queued. Codex
works in a fresh checkout of the frozen baseline, with network disabled and only
`limits.mjs` allowed to change. The supervisor records the baseline SHA and checks
browser-service source hashes, protects all other files, rejects changed Git
history and reruns the eight independent HTTP tests before creating a new commit
and optional draft PR.

Review that run's actual diff/tests, then approve its exact full commit in the
normal Engineering UI or native authorized Slack card. The worker releases only
that scenario. It checks deployed source hashes, build SHA, the 3/6 MiB raw
upload controls and the same journal's multipart retry endpoint. Only then does
it resolve the run and update the same widget case. On failure it restores the
scenario's own prior runtime. Finish by retrying the original photo, saving a
memory, reloading, and inspecting the resolved widget conversation. This final
browser check is required for complete rehearsal evidence.

Before a recording, prepare a second key on different free ports, for example
`rehearsal-20261012-b` on frontend `4403` and backend `4321`. Leave it at the broken
baseline with no report/job/approval. The first rehearsal remains inspectable;
never reset history, re-open its resolved issue or present its run as new.

Local verification: `npm run typecheck` and
`npx vitest run tests/rehearsals.test.ts tests/rehearsal-runtime.test.ts tests/convex.test.ts tests/coding.test.ts`.
Runtime tests use temporary owned loopback fixtures and a test-only candidate;
they do not count as a live Codex implementation or deployed production proof.

Implementation note: one `npx convex codegen --typecheck disable` invocation
unexpectedly uploaded additive backend functions while generating bindings. No
scenario/app, coding job, approval, public frontend release or recording was
created by that invocation. A coordinated final deployment must use the final
tested source before any live rehearsal is executed.
