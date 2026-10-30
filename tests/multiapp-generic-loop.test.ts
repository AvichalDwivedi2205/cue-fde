/// <reference types="vite/client" />
import { test, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { replyFacts, replyProblems } from "../lib/reply-policy";
import { runExecutionMode } from "../lib/coding-policy";
const modules = import.meta.glob("../convex/**/*.{ts,js}"),
  auth = { secret: "generic-loop-secret" };

afterEach(() => vi.unstubAllEnvs());

function fresh() {
  vi.stubEnv("CUE_DEMO_SECRET", auth.secret);
  return convexTest(schema, modules);
}

async function onboardApp2(t: Awaited<ReturnType<typeof fresh>>) {
  const { appId } = await t.mutation(api.appPacks.register, {
    ...auth,
    name: "Generic Notes",
    origins: ["https://notes.example.com"],
  });
  // Install check: one case through the widget, then activation.
  const caseId = await t.mutation(api.cue.createCase, {
    ...auth,
    appId,
    customer: "Notes visitor",
    owner: `widget:${appId}:visitor-1`,
    channel: "widget",
    title: "Widget hello",
    body: "Just testing the install.",
  });
  await t.mutation(api.appPacks.recordInstallCheck, { ...auth, appId });
  await t.mutation(api.appPacks.activate, { ...auth, appId });
  await t.mutation(api.appPacks.bindEngineering, {
    ...auth,
    appId,
    repository: "acme/generic-notes",
    baseBranch: "main",
    allowedPaths: ["lib/"],
    testCommands: [{ program: "node", args: ["test.mjs"] }],
  });
  return { appId, caseId };
}

test("a bug on app #2 walks the full governed loop without any Bloom coupling", async () => {
  const t = fresh();
  const { appId, caseId } = await onboardApp2(t);

  // A real bug report on app #2: NOT the Bloom symptom gate, provisional issue.
  const bugCaseId = await t.mutation(api.cue.createCase, {
    ...auth,
    appId,
    customer: "Notes visitor",
    owner: `widget:${appId}:visitor-1`,
    channel: "widget",
    title: "Note titles disappear",
    body: "When I save a note the title is gone. I typed 'First memory' and only the body came back.",
  });
  const s1 = await t.query(api.cue.snapshot, auth);
  const bugCase = s1.cases.find((c) => c._id === bugCaseId)!;
  expect(bugCase.issueId).toBeDefined();
  const issueId = bugCase.issueId!;
  const issue = s1.issues.find((i) => i._id === issueId)!;
  expect(issue.kind).toBe("bug");
  expect(issue.fingerprint).not.toContain("bloom:upload:413");
  expect(issue.fingerprint).toContain(appId);

  // Refusals that protect the invariant: short reproduction, unbound app.
  await expect(
    t.mutation(api.cue.startRun, {
      ...auth,
      issueId,
      reproduction: "too short",
    }),
  ).rejects.toThrow("reproduced");
  // Start the fix run: pack legality is checked in-transaction.
  const runId = await t.mutation(api.cue.startRun, {
    ...auth,
    issueId,
    reproduction:
      "node test.mjs fails at base: saveNote drops the title field entirely.",
  });
  const s2 = await t.query(api.cue.snapshot, auth);
  const run = s2.runs.find((r) => r._id === runId)!;
  expect(run.kind).toBe("bug");
  expect(run.deploymentMode).toBe("pull_request");
  expect(run.targetId).toBe(appId);
  expect(run.repository).toBe("acme/generic-notes");
  expect(run.reproduction).toContain("saveNote drops the title");
  expect(runExecutionMode(run)).toBe("pull_request");

  const unbound = await t.mutation(api.appPacks.register, {
    ...auth,
    name: "Unbound",
    origins: ["https://unbound.example.com"],
  });
  const unboundIssueId = await t.run(async (ctx) => {
    const caseId2 = await ctx.db.insert("cases", {
      title: "t",
      customer: "c",
      initials: "c",
      channel: "widget",
      appId: unbound.appId,
      body: "b",
      status: "open",
      priority: "P2",
      tags: [],
      provenance: "test",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return ctx.db.insert("issues", {
      title: "Unbound bug",
      description: "d",
      kind: "bug",
      fingerprint: `${unbound.appId}:report:1`,
      appId: unbound.appId,
      status: "open",
      priority: "P2",
      tags: [],
      createdAt: Date.now(),
    });
  });
  await expect(
    t.mutation(api.cue.startRun, {
      ...auth,
      issueId: unboundIssueId,
      reproduction: "a reproduction note that is long enough here",
    }),
  ).rejects.toThrow("repository");

  // Engineering approves the exact PR commit: approved, never resolved.
  const commit = "a".repeat(40);
  await t.mutation(api.cue.updateRun, {
    ...auth,
    runId,
    fields: { status: "awaiting_approval", phase: "awaiting_approval", commit },
  });
  await t.mutation(api.jobs.decide, {
    ...auth,
    runId,
    commit,
    actor: "Engineering",
    approve: true,
  });
  const s3 = await t.query(api.cue.snapshot, auth);
  const approved = s3.runs.find((r) => r._id === runId)!;
  expect(approved.status).toBe("approved");
  const approvedIssue = s3.issues.find((i) => i._id === issueId)!;
  expect(approvedIssue.status).toBe("implemented");

  // updateRun cannot fabricate resolution for a pull-request run.
  await expect(
    t.mutation(api.cue.updateRun, {
      ...auth,
      runId,
      fields: { status: "resolved", deployed: true, verified: true },
    }),
  ).rejects.toThrow("release verifier");

  // Nothing may claim a verified fix yet: reply guards hold.
  const draft = replyFacts({
    issue: approvedIssue,
    run: approved,
  });
  expect(draft.fixVerified).toBe(false);
  // An explicit overclaim the documented pattern guards catch.
  const candidate = "The fix is deployed and verified. Please retry.";
  expect(replyProblems(candidate, { issue: approvedIssue, run: approved }).length)
    .toBeGreaterThan(0);

  // The release verifier resolves the run with real evidence — the only
  // honest path to "verified" for a bug fixed via PR.
  const releaseCommit = "b".repeat(40);
  const evidence =
    "Merged the fix on the fixture repository, ran node test.mjs against the deployed service: 2 checks passed, title and body both persisted.";
  await t.mutation(api.releases.confirmFeature, {
    ...auth,
    runId,
    commit,
    releaseCommit,
    evidence,
  });
  const s4 = await t.query(api.cue.snapshot, auth);
  const released = s4.runs.find((r) => r._id === runId)!;
  expect(released.status).toBe("resolved");
  expect(released.verified).toBe(true);
  const releasedIssue = s4.issues.find((i) => i._id === issueId)!;
  expect(releasedIssue.status).toBe("resolved");

  // NOW the verified facts exist and customer replies may say so.
  const facts = replyFacts({ issue: releasedIssue, run: released });
  expect(facts.fixVerified).toBe(true);
  expect(
    replyProblems(
      "The fix passed our regression tests. Please try the affected step again; we haven't verified the result for your own case yet.",
      { issue: releasedIssue, run: released },
    ),
  ).toHaveLength(0);

  // ConfirmFeature is idempotent on identical evidence.
  await t.mutation(api.releases.confirmFeature, {
    ...auth,
    runId,
    commit,
    releaseCommit,
    evidence,
  });

  // Bloom's fixture issue path is untouched: same fingerprint still starts.
  const bloomIssueId = await t.run((ctx) =>
    ctx.db.insert("issues", {
      title: "Upload regression",
      description: "3 MB photo rejected",
      kind: "bug",
      fingerprint: "bloom:upload:413",
      status: "open",
      priority: "P1",
      tags: [],
      createdAt: Date.now(),
    }),
  );
  const fixtureRunId = await t.mutation(api.cue.startRun, {
    ...auth,
    issueId: bloomIssueId,
  });
  const fixtureRun = await t.run((ctx) => ctx.db.get("runs", fixtureRunId));
  expect(fixtureRun?.deploymentMode).toBeUndefined();
});

test("suspended apps refuse coding but keep their history", async () => {
  const t = fresh();
  const { appId } = await onboardApp2(t);
  await t.mutation(api.appPacks.suspend, { ...auth, appId });
  const issueId = await t.run(async (ctx) =>
    ctx.db.insert("issues", {
      title: "Bug on suspended app",
      description: "d",
      kind: "bug",
      fingerprint: `${appId}:report:2`,
      appId,
      status: "open",
      priority: "P2",
      tags: [],
      createdAt: Date.now(),
    }),
  );
  await expect(
    t.mutation(api.cue.startRun, {
      ...auth,
      issueId,
      reproduction: "a reproduction note that is long enough here",
    }),
  ).rejects.toThrow();
  const packs = await t.query(api.appPacks.list, auth);
  const pack = packs.find((p: { appId: string }) => p.appId === appId);
  expect(pack?.status).toBe("suspended");
});

test("the live Bloom widget app still routes into the upload regression", async () => {
  const t = fresh();
  // The registered Bloom widget app: its pack serves the Bloom public origin.
  await t.mutation(api.appPacks.ensure, {
    ...auth,
    appId: "cue_app_bloomlive000000000000000",
    name: "Bloom",
    origins: ["https://bloom-with-cue.vercel.app"],
    status: "active",
    aliases: ["bloom"],
  });
  const caseId = await t.mutation(api.cue.createCase, {
    ...auth,
    appId: "cue_app_bloomlive000000000000000",
    customer: "Bloom user",
    channel: "widget",
    title: "3 MB photo rejected",
    body: "My 3 MB photo fails to upload. Your app says up to 5 MB.",
  });
  const s = await t.query(api.cue.snapshot, auth);
  const c = s.cases.find((x) => x._id === caseId)!;
  const issue = s.issues.find((i) => i._id === c.issueId)!;
  expect(issue.fingerprint).toContain("bloom:upload:413");
  expect(issue.priority).toBe("P1");
  // And an app #2 report with identical text must NOT.
  const { appId } = await t.mutation(api.appPacks.register, {
    ...auth,
    name: "Notes",
    origins: ["https://notes.example.com"],
  });
  await t.mutation(api.cue.createCase, {
    ...auth,
    appId,
    customer: "Notes visitor",
    channel: "widget",
    title: "3 MB photo rejected",
    body: "My 3 MB photo fails to upload. Your app says up to 5 MB.",
  });
  const s2 = await t.query(api.cue.snapshot, auth);
  const other = s2.issues.find((i) => i.appId === appId)!;
  expect(other.fingerprint).not.toContain("bloom:upload:413");
  expect(other.priority).toBe("P2");
});
