/// <reference types="vite/client" />
import { convexTest, type TestConvex } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts"]);
const auth = { secret: "conversation-secret" },
  owner = "widget:app-a:one-visitor",
  appId = "app-a",
  key = "a0000000-0000-4000-8000-000000000099";
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", auth.secret));
afterEach(() => vi.unstubAllEnvs());
function typed(t: TestConvex<typeof schema>) {
  return t.mutation(api.intake.widgetMessage, {
    ...auth,
    owner,
    appId,
    customer: "Visitor",
    title: "Typed question",
    body: "Typed follow-up",
    initialBody: "Typed follow-up",
    sourceUrl: "https://app-a.test",
    ack: "Typed answer",
  });
}
async function start(t: TestConvex<typeof schema>) {
  const sessionId = await t.mutation(api.voice.start, {
    ...auth,
    owner,
    appId,
    customer: "Visitor",
  });
  await t.mutation(api.voice.claim, { ...auth, owner, sessionId, key });
  return {
    ...auth,
    owner,
    sessionId,
    key,
    transcript: "Spoken question",
    reply: "Spoken answer",
  };
}
async function assertOne(t: TestConvex<typeof schema>, id: string) {
  const cases = await t.run((ctx) =>
    ctx.db
      .query("cases")
      .withIndex("by_owner", (q) => q.eq("owner", owner))
      .take(10),
  );
  expect(cases).toHaveLength(1);
  expect(cases[0]._id).toBe(id);
  expect(cases[0].sourceKey).toBe(owner);
  const conversation = await t.query(api.bloom.conversation, {
    ...auth,
    owner,
  });
  expect(
    conversation!.messages
      .filter((m) => m.role === "customer")
      .map((m) => m.body)
      .sort(),
  ).toEqual(["Spoken question", "Typed follow-up"]);
  expect(
    conversation!.messages
      .filter((m) => m.role === "cue")
      .map((m) => m.body)
      .sort(),
  ).toEqual(["Spoken answer", "Typed answer"]);
}
test("voice first and typed follow-up share one canonical visitor conversation", async () => {
  const t = convexTest(schema, modules),
    args = await start(t);
  const id = await t.mutation(api.voice.finish, args),
    result = await typed(t);
  expect(result).toEqual({ caseId: id, created: false });
  await assertOne(t, id);
});
test("typed first and a later spoken turn share the same conversation", async () => {
  const t = convexTest(schema, modules),
    result = await typed(t),
    args = await start(t);
  expect(await t.mutation(api.voice.finish, args)).toBe(result.caseId);
  await assertOne(t, result.caseId);
});
test("voice started before a typed message resolves the new conversation at commit", async () => {
  const t = convexTest(schema, modules),
    args = await start(t),
    result = await typed(t);
  expect(await t.mutation(api.voice.finish, args)).toBe(result.caseId);
  await assertOne(t, result.caseId);
});
test("concurrent typed and spoken commits preserve both turns with one source key", async () => {
  const t = convexTest(schema, modules),
    args = await start(t);
  const [id, result] = await Promise.all([
    t.mutation(api.voice.finish, args),
    typed(t),
  ]);
  expect(result.caseId).toBe(id);
  await assertOne(t, id);
});
test("historical voice cases without a source key are adopted through the indexed owner", async () => {
  const t = convexTest(schema, modules),
    args = await start(t),
    id = await t.mutation(api.voice.finish, args);
  await t.run((ctx) => ctx.db.patch("cases", id, { sourceKey: undefined }));
  const result = await typed(t);
  expect(result).toEqual({ caseId: id, created: false });
  await assertOne(t, id);
});
test("canonical conversation and voice session ownership reject wrong apps, owners and channels", async () => {
  for (const mismatch of [
    { owner: "widget:app-a:someone-else" },
    { appId: "app-b" },
    { channel: "email" },
  ]) {
    const t = convexTest(schema, modules),
      result = await typed(t);
    await t.run((ctx) => ctx.db.patch("cases", result.caseId, mismatch));
    await expect(typed(t)).rejects.toThrow("Wrong app conversation");
    await expect(start(t)).rejects.toThrow("Wrong app conversation");
  }
  const t = convexTest(schema, modules),
    args = await start(t);
  await expect(
    t.mutation(api.voice.start, {
      ...auth,
      owner,
      appId: "app-b",
      customer: "Other app",
    }),
  ).rejects.toThrow("another app");
  await expect(
    t.mutation(api.voice.finish, {
      ...args,
      owner: "widget:app-a:someone-else",
    }),
  ).rejects.toThrow("not found");
});
