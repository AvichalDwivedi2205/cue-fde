// @vitest-environment edge-runtime
import { defineTestApp } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { engineeringInput } from "../lib/app-pack-schema";
import * as commitMetadata from "./commitMetadata";
import * as cue from "./cue";
import * as jobs from "./jobs";
import * as releases from "./releases";
import schema from "./schema";

const app = defineTestApp({ schema }).defineModules({
  commitMetadata,
  cue,
  jobs,
  releases,
});
const oldCommit = "a".repeat(40);
const newCommit = "b".repeat(40);
const tree = "c".repeat(40);
const parent = "d".repeat(40);
const auth = { secret: "commit-metadata-test-secret" };
const attestation = {
  expectedOldCommit: oldCommit,
  newCommit,
  oldTree: tree,
  newTree: tree,
  oldParent: parent,
  newParent: parent,
  githubLogin: "ExampleOperator",
  githubUserId: 424242,
  authorName: "Example Operator",
  authorEmail: "424242+ExampleOperator@users.noreply.github.com",
  reason: "The user requested their authenticated GitHub author identity.",
};
const engineering = engineeringInput.parse({
  repository: "example/customer-app",
  baseBranch: "main",
  allowedPaths: ["src/action.ts"],
  testCommands: [{ program: "node", args: ["checks.mjs"] }],
});
afterEach(() => vi.unstubAllEnvs());

async function setup(kind: "bug" | "feature" = "bug") {
  vi.stubEnv("CUE_DEMO_SECRET", auth.secret);
  const t = app.createTest();
  const ids = await t.run(async (ctx) => {
    const packId = await ctx.db.insert("appPacks", {
      appId: "cue_app_metadata_test",
      name: "Example customer app",
      origins: ["https://customer.example"],
      status: "active",
      engineering,
      createdAt: 1000,
      updatedAt: 1000,
    });
    const issueId = await ctx.db.insert("issues", {
      appId: "cue_app_metadata_test",
      title: "Keyboard action",
      description: "The keyboard action needs repository verification.",
      kind,
      fingerprint: "metadata-test-action",
      status: "implemented",
      priority: "P2",
      tags: ["keyboard"],
      createdAt: 1000,
      ...(kind === "feature"
        ? { spec: "Approved action specification", specApprovedAt: 900 }
        : {}),
    });
    const runId = await ctx.db.insert("runs", {
      issueId,
      status: "approved",
      phase: "approved",
      approval: "Original reviewer",
      provider: "Meta",
      model: "muse-wonder-1.0",
      requestedModel: "muse-wonder-1.0",
      executionBackend: "local",
      inputTokens: 12345,
      outputTokens: 456,
      modelCalls: 3,
      sandboxIds: ["local-test-container"],
      createdAt: 1000,
      updatedAt: 1001,
      rootCause: "Action handling needs a consistent entry point.",
      diff: "Synthetic action-handler change",
      before: `Baseline reproduction at ${parent}: check failed`,
      after: `Patched checks at ${oldCommit}: passed`,
      prUrl: "https://github.com/example/customer-app/pull/1",
      commit: oldCommit,
      repoPath: "/tmp/example-customer-app",
      summary: "A bounded action-handler change passed repository checks.",
      kind,
      repository: engineering.repository,
      targetId: "cue_app_metadata_test",
      codingPolicy: engineering,
      baseCommit: parent,
      deploymentMode: "pull_request",
      reproduction: "Use the keyboard action and observe the missing result.",
      reproductionStatus: "reproduced",
      deployed: false,
      verified: false,
      ...(kind === "feature"
        ? { approvedSpec: "Approved action specification" }
        : {}),
    });
    const caseId = await ctx.db.insert("cases", {
      appId: "cue_app_metadata_test",
      issueId,
      title: "Keyboard action report",
      customer: "Example visitor",
      initials: "EV",
      channel: "chat",
      body: "The keyboard action did not work.",
      status: "open",
      priority: "P2",
      tags: [],
      provenance: "visitor report",
      createdAt: 1000,
      updatedAt: 1000,
    });
    await ctx.db.insert("messages", {
      caseId,
      author: "Example visitor",
      role: "customer",
      body: "The keyboard action did not work.",
      createdAt: 1000,
    });
    await ctx.db.insert("jobs", {
      runId,
      kind: kind === "feature" ? "feature" : "investigate",
      status: "done",
      leaseUntil: 0,
      cancel: false,
      createdAt: 1000,
    });
    await ctx.db.insert("events", {
      runId,
      issueId,
      title: "Repository checks passed",
      detail: `Patched source checked at ${oldCommit}; baseline at ${parent}.`,
      kind: "success",
      createdAt: 1000,
    });
    await ctx.db.insert("events", {
      runId,
      issueId,
      title: "Exact commit approved",
      detail: `Original reviewer: ${oldCommit}`,
      kind: "approval",
      createdAt: 1001,
    });
    return { packId, issueId, runId, caseId };
  });
  const snapshot = () =>
    t.run(async (ctx) => {
      const run = await ctx.db.get("runs", ids.runId);
      const issue = await ctx.db.get("issues", ids.issueId);
      if (!run || !issue) throw new Error("Missing test run or issue");
      return {
        run,
        issue,
        pack: await ctx.db.get("appPacks", ids.packId),
        cases: await ctx.db.query("cases").take(10),
        messages: await ctx.db.query("messages").take(10),
        jobs: await ctx.db.query("jobs").take(10),
        events: await ctx.db.query("events").take(20),
      };
    });
  return {
    t,
    ...ids,
    args: { runId: ids.runId, ...attestation },
    snapshot,
  };
}

