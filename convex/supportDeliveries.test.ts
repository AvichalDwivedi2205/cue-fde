/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import {
  createCustomerUpdates,
  type CustomerUpdateProvider,
} from "../lib/customer-updates";
import {
  previewUpdateBody,
  type SupportTarget,
} from "./supportDeliveryValidators";
import type { IntegrationConfig } from "../lib/integration-config";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts"]);
const auth = { secret: "support-deliveries-test-secret" };
const commit = "a".repeat(40),
  url = "https://preview-demo.vercel.app/";
const policy = {
  repository: "acme/app",
  baseBranch: "main",
  allowedPaths: ["app"],
  testCommands: [{ program: "npm" as const, args: ["test"] }],
};
const xTarget = {
  kind: "x",
  postId: "100",
  brandUserId: "200",
  brandUsername: "brand",
} satisfies SupportTarget;
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", auth.secret));
afterEach(() => vi.unstubAllEnvs());

async function setup(channel: "x" | "chat" = "x") {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    await ctx.db.insert("appPacks", {
      appId: "app-a",
      name: "App A",
      status: "active",
      origins: [],
      engineering: policy,
      createdAt: 1,
      updatedAt: 1,
    });
    const issueId = await ctx.db.insert("issues", {
      appId: "app-a",
      title: "Search",
      description: "Search failed",
      kind: "bug",
      fingerprint: "search",
      status: "approved",
      priority: "high",
      tags: [],
      createdAt: 1,
    });
    const caseId = await ctx.db.insert("cases", {
      appId: "app-a",
      issueId,
      title: "Search",
      customer: "Alice",
      initials: "A",
      channel,
      body: "Search failed",
      status: "open",
      priority: "high",
      tags: [],
      provenance: "native",
      createdAt: 1,
      updatedAt: 1,
      ...(channel === "x"
        ? {
            sourceKey: "x:100",
            externalId: "x-api:x:100",
            providerAuthorId: "300",
          }
        : {
            owner: "widget:app-a:visitor",
            sourceKey: "widget:app-a:visitor",
            notificationEmail: {
              kind: "opted_in" as const,
              address: "alice@example.test",
              revision: 1,
              consentedAt: 1,
            },
          }),
    });
    const runId = await ctx.db.insert("runs", {
      issueId,
      targetId: "app-a",
      codingPolicy: policy,
      deploymentMode: "pull_request",
      status: "approved",
      approval: "Engineer",
      phase: "Approved",
      provider: "test",
      commit,
      createdAt: 1,
      updatedAt: 1,
      previewDeployment: {
        id: "dpl_123",
        url,
        commit,
        policyDigest: "f".repeat(64),
        verifiedAt: 2,
      },
      previewAcceptance: {
        deploymentId: "dpl_123",
        commit,
        observations:
          "Observed search and reload work correctly on the approved preview, using the expected product interaction.",
        actor: "Operator",
        observedAt: 3,
      },
    });
    return { issueId, caseId, runId };
  });
  let config: IntegrationConfig = {
    apps: [],
    x: {
      appId: "app-a",
      enabled: true,
      userId: "200",
      username: "brand",
      userAccessToken: "user-authorized-test-token",
      bearerToken: "read-only-token",
      startedAt: 1,
    },
    email: { appId: "app-a", from: "support@example.test", apiKey: "re_test" },
  };
  const verify = vi.fn(async () => {}),
    send = vi.fn(async () => "900");
  const readback = vi.fn<CustomerUpdateProvider["readback"]>(
    async (providerId, body) =>
      channel === "x"
        ? { kind: "x", providerId, authorId: "200", postId: "100", body }
        : {
            kind: "widget_email",
            providerId,
            sender: "support@example.test",
            recipient: "alice@example.test",
            body,
          },
  );
  const service = createCustomerUpdates({
    store: {
      query: (reference, ...args) =>
        t.run((ctx) => ctx.runQuery(reference, ...args)),
      mutation: (reference, ...args) =>
        t.run((ctx) => ctx.runMutation(reference, ...args)),
    },
    secret: auth.secret,
    config: async () => config,
    provider: () => ({ verify, send, readback }),
  });
  const prepare = (body?: string) =>
    service.prepare({ ...ids, actor: "Operator", body });
  async function approved(body?: string) {
    const result = await prepare(body);
    await service.approve({ ...result, actor: "Operator" });
    return result;
  }
  return {
    t,
    ...ids,
    service,
    prepare,
    approved,
    send,
    readback,
    verify,
    changeConfig: (next: IntegrationConfig) => {
      config = next;
    },
    config: () => config,
  };
}

