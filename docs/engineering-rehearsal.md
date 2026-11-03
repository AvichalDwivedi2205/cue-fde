# Run a controlled Bloom engineering rehearsal

The Bloom fixture contains an upload regression: the example promises a 5 MiB limit while the seeded server limit is 2 MiB. The rehearsal creates a separate registered app and fixture, so label the records as controlled test data. Earlier claims about completed rehearsals and releases are withdrawn. See [repository and build provenance](repository-and-build-provenance.md).

## Prepare the fixture

Configure Cue, Convex, and the local worker first. Choose a fresh scenario key and unused loopback ports. `prepare` reserves the key, registers the app, freezes a fixture baseline, and checks that the baseline test reproduces the failure. It creates records and local files, so inspect `scripts/rehearsal.ts` and the active environment before running it. If `CUE_GITHUB_REPO` is set, the script clones its `main` branch; use a dedicated owned fixture repository with the expected broken baseline, not the Cue product repository. Without that variable, preparation creates a local fixture Git repository.

```sh
CUE_REHEARSAL_CUE_ORIGIN=http://127.0.0.1:3000 \
CUE_REHEARSAL_FRONTEND_ORIGIN=http://127.0.0.1:4402 \
CUE_REHEARSAL_BACKEND_ORIGIN=http://127.0.0.1:4320 \
npx tsx scripts/rehearsal.ts prepare my-fresh-scenario
npx tsx scripts/rehearsal.ts start my-fresh-scenario
npx tsx scripts/rehearsal.ts status my-fresh-scenario
```

Use the same fresh key for the three commands. Do not reuse a key or occupied ports. `start` asks the local worker to start the prepared scenario.

## Exercise and review

1. Open the reported frontend origin. Upload the generated 3 MiB image and confirm the seeded failure.
2. Report the failure and the 5 MiB promise through the registered widget. Start the investigation in Cue.
3. Inspect the resulting run, allowed diff, independent checks, and any draft PR. The fixture restricts the change to its configured file and protects the remaining files.
4. If the change is acceptable, an authorized reviewer can approve its exact commit through Cue or its configured Slack review. Review the scoped release and acceptance checks separately.
5. Retry the original image, save a memory, and reload it. Inspect the same conversation for the recorded result.

A local patch or test does not prove a provider receipt, human approval, production deployment, or customer outcome. Verify each claimed outcome against its own evidence. Native email, Slack, and X delivery require separate provider checks; copied or replayed reports are fixtures.

For local checks of the rehearsal code, use `npm run typecheck` and the relevant tests in `tests/rehearsals.test.ts`, `tests/rehearsal-runtime.test.ts`, `tests/convex.test.ts`, and `tests/coding.test.ts`. Read scripts before running them, particularly those that contact services or create records.
