import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => ({ completion: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: state.completion } };
  },
}));
vi.mock("../lib/google-client", () => ({
  client: () => {
    throw new Error("Google must not be called for Meta analysis");
  },
  geminiReady: () => true,
}));

import { analyzeSignalPosts, SignalsGenerationError } from "../lib/signals";
import { META_SPARK_MODEL } from "../lib/meta";
import type { SignalPostInput } from "../lib/signals-schema";

const posts: SignalPostInput[] = [
  { id: "p01", author: "Rhea M.", text: "We lost a board to an accidental clear-out. Any recovery path?" },
  { id: "p02", author: "Sam O.", text: "Same here — we need a way to restore cleared boards." },
  { id: "p03", author: "SpamBot", text: "Buy followers at spam.example.com" },
];
const provenance = {
  kind: "synthetic-fixture" as const,
  fixture: "quiet-signals-evaluation",
  version: "v1",
};

function metaOutput(value: unknown, model = META_SPARK_MODEL) {
  return {
    model,
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(value) } },
    ],
    usage: { prompt_tokens: 320, completion_tokens: 180 },
  };
}

const goodValue = {
  dispositions: [
    {
      postId: "p01",
      outcome: "evidence",
      clusterId: "c-recover",
      quote: "Any recovery path?",
      reason: "Direct recovery request.",
    },
    {
      postId: "p02",
      outcome: "evidence",
      clusterId: "c-recover",
      quote: "we need a way to restore cleared boards",
      reason: "Same need from another author.",
    },
    { postId: "p03", outcome: "spam", clusterId: null, quote: null, reason: "Promotional." },
  ],
  clusters: [
    {
      id: "c-recover",
      need: "Recover boards after accidental clears",
      rationale: "Two people lost work and asked for recovery.",
      sentiment: "frustrated",
      proposal: {
        title: "Board recovery window",
        assumptions: ["Retention window length is a proposal"],
        specification: {
          need: "Restore cleared boards",
          specification: "A recovery window lists and restores boards.",
          acceptanceCriteria: [
            "Cleared boards appear for their members",
            "Restore returns lists intact",
          ],
        },
      },
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CUE_AGENT_MODEL", META_SPARK_MODEL);
  vi.stubEnv("META_API_KEY", "test-key");
  vi.stubEnv("META_BASE_URL", "https://api.meta.ai/v1");
});
afterEach(() => vi.unstubAllEnvs());

describe("Spark batch analysis service", () => {
  test("one bounded call returns a validated analysis and the served-model receipt", async () => {
    state.completion.mockResolvedValueOnce(metaOutput(goodValue));
    const result = await analyzeSignalPosts({
      appName: "LatchGrid",
      provenance,
      posts,
    });
    expect(result.receipt).toMatchObject({
      provider: "meta",
      requestedModel: META_SPARK_MODEL,
      model: META_SPARK_MODEL,
      inputTokens: 320,
      outputTokens: 180,
    });
    expect(result.analysis.stats).toMatchObject({
      posts: 3,
      evidencePosts: 2,
      distinctEvidenceAuthors: 2,
      spamPosts: 1,
    });
    expect(result.analysis.clusters[0].repeatedEvidence).toBe(true);
    // The call is exactly one request; no fallback provider ever runs.
    expect(state.completion).toHaveBeenCalledTimes(1);
  });

  test("the serialized strict provider schema requires every property", async () => {
    state.completion.mockResolvedValueOnce(metaOutput(goodValue));
    await analyzeSignalPosts({ appName: "LatchGrid", provenance, posts });
    const schema = state.completion.mock.calls[0][0].response_format.json_schema.schema;
    function inspect(value: unknown): void {
      if (!value || typeof value !== "object") return;
      if ("properties" in value && value.properties && typeof value.properties === "object") {
        expect(value).toMatchObject({ additionalProperties: false });
        expect("required" in value ? value.required : []).toEqual(Object.keys(value.properties));
      }
      for (const child of Object.values(value)) {
        if (Array.isArray(child)) child.forEach(inspect);
        else inspect(child);
      }
    }
    inspect(schema);
  });

  test("nullable absent provider fields normalize before evidence validation", async () => {
    const value = {
      dispositions: goodValue.dispositions,
      clusters: goodValue.clusters.map((c) => ({ ...c, sentiment: null })),
    };
    state.completion.mockResolvedValueOnce(metaOutput(value));
    const result = await analyzeSignalPosts({ appName: "LatchGrid", provenance, posts });
    expect(result.analysis.dispositions[2]).toEqual({ postId: "p03", outcome: "spam", reason: "Promotional." });
    expect(result.analysis.clusters[0]).not.toHaveProperty("sentiment");
    expect(result.analysis.clusters[0].distinctAuthors).toBe(2);
  });

  test("an excluded post cannot smuggle evidence through nullable fields", async () => {
    const value = structuredClone(goodValue);
    value.dispositions[0].outcome = "spam";
    state.completion.mockResolvedValueOnce(metaOutput(value));
    await expect(analyzeSignalPosts({ appName: "LatchGrid", provenance, posts })).rejects.toMatchObject({
      stage: "schema", receipt: { inputTokens: 320 },
      message: expect.stringContaining("Excluded post p01 cannot reference a cluster"),
    });
  });

  test("invalid JSON fails as a paid schema-stage failure with the receipt", async () => {
    state.completion.mockReset();
    state.completion.mockResolvedValueOnce({
      model: META_SPARK_MODEL,
      choices: [
        { finish_reason: "stop", message: { content: "{not json" } },
      ],
      usage: { prompt_tokens: 320, completion_tokens: 40 },
    });
    await expect(
      analyzeSignalPosts({ appName: "LatchGrid", provenance, posts }),
    ).rejects.toMatchObject({
      name: "SignalsGenerationError",
      stage: "json",
      receipt: { inputTokens: 320 },
    });
  });

  test("a wrong served model cannot appear as successful analysis", async () => {
    state.completion.mockResolvedValueOnce(
      metaOutput(goodValue, "some-other-model"),
    );
    await expect(
      analyzeSignalPosts({ appName: "LatchGrid", provenance, posts }),
    ).rejects.toMatchObject({ name: "SignalsGenerationError" });
  });

  test("truncated output fails instead of parsing partial evidence", async () => {
    state.completion.mockResolvedValueOnce({
      model: META_SPARK_MODEL,
      choices: [
        { finish_reason: "length", message: { content: '{"dispositions":[' } },
      ],
      usage: { prompt_tokens: 320, completion_tokens: 8000 },
    });
    await expect(
      analyzeSignalPosts({ appName: "LatchGrid", provenance, posts }),
    ).rejects.toBeInstanceOf(SignalsGenerationError);
  });

  test("a relationally invalid answer keeps its receipt as a failed attempt", async () => {
    const fabricated = structuredClone(goodValue);
    fabricated.dispositions[0].quote = "words the customer never wrote";
    state.completion.mockResolvedValueOnce(metaOutput(fabricated));
    await expect(
      analyzeSignalPosts({ appName: "LatchGrid", provenance, posts }),
    ).rejects.toMatchObject({
      name: "SignalsGenerationError",
      stage: "schema",
      receipt: { outputTokens: 180 },
    });
  });

  test("an unconfigured route refuses cleanly instead of falling back", async () => {
    vi.stubEnv("CUE_AGENT_MODEL", META_SPARK_MODEL);
    vi.stubEnv("META_API_KEY", "");
    await expect(
      analyzeSignalPosts({ appName: "LatchGrid", provenance, posts }),
    ).rejects.toThrow(/Meta is not configured/);
    expect(state.completion).not.toHaveBeenCalled();
  });

  test("the prompt payload never contains a target feature name", async () => {
    state.completion.mockResolvedValueOnce(metaOutput(goodValue));
    await analyzeSignalPosts({ appName: "LatchGrid", provenance, posts });
    const body = JSON.stringify(state.completion.mock.calls[0][0]);
    expect(body.toLowerCase()).not.toContain("recently deleted");
    expect(body.toLowerCase()).not.toContain("trash bin");
    expect(body).toContain("Synthetic operator fixture");
  });
});

test("native analysis sees stable author aliases across handle changes and never receives provider IDs or source URLs", async () => {
  state.completion.mockResolvedValueOnce(metaOutput(goodValue));
  const input = posts.map((post, index) => ({ ...post, author: index ? "@newhandle" : "@oldhandle", providerAuthorId: "7358192", sourceRef: "https://x.com/privatehandle/status/123" }));
  const result = await analyzeSignalPosts({ appName: "LatchGrid", provenance: { kind: "native-x" }, posts: input });
  const payload = JSON.parse(state.completion.mock.calls[0][0].messages[1].content[0].text);
  expect(payload.posts.map((post: { author: string }) => post.author)).toEqual(["Author 1", "Author 1", "Author 1"]);
  expect(result.analysis.stats.distinctEvidenceAuthors).toBe(1);
  expect(JSON.stringify(payload)).not.toMatch(/7358192|oldhandle|newhandle|privatehandle|https:\/\//);
  expect(state.completion).toHaveBeenCalledTimes(1);
});
