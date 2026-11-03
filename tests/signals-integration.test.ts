/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionReference } from "convex/server";
import { NextRequest } from "next/server";
import { afterEach, expect, test, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";

const state = vi.hoisted(() => ({
  completion: vi.fn(),
  testBatchId: "",
  store: null as Pick<ReturnType<typeof convexTest>, "query" | "mutation"> | null,
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: state.completion } };
  },
}));
vi.mock("../lib/google-client", () => ({
  client: () => { throw new Error("Google must not be called"); },
  geminiReady: () => true,
}));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => {
    if (!state.store) throw new Error("Test store missing");
    // convex-test embeds the mixed-case table name in IDs, unlike hosted IDs.
    return {
      query: (reference: FunctionReference<"query">, args: Record<string, unknown>) =>
        state.store!.query(reference, { ...args, batchId: state.testBatchId }),
      mutation: (reference: FunctionReference<"mutation">, args: Record<string, unknown>) =>
        state.store!.mutation(reference, { ...args, batchId: state.testBatchId }),
    };
  },
  secret: () => "signals-integration-secret",
}));
vi.mock("../lib/access", () => ({
  operator: async () => ({ id: "u1", role: "owner", name: "Avi", email: "a@example.test" }),
  sameOrigin: () => {},
}));
vi.mock("../lib/app-pack", () => ({ listPacks: async () => [] }));

import { POST } from "../app/api/signals/route";
import { META_SPARK_MODEL } from "../lib/meta";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const secret = "signals-integration-secret";
afterEach(() => {
  vi.unstubAllEnvs();
  state.store = null;
  vi.clearAllMocks();
});

test("HTTP analysis persists actual service clusters through the real Convex mutation and survives reopen", async () => {
  vi.stubEnv("CUE_DEMO_SECRET", secret);
  vi.stubEnv("CUE_AGENT_MODEL", META_SPARK_MODEL);
  vi.stubEnv("META_API_KEY", "synthetic-test-key");
  const t = convexTest(schema, modules);
  state.store = t;
  const { appId } = await t.mutation(api.appPacks.register, {
    secret, name: "LatchGrid", origins: ["https://latchgrid.example.test"],
  });
  const posts = [
    { id: "p01", author: "Rhea", text: "Please restore cleared boards." },
    { id: "p02", author: "Sam", text: "We need board recovery." },
  ];
  const { batchId } = await t.mutation(api.signals.createSignalBatch, {
    secret, appId, requestKey: "route-service-persistence",
    provenance: { kind: "synthetic-fixture", fixture: "integration", version: "v1" },
    posts, actor: "Avi",
  });
  state.testBatchId = batchId;
  const before = await t.query(api.signals.getSignalBatch, { secret, batchId });
  state.completion.mockResolvedValueOnce({
    model: META_SPARK_MODEL,
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify({
      dispositions: posts.map((post) => ({
        postId: post.id, outcome: "evidence", clusterId: "recover", quote: post.text, reason: "Recovery requested.",
      })),
      clusters: [{
        id: "recover", need: "Recover cleared boards", rationale: "Two authors request recovery.", sentiment: "concerned",
        proposal: {
          title: "Board recovery", assumptions: [],
          specification: {
            need: "Recover cleared boards", specification: "List and restore cleared boards.",
            acceptanceCriteria: ["Cleared boards are listed", "Restore returns the saved board"],
          },
        },
      }],
    }) } }],
    usage: { prompt_tokens: 320, completion_tokens: 180 },
  });
  const response = await POST(new NextRequest("http://localhost/api/signals", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "analyze", batchId: "b".repeat(32), expectedFingerprint: before!.inputFingerprint }),
  }));
  expect(await response.json()).toEqual({ state: "analyzed", attemptNumber: 1 });
  const reopened = await t.query(api.signals.getSignalBatch, { secret, batchId });
  expect(reopened!.state).toBe("analyzed");
  expect(reopened!.posts).toEqual(before!.posts);
  expect(reopened!.analysis!.clusters).toHaveLength(1);
  expect(reopened!.analysis!.clusters[0]).toMatchObject({
    id: "recover", distinctAuthors: 2, repeatedEvidence: true,
    sources: posts.map((p) => ({ postId: p.id, author: p.author, quote: p.text })),
  });
  expect(reopened!.attempts[0]).toMatchObject({ status: "completed", receipt: { inputTokens: 320, outputTokens: 180 } });
  expect(state.completion).toHaveBeenCalledTimes(1);
});
