/// <reference types="vite/client" />
import { test, expect, vi, afterEach } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.{ts,js}"),
  auth = { secret: "app-packs-test-secret" };

afterEach(() => vi.unstubAllEnvs());

function t2() {
  vi.stubEnv("CUE_DEMO_SECRET", auth.secret);
  return convexTest(schema, modules);
}

test("register mints unique appIds and validates input", async () => {
  const t = t2();
  const a = await t.mutation(api.appPacks.register, {
    ...auth,
    name: "Lumen",
    origins: ["https://lumen.example.com/"],
  });
  const b = await t.mutation(api.appPacks.register, {
    ...auth,
    name: "Other",
    origins: ["https://other.example.com"],
  });
  expect(a.appId).toMatch(/^cue_app_[0-9a-f]{24}$/);
  expect(b.appId).not.toEqual(a.appId);
  await expect(
    t.mutation(api.appPacks.register, {
      ...auth,
      name: "Bad",
      origins: ["https://lumen.example.com/path"],
    }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.appPacks.register, { ...auth, name: "  ", origins: ["https://x.example.com"] }),
  ).rejects.toThrow();
});

test("activate requires a delivered case first (install check)", async () => {
  const t = t2();
  const { appId } = await t.mutation(api.appPacks.register, {
    ...auth,
    name: "Lumen",
    origins: ["https://lumen.example.com"],
  });
  await expect(
    t.mutation(api.appPacks.activate, { ...auth, appId }),
  ).rejects.toThrow(/widget/i);
  await expect(
    t.mutation(api.appPacks.recordInstallCheck, { ...auth, appId }),
  ).rejects.toThrow(/No case/);
  await t.run((ctx) =>
    ctx.db.insert("cases", {
      title: "t",
      customer: "c",
      initials: "c",
      channel: "widget",
      appId,
      body: "hello",
      status: "open",
      priority: "P3",
      tags: [],
      provenance: "test",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await t.mutation(api.appPacks.recordInstallCheck, { ...auth, appId });
  await t.mutation(api.appPacks.activate, { ...auth, appId });
  const packs = await t.query(api.appPacks.list, auth);
  expect(packs.find((p: { appId: string }) => p.appId === appId)?.status).toBe(
    "active",
  );
});

test("suspend is idempotent; suspended reactivates; activate refuses suspended", async () => {
  const t = t2();
  const { appId } = await t.mutation(api.appPacks.register, {
    ...auth,
    name: "Lumen",
    origins: ["https://lumen.example.com"],
  });
  await t.run((ctx) =>
    ctx.db.insert("cases", {
      title: "t",
      customer: "c",
      initials: "c",
      channel: "widget",
      appId,
      body: "hello",
      status: "open",
      priority: "P3",
      tags: [],
      provenance: "test",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
  await t.mutation(api.appPacks.recordInstallCheck, { ...auth, appId });
  await t.mutation(api.appPacks.activate, { ...auth, appId });
  await t.mutation(api.appPacks.suspend, { ...auth, appId });
  await t.mutation(api.appPacks.suspend, { ...auth, appId });
  await expect(
    t.mutation(api.appPacks.activate, { ...auth, appId }),
  ).rejects.toThrow(/reactivate/i);
  await t.mutation(api.appPacks.reactivate, { ...auth, appId });
  await t.mutation(api.appPacks.reactivate, { ...auth, appId });
  const packs = await t.query(api.appPacks.list, auth);
  expect(packs.find((p: { appId: string }) => p.appId === appId)?.status).toBe(
    "active",
  );
});

test("bindEngineering validates through the shared coding rules", async () => {
  const t = t2();
  const { appId } = await t.mutation(api.appPacks.register, {
    ...auth,
    name: "Lumen",
    origins: ["https://lumen.example.com"],
  });
  await t.mutation(api.appPacks.bindEngineering, {
    ...auth,
    appId,
    repository: "acme/lumen",
    baseBranch: "main",
    allowedPaths: ["lib/"],
    testCommands: [{ program: "node", args: ["test.mjs"] }],
  });
  await expect(
    t.mutation(api.appPacks.bindEngineering, {
      ...auth,
      appId,
      repository: "not a repo",
      baseBranch: "main",
      allowedPaths: ["lib/"],
      testCommands: [{ program: "node", args: ["test.mjs"] }],
    }),
  ).rejects.toThrow();
  await expect(
    t.mutation(api.appPacks.bindEngineering, {
      ...auth,
      appId,
      repository: "acme/lumen",
      baseBranch: "main",
      allowedPaths: ["../etc"],
      testCommands: [{ program: "node", args: ["test.mjs"] }],
    }),
  ).rejects.toThrow();
  const packs = await t.query(api.appPacks.list, auth);
  const pack = packs.find((p: { appId: string }) => p.appId === appId);
  expect(pack?.engineering?.repository).toBe("acme/lumen");
});

test("ensure upserts by appId without minting (backfill path)", async () => {
  const t = t2();
  await t.mutation(api.appPacks.ensure, {
    ...auth,
    appId: "cue_app_5625fca3e391d92460528d8d",
    name: "Bloom",
    origins: ["https://bloom-with-cue.vercel.app"],
    status: "active",
  });
  await t.mutation(api.appPacks.ensure, {
    ...auth,
    appId: "cue_app_5625fca3e391d92460528d8d",
    name: "Bloom",
    origins: ["https://bloom-with-cue.vercel.app"],
    status: "active",
    engineering: {
      repository: "AvichalDwivedi2205/cue-bloom-demo",
      baseBranch: "main",
      allowedPaths: ["limits.mjs"],
      testCommands: [{ program: "node", args: ["test.mjs"] }],
    },
  });
  const packs = await t.query(api.appPacks.list, auth);
  const bloom = packs.filter(
    (p: { appId: string }) => p.appId === "cue_app_5625fca3e391d92460528d8d",
  );
  expect(bloom).toHaveLength(1);
  expect(bloom[0].status).toBe("active");
  expect(bloom[0].engineering?.repository).toBe(
    "AvichalDwivedi2205/cue-bloom-demo",
  );
  await expect(
    t.mutation(api.appPacks.ensure, {
      ...auth,
      appId: "cue_app_5625fca3e391d92460528d8d",
      name: "Bloom",
      origins: ["https://bad.example.com/path"],
      status: "active",
    }),
  ).rejects.toThrow();
});
