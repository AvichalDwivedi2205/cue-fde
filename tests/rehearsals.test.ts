/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
const auth = { secret: "isolated-rehearsal-secret" };
const registration = {
  appId: "cue_app_rehearsal_test",
  key: "rehearsal-a",
  frontendOrigin: "http://127.0.0.1:4402",
  backendOrigin: "http://127.0.0.1:4320",
  cueOrigin: "https://cue.example.test",
  repository: "owner/upload-fixture",
};
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", auth.secret));
afterEach(() => vi.unstubAllEnvs());
test("operator registration is loopback-only, immutable and additive to historical evidence", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.cue.seed, auth);
  const history = await t.query(api.cue.snapshot, auth);
  await expect(
    t.mutation(api.rehearsals.register, { secret: "wrong", registration }),
  ).rejects.toThrow("Unauthorized");
  await expect(
    t.mutation(api.rehearsals.register, {
      ...auth,
      registration: {
        ...registration,
        frontendOrigin: "https://bloom.example.test",
      },
    }),
  ).rejects.toThrow("loopback");
  await expect(
    t.mutation(api.rehearsals.register, {
      ...auth,
      registration: { ...registration, backendOrigin: "http://127.0.0.1:4318" },
    }),
  ).rejects.toThrow("loopback");
  const issueId = await t.mutation(api.rehearsals.register, {
    ...auth,
    registration,
  });
  expect(
    await t.mutation(api.rehearsals.register, { ...auth, registration }),
  ).toBe(issueId);
  await expect(
    t.mutation(api.rehearsals.register, {
      ...auth,
      registration: { ...registration, key: "rehearsal-b" },
    }),
  ).rejects.toThrow("immutable");
  const after = await t.query(api.cue.snapshot, auth);
  expect(after.cases).toEqual(history.cases);
  expect(after.messages).toEqual(history.messages);
  expect(after.runs).toEqual(history.runs);
  expect(after.issues.filter((i) => i._id !== issueId)).toEqual(history.issues);
});
test("normal widget intake groups only the registered fixture, starts one real durable job and preserves native provenance", async () => {
  const t = convexTest(schema, modules);
  const issueId = await t.mutation(api.rehearsals.register, {
    ...auth,
    registration,
  });
  const body =
    "My valid 3 MB photo returns 413, but the upload area promises 5 MB.";
  const widget = await t.mutation(api.intake.widgetMessage, {
    ...auth,
    appId: registration.appId,
    owner: `widget:${registration.appId}:visitor-one`,
    customer: "Bloom user",
    title: body,
    body,
    initialBody: body,
    sourceUrl: registration.frontendOrigin,
  });
  const foreign = await t.mutation(api.cue.createCase, {
    ...auth,
    appId: "cue_app_foreign",
    customer: "Other visitor",
    title: body,
    body,
    channel: "chat",
  });
  const before = await t.query(api.cue.snapshot, auth);
  expect(before.cases.find((c) => c._id === widget.caseId)).toMatchObject({
    issueId,
    appId: registration.appId,
    provenance: "Controlled rehearsal rehearsal-a · connected widget report",
  });
  expect(before.cases.find((c) => c._id === foreign)?.issueId).not.toBe(
    issueId,
  );
  const outcomes = await Promise.allSettled([
    t.mutation(api.cue.startRun, { ...auth, issueId }),
    t.mutation(api.cue.startRun, { ...auth, issueId }),
  ]);
  expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const s = await t.query(api.cue.snapshot, auth),
    run = s.runs[0];
  expect(run).toMatchObject({
    targetId: registration.appId,
    repository: registration.repository,
    deploymentMode: "rehearsal",
    status: "running",
    provider: "Codex",
  });
  expect(await t.query(api.jobs.status, auth)).toHaveLength(1);
  const native = await t.mutation(api.cue.createCase, {
    ...auth,
    customer: "Native email tester",
    title: body,
    body,
    channel: "email",
  });
  expect(
    (await t.query(api.cue.snapshot, auth)).cases.find((c) => c._id === native)
      ?.provenance,
  ).toBe("Verified inbound email");
});
test("invented scoped issues cannot execute and review/release requires exact fresh-run evidence", async () => {
  const t = convexTest(schema, modules);
  const invented = await t.run((ctx) =>
    ctx.db.insert("issues", {
      appId: registration.appId,
      fingerprint: `${registration.appId}:rehearsal:${registration.key}:upload:413`,
      title: "Unregistered",
      description: "Not authorized",
      kind: "bug",
      status: "open",
      priority: "P1",
      tags: [],
      createdAt: Date.now(),
    }),
  );
  await expect(
    t.mutation(api.cue.startRun, { ...auth, issueId: invented }),
  ).rejects.toThrow("supports");
  const issueId = await t.mutation(api.rehearsals.register, {
    ...auth,
    registration,
  });
  const runId = await t.mutation(api.cue.startRun, { ...auth, issueId });
  const commit = "a".repeat(40);
  await t.mutation(api.cue.updateRun, {
    ...auth,
    runId,
    fields: { status: "awaiting_approval", phase: "awaiting_approval", commit },
  });
  await expect(
    t.mutation(api.jobs.decide, {
      ...auth,
      runId,
      commit: "b".repeat(40),
      actor: "Engineering",
      approve: true,
    }),
  ).rejects.toThrow("pending commit");
  await t.mutation(api.jobs.decide, {
    ...auth,
    runId,
    commit,
    actor: "Engineering",
    approve: true,
  });
  await expect(
    t.mutation(api.jobs.decide, {
      ...auth,
      runId,
      commit,
      actor: "Engineering",
      approve: true,
    }),
  ).rejects.toThrow("pending commit");
  await expect(
    t.mutation(api.cue.updateRun, {
      ...auth,
      runId,
      fields: { status: "resolved", deployed: true },
    }),
  ).rejects.toThrow("verification");
  await t.mutation(api.cue.updateRun, {
    ...auth,
    runId,
    fields: {
      status: "resolved",
      phase: "resolved",
      deployed: true,
      verified: true,
    },
  });
  await expect(
    t.mutation(api.cue.startRun, { ...auth, issueId }),
  ).rejects.toThrow("completed run");
  const issue2 = await t.mutation(api.rehearsals.register, {
    ...auth,
    registration: {
      ...registration,
      appId: "cue_app_rehearsal_next",
      key: "rehearsal-b",
      backendOrigin: "http://127.0.0.1:4321",
      frontendOrigin: "http://127.0.0.1:4403",
    },
  });
  expect(
    await t.mutation(api.cue.startRun, { ...auth, issueId: issue2 }),
  ).not.toBe(runId);
  expect(
    (await t.query(api.cue.snapshot, auth)).runs.find((r) => r._id === runId),
  ).toMatchObject({ status: "resolved", commit, approval: "Engineering" });
});

