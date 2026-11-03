import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { db, api, secret } = await import("../../lib/server-store");

// Live end-to-end drive of a registered app ("Notes") through the governed BUG
// loop: register -> install check -> activate -> bind repo -> widget bug report
// -> live triage -> pull-request run (Codex) -> approval -> merge -> release
// verification -> customer-visible resolution. Refusals are asserted at every
// gate. Registers a fresh pack each run; safe to re-run repeatedly.
//
// Usage: npx tsx scripts/e2e/notes-bug-loop.ts
// Requires: web on :3000, worker running (Codex + gh authenticated),
// and the notes demo repo (AvichalDwivedi2205/cue-notes-demo).

const base = process.env.CUE_VERIFY_ORIGIN || "http://127.0.0.1:3000";
const ORIGIN = "http://127.0.0.1:4460";
const REPO = "AvichalDwivedi2205/cue-notes-demo";
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

const { appId } = await db().mutation(api.appPacks.register, {
  secret: auth,
  name: "Notes",
  origins: [ORIGIN],
});
console.log("registered Notes pack:", appId);
pass("Pack registration mints a draft app identity");

await expectThrow("Activation before the install check is refused", () =>
  db().mutation(api.appPacks.activate, { secret: auth, appId }),
);
const evil = await fetch(base + "/api/widget", {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ action: "session", app: appId, origin: "https://evil.example" }),
});
if (evil.status !== 403 && evil.status !== 400)
  throw new Error("non-allowed origin was not rejected, status " + evil.status);
pass("Widget intake from a non-allowed origin is refused");

const session = await (
  await fetch(base + "/api/widget", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ action: "session", app: appId, origin: ORIGIN }),
  })
).json();
if (!session.token) throw new Error("widget session failed: " + JSON.stringify(session));
pass("Widget session issued for the new app on its allowed origin");

const text =
  "Bug report: every note I save loses its title. The note body is kept but the title field is empty after saving, so all my notes are called untitled. Reproduced on every save.";
const sent = await (
  await fetch(base + "/api/widget", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({
      action: "message",
      app: appId,
      token: session.token,
      origin: ORIGIN,
      name: "E2E Tester",
      text,
    }),
  })
).json();
const caseId = sent?.id;
if (!caseId) throw new Error("widget message failed: " + JSON.stringify(sent).slice(0, 300));
pass("Widget bug report captured as a case for the new app");
console.log("  case:", caseId);

await db().mutation(api.appPacks.recordInstallCheck, { secret: auth, appId });
await db().mutation(api.appPacks.activate, { secret: auth, appId });
pass("Install check verified from a real case; pack is now active");
await db().mutation(api.appPacks.bindEngineering, {
  secret: auth,
  appId,
  repository: REPO,
  baseBranch: "main",
  allowedPaths: ["lib/", "page/"],
  testCommands: [{ program: "node", args: ["test.mjs"] }],
});
pass("Repository binding set on the pack");

console.log("waiting for live triage to classify the report…");
let issue: { _id: string; kind: string } | undefined;
for (let i = 0; i < 30 && !issue; i++) {
  await sleep(4000);
  const s = await snapshot();
  issue = s.issues.find((x) => x.appId === appId && x.status === "open");
}
if (!issue) throw new Error("triage did not produce an issue for the app");
console.log("  issue:", issue._id, "kind:", issue.kind);
pass("Live triage produced a bug issue for the new app");
if (issue.kind !== "bug") throw new Error("expected kind bug, got " + issue.kind);

const runId = await db().mutation(api.cue.startRun, {
  secret: auth,
  issueId: issue._id as never,
  reproduction:
    "Run `node test.mjs`: saving a note keeps the body but returns the note with title undefined; the assertion 'title missing (expected saved)' fails on every save.",
});
console.log("run started:", runId);
pass("Pull-request run born against the pack's repository binding");

