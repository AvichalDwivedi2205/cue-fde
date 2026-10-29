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

The first rehearsal used these commands after the coordinated backend/web
deployment and worker restart, from the repository root. The script reads saved
environment without printing secrets. This historical key is consumed; a future
rehearsal must use a new key and free ports:

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

Rehearsals `rehearsal-20261012-a` and `rehearsal-20261012-b` completed two
consecutive actual native passes. Each used a fresh app, a real 3 MiB failure,
its installed widget report, a new Codex investigation, eight independent
checks, exact commit approval, scoped release verification and the original
photo retry/save/reload. Their deployed fixture commits are
`d35309781317a89a23a416edf04515a536b2d148` and
`93495520dc3882b882419918eeddcf47d0bf0400`, respectively. Keep both runs and their
native evidence inspectable; do not reset history or present either as new.

The fresh recording run used `recording-20261012-c`, app
`cue_app_c6adfa8b29daa6b5722fc076`, frontend `http://127.0.0.1:4404`, backend
`http://127.0.0.1:4322`. Its frozen broken baseline is
`d499f6f392f30e61ef4d17c08146acf83fa79f5c`. The actual 3 MiB upload failure and
installed-widget report led to new Codex run `jn7c88jp2xnkqkvvphwrdq09x58g5ymx`.
Its fix commit is `ee431005102dbfed46ebaa71cae21b71997e85e2`, with
[PR #5](https://github.com/AvichalDwivedi2205/cue-bloom-demo/pull/5). All eight
independent HTTP tests passed. Native Slack approval receipt
`p1791820226411299` approved that exact commit before the scoped release.
The original generated `fixtures/synthetic-photo-3mb.png` remained in the New
memory form and passed the actual retry, save and reload after release. This run
is now consumed and its evidence must remain intact; any future rehearsal needs
a unique key and free ports. The healthy public Bloom deployment remains
separate. See [the final timed recording plan](demo-recording-plan-final.md).

The latest Cue operator release is source
`b49c358187454c2bf4cd287cdf3d6f8f6eef7345`, Cloud Run `cue-00048-kic`, built by
successful Cloud Build `1437f7fe-1a31-4507-9e90-62edefd833c4`. Its selected-case
history fix passed 43 scoped tests, typecheck and scoped lint;
the earlier 419-test full suite was not rerun for this commit. Release checks
verified the exact built browser asset, release SHA and unauthenticated denials.
Native authenticated browser checks confirmed the existing Email and Slack
conversations now show their original reports, follow-ups and actual replies.
Those historical channel receipts are separate from recording-c's fresh widget
report and do not represent new email or Slack reports.

Local verification: `npm run typecheck` and
`npx vitest run tests/rehearsals.test.ts tests/rehearsal-runtime.test.ts tests/convex.test.ts tests/coding.test.ts`.
Runtime tests use temporary owned loopback fixtures and a test-only candidate;
they do not count as a live Codex implementation or deployed production proof.

Implementation note: one `npx convex codegen --typecheck disable` invocation
unexpectedly uploaded additive backend functions while generating bindings. No
scenario/app, coding job, approval, public frontend release or recording was
created by that invocation. The coordinated backend/web deployment subsequently
completed before the native rehearsals; the latest operator release is recorded
above.
