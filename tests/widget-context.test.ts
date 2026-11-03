import { afterEach, beforeEach, expect, test, vi } from "vitest";
import sharp from "sharp";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  answer: vi.fn(),
  save: vi.fn(),
  supportModel: "muse-spark-1.3",
  screenshots: true,
}));
vi.mock("../lib/access", () => ({ sameOrigin: () => {} }));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => m,
  secret: () => "widget-context-secret",
}));
vi.mock("../lib/integration-config", () => ({
  readIntegrations: async () => ({
    workspace: { supportModel: m.supportModel },
  }),
}));
vi.mock("../lib/app-pack", async (original) => ({
  ...(await original<object>()),
  requireSessionPack: async (appId: string) => {
    if (appId !== "app-a") throw new Error("Unknown app");
    return {
      appId,
      name: "App A",
      status: "active",
      origins: ["https://app-a.test"],
      widget: { answers: true, screenshots: m.screenshots, voice: false },
    };
  },
}));
vi.mock("../lib/widget-preview", () => ({
  widgetOriginAllowed: async (
    _request: Request,
    origins: string[],
    origin: string,
  ) => origins.includes(origin),
}));
vi.mock("../lib/attachment", async (original) => ({
  ...(await original<object>()),
  saveAttachment: m.save,
}));
vi.mock("../lib/triage", () => ({ triage: vi.fn() }));
vi.mock("../lib/knowledge-answer", () => ({ answerKnowledge: m.answer }));
import { POST } from "../app/api/widget/route";
import { issueWidgetSession } from "../lib/widget-session";
const app = {
  id: "app-a",
  name: "App A",
  origins: ["https://app-a.test"],
  createdAt: 1,
};
function request(overrides: Record<string, unknown> = {}) {
  return new Request("https://cue.test/api/widget", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action: "message",
      app: app.id,
      origin: app.origins[0],
      token: issueWidgetSession(app, app.origins[0]),
      text: "Please inspect the screenshot.",
      ...overrides,
    }),
  });
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("META_API_KEY", "isolated-meta-key");
  vi.stubEnv("META_BASE_URL", "");
  vi.stubEnv("GEMINI_API_KEY", "");
  vi.stubEnv("GOOGLE_CLOUD_PROJECT", "");
  vi.stubEnv("LITELLM_API_KEY", "");
  vi.stubEnv("CUE_WIDGET_SECRET", "widget-context-secret");
  m.supportModel = "muse-spark-1.3";
  m.screenshots = true;
  m.query.mockResolvedValue(null);
  m.mutation.mockResolvedValue({ caseId: "case-1", created: false });
  m.answer.mockResolvedValue({
    text: "What happens after saving?",
    status: "needs_review",
    hits: [],
    citedIds: [],
    provider: "meta",
    model: "muse-spark-1.3",
    inputTokens: 101,
    outputTokens: 31,
    retrieval: "keyword",
    brandVersion: 1,
  });
});
afterEach(() => vi.unstubAllEnvs());

test("Meta-only widget sends validated pixels with app-scoped context and persists actual usage", async () => {
  const pixels = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#1976d2" },
  })
    .png()
    .toBuffer();
  const attachment = `data:image/png;base64,${pixels.toString("base64")}`;
  expect((await POST(request({ attachment }))).status).toBe(200);
  expect(m.answer).toHaveBeenCalledWith(
    "app-a",
    expect.objectContaining({
      appName: "App A",
      message: "Please inspect the screenshot.",
    }),
    {
      model: "muse-spark-1.3",
      images: [{ mimeType: "image/png", data: pixels.toString("base64") }],
    },
  );
  expect(m.mutation.mock.calls[0][1].knowledge).toMatchObject({
    provider: "meta",
    model: "muse-spark-1.3",
    inputTokens: 101,
    outputTokens: 31,
  });
  expect(m.save).toHaveBeenCalledWith(attachment, expect.any(String), "case-1");
});

test("invalid or disabled screenshots are rejected before model spending or intake writes", async () => {
  expect(
    (await POST(request({ attachment: "data:image/png;base64,aGVsbG8===" })))
      .status,
  ).toBe(400);
  m.screenshots = false;
  expect(
    (await POST(request({ attachment: "data:image/png;base64,aGVsbG8=" })))
      .status,
  ).toBe(400);
  expect(m.answer).not.toHaveBeenCalled();
  expect(m.mutation).not.toHaveBeenCalled();
});

test.each(["unverified-model", "muse-spark-1.3"])(
  "unavailable generation preserves the report: %s",
  async (model) => {
    m.supportModel = model;
    vi.stubEnv("META_API_KEY", "");
    expect((await POST(request())).status).toBe(200);
    expect(m.answer).not.toHaveBeenCalled();
    expect(m.mutation).toHaveBeenCalledTimes(1);
    expect(m.mutation.mock.calls[0][1].ack).toMatch(/saved|What|Which|\?/);
  },
);

test("wrong app and wrong origin are rejected before reading or writing context", async () => {
  expect((await POST(request({ app: "other-app" }))).status).toBe(403);
  expect((await POST(request({ origin: "https://foreign.test" }))).status).toBe(
    403,
  );
  expect(m.query).not.toHaveBeenCalled();
  expect(m.mutation).not.toHaveBeenCalled();
  expect(m.answer).not.toHaveBeenCalled();
});
