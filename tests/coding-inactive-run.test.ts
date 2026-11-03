/// <reference types="vite/client" />
import { expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { implementFeature } from "../lib/feature-runner";
const mocked = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  pack: vi.fn(),
  delivery: vi.fn(),
}));
vi.mock("../lib/server-store", () => ({
  api: {
    cue: { snapshot: "snapshot", updateRun: "updateRun", event: "event" },
  },
  db: () => ({ query: mocked.query, mutation: mocked.mutation }),
  secret: () => "synthetic",
}));
vi.mock("../lib/app-pack", () => ({
  requireActivePack: mocked.pack,
  asCodingConfig: vi.fn(),
}));
vi.mock("../lib/delivery", () => ({ sendSlackRunUpdate: mocked.delivery }));
const modules = import.meta.glob("../convex/**/*.{ts,js}");

test.each(["awaiting_approval", "approved", "resolved", "canceled"])(
  "stale queued work preserves a %s run without mutation or notification",
  async (status) => {
    mocked.query.mockReset();
    mocked.mutation.mockReset();
    mocked.pack.mockReset();
    mocked.delivery.mockReset();
    const t = convexTest(schema, modules);
    const state = await t.run(async (ctx) => {
      const spec = JSON.stringify({
        specification: "Synthetic",
        acceptanceCriteria: ["Synthetic acceptance"],
      });
      const issueId = await ctx.db.insert("issues", {
        title: "Synthetic",
        description: "Synthetic report",
        kind: "feature",
        fingerprint: "synthetic",
        status: "approved",
        spec,
        specApprovedAt: Date.now(),
        priority: "P3",
        tags: [],
        createdAt: Date.now(),
      });
      const runId = await ctx.db.insert("runs", {
        issueId,
        status,
        phase: status,
        provider: "Meta",
        approvedSpec: spec,
        kind: "feature",
        deploymentMode: "pull_request",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return {
        runId,
        runs: [await ctx.db.get("runs", runId)],
        issues: [await ctx.db.get("issues", issueId)],
      };
    });
    mocked.query.mockResolvedValue(state);
    await implementFeature(state.runId, new AbortController().signal, {
      notify: false,
    });
    expect(mocked.mutation).not.toHaveBeenCalled();
    expect(mocked.pack).not.toHaveBeenCalled();
    expect(mocked.delivery).not.toHaveBeenCalled();
  },
);