test("internal re-authoring resets exact approval and preserves all original evidence", async () => {
  expect(commitMetadata.reauthor.isInternal).toBe(true);
  const s = await setup();
  const before = await s.snapshot();
  expect(
    await s.t.mutation(app.internal.commitMetadata.reauthor, s.args),
  ).toEqual({ outcome: "updated", commit: newCommit });
  const after = await s.snapshot();
  const { approval, ...retainedRun } = before.run;
  expect(approval).toBe("Original reviewer");
  expect(after.run).toStrictEqual({
    ...retainedRun,
    commit: newCommit,
    status: "awaiting_approval",
    phase: "awaiting_approval",
    updatedAt: expect.any(Number),
  });
  expect(after.issue).toStrictEqual({
    ...before.issue,
    status: "awaiting_approval",
  });
  expect(after.pack).toStrictEqual(before.pack);
  expect(after.cases).toStrictEqual(before.cases);
  expect(after.messages).toStrictEqual(before.messages);
  expect(after.jobs).toStrictEqual(before.jobs);
  expect(after.events.slice(0, before.events.length)).toStrictEqual(
    before.events,
  );
  expect(after.events).toHaveLength(before.events.length + 1);
  const audit = after.events.at(-1);
  expect(audit).toMatchObject({
    runId: s.runId,
    issueId: s.issueId,
    title: "Commit identity corrected; approval required",
    kind: "step",
  });
  for (const fact of [
    oldCommit,
    newCommit,
    tree,
    parent,
    attestation.githubLogin,
    String(attestation.githubUserId),
    attestation.authorName,
    attestation.authorEmail,
    attestation.reason,
    "Previous approval by Original reviewer applies only to " + oldCommit,
    "patched-tree verification remains attributed to " + oldCommit,
    "same-tree attestation, not a rerun",
    "no checks or model calls were rerun for " + newCommit,
  ])
    expect(audit?.detail).toContain(fact);
});

test("normal worker updates still cannot rewrite an approved terminal run", async () => {
  const s = await setup();
  const before = await s.snapshot();
  await expect(
    s.t.mutation(app.api.cue.updateRun, {
      ...auth,
      runId: s.runId,
      fields: { commit: newCommit, status: "awaiting_approval" },
    }),
  ).rejects.toThrow("Run is terminal");
  expect(await s.snapshot()).toStrictEqual(before);
});

test("retries do not duplicate audit or reset a later exact-commit approval", async () => {
  const s = await setup();
  await s.t.mutation(app.internal.commitMetadata.reauthor, s.args);
  const pending = await s.snapshot();
  expect(
    await s.t.mutation(app.internal.commitMetadata.reauthor, s.args),
  ).toEqual({ outcome: "already_current", commit: newCommit });
  expect(await s.snapshot()).toStrictEqual(pending);
  await expect(
    s.t.mutation(app.api.jobs.decide, {
      ...auth,
      runId: s.runId,
      commit: oldCommit,
      actor: "New reviewer",
      approve: true,
    }),
  ).rejects.toThrow("Approval must match the pending commit");
  await s.t.mutation(app.api.jobs.decide, {
    ...auth,
    runId: s.runId,
    commit: newCommit,
    actor: "New reviewer",
    approve: true,
  });
  await s.t.run((ctx) =>
    ctx.db.patch("appPacks", s.packId, { status: "suspended" }),
  );
  const approved = await s.snapshot();
  expect(approved.run.approval).toBe("New reviewer");
  expect(approved.run.status).toBe("approved");
  await s.t.mutation(app.internal.commitMetadata.reauthor, s.args);
  expect(await s.snapshot()).toStrictEqual(approved);
});

