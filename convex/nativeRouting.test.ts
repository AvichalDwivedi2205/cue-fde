/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts"]);
const auth = { secret: "native-routing-secret" };
const xReport = {
  ...auth,
  appId: "app-a",
  channel: "x" as const,
  transport: "x_api" as const,
  providerAuthorId: "200",
  sourceKey: "x:2109012253718773827",
  eventKey: "x-api:x:2109012253718773827",
  externalId: "x-api:x:2109012253718773827",
  sourceUrl: "https://x.com/alice/status/2109012253718773827",
  customer: "@alice",
  title: "Caption search is broken",
  body: "Caption search does not find my saved memories",
};
const emailReport = {
  ...auth,
  appId: "app-a",
  channel: "email" as const,
  sourceKey: "email:one",
  eventKey: "email:one",
  messageKey: "rfc822:<one@example.test>",
  customer: "alice@example.test",
  title: "Search bug",
  body: "My saved caption cannot be found",
};
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", auth.secret));
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const appId of ["app-a", "app-b"])
      await ctx.db.insert("appPacks", {
        appId,
        name: appId,
        status: "active",
        origins: [],
        createdAt: 1,
        updatedAt: 1,
      });
  });
  return t;
}

test("native X and widget reports can share only their app's issue; replay is idempotent", async () => {
  const t = await setup();
  const native = await t.mutation(api.intake.receive, xReport);
  const widget = await t.mutation(api.intake.widgetMessage, {
    ...auth,
    appId: "app-a",
    owner: "widget:app-a:visitor",
    customer: "Visitor",
    title: "Caption search",
    body: "Search failed",
    initialBody: "Search failed",
    sourceUrl: "https://app-a.test",
  });
  const report = await t.run((ctx) => ctx.db.get("cases", native.caseId));
  expect(report).toMatchObject({ appId: "app-a", providerAuthorId: "200" });
  await t.mutation(api.cue.link, {
    ...auth,
    caseId: widget.caseId,
    issueId: report!.issueId!,
  });
  const other = await t.mutation(api.cue.createCase, {
    ...auth,
    appId: "app-b",
    channel: "chat",
    customer: "Other visitor",
    title: "Search",
    body: "Search failed",
  });
  await expect(
    t.mutation(api.cue.link, {
      ...auth,
      caseId: other,
      issueId: report!.issueId!,
    }),
  ).rejects.toThrow();
  expect(await t.mutation(api.intake.receive, xReport)).toEqual({
    caseId: native.caseId,
    duplicate: true,
  });
  expect(await t.run((ctx) => ctx.db.query("cases").take(10))).toHaveLength(3);
});

test("active app validation precedes receipt and source deduplication", async () => {
  const t = await setup();
  await t.mutation(api.intake.receive, xReport);
  for (const change of [
    { appId: "app-b" },
    { appId: undefined },
    { appId: "missing" },
  ])
    await expect(
      t.mutation(api.intake.receive, { ...xReport, ...change }),
    ).rejects.toThrow();
  await expect(
    t.mutation(api.intake.receive, {
      ...xReport,
      appId: "app-b",
      eventKey: "email-replay",
      externalId: "mail-replay",
      transport: "notification_email",
      providerAuthorId: undefined,
    }),
  ).rejects.toThrow();
  await t.run(async (ctx) => {
    const pack = await ctx.db
      .query("appPacks")
      .withIndex("by_appId", (q) => q.eq("appId", "app-a"))
      .unique();
    await ctx.db.patch("appPacks", pack!._id, { status: "suspended" });
  });
  await expect(t.mutation(api.intake.receive, xReport)).rejects.toThrow();
});

