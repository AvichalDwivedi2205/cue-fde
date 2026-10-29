/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, test, expect, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts"]);
const scope = {
    secret: "typed-verification-secret",
    workspaceId: "workspace-a",
    appId: "app-a",
  },
  owner = "widget:app-a:00000000-0000-4000-8000-000000000001",
  question = "What is the photo upload limit?",
  origin = "https://app-a.test";
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", scope.secret));
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  const { caseId } = await t.mutation(api.intake.widgetMessage, {
    secret: scope.secret,
    appId: scope.appId,
    owner,
    customer: "Synthetic answer-outcome verification",
    title: "Fixture",
    body: question,
    initialBody: question,
    sourceUrl: origin,
    ack: "Needs review",
    knowledge: {
      workspaceId: scope.workspaceId,
      usedChunkIds: [],
      citedChunkIds: [],
      status: "needs_review",
      provider: "none",
      model: "none",
      inputTokens: 0,
      outputTokens: 0,
    },
  });
  const args = {
    secret: scope.secret,
    caseId,
    expectedOwner: owner,
    expectedAppId: scope.appId,
    expectedQuestion: question,
    expectedOrigin: origin,
  };
  return { t, caseId, args };
}
test("typed fixture labeling is idempotent, preserves messages and excludes gap counts", async () => {
  const { t, caseId, args } = await setup();
  const before = await t.query(api.bloom.conversation, {
    secret: scope.secret,
    owner,
  });
  expect(await t.query(api.feedbackGaps.snapshot, scope)).toHaveLength(1);
  await t.mutation(api.intake.markVerificationCase, args);
  await t.mutation(api.intake.markVerificationCase, args);
  const after = await t.query(api.bloom.conversation, {
    secret: scope.secret,
    owner,
  });
  expect(after!.case.provenance).toBe("Synthetic answer-outcome verification");
  expect(after!.messages.filter((m) => m.role !== "note")).toEqual(
    before!.messages,
  );
  expect(
    after!.messages.filter((m) => m.body.startsWith("Generated typed fixture")),
  ).toHaveLength(1);
  expect(await t.query(api.feedbackGaps.snapshot, scope)).toEqual([]);
  const reports = await t.run((ctx) =>
    ctx.db.query("knowledgeGapReports").take(10),
  );
  expect(reports[0]).toMatchObject({ caseId, excludedVerification: true });
});
test("the trusted marker rejects identity, scope, question and page-origin substitutions", async () => {
  const { t, args } = await setup();
  for (const mismatch of [
    { secret: "wrong-secret" },
    { expectedOwner: "widget:app-a:00000000-0000-4000-8000-000000000002" },
    { expectedAppId: "app-b" },
    { expectedQuestion: "A real customer question" },
    { expectedOrigin: origin + "/support" },
    { expectedOrigin: "https://other.test" },
  ])
    await expect(
      t.mutation(api.intake.markVerificationCase, { ...args, ...mismatch }),
    ).rejects.toThrow();
  expect(
    (await t.query(api.bloom.conversation, { secret: scope.secret, owner }))!
      .case.provenance,
  ).not.toMatch(/^Synthetic/);
});
test("a customer report, external event, page URL or non-chat case cannot be hidden", async () => {
  for (const mismatch of [
    { customer: "Actual customer" },
    { externalId: "external-event" },
    { channel: "email" },
    { sourceUrl: origin + "/page" },
    { sourceUrl: undefined },
    { sourceKey: "email:thread" },
    { appId: "app-b" },
    { owner: "real-guest" },
  ]) {
    const { t, caseId, args } = await setup();
    await t.run((ctx) => ctx.db.patch("cases", caseId, mismatch));
    await expect(
      t.mutation(api.intake.markVerificationCase, args),
    ).rejects.toThrow("does not match");
    expect(
      (await t.run((ctx) => ctx.db.get("cases", caseId)))!.provenance,
    ).not.toMatch(/^Synthetic/);
  }
});
