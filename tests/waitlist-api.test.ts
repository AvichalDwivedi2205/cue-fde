import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({ mutation: vi.fn() }));
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => mocks,
  secret: () => "private-server-secret",
}));
import { POST } from "../app/api/waitlist/route";
const request = (body: unknown, origin = "https://cue.test") =>
  new Request("https://cue.test/api/waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "cue.test",
      origin,
      "x-forwarded-for": "192.0.2.10",
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.mutation.mockResolvedValue({ status: "ok" });
});
test("anonymous signup reaches Convex with normalized email and a server-derived opaque rate key", async () => {
  const response = await POST(request({ email: " Owner@Example.com " }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(mocks.mutation).toHaveBeenCalledOnce();
  expect(mocks.mutation.mock.calls[0][1]).toEqual({
    email: "owner@example.com",
    secret: "private-server-secret",
    clientKey: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
});
test("cross-origin, invalid, oversized and client-supplied identity fields never write to Convex", async () => {
  expect(
    (await POST(request({ email: "owner@example.com" }, "https://other.test")))
      .status,
  ).toBe(403);
  expect((await POST(request({ email: "bad" }))).status).toBe(400);
  expect(
    (await POST(request({ email: "owner@example.com", secret: "forged" })))
      .status,
  ).toBe(400);
  expect(
    (
      await POST(
        request({ email: "owner@example.com", website: "x".repeat(3000) }),
      )
    ).status,
  ).toBe(413);
  expect(mocks.mutation).not.toHaveBeenCalled();
});
test("honeypot submissions do not store junk addresses", async () => {
  expect(
    (await POST(request({ email: "bot@example.com", website: "bot" }))).status,
  ).toBe(200);
  expect(mocks.mutation).not.toHaveBeenCalled();
});
test("storage failures and rate limits are explicit and never return signup success", async () => {
  mocks.mutation.mockRejectedValueOnce(
    new Error("Private database error with secret"),
  );
  const failed = await POST(request({ email: "owner@example.com" }));
  expect(failed.status).toBe(503);
  expect(await failed.json()).toEqual({
    error: "We couldn't save your email. Please try again.",
  });
  mocks.mutation.mockResolvedValueOnce({
    status: "rate_limited",
    retryAfterMs: 1200,
  });
  const limited = await POST(request({ email: "owner@example.com" }));
  expect(limited.status).toBe(429);
  expect(limited.headers.get("retry-after")).toBe("2");
});
