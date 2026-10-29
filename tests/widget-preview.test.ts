import { beforeEach, afterEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ operator: vi.fn(), sameOrigin: vi.fn() }));
vi.mock("../lib/access", () => mocks);
vi.mock("../lib/integration-config", () => ({
  readIntegrations: async () => ({
    apps: [
      {
        id: "app-a",
        name: "App A",
        origins: ["https://app.example.com"],
        createdAt: 1,
      },
    ],
  }),
}));
vi.mock("../lib/server-store", () => ({
  secret: () => "isolated-preview-secret",
  api: {},
  db: () => {
    throw new Error("Preview session must not create a conversation");
  },
}));
vi.mock("../lib/triage", () => ({ triage: vi.fn() }));
vi.mock("../lib/attachment", () => ({ saveAttachment: vi.fn() }));
vi.mock("../lib/knowledge-answer", () => ({ answerKnowledge: vi.fn() }));
import { widgetOriginAllowed } from "../lib/widget-preview";
import { POST } from "../app/api/widget/route";
import { GET } from "../app/widget/route";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("CUE_PUBLIC_URL", "https://cue.test");
  mocks.operator.mockResolvedValue({ role: "owner" });
});
afterEach(() => vi.unstubAllEnvs());
const request = (preview: boolean, origin = "https://cue.test") =>
  new Request("https://cue.test/api/widget", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "session", app: "app-a", origin, preview }),
  });
test("operator preview is confined to Cue and never alters public allowed origins", async () => {
  const origins = ["https://app.example.com"],
    req = new Request("https://cue.test/widget");
  expect(
    await widgetOriginAllowed(req, origins, "https://cue.test", true),
  ).toBe(true);
  expect(
    await widgetOriginAllowed(req, origins, "https://evil.example.com", true),
  ).toBe(false);
  expect(
    await widgetOriginAllowed(req, origins, "https://cue.test", false),
  ).toBe(false);
  expect(origins).toEqual(["https://app.example.com"]);
});
test("anonymous callers cannot use preview to bypass the embed allowlist", async () => {
  mocks.operator.mockRejectedValue(new Error("Sign in first"));
  expect((await POST(request(true))).status).toBe(403);
  expect((await POST(request(false))).status).toBe(403);
  expect(
    (
      await GET(
        new Request(
          "https://cue.test/widget?app=app-a&origin=https%3A%2F%2Fcue.test&preview=1",
        ),
      )
    ).status,
  ).toBe(403);
  expect((await POST(request(false, "https://app.example.com"))).status).toBe(
    200,
  );
});
test("authenticated preview issues a session and allows framing only from Cue", async () => {
  const r = await POST(request(true));
  expect(r.status).toBe(200);
  expect((await r.json()).token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  const page = await GET(
    new Request(
      "https://cue.test/widget?app=app-a&origin=https%3A%2F%2Fcue.test&preview=1",
    ),
  );
  expect(page.status).toBe(200);
  expect(page.headers.get("content-security-policy")).toContain(
    "frame-ancestors https://cue.test;",
  );
});
