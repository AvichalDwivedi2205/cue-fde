import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";

const state = vi.hoisted(() => ({ writer: "claude-sonnet-4.6", gemini: true, worker: vi.fn() }));
vi.mock("../lib/integration-config", () => ({
  readIntegrations: async () => ({
    apps: [{ id: "registered", name: "Bloom", origins: [] }],
    workspace: { growthModel: state.writer },
  }),
}));
vi.mock("../lib/gemini", () => ({ geminiReady: () => state.gemini }));
vi.mock("../lib/google-client", () => ({ geminiReady: () => state.gemini }));
vi.mock("../lib/integration-checks", () => ({
  sharedWorkerStatus: state.worker,
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
  state.worker.mockResolvedValue(null);
  vi.stubEnv("LITELLM_API_KEY", "isolated-test-key");
  vi.stubEnv("CUE_AGENT_MODEL", "");
  vi.stubEnv("GEMINI_MODEL", "");
  vi.stubEnv("META_API_KEY", "");
  vi.stubEnv("META_BASE_URL", "");
});
test.each([
  { backend: "local", configured: true, workerOnline: true, ready: true },
  { backend: "local", configured: false, workerOnline: true, ready: false },
  { backend: "local", configured: true, workerOnline: false, ready: false },
  { backend: "modal", configured: true, workerOnline: true, ready: false },
])("engineering health follows actual local execution availability: %j", async ({ ready, ...runtime }) => {
  state.worker.mockResolvedValue({
    coding: { provider: "meta", model: "muse-wonder-1.0", detail: "Runtime diagnostic", ...runtime },
    busy: false,
  });
  const snapshot = await workspaceSnapshot("registered", {
    id: "owner@example.test", name: "Owner", role: "owner",
  });
  expect(snapshot.agents.find((agent) => agent.id === "engineering")?.health).toMatchObject({
    st: ready ? "ok" : "unknown",
    label: ready ? "Meta + local Docker worker online" : "Meta coding worker unavailable",
    detail: "Runtime diagnostic",
  });
});
test("legacy Codex health remains available without a Meta coding worker", async () => {
  state.worker.mockResolvedValue({
    codex: { loggedIn: true, workerOnline: true, github: true },
    busy: false,
  });
  const snapshot = await workspaceSnapshot("registered", {
    id: "owner@example.test", name: "Owner", role: "owner",
  });
  expect(snapshot.agents.find((agent) => agent.id === "engineering")?.health).toMatchObject({
    st: "ok", label: "Companion online",
  });
});
test("Meta qualification and Growth writing work without a Google provider", async () => {
  state.writer = "muse-spark-1.3";
  state.gemini = false;
  vi.stubEnv("CUE_AGENT_MODEL", "muse-spark-1.3");
  vi.stubEnv("META_API_KEY", "isolated-meta-key");
  const snapshot = await workspaceSnapshot("registered", {
    id: "owner@example.test",
    name: "Owner",
    role: "owner",
  });
  const growth = snapshot.agents.find((agent) => agent.id === "growth");
  expect(growth?.health.st).toBe("ok");
  expect(growth?.models).toMatchObject({
    qualification: "muse-spark-1.3",
    writer: "muse-spark-1.3",
    writerProvider: "meta",
  });
  expect(growth?.health.detail).toContain("muse-spark-1.3 via Meta API");
});

test("an unavailable selected Meta writer is not satisfied by Gemini", async () => {
  state.writer = "muse-spark-1.3";
  const snapshot = await workspaceSnapshot("registered", {
    id: "owner@example.test",
    name: "Owner",
    role: "owner",
  });
  expect(
    snapshot.agents.find((agent) => agent.id === "growth")?.health,
  ).toMatchObject({
    st: "unknown",
    label: "Gemini qualification · Meta API writer unavailable",
  });
});
vi.mock("../lib/app-pack", async () => {
  const pack = {
    appId: "registered",
    name: "Bloom",
    status: "active",
    origins: [],
  };
  const actual =
    await vi.importActual<typeof import("../lib/app-pack")>("../lib/app-pack");
  const known = (appId?: string) => appId === pack.appId;
  return {
    ...actual,
    packContext: async (appId: string) => (known(appId) ? pack : null),
    requireSessionPack: async (appId: string) => {
      if (!known(appId)) throw new Error("App origin is not allowed");
      return pack;
    },
    requireActivePack: async (appId: string) => {
      if (!known(appId))
        throw new Error("Register the application in Setup first");
      return pack;
    },
    listPacks: async () => [pack],
    resolveAppPack: async (appId?: string) => (known(appId) ? pack : null),
  };
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
