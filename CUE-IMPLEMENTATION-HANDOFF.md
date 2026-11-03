# Cue implementation handoff

The implementation fixes are complete. Hosted browser acceptance and fresh screen captures remain open. The user will record their own narration later. Do not describe the final film or complete demo flow as finished until those checks pass.

## Source and verification

Work is on `fix/cue-demo-integration`, based on the initial implementation checkpoint `a4e5499`, with small commits authored as AvichalDwivedi2205. [Draft PR #2](https://github.com/AvichalDwivedi2205/cue-fde/pull/2) includes the initial Quiet signals implementation and the integration corrections.

| Check | Observed result |
| --- | --- |
| Backend tests | 921 passed across 111 files |
| TypeScript | Passed |
| Lint | Zero errors, seven existing warnings |
| Production web build | Passed at `8e4fbe5` |
| Backend deployment | Passed at `5847a8d` |
| Secret scan | No leaks found in the changed commits |
| Real Meta demo fixture | Requested and served `muse-spark-1.3`; three clusters |
| Held-out fixture | One real run; six supported needs, no forced recovery feature |
| All-noise fixture | Zero clusters |
| Hosted backend persistence | Real response saved and reopened; one attempt; replayed import/promotion reuse their existing records |
| Candidate access/privacy checks | Sign-in, canonical callback, visitor read, hidden internal notes, negative requests, and anonymous Signals denial passed |
| Hosted browser acceptance | Pending browser control recovery |

The persistence check reused the saved real Meta response. It was a backend integration check, not a new model call or a completed browser session. Provider and database records remain operator-private.

## Final behavior

- Quiet signals stores frozen, app-scoped batches with provenance, a canonical fingerprint, an attempt ledger, a claim token and one explicit retry. Expired claims reconcile through an explicit recovery action.
- The Meta transport schema uses required nullable fields. The service normalizes absent values and projects a strict raw payload for persistence. Database completion revalidates all citations, references and derived counts. Rejected completion cannot be reported as analyzed.
- Every post has exactly one disposition. Quotes must be exact substrings of saved posts. Duplicate cluster IDs, unknown references and invented quotes are rejected. Zero supported needs is a valid result.
- UI state is bound to both application and selection revision. Switching app, choosing another batch, or pressing Back prevents late work from replacing selection, navigating, or emitting stale success messages.
- A promoted proposal creates one feature at `spec_ready`. Product approval binds the displayed specification. Signal-derived features remain Handoff ready after approval; they cannot reuse an unverified future-work repository binding or start a coding job.
- Specification receipts describe the served model and actual usage. Human edits clear model attribution when no new generation occurred.

## Evidence export

Run exports contain recorded call history, cumulative token usage, relative offsets and validated command observations. Unknown, truncated, contradictory or unrecognized check output stays unknown. Raw check logs and repository locations stay private.

Signal export currently accepts synthetic fixtures only. It aliases structural post, author and cluster references, preserves exact source quotes, and projects generated reference prose in one pass. Actual issue state supplies the handoff state. Operator captures require a reviewed projection. Private string checks supplement operator review; they do not certify arbitrary text as free of all possible secrets.

The operator-reviewed version-1 `run.json` and `signals.json` have been installed in the local video project. The run has 17 Wonder calls, baseline acceptance 2/8, final acceptance 8/8, TypeScript pass and 238/238 default tests. The signal export has 12 fictional posts, three clusters and one proposal awaiting Product review. These are observed records, not customer traction.

## Remaining acceptance

1. Open Cue in the requested Chrome profile and exercise import, analysis, reload, proposal promotion and Product review through the hosted UI. Verify selection changes, expired-attempt recovery and implementation refusal.
2. Capture the remaining actual screen sequences. Preserve private source, IDs and account details. Keep controlled negative checks labelled as such.
3. Record the user's voice, measure caption timing, and run the video's final readiness check before exporting the finished film.

The original approved bug run and its frozen repository policy remain unchanged. Docker remains stopped. No new environment variables or production configuration settings were added for these fixes. Modal is not used.