test("approval binds exact body and hash; historical deliveries stay intact and generic finish cannot bypass support transitions", async () => {
  const s = await setup(),
    review = await s.prepare();
  await expect(
    s.service.approve({
      ...review,
      reviewHash: "0".repeat(64),
      actor: "Operator",
    }),
  ).rejects.toThrow("Exact immutable");
  await expect(
    s.t.mutation(api.supportDeliveries.approve, {
      ...auth,
      ...review,
      secret: "forged",
      actor: "Operator",
    }),
  ).rejects.toThrow("Unauthorized");
  await expect(
    s.t.mutation(api.deliveries.finish, {
      ...auth,
      id: review.id,
      status: "sent",
      receipt: "forged",
    }),
  ).rejects.toThrow("exact reviewed");
  const historical = await s.t.mutation(api.deliveries.reserve, {
    ...auth,
    key: "historic-email",
    channel: "email",
    destination: "old@example.test",
    body: "Legacy email",
    actor: "Operator",
  });
  await s.t.mutation(api.deliveries.finish, {
    ...auth,
    id: historical,
    status: "sent",
    receipt: "legacy-receipt",
  });
  expect(
    await s.t.run((ctx) => ctx.db.get("deliveries", historical)),
  ).toMatchObject({ status: "sent", receipt: "legacy-receipt" });
  await s.service.approve({ ...review, actor: "Operator" });
  await s.t.run((ctx) =>
    ctx.db.patch("deliveries", review.id, { body: "Edited after approval" }),
  );
  await expect(s.service.send(review)).rejects.toThrow("Exact immutable");
  expect(s.send).not.toHaveBeenCalled();
});

test("concurrent approved duplicates and different drafts reserve only one provider call; preview never resolves production", async () => {
  const s = await setup(),
    first = await s.approved();
  const second = await s.approved(
    `A browser check passed for this preview: ${url} Production is unchanged.`,
  );
  await Promise.all([
    s.service.send(first),
    s.service.send(first),
    s.service.send(second),
  ]);
  expect(s.send).toHaveBeenCalledTimes(1);
  expect(await s.service.send(first)).toEqual({ sent: false });
  const saved = await s.t.run(async (ctx) => ({
    issue: await ctx.db.get("issues", s.issueId),
    conversation: await ctx.db.get("cases", s.caseId),
    run: await ctx.db.get("runs", s.runId),
  }));
  expect(saved.issue?.status).toBe("approved");
  expect(saved.conversation?.status).toBe("open");
  expect(saved.run).toMatchObject({
    status: "approved",
    deploymentMode: "pull_request",
  });
  expect(saved.run?.deployed).toBeUndefined();
  const posted = await s.t.run((ctx) => ctx.db.query("messages").withIndex("by_caseId_and_createdAt", (q) => q.eq("caseId", s.caseId)).take(10));
  expect(posted).toHaveLength(1);
  expect(posted[0]).toMatchObject({ role: "staff", author: "Cue · X reply" });
  expect([previewUpdateBody(url), `A browser check passed for this preview: ${url} Production is unchanged.`]).toContain(posted[0].body);
});

test("changed destination, app route, commit, acceptance or latest run cannot reuse approval", async () => {
  for (const change of [
    "destination",
    "app",
    "commit",
    "acceptance",
    "latest",
  ] as const) {
    const s = await setup(),
      review = await s.approved();
    await s.t.run(async (ctx) => {
      if (change === "destination")
        await ctx.db.patch("cases", s.caseId, { sourceKey: "x:999" });
      if (change === "app")
        await ctx.db.patch("cases", s.caseId, { appId: "other-app" });
      if (change === "commit")
        await ctx.db.patch("runs", s.runId, { commit: "b".repeat(40) });
      if (change === "acceptance") {
        const run = await ctx.db.get("runs", s.runId);
        if (!run?.previewAcceptance)
          throw new Error("Fixture missing acceptance");
        await ctx.db.patch("runs", s.runId, {
          previewAcceptance: { ...run.previewAcceptance, observedAt: 4 },
        });
      }
      if (change === "latest")
        await ctx.db.insert("runs", {
          issueId: s.issueId,
          status: "queued",
          phase: "queued",
          provider: "test",
          createdAt: 5,
          updatedAt: 5,
        });
    });
    await expect(s.service.send(review)).rejects.toThrow();
    expect(s.send).not.toHaveBeenCalled();
  }
});

