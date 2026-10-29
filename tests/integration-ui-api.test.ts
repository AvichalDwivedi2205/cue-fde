import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  operator: vi.fn(),
  sameOrigin: vi.fn(),
  update: vi.fn(),
}));
vi.mock("../lib/access", () => ({
  operator: mocks.operator,
  sameOrigin: mocks.sameOrigin,
}));
vi.mock("../lib/integration-config", async (original) => ({
  ...(await original<object>()),
  updateIntegrations: mocks.update,
}));
import { POST } from "../app/api/integrations/route";
const request = (body: object) =>
  new Request("https://cue.test/api/integrations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const config = {
  apps: [
    {
      id: "a",
      name: "App A",
      origins: ["https://a.example.com"],
      createdAt: 1,
      widget: { answers: true, voice: true, screenshots: true },
    },
    {
      id: "b",
      name: "App B",
      origins: ["https://b.example.com"],
      createdAt: 2,
    },
  ],
  workspace: { name: "Cue", timezone: "UTC" },
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.operator.mockResolvedValue({ role: "owner" });
  mocks.update.mockImplementation(async (update) => update(config));
});
test("editing an app preserves its identity, widget settings and other apps", async () => {
  const r = await POST(
    request({
      action: "appUpdate",
      id: "a",
      name: "Renamed",
      origins: ["https://new.example.com", "https://new.example.com"],
    }),
  );
  expect(r.status).toBe(200);
  const saved = await mocks.update.mock.results[0].value;
  expect(saved.apps[0]).toEqual({
    ...config.apps[0],
    name: "Renamed",
    origins: ["https://new.example.com"],
  });
  expect(saved.apps[1]).toEqual(config.apps[1]);
  expect(saved.workspace).toEqual(config.workspace);
});
test("widget options only update the selected application", async () => {
  const widget = { answers: false, voice: false, screenshots: true };
  expect(
    (await POST(request({ action: "widget", appId: "a", widget }))).status,
  ).toBe(200);
  const saved = await mocks.update.mock.results[0].value;
  expect(saved.apps).toEqual([{ ...config.apps[0], widget }, config.apps[1]]);
});
test("unknown apps and invalid origins or widget options cannot be saved", async () => {
  expect(
    (
      await POST(
        request({
          action: "appUpdate",
          id: "missing",
          name: "App",
          origins: ["https://safe.example.com"],
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          action: "appUpdate",
          id: "a",
          name: "App",
          origins: ["https://a.example.com/path"],
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({
          action: "widget",
          appId: "a",
          widget: { answers: "false", voice: true, screenshots: true },
        }),
      )
    ).status,
  ).toBe(400);
  expect(mocks.update).toHaveBeenCalledTimes(1);
});
test("owner permissions and request origin are checked before changing app access", async () => {
  const body = {
    action: "widget",
    appId: "a",
    widget: { answers: true, voice: true, screenshots: true },
  };
  mocks.operator.mockResolvedValue({ role: "support" });
  expect((await POST(request(body))).status).toBe(401);
  mocks.operator.mockResolvedValue({ role: "owner" });
  mocks.sameOrigin.mockImplementation(() => {
    throw new Error("Wrong origin");
  });
  expect((await POST(request(body))).status).toBe(401);
  expect(mocks.update).not.toHaveBeenCalled();
});
