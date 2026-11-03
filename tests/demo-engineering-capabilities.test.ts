import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const m = vi.hoisted(() => ({ operator: vi.fn(), packs: vi.fn() }));
vi.mock("../lib/access", () => ({ operator: m.operator, sameOrigin: vi.fn(), workosReady: () => true }));
vi.mock("../lib/app-pack", () => ({ listPacks: m.packs }));
vi.mock("../lib/server-store", () => ({
  api: { cue: { snapshot: "snapshot" } },
  db: () => ({ query: async () => ({ cases: [], issues: [], runs: [], events: [] }) }),
  secret: () => "fixture-secret",
}));
vi.mock("../lib/gemini", () => ({ geminiReady: () => false, draft: vi.fn(), generateSpec: vi.fn() }));
vi.mock("../lib/attachment", () => ({ saveAttachment: vi.fn() }));
vi.mock("../lib/triage", () => ({ triage: vi.fn() }));
vi.mock("../lib/delivery", () => ({ sendApproval: vi.fn(), sendEmail: vi.fn(), sendSlackReply: vi.fn(), sendSpecApproval: vi.fn() }));
vi.mock("../lib/integration-config", () => ({
  slackConfig: async () => null,
  emailConfig: async () => null,
  readIntegrations: async () => ({ coding: [{ appId: "legacy-binding" }] }),
}));
vi.mock("../lib/integration-checks", () => ({
  slackRuntimeStatus: async () => ({ connected: false }),
  notificationRuntimeStatus: async () => null,
  xRuntimeStatus: async () => ({ connected: false }),
}));
import { GET } from "../app/api/demo/route";
beforeEach(() => {
  vi.clearAllMocks();
  m.operator.mockResolvedValue({ name: "Owner", role: "owner" });
  const engineering = { repository: "org/private-repository", testCommands: [{ program: "bun", args: ["test"] }] };
  m.packs.mockResolvedValue([
    { appId: "active-bound", status: "active", engineering },
    { appId: "draft-bound", status: "draft", engineering },
    { appId: "suspended-bound", status: "suspended", engineering },
    { appId: "active-unbound", status: "active" },
  ]);
});
test("demo snapshot publishes only active bound application IDs without repository policy", async () => {
  const response = await GET(new NextRequest("https://cue.test/api/demo"));
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.integration.engineeringApps).toEqual(["active-bound"]);
  expect(body.integration.codingApps).toEqual(["legacy-binding"]);
  expect(body.integration.permissions.investigate).toBe(true);
  expect(JSON.stringify(body)).not.toContain("private-repository");
  expect(JSON.stringify(body)).not.toContain("testCommands");
});
test("capability serialization preserves role permissions and rejects anonymous reads", async () => {
  m.operator.mockResolvedValue({ name: "Support", role: "support" });
  const body = await (await GET(new NextRequest("https://cue.test/api/demo"))).json();
  expect(body.integration.permissions.investigate).toBe(false);
  m.packs.mockClear();
  m.operator.mockRejectedValue(new Error("Sign in first"));
  expect((await GET(new NextRequest("https://cue.test/api/demo"))).status).toBe(401);
  expect(m.packs).not.toHaveBeenCalled();
});
