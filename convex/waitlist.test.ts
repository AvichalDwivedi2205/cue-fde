/// <reference types="vite/client" />
// @vitest-environment edge-runtime
import { convexTest } from "convex-test";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts"]);
const args = {
  secret: "test-secret",
  clientKey: "a".repeat(64),
  email: "Owner@Example.com",
};
const instance = () => {
  const t = convexTest(schema, modules);
  rateLimiter.register(t);
  return t;
};
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", "test-secret"));
afterEach(() => vi.unstubAllEnvs());
test("concurrent, repeated and case-varied signups store one normalized address", async () => {
  const t = instance();
  expect(
    await Promise.all([
      t.mutation(api.waitlist.join, args),
      t.mutation(api.waitlist.join, { ...args, email: " owner@example.com " }),
    ]),
  ).toEqual([{ status: "ok" }, { status: "ok" }]);
  const entries = await t.run((ctx) =>
    ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", "owner@example.com"))
      .take(2),
  );
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({
    email: "owner@example.com",
    source: "cue-waitlist",
  });
});
test("unauthorized and invalid signups cannot write waitlist data", async () => {
  const t = instance();
  await expect(
    t.mutation(api.waitlist.join, { ...args, secret: "wrong" }),
  ).rejects.toThrow("Unauthorized");
  await expect(
    t.mutation(api.waitlist.join, { ...args, email: "not-an-email" }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.waitlist.join, { ...args, clientKey: "client-supplied-ip" }),
  ).rejects.toThrow("Invalid signup");
  expect(await t.run((ctx) => ctx.db.query("waitlist").take(1))).toEqual([]);
});
test("signup bursts are limited without dropping earlier saved addresses", async () => {
  const t = instance();
  for (let i = 0; i < 10; i++)
    expect(
      await t.mutation(api.waitlist.join, {
        ...args,
        email: `person${i}@example.com`,
      }),
    ).toEqual({ status: "ok" });
  const result = await t.mutation(api.waitlist.join, {
    ...args,
    email: "person10@example.com",
  });
  expect(result.status).toBe("rate_limited");
  expect(await t.run((ctx) => ctx.db.query("waitlist").take(11))).toHaveLength(
    10,
  );
});
