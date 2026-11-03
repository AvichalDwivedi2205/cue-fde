import { afterEach, beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => {
  const workspace: { supportModel?: string; growthModel?: string } = {};
  return { workspace };
});
vi.mock("../lib/integration-config", () => ({
  readIntegrations: async () => ({ workspace: state.workspace }),
}));
import { configuredRoute, routeReadiness } from "../lib/model-config";
import { META_SPARK_MODEL } from "../lib/meta";

beforeEach(() => {
  state.workspace = {};
  for (const name of [
    "META_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_CLOUD_PROJECT",
    "LITELLM_API_KEY",
    "CUE_SUPPORT_MODEL",
    "CUE_GROWTH_MODEL",
    "CUE_AGENT_MODEL",
    "GEMINI_MODEL",
    "META_BASE_URL",
  ])
    vi.stubEnv(name, "");
});
afterEach(() => vi.unstubAllEnvs());

test("legacy defaults and saved configuration precedence remain intact", async () => {
  expect(await configuredRoute({ purpose: "support" })).toEqual({
    kind: "google",
    model: "gemini-2.5-flash",
  });
  vi.stubEnv("CUE_SUPPORT_MODEL", META_SPARK_MODEL);
  state.workspace.supportModel = "claude-haiku";
  expect(await configuredRoute({ purpose: "support" })).toEqual({
    kind: "litellm",
    model: "claude-haiku",
  });
  expect(
    await configuredRoute({ purpose: "support", override: META_SPARK_MODEL }),
  ).toEqual({ kind: "meta", model: META_SPARK_MODEL });
});

test("Meta-only credentials enable Meta without relying on Google or LiteLLM", async () => {
  vi.stubEnv("META_API_KEY", "isolated-meta-key");
  vi.stubEnv("CUE_SUPPORT_MODEL", META_SPARK_MODEL);
  vi.stubEnv("CUE_AGENT_MODEL", META_SPARK_MODEL);
  for (const purpose of [
    "support",
    "triage",
    "qualification",
    "specification",
    "workspace",
  ] as const) {
    const route = await configuredRoute({ purpose });
    expect(route).toEqual({ kind: "meta", model: META_SPARK_MODEL });
    expect(routeReadiness(route)).toEqual({ kind: "ready" });
  }
});

test("Google credentials cannot satisfy a selected unavailable Meta provider", async () => {
  vi.stubEnv("GEMINI_API_KEY", "isolated-google-key");
  state.workspace.supportModel = META_SPARK_MODEL;
  expect(routeReadiness(await configuredRoute({ purpose: "support" }))).toEqual(
    { kind: "unavailable", reason: "Meta is not configured" },
  );
});

test("Growth configuration is independent and unknown models fail closed", async () => {
  vi.stubEnv("CUE_GROWTH_MODEL", META_SPARK_MODEL);
  expect(await configuredRoute({ purpose: "growth" })).toEqual({
    kind: "meta",
    model: META_SPARK_MODEL,
  });
  expect(await configuredRoute({ purpose: "support" })).toEqual({
    kind: "google",
    model: "gemini-2.5-flash",
  });
  await expect(
    configuredRoute({ purpose: "support", override: "unverified-model" }),
  ).rejects.toThrow();
});
