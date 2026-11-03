import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { db, api, secret } = await import("../../lib/server-store");
const { replyFacts } = await import("../../lib/reply-policy");

// Live end-to-end drive of the FEATURE loop for the Notes app:
// widget feature request -> live triage -> spec proposal -> product approval ->
// implementation run (Codex) -> PR -> engineering approval -> merge ->
// release verification -> featureVerified reply facts. Refusals asserted.
//
// Usage: npx tsx scripts/e2e/notes-feature-loop.ts
//   CUE_E2E_NOTES_APP_ID=<appId>   target an existing Notes pack (default: the
//                                  pack registered by notes-bug-loop)
//   CUE_E2E_ISSUE_ID=<issueId>     resume from an existing triaged feature
//                                  issue instead of sending a new request
// Requires: web on :3000, worker running (Codex + gh authenticated).

const base = process.env.CUE_VERIFY_ORIGIN || "http://127.0.0.1:3000";
const ORIGIN = "http://127.0.0.1:4460";
const REPO = "AvichalDwivedi2205/cue-notes-demo";
const APP_ID = process.env.CUE_E2E_NOTES_APP_ID || "cue_app_94c08efd3159ef0d1563fc29";
const auth = secret();
const pass = (name: string) => console.log("PASS · " + name);
const expectThrow = async (label: string, fn: () => Promise<unknown>) => {
  try {
    await fn();
    throw new Error("EXPECTED FAILURE DID NOT HAPPEN: " + label);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    if (m.includes("EXPECTED FAILURE")) throw e;
    console.log(`PASS · ${label} (refused: ${m.slice(0, 90)})`);
  }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const snapshot = () => db().query(api.cue.snapshot, { secret: auth });
const gh = (args: string[]) =>
  new Promise<string>((resolve, reject) => {
    import("node:child_process").then(({ execFile }) =>
      execFile("gh", args, (err, stdout, stderr) =>
        err ? reject(new Error(stderr || err.message)) : resolve(stdout),
      ),
    );
  });

const session = await (
  await fetch(base + "/api/widget", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ action: "session", app: APP_ID, origin: ORIGIN }),
  })
).json();
const text =
  "Feature request: add a search box above the notes list that filters notes by title or body text as I type, so I can find an old note without scrolling.";
const sent = await (
  await fetch(base + "/api/widget", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({
      action: "message",
      app: APP_ID,
      token: session.token,
      origin: ORIGIN,
      name: "E2E Tester",
      text,
    }),
  })
).json();
const caseId = sent?.id;
if (!caseId) throw new Error("widget message failed: " + JSON.stringify(sent).slice(0, 200));
pass("Feature request captured through the widget");

const reuseIssueId = process.env.CUE_E2E_ISSUE_ID;
let issue: { _id: string; kind: string } | undefined;
if (reuseIssueId) {
  issue = (await snapshot()).issues.find((x) => x._id === reuseIssueId);
  console.log("reusing issue:", issue?._id, "kind:", issue?.kind);
} else {
  console.log("waiting for live triage…");
  for (let i = 0; i < 30 && !issue; i++) {
    await sleep(4000);
    const s = await snapshot();
    issue = s.issues
      .filter((x) => x.appId === APP_ID && ["open", "requested"].includes(x.status))
      .sort((a, b) => b._creationTime - a._creationTime)[0];
  }
}
if (!issue) throw new Error("triage did not produce an issue");
console.log("  issue:", issue._id, "kind:", issue.kind);
if (issue.kind !== "feature") throw new Error("expected kind feature, got " + issue.kind);
pass("Live triage classified a feature issue");

const spec = JSON.stringify({
  need: "Customers cannot find an old note without scrolling the whole list.",
  specification:
    "Add a search input above the notes list in page/index.html. While typing, filter visible notes to those whose title or body contains the query (case-insensitive). Clearing the input shows all notes again. Wire the filter through lib/notes.mjs so the list rendering stays in one place.",
  acceptanceCriteria: [
    "A search input is visible above the notes list",
    "Typing filters notes to matches on title or body, case-insensitive",
    "Clearing the search input shows every note again",
  ],
});

