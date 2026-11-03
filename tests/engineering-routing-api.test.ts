import { beforeEach, expect, test, vi } from "vitest";
const m = vi.hoisted(() => ({ operator: vi.fn(), sameOrigin: vi.fn(), mutation: vi.fn(), slackConfig: vi.fn(), packContext: vi.fn() }));
vi.mock("../lib/access", () => ({ operator: m.operator, sameOrigin: m.sameOrigin }));
vi.mock("../lib/integration-config", () => ({ slackConfig: m.slackConfig }));
vi.mock("../lib/app-pack", () => ({ packContext: m.packContext, listPacks: vi.fn(), requireActivePack: vi.fn() }));
vi.mock("../lib/server-store", async () => ({ api: (await import("../convex/_generated/api")).api, db: () => ({ mutation: m.mutation }), secret: () => "routing-test-secret" }));
import { POST } from "../app/api/onboarding/route";
import { api } from "../convex/_generated/api";

const request = (body: object = {}) => new Request("https://cue.test/api/onboarding", {
  method: "POST",
  headers: { "content-type": "application/json", host: "cue.test", origin: "https://cue.test" },
  body: JSON.stringify({ action: "setRouting", appId: "app-Exact", label: "Exact App", engineeringChannel: "CEXACT42", engineeringMemberId: "UEXACT42", ...body }),
});
beforeEach(() => {
  vi.resetAllMocks();
  m.operator.mockResolvedValue({ id: "server-owner", name: "Server Owner", role: "owner" });
  m.packContext.mockResolvedValue({ appId: "app-Exact", status: "active" });
  m.slackConfig.mockResolvedValue({ members: [{ slackId: "UEXACT42", role: "engineering", name: "Assigned Engineer" }] });
});

test.each(["engineering", "owner"])("connected %s assignee preserves exact app/channel/member through the real route", async (role) => {
  m.slackConfig.mockResolvedValue({ members: [{ slackId: "UEXACT42", role, name: "Connected Member" }] });
  const response = await POST(request({ actor: "forged", owner: "forged", role: "support", memberRole: "support" }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true, message: "Slack routing saved." });
  expect(m.packContext).toHaveBeenCalledExactlyOnceWith("app-Exact");
  expect(m.mutation).toHaveBeenCalledExactlyOnceWith(api.appPacks.setRouting, {
    secret: "routing-test-secret", appId: "app-Exact", label: "Exact App", engineeringChannel: "CEXACT42", engineeringMemberId: "UEXACT42",
  });
});

test.each(["support", "product"])("connected %s cannot be promoted to engineering assignee through forged request role", async (role) => {
  m.slackConfig.mockResolvedValue({ members: [{ slackId: "UEXACT42", role, name: "Connected Member" }] });
  const response = await POST(request({ role: "owner", memberRole: "engineering", engineeringMember: { slackId: "UEXACT42", role: "owner" } }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Assign a connected Engineering or Owner member" });
  expect(m.mutation).not.toHaveBeenCalled();
});

test.each([
  { label: "unknown member", config: { members: [{ slackId: "UOTHER42", role: "engineering" }] } },
  { label: "missing member directory", config: { operatorIds: ["UEXACT42"] } },
  { label: "disconnected Slack", config: null },
])("$label cannot supply a connected engineering assignee", async ({ config }) => {
  m.slackConfig.mockResolvedValue(config);
  const response = await POST(request({ role: "owner", memberRole: "engineering" }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "Assign a connected Engineering or Owner member" });
  expect(m.mutation).not.toHaveBeenCalled();
});

test.each(["support", "product", "engineering"])("authenticated %s actor cannot edit routing despite forged owner fields", async (role) => {
  m.operator.mockResolvedValue({ id: "server-member", name: "Server Member", role });
  const response = await POST(request({ actor: "owner", owner: "owner", role: "owner", permissions: { manage: true } }));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: "Operator access required" });
  expect(m.slackConfig).not.toHaveBeenCalled(); expect(m.packContext).not.toHaveBeenCalled(); expect(m.mutation).not.toHaveBeenCalled();
});

test("unknown app and origin/authentication failure cannot write routing", async () => {
  m.packContext.mockResolvedValueOnce(null);
  const unknown = await POST(request());
  expect(unknown.status).toBe(400); expect(await unknown.json()).toEqual({ error: "Application not found" });
  expect(m.slackConfig).not.toHaveBeenCalled(); expect(m.mutation).not.toHaveBeenCalled();
  m.operator.mockRejectedValueOnce(new Error("Unauthenticated"));
  expect((await POST(request())).status).toBe(401);
  m.sameOrigin.mockImplementationOnce(() => { throw new Error("Request origin rejected"); });
  expect((await POST(request())).status).toBe(401);
  expect(m.mutation).not.toHaveBeenCalled(); expect(m.packContext).toHaveBeenCalledTimes(1);
});
