/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const auth = { secret: "case-message-test-secret" };
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", auth.secret));
afterEach(() => vi.unstubAllEnvs());
const report = (channel: string, appId?: string) => ({
  title: "Actual incoming report",
  customer: "Test customer",
  initials: "TC",
  channel,
  appId,
  body: "Summary is not the stored conversation",
  status: "open",
  priority: "medium",
  tags: [],
  provenance: "Native provider receipt",
  createdAt: 1,
  updatedAt: 1,
});

test("old legacy email and Slack threads retain real messages beyond the global 300-message window", async () => {
  const t = convexTest(schema, modules);
  const cases = await t.run(async (ctx) => {
    const email = await ctx.db.insert("cases", report("email"));
    const slack = await ctx.db.insert("cases", report("slack"));
    const newer = await ctx.db.insert("cases", report("chat", "cue_app_new"));
    for (const caseId of [email, slack])
      await ctx.db.insert("messages", {
        caseId,
        author: "Native sender",
        role: "customer",
        body: "Actual original provider message",
        createdAt: 1,
      });
    for (let n = 0; n < 305; n++)
      await ctx.db.insert("messages", {
        caseId: newer,
        author: "Other visitor",
        role: "customer",
        body: `Newer message ${n}`,
        createdAt: n + 2,
      });
    return { email, slack };
  });
  const snapshot = await t.query(api.cue.snapshot, auth);
  expect(
    snapshot.messages.some(
      (m) => m.caseId === cases.email || m.caseId === cases.slack,
    ),
  ).toBe(false);
  for (const caseId of [cases.email, cases.slack]) {
    const messages = await t.query(api.cue.caseMessages, {
      ...auth,
      caseId,
      appId: "bloom",
    });
    expect(messages.map((m) => m.body)).toEqual([
      "Actual original provider message",
    ]);
    expect(messages[0].author).toBe("Native sender");
  }
});

test("selected-case reads deny wrong server credentials and mismatched parent application", async () => {
  const t = convexTest(schema, modules);
  const caseId = await t.run((ctx) =>
    ctx.db.insert("cases", report("chat", "cue_app_owned")),
  );
  await expect(
    t.query(api.cue.caseMessages, {
      ...auth,
      secret: "wrong",
      caseId,
      appId: "cue_app_owned",
    }),
  ).rejects.toThrow("Unauthorized");
  for (const appId of ["bloom", "cue_app_foreign"])
    await expect(
      t.query(api.cue.caseMessages, { ...auth, caseId, appId }),
    ).rejects.toThrow("Case not found");
  expect(
    await t.query(api.cue.caseMessages, {
      ...auth,
      caseId,
      appId: "cue_app_owned",
    }),
  ).toEqual([]);
  await t.run((ctx) => ctx.db.delete("cases", caseId));
  await expect(
    t.query(api.cue.caseMessages, { ...auth, caseId, appId: "cue_app_owned" }),
  ).rejects.toThrow("Case not found");
});

test("the selected thread returns its latest 100 messages in chronological order", async () => {
  const t = convexTest(schema, modules);
  const caseId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("cases", report("chat", "cue_app_owned"));
    for (let n = 0; n < 105; n++)
      await ctx.db.insert("messages", {
        caseId: id,
        author: "Sender",
        role: "customer",
        body: String(n),
        createdAt: n,
      });
    return id;
  });
  const messages = await t.query(api.cue.caseMessages, {
    ...auth,
    caseId,
    appId: "cue_app_owned",
  });
  expect(messages).toHaveLength(100);
  expect(messages.map((m) => m.body)).toEqual(
    Array.from({ length: 100 }, (_, n) => String(n + 5)),
  );
});
