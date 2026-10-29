import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  operator: vi.fn(),
  sameOrigin: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
}));
vi.mock("../lib/access", () => ({
  operator: mocks.operator,
  sameOrigin: mocks.sameOrigin,
}));
vi.mock("../lib/integration-config", () => ({
  readIntegrations: async () => ({ apps: [{ id: "app-a", name: "App A" }] }),
}));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => mocks,
  secret: () => "trusted-server-secret",
}));
import { GET, POST } from "../app/api/knowledge-gaps/route";
const request = (body: unknown) =>
  new Request("https://cue.test/api/knowledge-gaps", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const draft = {
  action: "teach",
  appId: "app-a",
  gapId: "gap-id",
  question: "How?",
  answer: "Reviewed answer.",
  expectedReportCount: 1,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.operator.mockResolvedValue({
    email: "support@example.com",
    role: "support",
  });
  mocks.query.mockResolvedValue([]);
  mocks.mutation.mockResolvedValue({ sourceId: "source-id", revision: 1 });
});
test("gaps and draft review use a server-derived actor and workspace within registered apps", async () => {
  expect((await POST(request(draft))).status).toBe(200);
  expect(mocks.mutation.mock.calls[0][1]).toMatchObject({
    actor: "support@example.com",
    workspaceId: "cue-configured-workspace",
    appId: "app-a",
  });
  expect((await POST(request({ ...draft, actor: "owner" }))).status).toBe(400);
  expect(
    (await POST(request({ ...draft, workspaceId: "other-workspace" }))).status,
  ).toBe(400);
  expect((await POST(request({ ...draft, appId: "app-b" }))).status).toBe(400);
  expect(mocks.mutation).toHaveBeenCalledTimes(1);
  expect(
    (await GET(new Request("https://cue.test/api/knowledge-gaps?app=app-b")))
      .status,
  ).toBe(401);
});
test("a Support reviewer can draft or ignore while an engineer cannot change company answers", async () => {
  expect((await POST(request(draft))).status).toBe(200);
  expect(
    (await POST(request({ action: "ignore", appId: "app-a", gapId: "gap-id" })))
      .status,
  ).toBe(200);
  mocks.operator.mockResolvedValue({
    email: "engineer@example.com",
    role: "engineering",
  });
  expect((await POST(request(draft))).status).toBe(403);
  expect(mocks.mutation).toHaveBeenCalledTimes(2);
});
test("login and same-origin gates run before any data reads or writes", async () => {
  mocks.operator.mockRejectedValue(new Error("No session"));
  expect(
    (await GET(new Request("https://cue.test/api/knowledge-gaps?app=app-a")))
      .status,
  ).toBe(401);
  expect((await POST(request(draft))).status).toBe(400);
  mocks.operator.mockResolvedValue({
    role: "owner",
    email: "owner@example.com",
  });
  mocks.sameOrigin.mockImplementation(() => {
    throw new Error("Bad origin");
  });
  expect((await POST(request(draft))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.mutation).not.toHaveBeenCalled();
});
