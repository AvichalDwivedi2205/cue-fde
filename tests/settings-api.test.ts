import { beforeEach, afterEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  operator: vi.fn(),
  sameOrigin: vi.fn(),
  readIntegrations: vi.fn(),
  updateIntegrations: vi.fn(),
}));
vi.mock("../lib/access", () => ({
  operator: mocks.operator,
  sameOrigin: mocks.sameOrigin,
}));
vi.mock("../lib/integration-config", () => ({
  readIntegrations: mocks.readIntegrations,
  updateIntegrations: mocks.updateIntegrations,
}));
vi.mock("../lib/knowledge-answer", () => ({
  SUPPORT_MODELS: [
    "gemini-2.5-flash",
    "nova-lite",
    "claude-haiku",
    "claude-sonnet-4.6",
  ],
}));
import { GET, POST } from "../app/api/settings/route";
beforeEach(() => {
  vi.resetAllMocks();
  mocks.operator.mockResolvedValue({
    name: "Owner",
    email: "owner@example.com",
    role: "owner",
  });
  mocks.readIntegrations.mockResolvedValue({
    apps: [],
    slack: { botToken: "private-token", members: [] },
  });
  vi.stubEnv("CUE_SUPPORT_MODEL", "gemini-2.5-flash");
  vi.stubEnv("CUE_GROWTH_MODEL", "");
  vi.stubEnv("LITELLM_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: object) =>
  new Request("https://cue.test/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
test("settings reads show real configuration without leaking credentials", async () => {
  const r = await GET(new Request("https://cue.test/api/settings")),
    data = await r.json();
  expect(r.status).toBe(200);
  expect(data.models.support).toBe("gemini-2.5-flash");
  expect(data.models.litellm).toBe(false);
  expect(data.models.growth).toBe("gemini-2.5-flash");
  expect(data.models.coding).toBe("Codex");
  expect(data.models.litellmCreditsRemaining).toBeNull();
  expect(JSON.stringify(data)).not.toContain("private-token");
});
test("Growth model is independently configurable and requires its actual provider", async () => {
  const body = { action: "growth-model", growthModel: "claude-sonnet-4.6" };
  expect((await POST(request(body))).status).toBe(400);
  vi.stubEnv("LITELLM_API_KEY", "configured-test-key");
  expect((await POST(request(body))).status).toBe(200);
  const update = mocks.updateIntegrations.mock.calls[0][0];
  expect(
    update({
      apps: [{ id: "a" }],
      workspace: {
        name: "Cue",
        timezone: "UTC",
        supportModel: "gemini-2.5-flash",
      },
    }),
  ).toMatchObject({
    workspace: {
      supportModel: "gemini-2.5-flash",
      growthModel: "claude-sonnet-4.6",
    },
  });
  expect(
    (await POST(request({ ...body, growthModel: "unknown" }))).status,
  ).toBe(400);
});
test("non-owner and cross-origin writes are rejected before changing settings", async () => {
  mocks.operator.mockResolvedValue({ role: "product" });
  expect(
    (await POST(request({ action: "model", supportModel: "gemini-2.5-flash" })))
      .status,
  ).toBe(403);
  mocks.operator.mockResolvedValue({ role: "owner" });
  mocks.sameOrigin.mockImplementation(() => {
    throw new Error("Wrong origin");
  });
  expect(
    (await POST(request({ action: "model", supportModel: "gemini-2.5-flash" })))
      .status,
  ).toBe(403);
  expect(mocks.updateIntegrations).not.toHaveBeenCalled();
});
test("model selection requires a configured provider and preserves existing integrations", async () => {
  expect(
    (await POST(request({ action: "model", supportModel: "nova-lite" })))
      .status,
  ).toBe(400);
  vi.stubEnv("LITELLM_API_KEY", "configured-test-key");
  expect(
    (await POST(request({ action: "model", supportModel: "nova-lite" })))
      .status,
  ).toBe(200);
  const update = mocks.updateIntegrations.mock.calls[0][0];
  expect(
    update({
      apps: [{ id: "a" }],
      workspace: { name: "Cue", timezone: "UTC" },
    }),
  ).toEqual({
    apps: [{ id: "a" }],
    workspace: { name: "Cue", timezone: "UTC", supportModel: "nova-lite" },
  });
});
test("workspace names and time zones are validated while retaining model choices", async () => {
  expect(
    (
      await POST(
        request({ action: "workspace", name: "Cue", timezone: "invalid-zone" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          action: "workspace",
          name: "My Cue",
          timezone: "Asia/Kolkata",
        }),
      )
    ).status,
  ).toBe(200);
  const update = mocks.updateIntegrations.mock.calls[0][0];
  expect(
    update({ apps: [], workspace: { supportModel: "gemini-2.5-flash" } })
      .workspace,
  ).toEqual({
    name: "My Cue",
    timezone: "Asia/Kolkata",
    supportModel: "gemini-2.5-flash",
  });
});