test("draft, acknowledgement, manual X and misleading release text cannot bypass preview evidence", async () => {
  const s = await setup();
  for (const body of [
    `It is fixed and shipped: ${url} Production is unchanged.`,
    `Preview: ${url} Everything is resolved.`,
  ])
    await expect(s.prepare(body)).rejects.toThrow("Preview text");
  await s.t.run((ctx) =>
    ctx.db.patch("cases", s.caseId, { externalId: "manual-capture" }),
  );
  await expect(s.prepare()).rejects.toThrow("original native X");
  expect(s.send).not.toHaveBeenCalled();
});

test("changed brand or connection credentials require fresh review and cannot send cross-app", async () => {
  for (const change of ["brand", "app", "token"] as const) {
    const s = await setup(),
      review = await s.approved(),
      config = s.config();
    if (!config.x) throw new Error("Fixture missing X config");
    s.changeConfig({
      ...config,
      x: {
        ...config.x,
        ...(change === "brand"
          ? { userId: "999" }
          : change === "app"
            ? { appId: "app-b" }
            : { userAccessToken: "rotated-user-token" }),
      },
    });
    await expect(s.service.send(review)).rejects.toThrow();
    expect(s.send).not.toHaveBeenCalled();
  }
});

test("timeout remains unknown, every resend is blocked and reconciliation only reads provider state", async () => {
  const s = await setup(),
    review = await s.approved();
  s.send.mockRejectedValueOnce(new Error("timeout after provider accepted"));
  await expect(s.service.send(review)).rejects.toThrow("outcome unknown");
  expect(
    (await s.t.query(api.supportDeliveries.get, { ...auth, id: review.id }))
      .supportIntent?.state.kind,
  ).toBe("unknown");
  expect(await s.service.send(review)).toEqual({ sent: false });
  const changedDraft = await s.approved(
    `A browser check passed for this preview: ${url} Production is unchanged.`,
  );
  expect(await s.service.send(changedDraft)).toEqual({ sent: false });
  await expect(s.service.reconcile({ id: review.id })).rejects.toThrow(
    "Locate the provider",
  );
  await s.service.reconcile({ id: review.id, providerId: "900" });
  expect(s.send).toHaveBeenCalledTimes(1);
  expect(
    (await s.t.query(api.supportDeliveries.get, { ...auth, id: review.id }))
      .supportIntent?.state.kind,
  ).toBe("verified");
});

test("crash after atomic claim blocks later claims, and accepted identity survives readback failure", async () => {
  const s = await setup(),
    review = await s.approved();
  const saved = await s.t.query(api.supportDeliveries.get, {
    ...auth,
    id: review.id,
  });
  if (!saved.supportIntent) throw new Error("Fixture missing review");
  const { target, configDigest } = saved.supportIntent.review;
  expect(
    await s.t.mutation(api.supportDeliveries.claim, {
      ...auth,
      ...review,
      target,
      configDigest,
    }),
  ).toBe(true);
  expect(await s.service.send(review)).toEqual({ sent: false });
  await s.service.reconcile({ id: review.id, providerId: "900" });
  expect(s.send).not.toHaveBeenCalled();
  const other = await setup(),
    approved = await other.approved();
  other.readback.mockRejectedValueOnce(new Error("GET timeout"));
  await expect(other.service.send(approved)).rejects.toThrow("GET timeout");
  expect(
    (
      await other.t.query(api.supportDeliveries.get, {
        ...auth,
        id: approved.id,
      })
    ).supportIntent?.state,
  ).toMatchObject({ kind: "accepted", providerId: "900" });
  await expect(
    other.service.reconcile({ id: approved.id, providerId: "901" }),
  ).rejects.toThrow("cannot change");
  await other.service.reconcile({ id: approved.id });
  expect(other.send).toHaveBeenCalledTimes(1);
});

