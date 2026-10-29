import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";
const m = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  draft: vi.fn(),
}));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => m,
  secret: () => "trusted",
}));
vi.mock("../lib/workspace", () => ({
  workspaceApp: async () => ({
    app: {
      id: "registered-bloom",
      name: "Bloom",
      origins: ["https://bloom-with-cue.vercel.app"],
    },
    config: {},
  }),
}));
vi.mock("../lib/growth-model", () => ({
  generateGrowthDraft: m.draft,
  qualifyGrowth: vi.fn(),
}));
vi.mock("../lib/knowledge-embedding", () => ({
  embedKnowledge: async () => {
    throw new Error("provider unavailable");
  },
}));
import { processGrowth } from "../lib/growth";
import type { Id } from "../convex/_generated/dataModel";
const release = "a".repeat(40),
  link = "https://cue.test/g/current",
  name = (ref: unknown) =>
    getFunctionName(ref as Parameters<typeof getFunctionName>[0]);
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", async () =>
    Response.json({
      appId: "registered-bloom",
      release,
      captionSearch: "owned-caption-all-terms",
    }),
  );
  m.query.mockImplementation(async (ref) => {
    if (name(ref) === "growth:job")
      return {
        receipt: {
          action: "draft",
          appId: "registered-bloom",
          actor: { role: "product", name: "Product", id: "product" },
        },
        campaign: {},
        opportunity: {
          _id: "opportunity",
          text: "Anyone recommend a photo journal app to find saved captions?",
        },
        capability: {
          valid: true,
          release,
          need: "Caption search",
          claims: ["Search saved captions using all query words"],
        },
      };
    if (name(ref) === "companyContext:brand")
      return {
        enabled: true,
        label: "Bloom",
        tone: "warm",
        guidelines: "Plain words",
        examples: [],
        version: 3,
      };
    if (name(ref) === "knowledge:keyword")
      return [
        {
          _id: "passage",
          sourceId: "source",
          versionId: "version",
          title: "Caption guide",
          text: "All caption words match",
          heading: "Search",
        },
      ];
    throw new Error("Unexpected query");
  });
  m.mutation.mockImplementation(async (ref) =>
    name(ref) === "growthExecution:begin"
      ? true
      : name(ref) === "growthAttribution:prepare"
        ? { link }
        : null,
  );
  m.draft.mockResolvedValue({
    text: "Bloom searches saved captions using all query words: " + link,
    generation: {
      provider: "litellm",
      model: "claude-sonnet-4.6",
      inputTokens: 500,
      outputTokens: 40,
      durationMs: 400,
    },
  });
});
afterEach(() => vi.unstubAllGlobals());
test("guarded Growth job retrieves its app's public knowledge and commits the exact voice and source receipt", async () => {
  await processGrowth("receipt" as Id<"growthReceipts">);
  expect(
    m.query.mock.calls.find((c) => name(c[0]) === "knowledge:keyword")?.[1],
  ).toMatchObject({
    appId: "registered-bloom",
    audience: "customer",
    workspaceId: "cue-configured-workspace",
  });
  expect(m.draft.mock.calls[0][4]).toMatchObject({
    hits: [{ _id: "passage" }],
    brand: { version: 3 },
  });
  const commit = m.mutation.mock.calls.find(
    (c) => name(c[0]) === "growthExecution:commitDraft",
  )?.[1];
  expect(commit).toMatchObject({
    release,
    text: "Bloom searches saved captions using all query words: " + link,
    grounding: {
      workspaceId: "cue-configured-workspace",
      chunkIds: ["passage"],
      brandVersion: 3,
      retrieval: "keyword-fallback",
    },
    generation: {
      provider: "litellm",
      model: "claude-sonnet-4.6",
      inputTokens: 500,
      outputTokens: 40,
      durationMs: 400,
    },
  });
  expect(commit.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(
    m.mutation.mock.calls.some((c) => /report|verify$/.test(name(c[0]))),
  ).toBe(false);
});
test("unavailable public context fails the work and preserves the attempt without an ungrounded draft", async () => {
  const implementation = m.query.getMockImplementation()!;
  m.query.mockImplementation(async (ref) => {
    if (name(ref) === "knowledge:keyword")
      throw new Error("storage unavailable");
    return implementation(ref);
  });
  await expect(
    processGrowth("receipt" as Id<"growthReceipts">),
  ).rejects.toThrow("attempt retained");
  expect(m.draft).not.toHaveBeenCalled();
  expect(
    m.mutation.mock.calls.some(
      (c) => name(c[0]) === "growthExecution:commitDraft",
    ),
  ).toBe(false);
  expect(
    m.mutation.mock.calls.find(
      (c) => name(c[0]) === "growthExecution:finish",
    )?.[1].ok,
  ).toBe(false);
});