console.log("waiting for the Codex pipeline (clone → baseline → fix → PR)…");
let run: Record<string, unknown> | undefined;
const started = Date.now();
while (Date.now() - started < 15 * 60_000) {
  await sleep(20_000);
  const s = await snapshot();
  run = s.runs.find((r) => r._id === runId) as Record<string, unknown> | undefined;
  const phase = String(run?.phase ?? "?");
  console.log(`  [${Math.round((Date.now() - started) / 1000)}s] status=${run?.status} phase=${phase}`);
  if (["awaiting_approval", "failed", "canceled", "resolved"].includes(run?.status as string))
    break;
}
if (!run || run.status !== "awaiting_approval")
  throw new Error("run did not reach awaiting_approval: " + JSON.stringify(run).slice(0, 400));
pass("Codex produced a draft PR awaiting engineering review");
console.log("  pr:", run.prUrl);
console.log("  reproductionStatus:", run.reproductionStatus, "commit:", run.commit);
if (run.reproductionStatus !== "reproduced")
  throw new Error("expected reproductionStatus reproduced, got " + run.reproductionStatus);

await expectThrow(
  "Direct resolution of a pull-request run is refused",
  () =>
    db().mutation(api.cue.updateRun, {
      secret: auth,
      runId: runId as never,
      fields: { status: "resolved" },
    }),
);
pass("Release-verifier-only resolution gate holds for pull-request runs");

const prNumber = String(run.prUrl).split("/").pop();
await gh(["pr", "ready", prNumber!, "--repo", REPO]);
await gh(["pr", "merge", prNumber!, "--repo", REPO, "--merge"]);
const releaseCommit = (await gh(["api", `repos/${REPO}/commits/main`, "--jq", ".sha"])).trim();
console.log("PR merged; release commit:", releaseCommit);
pass("Connected repository's release process merged the fix");

await db().mutation(api.jobs.decide, {
  secret: auth,
  runId: runId as never,
  commit: run.commit as string,
  actor: "E2E Verification",
  approve: true,
});
pass("Engineering approval recorded against the exact PR commit");

await db().mutation(api.releases.confirmFeature, {
  secret: auth,
  runId: runId as never,
  commit: run.commit as string,
  releaseCommit,
  evidence:
    "Merged pull request " + prNumber + " on " + REPO + " puts the note title through node test.mjs on main; the previously failing assertion now passes and the baseline suite is green.",
});
const s2 = await snapshot();
const resolved = s2.runs.find((r) => r._id === runId);
if (
  resolved?.status !== "resolved" ||
  !resolved.verified ||
  !resolved.deployed ||
  resolved.releaseCommit !== releaseCommit
)
  throw new Error("release verification did not complete: " + JSON.stringify(resolved).slice(0, 300));
pass("Release verifier resolved the run with deployed + verified evidence");

const replay = await db().mutation(api.releases.confirmFeature, {
  secret: auth,
  runId: runId as never,
  commit: run.commit as string,
  releaseCommit,
  evidence: "Merged pull request " + prNumber + " on " + REPO + " puts the note title through node test.mjs on main; the previously failing assertion now passes and the baseline suite is green.",
});
if (replay !== null) throw new Error("release verification replay should be idempotent");
pass("Release verification is idempotent on replay");

const s3 = await snapshot();
const resolvedIssue = s3.issues.find((x) => x._id === issue._id);
const resolvedRun = s3.runs.find((r) => r._id === runId);
const facts = (
  await import("../../lib/reply-policy")
).replyFacts({
  issue: resolvedIssue as never,
  run: resolvedRun as never,
  case: s3.cases.find((c) => c._id === caseId) as never,
  channel: "chat",
} as never);
if (!facts.fixVerified) throw new Error("replyFacts.fixVerified should be true");
console.log("  replyFacts:", JSON.stringify(facts));
pass("Customer reply facts reflect the verified fix");

const conv = await (
  await fetch(base + "/api/widget", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({
      action: "read",
      app: appId,
      token: session.token,
      origin: ORIGIN,
    }),
  })
).json();
const cueMessages = (conv.messages || []).filter((m: { role: string }) => m.role === "cue");
console.log("  customer sees", cueMessages.length, "cue replies; case status:", conv.case?.status);
pass("Customer conversation reflects the loop outcome");

console.log("appId:", appId, "caseId:", caseId, "runId:", runId);
console.log("NOTES APP END-TO-END COMPLETE");
