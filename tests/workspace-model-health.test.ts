import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";

const state = vi.hoisted(() => ({ writer: "claude-sonnet-4.6", gemini: true }));
vi.mock("../lib/integration-config", () => ({
  readIntegrations: async () => ({
    apps: [{ id: "registered", name: "Bloom", origins: [] }],
    workspace: { growthModel: state.writer },
  }),
}));
vi.mock("../lib/gemini", () => ({ geminiReady: () => state.gemini }));
vi.mock("../lib/integration-checks", () => ({
  sharedWorkerStatus: async () => null,
  xRuntimeStatus: async () => ({ connected: false, detail: "Not configured" }),
  notificationRuntimeStatus: async () => ({ connected: false }),
}));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  secret: () => "isolated",
  db: () => ({
    query: async (reference: unknown) => {
      const name = getFunctionName(
        reference as Parameters<typeof getFunctionName>[0],
      );
      if (name === "workspace:snapshot")
        return { tasks: [], events: [], conversations: [] };
      if (name === "cue:snapshot")
        return { cases: [], issues: [], runs: [], events: [] };
      if (name === "jobs:status") return [];
      if (name === "growth:snapshot")
        return { opportunities: [], capabilities: [], drafts: [], touches: [] };
      throw new Error("Unexpected snapshot query " + name);
    },
  }),
}));
import { workspaceSnapshot } from "../lib/workspace";
beforeEach(() => {
  state.writer = "claude-sonnet-4.6";
  state.gemini = true;
  vi.stubEnv("LITELLM_API_KEY", "isolated-test-key");
});
afterEach(() => vi.unstubAllEnvs());
test("Growth health reports the configured writer separately from qualification", async () => {
  const snapshot = await workspaceSnapshot("registered", {
    id: "owner@example.test",
    name: "Owner",
    role: "owner",
  });
  const growth = snapshot.agents.find((agent) => agent.id === "growth")!;
  expect(growth.health.label).toBe(
    "Gemini qualification · Claude Sonnet via LiteLLM",
  );
  expect(growth.models).toMatchObject({
    writer: "claude-sonnet-4.6",
    writerProvider: "litellm",
  });
  expect(growth.health.detail).toContain(
    "Replies: claude-sonnet-4.6 via LiteLLM",
  );
});
test("missing proxy credentials cannot claim the Claude writer is configured", async () => {
  vi.stubEnv("LITELLM_API_KEY", "");
  const snapshot = await workspaceSnapshot("registered", {
    id: "owner@example.test",
    name: "Owner",
    role: "owner",
  });
  expect(
    snapshot.agents.find((agent) => agent.id === "growth")?.health,
  ).toMatchObject({
    st: "unknown",
    label: "Gemini qualification · LiteLLM writer unavailable",
  });
});
