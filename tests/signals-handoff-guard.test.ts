/// <reference types="vite/client" />
import { afterEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const auth = { secret: "signals-handoff-test" };
afterEach(() => vi.unstubAllEnvs());

async function fixture(signals: boolean) {
  vi.stubEnv("CUE_DEMO_SECRET", auth.secret);
  const t = convexTest(schema, modules);
  const specification = JSON.stringify({ need: "Recover work", specification: "Offer an undo path", acceptanceCriteria: ["Undo keeps ownership", "Undo restores the saved content"] });
  const engineering = { repository: "example/notes", baseBranch: "main", allowedPaths: ["src/"], testCommands: [{ program: "node" as const, args: ["test.mjs"] }] };
  const { issueId, packId } = await t.run(async (ctx) => {
    const packId = await ctx.db.insert("appPacks", { appId: "app-notes", name: "Notes", status: "active", origins: ["https://notes.example.test"], engineering, createdAt: 1, updatedAt: 1 });
    const batchId = await ctx.db.insert("signalBatches", { appId: "app-notes", requestKey: "fixture", creator: "Product", provenance: { kind: "synthetic-fixture", fixture: "guard", version: "v1" }, posts: [], inputFingerprint: "0000000000000000", state: "ready", attempts: [], promoted: [], createdAt: 1, updatedAt: 1 });
    const issueId = await ctx.db.insert("issues", { appId: "app-notes", title: "Recover work", description: "Undo accidental deletion", kind: "feature", fingerprint: "feature:guard", priority: "P2", status: "approved", tags: [], createdAt: 1, spec: specification, specApprovedAt: 1, specApprovedBy: "Product", ...(signals ? { sourceSignals: { batchId, inputFingerprint: "0000000000000000", analysisRevision: 1, clusterId: "recovery" } } : {}) });
    return { issueId, packId };
  });
  return { t, issueId, packId, specification, engineering };
}

test("a signal-derived handoff cannot queue against an unverified future-work binding", async () => {
  const { t, issueId, packId, specification, engineering } = await fixture(true);
  await expect(t.mutation(api.cue.startFeature, { ...auth, issueId, expectedSpec: specification, targetId: "app-notes" })).rejects.toThrow("verified future-work binding");
  const state = await t.query(api.cue.snapshot, auth);
  expect(state.runs).toEqual([]);
  expect(state.jobs).toEqual([]);
  expect(state.issues.find((issue) => issue._id === issueId)?.status).toBe("approved");
  const pack = await t.run((ctx) => ctx.db.get("appPacks", packId));
  expect(pack?.engineering).toEqual(engineering);
});

test("the existing ordinary approved feature queue remains available", async () => {
  const { t, issueId, specification } = await fixture(false);
  const runId = await t.mutation(api.cue.startFeature, { ...auth, issueId, expectedSpec: specification, targetId: "app-notes" });
  const state = await t.query(api.cue.snapshot, auth);
  expect(state.runs.find((run) => run._id === runId)?.approvedSpec).toBe(specification);
  expect(state.jobs.filter((job) => job.runId === runId)).toHaveLength(1);
  expect(state.jobs.find((job) => job.runId === runId)?.status).toBe("queued");
});
