/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { SlackConfig } from "../lib/integration-config";

const mocks = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => ({ mutation: mocks.mutation }),
  secret: () => "isolated-test-secret",
}));
vi.mock("../lib/triage", () => ({ triage: vi.fn() }));
import { decideSlack } from "../lib/slack-events";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const auth = { secret: "isolated-test-secret" };
const commit = "a".repeat(40);
const config: SlackConfig = {
  botToken: "xoxb-isolated-test",
  teamId: "TTEST",
  supportChannel: "CSUPPORT",
  engineeringChannel: "CENGINEERING",
  operatorIds: ["UOPERATOR"],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CUE_DEMO_SECRET", auth.secret);
});
afterEach(() => vi.unstubAllEnvs());

test.each([true, false])(
  "Slack decision approve=%s reaches actual Convex lifecycle and rejects replay",
  async (approve) => {
    const t = convexTest(schema, modules);
    await t.mutation(api.cue.seed, auth);
    const initial = await t.query(api.cue.snapshot, auth);
    const issue = initial.issues.find((i) => i.kind === "bug")!;
    const runId = await t.mutation(api.cue.startRun, {
      ...auth,
      issueId: issue._id,
    });
    await t.mutation(api.cue.updateRun, {
      ...auth,
      runId,
      fields: { status: "awaiting_approval", commit },
    });
    mocks.mutation.mockImplementation((reference, args) =>
      t.mutation(reference, args),
    );
    const payload = {
      team: { id: config.teamId },
      channel: { id: config.engineeringChannel },
      user: { id: config.operatorIds[0] },
      actions: [
        {
          action_id: approve ? "cue_approve" : "cue_reject",
          value: JSON.stringify({ runId, commit }),
        },
      ],
    };
    await decideSlack(payload, config);
    const snapshot = await t.query(api.cue.snapshot, auth);
    expect(snapshot.runs.find((r) => r._id === runId)).toMatchObject({
      status: approve ? "running" : "rejected",
      phase: approve ? "deploying" : "rejected",
      approval: "Slack operator UOPERATOR",
      commit,
      ...(approve ? {} : { error: "Rejected in Slack" }),
    });
    expect(snapshot.issues.find((i) => i._id === issue._id)?.status).toBe(
      approve ? "investigating" : "open",
    );
    const jobs = await t.query(api.jobs.status, auth);
    expect(
      jobs.filter((j) => j.runId === runId && j.kind === "deploy"),
    ).toHaveLength(approve ? 1 : 0);
    await expect(decideSlack(payload, config)).rejects.toThrow(
      "pending commit",
    );
    const afterReplay = await t.query(api.jobs.status, auth);
    expect(afterReplay).toEqual(jobs);
  },
);