test("a retry after actual release never reopens the run, case or issue", async () => {
  const s = await setup();
  await s.t.mutation(app.internal.commitMetadata.reauthor, s.args);
  await s.t.mutation(app.api.jobs.decide, {
    ...auth,
    runId: s.runId,
    commit: newCommit,
    actor: "New reviewer",
    approve: true,
  });
  await s.t.mutation(app.api.releases.confirmFeature, {
    ...auth,
    runId: s.runId,
    commit: newCommit,
    releaseCommit: "e".repeat(40),
    evidence:
      "Synthetic production acceptance evidence: the exact approved source was deployed and the original keyboard action succeeded after reloading the customer application.",
  });
  const released = await s.snapshot();
  expect(released.run.status).toBe("resolved");
  expect(released.cases[0].status).toBe("resolved");
  await s.t.mutation(app.internal.commitMetadata.reauthor, s.args);
  expect(await s.snapshot()).toStrictEqual(released);
});

test.each([
  { newTree: "e".repeat(40) },
  { newParent: "e".repeat(40) },
  { oldParent: "e".repeat(40), newParent: "e".repeat(40) },
  { expectedOldCommit: "e".repeat(40) },
  { newCommit: oldCommit },
  { oldTree: "not-a-git-object" },
  { authorEmail: "unrelated@example.com" },
  { githubUserId: 0 },
])("invalid attestation refuses atomically: %j", async (changed) => {
  const s = await setup();
  const before = await s.snapshot();
  await expect(
    s.t.mutation(app.internal.commitMetadata.reauthor, {
      ...s.args,
      ...changed,
    }),
  ).rejects.toThrow();
  expect(await s.snapshot()).toStrictEqual(before);
});

test.each([
  "running",
  "awaiting_approval",
  "failed",
  "rejected",
  "canceled",
  "resolved",
  "archived",
])("an old-SHA %s run cannot be reopened by re-authoring", async (status) => {
  const s = await setup();
  await s.t.run((ctx) => ctx.db.patch("runs", s.runId, { status }));
  const before = await s.snapshot();
  await expect(
    s.t.mutation(app.internal.commitMetadata.reauthor, s.args),
  ).rejects.toThrow("approved pull-request run");
  expect(await s.snapshot()).toStrictEqual(before);
});

test.each([
  { deployed: true },
  { verified: true },
  { releaseCommit: "e".repeat(40) },
  { releaseEvidence: "" },
])("a prior deployment/release marker refuses: %j", async (marker) => {
  const s = await setup();
  await s.t.run((ctx) => ctx.db.patch("runs", s.runId, marker));
  const before = await s.snapshot();
  await expect(
    s.t.mutation(app.internal.commitMetadata.reauthor, s.args),
  ).rejects.toThrow("Deployed or released runs");
  expect(await s.snapshot()).toStrictEqual(before);
});

test.each(["suspended", "changed", "missing", "unfrozen"])(
  "repository policy must remain active and frozen: %s",
  async (change) => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      if (change === "suspended")
        await ctx.db.patch("appPacks", s.packId, { status: "suspended" });
      if (change === "changed")
        await ctx.db.patch("appPacks", s.packId, {
          engineering: { ...engineering, baseBranch: "changed" },
        });
      if (change === "missing") await ctx.db.delete("appPacks", s.packId);
      if (change === "unfrozen")
        await ctx.db.patch("runs", s.runId, { codingPolicy: undefined });
    });
    const before = await s.snapshot();
    await expect(
      s.t.mutation(app.internal.commitMetadata.reauthor, s.args),
    ).rejects.toThrow("Repository policy changed");
    expect(await s.snapshot()).toStrictEqual(before);
  },
);

test("feature re-authoring preserves the Product-approved specification", async () => {
  const s = await setup("feature");
  await s.t.mutation(app.internal.commitMetadata.reauthor, s.args);
  const after = await s.snapshot();
  expect(after.run.approvedSpec).toBe("Approved action specification");
  expect(after.issue.specApprovedAt).toBe(900);
  expect(after.run.status).toBe("awaiting_approval");
});

test.each(["changed", "withdrawn"])(
  "feature Product approval must remain current: %s",
  async (change) => {
    const s = await setup("feature");
    await s.t.run((ctx) =>
      ctx.db.patch("issues", s.issueId, {
        ...(change === "changed"
          ? { spec: "A different specification" }
          : { specApprovedAt: undefined }),
      }),
    );
    const before = await s.snapshot();
    await expect(
      s.t.mutation(app.internal.commitMetadata.reauthor, s.args),
    ).rejects.toThrow("Product must approve");
    expect(await s.snapshot()).toStrictEqual(before);
  },
);