test("readback with changed author, reply target or text never verifies", async () => {
  for (const proof of [
    { authorId: "999", postId: "100", body: previewUpdateBody(url) },
    { authorId: "200", postId: "999", body: previewUpdateBody(url) },
    { authorId: "200", postId: "100", body: "Altered text" },
  ]) {
    const s = await setup(),
      review = await s.approved();
    s.readback.mockResolvedValueOnce({
      kind: "x",
      providerId: "900",
      ...proof,
    });
    await expect(s.service.send(review)).rejects.toThrow("does not match");
    expect(
      (await s.t.query(api.supportDeliveries.get, { ...auth, id: review.id }))
        .supportIntent?.state.kind,
    ).toBe("accepted");
    expect(s.send).toHaveBeenCalledTimes(1);
  }
});

test("widget owner and app control consent; revoke or consent revision change invalidates approval", async () => {
  for (const contact of [
    { kind: "revoke" as const },
    { kind: "opt_in" as const, address: "changed@example.test" },
  ]) {
    const s = await setup("chat"),
      review = await s.approved();
    await expect(
      s.t.mutation(api.widgetContact.set, {
        ...auth,
        appId: "app-a",
        owner: "widget:app-a:someone-else",
        caseId: s.caseId,
        contact,
      }),
    ).rejects.toThrow("Wrong app");
    const value = await s.t.mutation(api.widgetContact.set, {
      ...auth,
      appId: "app-a",
      owner: "widget:app-a:visitor",
      caseId: s.caseId,
      contact,
    });
    expect(value.revision).toBe(2);
    await expect(s.service.send(review)).rejects.toThrow("consent");
    expect(s.send).not.toHaveBeenCalled();
  }
});

test("replayed widget preferences are idempotent; withdrawal and subsequent opt-in advance consent", async () => {
  const s = await setup("chat");
  const args = {
    ...auth,
    appId: "app-a",
    owner: "widget:app-a:visitor",
    caseId: s.caseId,
  };
  const same = await s.t.mutation(api.widgetContact.set, {
    ...args,
    contact: { kind: "opt_in", address: " Alice@Example.test " },
  });
  expect(same).toMatchObject({ kind: "opted_in", revision: 1, consentedAt: 1 });
  const revoked = await s.t.mutation(api.widgetContact.set, {
    ...args,
    contact: { kind: "revoke" },
  });
  expect(revoked).toMatchObject({ kind: "revoked", revision: 2 });
  expect(
    await s.t.mutation(api.widgetContact.set, {
      ...args,
      contact: { kind: "revoke" },
    }),
  ).toEqual(revoked);
  expect(
    await s.t.mutation(api.widgetContact.set, {
      ...args,
      contact: { kind: "opt_in", address: "alice@example.test" },
    }),
  ).toMatchObject({ kind: "opted_in", revision: 3 });
});

test("opted-in widget email uses separate sender/recipient evidence and does not claim inbox delivery", async () => {
  const s = await setup("chat"),
    review = await s.approved();
  await s.service.send(review);
  expect(s.send).toHaveBeenCalledTimes(1);
  const events = await s.t.run((ctx) =>
    ctx.db
      .query("events")
      .withIndex("by_runId_and_createdAt", (q) => q.eq("runId", s.runId))
      .take(10),
  );
  expect(events[0].detail).toContain("Inbox delivery is not implied");
  expect(await s.t.run((ctx) => ctx.db.get("cases", s.caseId))).toMatchObject({
    status: "open",
    channel: "chat",
  });
});

test("claim rejects a supplied changed target or config digest independently of the gateway", async () => {
  const s = await setup(),
    review = await s.approved();
  const saved = await s.t.query(api.supportDeliveries.get, {
    ...auth,
    id: review.id,
  });
  if (!saved.supportIntent) throw new Error("Fixture missing review");
  for (const [target, configDigest] of [
    [{ ...xTarget, postId: "999" }, saved.supportIntent.review.configDigest],
    [xTarget, "0".repeat(64)],
  ] satisfies [SupportTarget, string][]) {
    await expect(
      s.t.mutation(api.supportDeliveries.claim, {
        ...auth,
        ...review,
        target,
        configDigest,
      }),
    ).rejects.toThrow("changed");
  }
  expect(s.send).not.toHaveBeenCalled();
});
