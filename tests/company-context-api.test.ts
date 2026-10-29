import { beforeEach, expect, test, vi } from "vitest";
const m = vi.hoisted(() => ({
  operator: vi.fn(),
  sameOrigin: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
}));
vi.mock("../lib/access", () => ({
  operator: m.operator,
  sameOrigin: m.sameOrigin,
}));
vi.mock("../lib/integration-config", () => ({
  readIntegrations: async () => ({ apps: [{ id: "bloom", name: "Bloom" }] }),
}));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => m,
  secret: () => "trusted",
}));
import { GET, POST } from "../app/api/company-context/route";
const brand = {
  action: "brand",
  appId: "bloom",
  expectedVersion: 0,
  enabled: true,
  label: "Bloom voice",
  tone: "warm",
  guidelines: "Plain words",
  examples: ["Find a moment."],
};
const request = (b: unknown) =>
  new Request("https://cue.test/api/company-context", {
    method: "POST",
    body: JSON.stringify(b),
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.operator.mockResolvedValue({
    email: "owner@test",
    name: "Owner",
    role: "owner",
  });
  m.query.mockResolvedValue({ brand: {}, manifest: null, sources: [] });
});
test("server derives workspace and identity; spoofed scope or actor never writes", async () => {
  expect((await POST(request(brand))).status).toBe(200);
  expect(m.mutation.mock.calls[0][1]).toMatchObject({
    workspaceId: "cue-configured-workspace",
    actor: { id: "owner@test", role: "owner" },
  });
  for (const patch of [
    { workspaceId: "another-company" },
    { actor: { role: "owner" } },
    { appId: "other" },
  ])
    expect((await POST(request({ ...brand, ...patch }))).status).toBe(400);
  expect(m.mutation).toHaveBeenCalledTimes(1);
});
test("support can read but cannot change company coverage or voice", async () => {
  m.operator.mockResolvedValue({ role: "support" });
  expect(
    (await GET(new Request("https://cue.test/api/company-context?app=bloom")))
      .status,
  ).toBe(200);
  expect((await POST(request(brand))).status).toBe(403);
  expect(
    (
      await POST(
        request({
          action: "coverage",
          appId: "bloom",
          expectedRevision: 0,
          requirements: [],
        }),
      )
    ).status,
  ).toBe(403);
  expect(m.mutation).not.toHaveBeenCalled();
});
test("auth and origin rejection precede reads and writes", async () => {
  m.operator.mockRejectedValue(new Error("no session"));
  expect(
    (await GET(new Request("https://cue.test/api/company-context"))).status,
  ).toBe(401);
  expect((await POST(request(brand))).status).toBe(400);
  m.operator.mockResolvedValue({ role: "owner" });
  m.sameOrigin.mockImplementation(() => {
    throw new Error("origin");
  });
  expect((await POST(request(brand))).status).toBe(400);
  expect(m.query).not.toHaveBeenCalled();
  expect(m.mutation).not.toHaveBeenCalled();
});