await expectThrow(
  "Implementation before spec approval is refused",
  () =>
    db().mutation(api.cue.startFeature, {
      secret: auth,
      issueId: issue._id as never,
      expectedSpec: spec,
      targetId: APP_ID,
    }),
);
await db().mutation(api.cue.spec, {
  secret: auth,
  issueId: issue._id as never,
  spec,
  approved: false,
});
pass("Product specification proposed (spec_ready)");
await expectThrow(
  "Spec approval must match the pending specification",
  () =>
    db().mutation(api.cue.decideSpec, {
      secret: auth,
      issueId: issue._id as never,
      expectedSpec: spec + " tampered",
      approve: true,
      actor: "E2E Product",
    }),
);
await db().mutation(api.cue.decideSpec, {
  secret: auth,
  issueId: issue._id as never,
  expectedSpec: spec,
  approve: true,
  actor: "E2E Product",
});
pass("Product approved the specification");

await expectThrow(
  "startFeature with a stale specification is refused",
  () =>
    db().mutation(api.cue.startFeature, {
      secret: auth,
      issueId: issue._id as never,
      expectedSpec: spec + " stale",
      targetId: APP_ID,
    }),
);
const runId = await db().mutation(api.cue.startFeature, {
  secret: auth,
  issueId: issue._id as never,
  expectedSpec: spec,
  targetId: APP_ID,
});
pass("Implementation run born from the approved specification");
console.log("  run:", runId);

console.log("waiting for the Codex feature pipeline…");
let run: Record<string, unknown> | undefined;
const started = Date.now();
while (Date.now() - started < 15 * 60_000) {
  await sleep(20_000);
  const s = await snapshot();
  run = s.runs.find((r) => r._id === runId) as Record<string, unknown> | undefined;
  console.log(`  [${Math.round((Date.now() - started) / 1000)}s] status=${run?.status} phase=${run?.phase}`);
  if (["awaiting_approval", "failed", "canceled", "resolved"].includes(run?.status as string))
    break;
}
if (!run || run.status !== "awaiting_approval")
  throw new Error("feature run did not reach awaiting_approval: " + JSON.stringify(run).slice(0, 300));
pass("Codex implemented the feature and opened a draft PR");
console.log("  pr:", run.prUrl, "commit:", run.commit);

const prNumber = String(run.prUrl).split("/").pop();
await gh(["pr", "ready", prNumber!, "--repo", REPO]);
await gh(["pr", "merge", prNumber!, "--repo", REPO, "--merge"]);
const releaseCommit = (await gh(["api", `repos/${REPO}/commits/main`, "--jq", ".sha"])).trim();
console.log("PR merged; release commit:", releaseCommit);
pass("Release process merged the feature");

await db().mutation(api.jobs.decide, {
  secret: auth,
  runId: runId as never,
  commit: run.commit as string,
  actor: "E2E Verification",
  approve: true,
});
pass("Engineering approval recorded");

await expectThrow(
  "Release verification with a foreign commit is refused",
  () =>
    db().mutation(api.releases.confirmFeature, {
      secret: auth,
      runId: runId as never,
      commit: "b".repeat(40),
      releaseCommit,
      evidence: "x".repeat(100),
    }),
);
await db().mutation(api.releases.confirmFeature, {
  secret: auth,
  runId: runId as never,
  commit: run.commit as string,
  releaseCommit,
  evidence:
    "Merged pull request " + prNumber + " on " + REPO + " ships the note search box; baseline node test.mjs passed before Codex started and the merged main includes the search acceptance criteria.",
});
const s2 = await snapshot();
const resolvedRun = s2.runs.find((r) => r._id === runId);
const resolvedIssue = s2.issues.find((i) => i._id === issue._id);
const theCase = s2.cases.find((c) => c._id === caseId);
const facts = replyFacts({
  issue: resolvedIssue as never,
  run: resolvedRun as never,
  case: theCase as never,
  channel: "chat",
} as never);
if (!facts.featureVerified) throw new Error("featureVerified should be true: " + JSON.stringify(facts));
console.log("  replyFacts:", JSON.stringify(facts));
pass("Feature reply facts carry verification scope and release evidence");

console.log("FEATURE LOOP END-TO-END COMPLETE · case", caseId, "run", runId);
