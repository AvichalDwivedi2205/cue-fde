import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  operator: vi.fn(),
  pack: vi.fn(),
  saved: vi.fn(),
  credits: vi.fn(),
  brand: vi.fn(),
  checkEmail: vi.fn(),
  read: vi.fn(),
  userBrand: vi.fn(),
  userConfig: vi.fn(),
}));
vi.mock("../lib/access", () => ({
  operator: mocks.operator,
  sameOrigin: vi.fn(),
}));
vi.mock("../lib/app-pack", () => ({ packContext: mocks.pack }));
vi.mock("../lib/integration-config", async (original) => ({
  ...(await original<object>()),
  readIntegrations: mocks.read,
  slackConfig: async () => null,
  emailConfig: async () => null,
  updateIntegrations: async (update: (value: { apps: never[] }) => unknown) =>
    mocks.saved(update({ apps: [] })),
}));
vi.mock("../lib/integration-checks", () => ({
  checkEmail: mocks.checkEmail,
  checkSlack: vi.fn(),
  checkCodex: vi.fn(),
  slackRuntimeStatus: async () => ({}),
  notificationRuntimeStatus: async () => ({}),
  xRuntimeStatus: async () => ({}),
}));
vi.mock("../lib/x-api", () => ({
  createXApi: () => ({ credits: mocks.credits, verifyBrand: mocks.brand }),
}));
vi.mock("../lib/x-support", () => ({
  createXSupport: (config: unknown) => {
    mocks.userConfig(config);
    return { verifyBrand: mocks.userBrand };
  },
}));
import { GET, POST } from "../app/api/integrations/route";
const request = (body: object) =>
  new Request("https://cue.test/api/integrations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const x = {
  action: "x",
  username: "testbrand",
  userId: "100",
  bearerToken: "unit-test-read-token-123456789",
  enabled: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.operator.mockResolvedValue({ role: "owner" });
  mocks.read.mockResolvedValue({ apps: [], coding: [] });
  mocks.pack.mockImplementation(async (appId) =>
    appId === "alias"
      ? { appId: "app-a", status: "active" }
      : appId === "app-a"
        ? { appId, status: "active" }
        : { appId, status: "suspended" },
  );
  mocks.checkEmail.mockResolvedValue({ ok: true });
});
test("pausing collection remains possible after its application is suspended", async () => {
  expect(
    (await POST(request({ ...x, appId: "suspended", enabled: false }))).status,
  ).toBe(200);
  expect(mocks.credits).not.toHaveBeenCalled();
  expect(mocks.brand).not.toHaveBeenCalled();
});
test("reply tokens survive a blank save, require the correct brand and stay out of status responses", async () => {
  const userAccessToken = "unit-test-private-user-token-123456789";
  mocks.read.mockResolvedValue({
    apps: [],
    x: {
      ...x,
      action: undefined,
      appId: "app-a",
      userAccessToken,
      startedAt: 1,
    },
  });
  expect(
    (await POST(request({ ...x, appId: "app-a", userAccessToken: "" }))).status,
  ).toBe(200);
  expect(mocks.userConfig).toHaveBeenCalledWith(
    expect.objectContaining({ userAccessToken }),
  );
  expect(mocks.userBrand).toHaveBeenCalledWith({
    brandUserId: x.userId,
    brandUsername: x.username,
  });
  const status = await (
    await GET(new Request("https://cue.test/api/integrations"))
  ).text();
  expect(status).toContain('"replyConfigured":true');
  expect(status).not.toContain(userAccessToken);
  expect(status).not.toContain(x.bearerToken);
  mocks.saved.mockClear();
  mocks.userBrand.mockRejectedValueOnce(new Error("Wrong brand"));
  expect((await POST(request({ ...x, appId: "app-a" }))).status).toBe(400);
  expect(mocks.saved).not.toHaveBeenCalled();
});
test("enabled native collection requires an active app before any provider request", async () => {
  expect((await POST(request(x))).status).toBe(400);
  expect((await POST(request({ ...x, appId: "suspended" }))).status).toBe(400);
  expect(mocks.credits).not.toHaveBeenCalled();
  expect(mocks.brand).not.toHaveBeenCalled();
  expect(mocks.saved).not.toHaveBeenCalled();
});
test("a configured alias is stored as canonical app identity for intake", async () => {
  expect((await POST(request({ ...x, appId: "alias" }))).status).toBe(200);
  expect(mocks.saved).toHaveBeenCalledWith(
    expect.objectContaining({
      x: expect.objectContaining({ appId: "app-a", userId: "100" }),
    }),
  );
  expect(mocks.brand).toHaveBeenCalledTimes(1);
});
test("email routes require the same active app boundary and canonicalize aliases", async () => {
  const email = {
    action: "email",
    apiKey: "re_test_only",
    from: "support@example.test",
  };
  expect((await POST(request(email))).status).toBe(400);
  expect(mocks.checkEmail).not.toHaveBeenCalled();
  expect((await POST(request({ ...email, appId: "alias" }))).status).toBe(200);
  expect(mocks.saved).toHaveBeenCalledWith(
    expect.objectContaining({
      email: expect.objectContaining({ appId: "app-a" }),
    }),
  );
});
test("support roles cannot change native provider routing", async () => {
  mocks.operator.mockResolvedValue({ role: "support" });
  expect((await POST(request({ ...x, appId: "app-a" }))).status).toBe(401);
  expect(mocks.saved).not.toHaveBeenCalled();
});