test("email receipts, source keys and RFC references never cross an app boundary", async () => {
  const t = await setup();
  const first = await t.mutation(api.intake.receive, emailReport);
  const reply = {
    ...emailReport,
    eventKey: "email:two",
    sourceKey: "email:two",
    messageKey: "rfc822:<two@example.test>",
    references: [emailReport.messageKey],
  };
  expect((await t.mutation(api.intake.receive, reply)).caseId).toBe(
    first.caseId,
  );
  for (const input of [
    { ...emailReport, appId: "app-b" },
    { ...emailReport, appId: "app-b", eventKey: "different-event" },
    {
      ...emailReport,
      appId: "app-b",
      eventKey: "different-event",
      messageKey: undefined,
    },
    {
      ...reply,
      appId: "app-b",
      eventKey: "email:three",
      sourceKey: "email:three",
      messageKey: "rfc822:<three@example.test>",
    },
    { ...emailReport, customer: "mallory@example.test" },
  ])
    await expect(t.mutation(api.intake.receive, input)).rejects.toThrow();
  const stranger = await t.mutation(api.intake.receive, {
    ...reply,
    customer: "bob@example.test",
    eventKey: "email:bob",
    sourceKey: "email:bob",
    messageKey: "rfc822:<bob@example.test>",
  });
  expect(stranger.caseId).not.toBe(first.caseId);
  expect(await t.run((ctx) => ctx.db.query("cases").take(10))).toHaveLength(2);
});
test("legacy signed Slack follow-ups preserve their saved app while explicit mismatches fail", async () => {
  const t = await setup();
  const report = { ...auth, channel: "slack" as const, sourceKey: "slack:TTEAM:CSUPPORT:1.0", eventKey: "slack:TTEAM:CSUPPORT:1.0", customer: "Slack UREPORTER", title: "Search bug", body: "Search still fails" };
  const first = await t.mutation(api.intake.receive, { ...report, appId: "app-a" });
  const followup = await t.mutation(api.intake.receive, { ...report, eventKey: "slack:TTEAM:CSUPPORT:2.0" });
  expect(followup.caseId).toBe(first.caseId);
  expect((await t.run((ctx) => ctx.db.get("cases", first.caseId)))?.appId).toBe("app-a");
  await expect(t.mutation(api.intake.receive, { ...report, appId: "app-b", eventKey: "slack:TTEAM:CSUPPORT:3.0" })).rejects.toThrow();
});

test("only official X transport may assert a provider author; unbound historical records remain usable", async () => {
  const t = await setup();
  await expect(
    t.mutation(api.intake.receive, {
      ...xReport,
      transport: "notification_email",
      eventKey: "notification:one",
      externalId: "mail",
    }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.intake.receive, { ...emailReport, providerAuthorId: "200" }),
  ).rejects.toThrow();
  const legacy = { ...emailReport, appId: undefined };
  const first = await t.mutation(api.intake.receive, legacy);
  expect(await t.mutation(api.intake.receive, legacy)).toEqual({
    caseId: first.caseId,
    duplicate: true,
  });
  await expect(t.mutation(api.intake.receive, emailReport)).rejects.toThrow();
  expect(
    (await t.run((ctx) => ctx.db.get("cases", first.caseId)))?.appId,
  ).toBeUndefined();
});

test("native replay preserves historical notification provenance and missing author identity", async () => {
  const t = await setup();
  const receipt = await t.mutation(api.intake.receive, {
    ...xReport,
    providerAuthorId: undefined,
    transport: "notification_email",
    eventKey: "mail:one",
    externalId: "mail:one",
  });
  expect(
    (await t.run((ctx) => ctx.db.get("cases", receipt.caseId)))
      ?.providerAuthorId,
  ).toBeUndefined();
  expect(await t.mutation(api.intake.receive, xReport)).toEqual({
    caseId: receipt.caseId,
    duplicate: true,
  });
  expect(
    (await t.run((ctx) => ctx.db.get("cases", receipt.caseId)))
      ?.providerAuthorId,
  ).toBeUndefined();
  const native = await setup();
  await native.mutation(api.intake.receive, xReport);
  await expect(
    native.mutation(api.intake.receive, { ...xReport, providerAuthorId: "300" }),
  ).rejects.toThrow("Conflicting provider author");
});
