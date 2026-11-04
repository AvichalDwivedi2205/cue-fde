/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { SlackConfig } from "../lib/integration-config";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  config: vi.fn(),
  post: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => ({ query: mocks.query, mutation: mocks.mutation }),
  secret: () => "handoff-test",
}));
vi.mock("../lib/integration-config", () => ({
  slackConfig: mocks.config,
  emailConfig: vi.fn(),
}));
vi.mock("../lib/slack", () => ({
  slackPost: mocks.post,
  slackUpdate: mocks.update,
}));
import {
  openEngineeringHandoff,
  receiveEngineeringInteraction,
  publishEngineeringRun,
} from "../lib/engineering-slack";
import { sendSlackRunUpdate, sendSlackDecision } from "../lib/delivery";
const modules = import.meta.glob("../convex/**/*.{ts,js}");
const auth = { secret: "handoff-test" },
  commit = "a".repeat(40);
const reproduction =
  "Save a note with a title and reload; the saved title is missing.";
const config: SlackConfig = {
  botToken: "test-only",
  teamId: "TTEAM",
  supportChannel: "CSUPPORT",
  engineeringChannel: "CDEFAULT",
  operatorIds: [],
  members: [
    {
      name: "Engineer",
      email: "engineer@example.com",
      role: "engineering",
      slackId: "UENGINEER",
    },
    {
      name: "Owner",
      email: "owner@example.com",
      role: "owner",
      slackId: "UOWNER",
    },
    {
      name: "Other",
      email: "other@example.com",
      role: "engineering",
      slackId: "UOTHER",
    },
  ],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CUE_DEMO_SECRET", auth.secret);
  mocks.config.mockResolvedValue(config);
  let n = 100;
  mocks.post.mockImplementation(async (_token, channel) => ({
    channel,
    ts: `${n++}.001`,
  }));
  mocks.update.mockResolvedValue({ ok: true });
});
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  const data = await t.run(async (ctx) => {
    const packId = await ctx.db.insert("appPacks", {
      appId: "notes",
      name: "Notes",
      origins: ["https://notes.example.com"],
      status: "active",
      createdAt: 1,
      updatedAt: 1,
      engineering: {
        repository: "acme/notes",
        baseBranch: "main",
        allowedPaths: ["lib/"],
        testCommands: [{ program: "node", args: ["test.mjs"] }],
      },
      routing: {
        engineeringChannel: "CNOTES",
        engineeringMemberId: "UENGINEER",
      },
    });
    const issueId = await ctx.db.insert("issues", {
      appId: "notes",
      title: "Missing title",
      description: "Titles disappear on save",
      kind: "bug",
      fingerprint: "notes:bug",
      status: "open",
      priority: "high",
      tags: [],
      createdAt: 1,
    });
    const caseId = await ctx.db.insert("cases", {
      appId: "notes",
      issueId,
      title: "Lost title",
      customer: "Reporter",
      initials: "R",
      channel: "widget",
      body: "My saved note title vanished after reload",
      status: "open",
      priority: "high",
      tags: [],
      provenance: "test",
      createdAt: 1,
      updatedAt: 1,
    });
    return { packId, issueId, caseId };
  });
  mocks.query.mockImplementation((ref, args) => t.query(ref, args));
  mocks.mutation.mockImplementation((ref, args) => t.mutation(ref, args));
  const handoff = await openEngineeringHandoff(
    data.issueId,
    reproduction,
    "Operator",
  );
  if (handoff.kind === "posting") throw new Error("Expected posted handoff");
  const value = {
    issueId: data.issueId,
    revision: handoff.revision,
    reproductionDigest: handoff.reproductionDigest,
  };
  const start = {
    team: { id: "TTEAM" },
    channel: { id: "CNOTES" },
    user: { id: "UENGINEER" },
    message: { ts: handoff.rootTs },
    actions: [
      { action_id: "cue_engineering_start", value: JSON.stringify(value) },
    ],
  };
  return { t, ...data, handoff, value, start };
}
test("a web decision cannot bypass the assigned Slack engineer", async () => {
  const { t, start } = await setup();
  await receiveEngineeringInteraction(start, config);
  const run = (await t.query(api.cue.snapshot, auth)).runs[0];
  await t.run((ctx) => ctx.db.patch("runs", run._id, { status: "awaiting_approval", commit }));
  await expect(t.mutation(api.jobs.decide, { ...auth, runId: run._id, commit, actor: "Unassigned Owner", approve: true })).rejects.toThrow("assigned Slack");
});
test("one assigned thread covers start, actual milestones, exact approval and decision without production resolution", async () => {
  const { t, issueId, caseId, handoff, value, start } = await setup();
  expect(mocks.post.mock.calls[0][2]).toContain("My saved note title vanished");
  expect(JSON.stringify(mocks.post.mock.calls[0][3])).toContain(
    "Start fix with Muse Wonder",
  );
  await openEngineeringHandoff(issueId, reproduction, "Operator");
  expect(mocks.post).toHaveBeenCalledTimes(1);
  for (const id of ["UOTHER", "UOWNER"])
    await expect(
      receiveEngineeringInteraction({ ...start, user: { id } }, config),
    ).rejects.toThrow("not assigned");
  await expect(
    receiveEngineeringInteraction({ ...start, team: { id: "TOTHER" } }, config),
  ).rejects.toThrow("authorized");
  await expect(
    receiveEngineeringInteraction(
      { ...start, channel: { id: "COTHER" } },
      config,
    ),
  ).rejects.toThrow("not assigned");
  await Promise.all([
    receiveEngineeringInteraction(start, config),
    receiveEngineeringInteraction(start, config),
  ]);
  let state = await t.query(api.cue.snapshot, auth);
  expect(state.runs).toHaveLength(1);
  const run = state.runs[0];
  expect(run).toMatchObject({
    provider: "Meta",
    reproduction,
    deploymentMode: "pull_request",
  });
  expect(await t.query(api.jobs.status, auth)).toHaveLength(1);
  const eventId = await t.mutation(api.cue.event, {
    ...auth,
    runId: run._id,
    issueId,
    title: "Repository baseline passed",
    detail: "node test.mjs: 4 checks passed",
    kind: "success",
  });
  await publishEngineeringRun(run._id, eventId);
  await publishEngineeringRun(run._id, eventId);
  await t.mutation(api.cue.updateRun, {
    ...auth,
    runId: run._id,
    fields: {
      status: "awaiting_approval",
      phase: "awaiting_approval",
      commit,
      model: "muse-wonder",
      inputTokens: 100,
      modelCalls: 1,
    },
  });
  await sendSlackRunUpdate(run._id);
  state = await t.query(api.cue.snapshot, auth);
  const card = state.deliveries.find(
    (d) => d.key === `approval:${run._id}:${commit}`,
  );
  expect(card?.destination).toBe("CNOTES");
  const ts = card?.receipt?.split(":")[1];
  if (!ts) throw new Error("Missing approval receipt");
  const approval = {
    ...start,
    message: { ts, thread_ts: handoff.rootTs },
    actions: [
      {
        action_id: "cue_approve",
        value: JSON.stringify({ ...value, runId: run._id, commit }),
      },
    ],
  };
  await expect(
    receiveEngineeringInteraction(
      { ...approval, message: { ts: "999.001", thread_ts: handoff.rootTs } },
      config,
    ),
  ).rejects.toThrow("card context");
  await expect(
    receiveEngineeringInteraction(
      {
        ...approval,
        actions: [
          {
            action_id: "cue_approve",
            value: JSON.stringify({
              ...value,
              runId: run._id,
              commit: "b".repeat(40),
            }),
          },
        ],
      },
      config,
    ),
  ).rejects.toThrow("pending commit");
  const decision = await receiveEngineeringInteraction(approval, config);
  if (!decision) throw new Error("Decision missing");
  await sendSlackDecision(decision, "999.999");
  await sendSlackDecision(decision);
  await expect(receiveEngineeringInteraction(approval, config)).rejects.toThrow(
    "pending commit",
  );
  const final = await t.query(api.cue.snapshot, auth);
  expect(final.runs[0].status).toBe("approved");
  expect(final.issues[0].status).toBe("implemented");
  expect(final.cases.find((c) => c._id === caseId)?.status).toBe("open");
  expect(
    (await t.query(api.jobs.status, auth)).some((j) => j.kind === "deploy"),
  ).toBe(false);
  expect(mocks.post.mock.calls.every((c) => c[1] === "CNOTES")).toBe(true);
  expect(
    mocks.post.mock.calls.slice(1).every((c) => c[4] === handoff.rootTs),
  ).toBe(true);
  expect(mocks.update).toHaveBeenCalledWith(
    "test-only",
    "CNOTES",
    ts,
    expect.stringContaining("Implementation approved"),
    expect.any(Array),
  );
});
test.each([
  "assignment",
  "policy",
  "issue",
  "revision",
  "reproduction",
  "card",
])("changed %s refuses start before creating a run", async (change) => {
  const { t, packId, issueId, start, value } = await setup();
  if (change === "assignment")
    await t.run((ctx) =>
      ctx.db.patch(packId, {
        routing: {
          engineeringChannel: "CNOTES",
          engineeringMemberId: "UOTHER",
        },
      }),
    );
  if (change === "policy")
    await t.run(async (ctx) => {
      const pack = await ctx.db.get(packId);
      if (!pack?.engineering) throw new Error("Missing pack");
      await ctx.db.patch(packId, {
        engineering: { ...pack.engineering, baseBranch: "changed" },
      });
    });
  if (change === "issue")
    await t.run((ctx) =>
      ctx.db.patch(issueId, { description: "Changed report" }),
    );
  const payload =
    change === "revision" || change === "reproduction"
      ? {
          ...start,
          actions: [
            {
              action_id: "cue_engineering_start",
              value: JSON.stringify({
                ...value,
                ...(change === "revision"
                  ? { revision: 2 }
                  : { reproductionDigest: "b".repeat(64) }),
              }),
            },
          ],
        }
      : change === "card"
        ? { ...start, message: { ts: "999.001", thread_ts: start.message.ts } }
        : start;
  await expect(receiveEngineeringInteraction(payload, config)).rejects.toThrow(
    /changed/,
  );
  expect((await t.query(api.cue.snapshot, auth)).runs).toHaveLength(0);
});
test("an uncertain handoff send stays reserved and is never blindly posted again", async () => {
  const { t, issueId } = await setup();
  await t.run(async (ctx) => {
    const h = (await ctx.db.get(issueId))?.engineeringHandoff;
    if (!h) throw new Error("Missing handoff");
    await ctx.db.delete(h.deliveryId);
    await ctx.db.patch(issueId, { engineeringHandoff: undefined });
  });
  mocks.post.mockRejectedValueOnce(
    new Error("timeout after provider accepted"),
  );
  await expect(
    openEngineeringHandoff(issueId, reproduction, "Operator"),
  ).rejects.toThrow("timeout");
  await openEngineeringHandoff(issueId, reproduction, "Operator");
  expect(mocks.post).toHaveBeenCalledTimes(2);
  const state = await t.query(api.cue.snapshot, auth);
  expect(state.issues[0].engineeringHandoff?.kind).toBe("posting");
  expect(state.deliveries[0].status).toBe("unknown");
});
test("saved role revocation refuses the assigned member", async () => {
  const { t, start } = await setup();
  await expect(
    receiveEngineeringInteraction(start, {
      ...config,
      members: config.members?.map((m) => ({ ...m, role: "support" })),
    }),
  ).rejects.toThrow("authorized");
  expect((await t.query(api.cue.snapshot, auth)).runs).toHaveLength(0);
});
test.each([
  "assignment",
  "policy",
  "reproduction",
  "report",
  "production-mode",
])("changed %s refuses exact-commit approval", async (change) => {
  const { t, issueId, packId, start, value, handoff } = await setup();
  await receiveEngineeringInteraction(start, config);
  const run = (await t.query(api.cue.snapshot, auth)).runs[0];
  await t.mutation(api.cue.updateRun, {
    ...auth,
    runId: run._id,
    fields: { status: "awaiting_approval", phase: "awaiting_approval", commit },
  });
  await publishEngineeringRun(run._id);
  const card = (await t.query(api.cue.snapshot, auth)).deliveries.find(
    (d) => d.key === `approval:${run._id}:${commit}`,
  );
  const ts = card?.receipt?.split(":")[1];
  if (!ts) throw new Error("Missing approval");
  if (change === "assignment")
    await t.run((ctx) =>
      ctx.db.patch(packId, {
        routing: {
          engineeringChannel: "CNOTES",
          engineeringMemberId: "UOTHER",
        },
      }),
    );
  if (change === "policy")
    await t.run(async (ctx) => {
      const pack = await ctx.db.get(packId);
      if (!pack?.engineering) throw new Error("Missing pack");
      await ctx.db.patch(packId, {
        engineering: { ...pack.engineering, baseBranch: "changed" },
      });
    });
  if (change === "reproduction")
    await t.run((ctx) =>
      ctx.db.patch(run._id, { reproduction: "Changed reproduction" }),
    );
  if (change === "report")
    await t.run((ctx) =>
      ctx.db.patch(issueId, { description: "Changed issue context" }),
    );
  if (change === "production-mode")
    await t.run((ctx) => ctx.db.patch(run._id, { deploymentMode: "deploy" }));
  await expect(
    receiveEngineeringInteraction(
      {
        ...start,
        message: { ts, thread_ts: handoff.rootTs },
        actions: [
          {
            action_id: "cue_approve",
            value: JSON.stringify({ ...value, runId: run._id, commit }),
          },
        ],
      },
      config,
    ),
  ).rejects.toThrow(/changed|cannot deploy/);
  expect((await t.query(api.cue.snapshot, auth)).runs[0].status).toBe(
    "awaiting_approval",
  );
  expect(
    (await t.query(api.jobs.status, auth)).some((j) => j.kind === "deploy"),
  ).toBe(false);
});
test("uncertain approval delivery cannot be retried or decided from a forged card", async () => {
  const { t, start, value, handoff } = await setup();
  await receiveEngineeringInteraction(start, config);
  const run = (await t.query(api.cue.snapshot, auth)).runs[0];
  await t.mutation(api.cue.updateRun, {
    ...auth,
    runId: run._id,
    fields: { status: "awaiting_approval", phase: "awaiting_approval", commit },
  });
  mocks.post.mockRejectedValueOnce(new Error("uncertain"));
  await expect(publishEngineeringRun(run._id)).rejects.toThrow("uncertain");
  const calls = mocks.post.mock.calls.length;
  await publishEngineeringRun(run._id);
  expect(mocks.post).toHaveBeenCalledTimes(calls);
  await expect(
    receiveEngineeringInteraction(
      {
        ...start,
        message: { ts: "999.001", thread_ts: handoff.rootTs },
        actions: [
          {
            action_id: "cue_approve",
            value: JSON.stringify({ ...value, runId: run._id, commit }),
          },
        ],
      },
      config,
    ),
  ).rejects.toThrow("card context");
  expect(
    (await t.query(api.cue.snapshot, auth)).deliveries.find(
      (d) => d.key === `approval:${run._id}:${commit}`,
    )?.status,
  ).toBe("unknown");
});
