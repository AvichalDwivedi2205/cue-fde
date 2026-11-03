/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts"]);
const secret = "preview-acceptance-test";
const commit = "a".repeat(40);
const policy = {
  repository: "owner/product",
  baseBranch: "main",
  allowedPaths: ["src/"],
  testCommands: [{ program: "node" as const, args: ["test.mjs"] }],
};
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", secret));
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("appPacks", {
      appId: "app-a",
      name: "Product",
      status: "active",
      origins: [],
      engineering: policy,
      createdAt: 1,
      updatedAt: 1,
    });
    const issueId = await ctx.db.insert("issues", {
      appId: "app-a",
      title: "Delete is lost on reload",
      description: "A deleted note returns",
      kind: "bug",
      fingerprint: "test:delete",
      status: "implemented",
      priority: "high",
      tags: [],
      createdAt: 1,
    });
    const runId = await ctx.db.insert("runs", {
      issueId,
      targetId: "app-a",
      kind: "bug",
      deploymentMode: "pull_request",
      repository: policy.repository,
      codingPolicy: policy,
      status: "approved",
      phase: "approved",
      provider: "Meta",
      commit,
      approval: "Engineer",
      createdAt: 1,
      updatedAt: 1,
    });
    const caseId = await ctx.db.insert("cases", {
      appId: "app-a",
      issueId,
      title: "Delete",
      body: "Delete returns",
      customer: "Visitor",
      initials: "V",
      channel: "chat",
      status: "investigating",
      priority: "high",
      tags: [],
      provenance: "Widget",
      createdAt: 1,
      updatedAt: 1,
    });
    return { issueId, runId, caseId };
  });
  return { t, ...ids };
}
const deployment = {
  id: "dpl_test123",
  url: "https://product-preview.vercel.app",
  commit,
  policyDigest: "b".repeat(64),
};
const observations =
  "Deleted the synthetic note with the menu action, reloaded the same workspace and confirmed that the note remained absent.";

test("accepted preview notifies widget once while preserving production state", async () => {
  const { t, runId, caseId, issueId } = await setup();
  await t.mutation(api.previewAcceptance.registerDeployment, {
    secret,
    runId,
    deployment,
  });
  const input = {
    secret,
    runId,
    commit,
    deploymentId: deployment.id,
    observations,
    actor: "Engineer",
  };
  const [receipt, replay] = await Promise.all([
    t.mutation(api.previewAcceptance.record, input),
    t.mutation(api.previewAcceptance.record, input),
  ]);
  expect(replay).toEqual(receipt);
  expect(await t.mutation(api.previewAcceptance.record, input)).toEqual(
    receipt,
  );
  const actual = await t.run(async (ctx) => ({
    run: await ctx.db.get("runs", runId),
    issue: await ctx.db.get("issues", issueId),
    conversation: await ctx.db.get("cases", caseId),
    messages: await ctx.db
      .query("messages")
      .withIndex("by_caseId_and_createdAt", (q) => q.eq("caseId", caseId))
      .take(10),
  }));
  expect(actual.run).toMatchObject({
    status: "approved",
    previewAcceptance: { commit, deploymentId: deployment.id },
  });
  expect(actual.run?.deployed).toBeUndefined();
  expect(actual.run?.verified).toBeUndefined();
  expect(actual.run?.releaseCommit).toBeUndefined();
  expect(actual.issue?.status).toBe("implemented");
  expect(actual.conversation?.status).toBe("investigating");
  expect(actual.messages).toHaveLength(1);
  expect(actual.messages[0].body).toContain("preview");
  expect(actual.messages[0].body).toContain("Production");
  expect(await t.run((ctx) => ctx.db.query("jobs").take(10))).toEqual([]);
});
test("a new deployment identity or altered acceptance cannot overwrite existing evidence", async () => {
  const { t, runId } = await setup();
  await t.mutation(api.previewAcceptance.registerDeployment, {
    secret,
    runId,
    deployment,
  });
  await t.mutation(api.previewAcceptance.record, {
    secret,
    runId,
    commit,
    deploymentId: deployment.id,
    observations,
    actor: "Engineer",
  });
  await expect(
    t.mutation(api.previewAcceptance.registerDeployment, {
      secret,
      runId,
      deployment: { ...deployment, id: "dpl_other" },
    }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.previewAcceptance.record, {
      secret,
      runId,
      commit,
      deploymentId: deployment.id,
      observations: observations + " Changed.",
      actor: "Engineer",
    }),
  ).rejects.toThrow();
});
test("only an approved same-app preview can be registered or announced", async () => {
  const { t, runId, caseId } = await setup();
  await expect(
    t.mutation(api.previewAcceptance.registerDeployment, {
      secret,
      runId,
      deployment: { ...deployment, url: "https://production.example.test" },
    }),
  ).rejects.toThrow();
  await t.run((ctx) =>
    ctx.db.patch("runs", runId, { status: "awaiting_approval" }),
  );
  await expect(
    t.mutation(api.previewAcceptance.registerDeployment, {
      secret,
      runId,
      deployment,
    }),
  ).rejects.toThrow();
  await t.run((ctx) => ctx.db.patch("runs", runId, { status: "approved" }));
  await t.mutation(api.previewAcceptance.registerDeployment, {
    secret,
    runId,
    deployment,
  });
  await t.run((ctx) => ctx.db.patch("cases", caseId, { appId: "app-b" }));
  await expect(
    t.mutation(api.previewAcceptance.record, {
      secret,
      runId,
      commit,
      deploymentId: deployment.id,
      observations,
      actor: "Engineer",
    }),
  ).rejects.toThrow();
  expect(
    (await t.run((ctx) => ctx.db.get("runs", runId)))?.previewAcceptance,
  ).toBeUndefined();
});

test("preview acceptance refuses unregistered deployment, changed SHA and stale policy", async () => {
  const { t, runId } = await setup();
  const input = {
    secret,
    runId,
    commit,
    deploymentId: deployment.id,
    observations,
    actor: "Engineer",
  };
  await expect(
    t.mutation(api.previewAcceptance.record, input),
  ).rejects.toThrow();
  await t.mutation(api.previewAcceptance.registerDeployment, {
    secret,
    runId,
    deployment,
  });
  await expect(
    t.mutation(api.previewAcceptance.record, {
      ...input,
      commit: "c".repeat(40),
    }),
  ).rejects.toThrow();
  await t.run(async (ctx) => {
    const pack = await ctx.db
      .query("appPacks")
      .withIndex("by_appId", (q) => q.eq("appId", "app-a"))
      .unique();
    await ctx.db.patch("appPacks", pack!._id, {
      engineering: { ...policy, baseBranch: "changed" },
    });
  });
  await expect(
    t.mutation(api.previewAcceptance.record, input),
  ).rejects.toThrow();
});
