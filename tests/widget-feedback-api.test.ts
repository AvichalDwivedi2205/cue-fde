import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  sameOrigin: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
}));
vi.mock("../lib/access", () => ({ sameOrigin: mocks.sameOrigin }));
vi.mock("../lib/integration-config", () => ({
  readIntegrations: async () => ({
    apps: [
      {
        id: "app-a",
        name: "App A",
        origins: ["https://app-a.test"],
        createdAt: 1,
      },
    ],
  }),
}));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => mocks,
  secret: () => "widget-outcome-secret",
}));
vi.mock("../lib/widget-preview", () => ({
  widgetOriginAllowed: async (_: Request, origins: string[], origin: string) =>
    origins.includes(origin),
}));
vi.mock("../lib/attachment", () => ({ saveAttachment: vi.fn() }));
vi.mock("../lib/triage", () => ({ triage: vi.fn() }));
vi.mock("../lib/gemini", () => ({ geminiReady: () => false }));
vi.mock("../lib/knowledge-answer", () => ({ answerKnowledge: vi.fn() }));
import { POST } from "../app/api/widget/route";
import { issueWidgetSession, verifyWidgetSession } from "../lib/widget-session";
const app = {
  id: "app-a",
  name: "App A",
  origins: ["https://app-a.test"],
  createdAt: 1,
};
const request = (body: unknown) =>
  new Request("https://cue.test/api/widget", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.mutation.mockResolvedValue({ duplicate: false, outcome: "needs_help" });
});
test("widget feedback verifies the signed session and derives its owner before writing", async () => {
  const token = issueWidgetSession(app, "https://app-a.test");
  const body = {
    action: "feedback",
    app: app.id,
    origin: "https://app-a.test",
    token,
    caseId: "case-id",
    messageId: "answer-id",
    outcome: "needs_help",
    owner: "forged-owner",
  };
  expect((await POST(request(body))).status).toBe(200);
  expect(mocks.mutation.mock.calls[0][1]).toMatchObject({
    appId: app.id,
    owner: verifyWidgetSession(token, app, body.origin),
    workspaceId: "cue-configured-workspace",
    caseId: "case-id",
    messageId: "answer-id",
  });
  expect(
    (await POST(request({ ...body, token: "invalid-token" }))).status,
  ).toBe(401);
  expect(
    (await POST(request({ ...body, origin: "https://other-site.test" })))
      .status,
  ).toBe(403);
  expect((await POST(request({ ...body, app: "app-b" }))).status).toBe(403);
  expect(mocks.mutation).toHaveBeenCalledTimes(1);
});
test("read returns saved answer outcomes for the same conversation across widget reloads", async () => {
  const token = issueWidgetSession(app, "https://app-a.test");
  mocks.query
    .mockResolvedValueOnce({
      case: { _id: "case-id", status: "open", title: "Question" },
      messages: [
        { _id: "answer-id", body: "Answer", role: "cue", author: "Cue" },
      ],
    })
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ messageId: "answer-id", outcome: "solved" }]);
  const result = await POST(
    request({
      action: "read",
      app: app.id,
      origin: "https://app-a.test",
      token,
    }),
  );
  expect(result.status).toBe(200);
  expect((await result.json()).messages).toEqual([
    {
      id: "answer-id",
      body: "Answer",
      author: "Cue",
      role: "cue",
      citations: [],
      outcome: "solved",
    },
  ]);
});