test("release updates every linked rehearsal case without depending on the global case window", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (let i = 0; i < 110; i++)
      await ctx.db.insert("cases", {
        title: "Unrelated retained report",
        customer: "Other app visitor",
        initials: "OA",
        channel: "chat",
        body: "Unrelated report",
        status: "open",
        priority: "P2",
        tags: [],
        provenance: "Retained fixture",
        createdAt: i,
        updatedAt: i,
      });
  });
  const issueId = await t.mutation(api.rehearsals.register, {
    ...auth,
    registration,
  });
  const caseId = await t.mutation(api.cue.createCase, {
    ...auth,
    appId: registration.appId,
    customer: "Bloom user",
    channel: "chat",
    title: "3 MB photo rejected",
    body: "My 3 MB photo fails to upload. Your app says up to 5 MB.",
  });
  const runId = await t.mutation(api.cue.startRun, { ...auth, issueId });
  const commit = "a".repeat(40);
  await t.mutation(api.cue.updateRun, {
    ...auth,
    runId,
    fields: { status: "awaiting_approval", commit },
  });
  await t.mutation(api.jobs.decide, {
    ...auth,
    runId,
    commit,
    actor: "Engineering",
    approve: true,
  });
  await t.mutation(api.cue.updateRun, {
    ...auth,
    runId,
    fields: {
      status: "resolved",
      phase: "resolved",
      deployed: true,
      verified: true,
    },
  });
  const record = await t.run((ctx) => ctx.db.get("cases", caseId));
  expect(record?.status).toBe("resolved");
  const updates = await t.run((ctx) =>
    ctx.db
      .query("messages")
      .withIndex("by_caseId_and_createdAt", (q) => q.eq("caseId", caseId))
      .take(10),
  );
  expect(
    updates.filter((m) => m.body.startsWith("The fix for rejected photos")),
  ).toHaveLength(1);
  const others = await t.run((ctx) => ctx.db.query("cases").take(110));
  expect(others.every((c) => c.status === "open")).toBe(true);
});
