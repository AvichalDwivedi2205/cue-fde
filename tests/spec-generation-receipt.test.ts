/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const secret = "isolated-test-secret";
const auth = { secret };
const generation = {
  provider: "meta",
  model: "muse-spark-1.3",
  requestedModel: "muse-spark-1.3",
  inputTokens: 120,
  outputTokens: 40,
  durationMs: 1500,
};
const spec = JSON.stringify({
  need: "Printable journals",
  specification: "Export a journal as PDF.",
  acceptanceCriteria: ["Includes entries", "Includes photos"],
});
const edited = JSON.stringify({
  need: "Printable journals",
  specification: "Export a journal as PDF with dates.",
  acceptanceCriteria: ["Includes entries", "Includes dates"],
});
const featureOf = async (t: ReturnType<typeof convexTest>) => {
  await t.mutation(api.cue.seed, auth);
  const s = await t.query(api.cue.snapshot, auth);
  return s.issues.find((i) => i.kind === "feature")!;
};
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", secret));
afterEach(() => vi.unstubAllEnvs());

describe("specification generation receipts", () => {
  test("a generated spec keeps its served-model receipt", async () => {
    const t = convexTest(schema, modules);
    const feature = await featureOf(t);
    await t.mutation(api.cue.spec, {
      ...auth,
      issueId: feature._id,
      spec,
      generation,
    });
    const saved = await t.query(api.cue.snapshot, auth);
    const issue = saved.issues.find((i) => i._id === feature._id)!;
    expect(issue.specGeneration).toEqual(generation);
  });
  test("approving the displayed spec preserves the receipt", async () => {
    const t = convexTest(schema, modules);
    const feature = await featureOf(t);
    await t.mutation(api.cue.spec, {
      ...auth,
      issueId: feature._id,
      spec,
      generation,
    });
    // The operator approval action re-saves the exact displayed text.
    await t.mutation(api.cue.spec, {
      ...auth,
      issueId: feature._id,
      spec,
      approved: true,
      actor: "Product",
    });
    const saved = await t.query(api.cue.snapshot, auth);
    const issue = saved.issues.find((i) => i._id === feature._id)!;
    expect(issue.specApprovedBy).toBe("Product");
    expect(issue.specGeneration).toEqual(generation);
  });
  test("saving edited text without a receipt clears the stale model receipt", async () => {
    const t = convexTest(schema, modules);
    const feature = await featureOf(t);
    await t.mutation(api.cue.spec, {
      ...auth,
      issueId: feature._id,
      spec,
      generation,
    });
    await t.mutation(api.cue.spec, {
      ...auth,
      issueId: feature._id,
      spec: edited,
      actor: "Product",
    });
    const saved = await t.query(api.cue.snapshot, auth);
    const issue = saved.issues.find((i) => i._id === feature._id)!;
    expect(issue.spec).toBe(edited);
    expect(issue.specGeneration).toBeUndefined();
  });
});
