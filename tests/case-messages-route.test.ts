import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";
const m = vi.hoisted(() => ({ operator: vi.fn(), query: vi.fn() }));
vi.mock("../lib/access", () => ({
  operator: m.operator,
  sameOrigin: vi.fn(),
  workosReady: () => true,
}));
vi.mock("../lib/server-store", () => ({
  api: { cue: { caseMessages: "selected-case-messages" } },
  db: () => ({ query: m.query }),
  secret: () => "trusted-test-secret",
}));
vi.mock("../lib/gemini", () => ({
  geminiReady: () => false,
  draft: vi.fn(),
  generateSpec: vi.fn(),
}));
vi.mock("../lib/attachment", () => ({ saveAttachment: vi.fn() }));
vi.mock("../lib/triage", () => ({ triage: vi.fn() }));
vi.mock("../lib/delivery", () => ({
  sendApproval: vi.fn(),
  sendEmail: vi.fn(),
  sendSlackReply: vi.fn(),
  sendSpecApproval: vi.fn(),
}));
vi.mock("../lib/integration-config", () => ({
  emailConfig: vi.fn(),
  slackConfig: vi.fn(),
  readIntegrations: vi.fn(),
}));
vi.mock("../lib/integration-checks", () => ({
  slackRuntimeStatus: vi.fn(),
  notificationRuntimeStatus: vi.fn(),
  xRuntimeStatus: vi.fn(),
}));
import { GET } from "../app/api/demo/route";
const request = (query: string) =>
  new NextRequest("https://cue.example.test/api/demo?" + query);
beforeEach(() => {
  vi.resetAllMocks();
  m.operator.mockResolvedValue({ id: "staff", role: "support" });
});
test("anonymous selected-case reads stop before the trusted backend query", async () => {
  m.operator.mockRejectedValue(new Error("Sign in first"));
  expect((await GET(request("caseId=case-old&appId=bloom"))).status).toBe(401);
  expect(m.query).not.toHaveBeenCalled();
});
test("an authenticated selected-case request preserves exact scope and stored messages", async () => {
  const messages = [
    {
      caseId: "case-old",
      author: "Native sender",
      body: "Stored provider message",
    },
  ];
  m.query.mockResolvedValue(messages);
  const response = await GET(request("caseId=case-old&appId=bloom"));
  expect(response.status).toBe(200);
  expect(m.query).toHaveBeenCalledWith("selected-case-messages", {
    secret: "trusted-test-secret",
    caseId: "case-old",
    appId: "bloom",
  });
  expect(await response.json()).toEqual({ messages });
});
test("missing application scope never queries a conversation", async () => {
  expect((await GET(request("caseId=case-old"))).status).toBe(401);
  expect(m.query).not.toHaveBeenCalled();
});
