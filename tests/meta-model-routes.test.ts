import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { getFunctionName } from "convex/server";

const state = vi.hoisted(() => {
  const hits: Array<Record<string, unknown>> = [];
  return { query: vi.fn(), completion: vi.fn(), google: vi.fn(), hits };
});
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => ({ query: state.query }),
  secret: () => "isolated-secret",
}));
vi.mock("../lib/integration-config", () => ({
  readIntegrations: async () => ({
    workspace: {
      supportModel: "muse-spark-1.3",
      growthModel: "muse-spark-1.3",
    },
  }),
}));
vi.mock("../lib/google-client", () => ({
  client: () => ({ models: { generateContent: state.google } }),
  geminiReady: () => true,
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: state.completion } };
  },
}));

import { answerKnowledge } from "../lib/knowledge-answer";
import {
  classifyReport,
  classifyReportWithGeneration,
  generateReply,
  generateSpec,
} from "../lib/gemini";
import { generateGrowthDraft, qualifyGrowth } from "../lib/growth-model";
import { DEFAULT_BRAND } from "../lib/company-context-policy";
import { META_SPARK_MODEL } from "../lib/meta";

const hit = {
  _id: "chunk-1",
  sourceId: "source-1",
  versionId: "version-1",
  title: "Caption search",
  heading: "Search",
  text: "Search captions using all query words.",
};
function output(value: unknown) {
  return {
    model: META_SPARK_MODEL,
    choices: [
      { finish_reason: "stop", message: { content: JSON.stringify(value) } },
    ],
    usage: { prompt_tokens: 101, completion_tokens: 31 },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_API_KEY", "isolated-meta-key");
  vi.stubEnv("CUE_AGENT_MODEL", META_SPARK_MODEL);
  state.hits = [];
  state.query.mockImplementation(
    async (ref: Parameters<typeof getFunctionName>[0]) =>
      getFunctionName(ref) === "companyContext:brand"
        ? { ...DEFAULT_BRAND, version: 1 }
        : state.hits,
  );
});
afterEach(() => vi.unstubAllEnvs());

test.each([
  "The caption edit disappears after refresh. What should I check?",
  "Is the fix released?",
])(
  "selected Meta route covers diagnostic/status branch: %s",
  async (message) => {
    const text = message.startsWith("Is")
      ? "There is no verified release yet. Your report is saved."
      : "Do changes to the memory title stay saved after a refresh?";
    state.completion.mockResolvedValue(output({ text }));
    const answer = await answerKnowledge(
      "app-1",
      { message, appName: "Example", channel: "chat" },
      { mode: "keyword" },
    );
    expect(answer).toMatchObject({
      text,
      provider: "meta",
      model: META_SPARK_MODEL,
      inputTokens: 101,
      outputTokens: 31,
    });
    expect(state.google).not.toHaveBeenCalled();
    expect(state.completion.mock.calls[0][0].model).toBe(META_SPARK_MODEL);
  },
);

test("Meta corrections keep the same provider and include both attempts in usage", async () => {
  state.completion.mockResolvedValueOnce(
    output({ text: "The fix is live. Your issue is resolved." }),
  );
  state.completion.mockResolvedValueOnce(
    output({ text: "There is no verified release yet. Your report is saved." }),
  );
  const answer = await answerKnowledge(
    "app-1",
    { message: "Is the fix released?", channel: "chat" },
    { mode: "keyword" },
  );
  expect(answer).toMatchObject({
    provider: "meta",
    inputTokens: 202,
    outputTokens: 62,
  });
  expect(state.completion).toHaveBeenCalledTimes(2);
  expect(state.google).not.toHaveBeenCalled();
});

test("a truncated correction retains both paid Meta attempts", async () => {
  state.completion.mockResolvedValueOnce(
    output({ text: "The fix is live. Your issue is resolved." }),
  );
  state.completion.mockResolvedValueOnce({
    model: META_SPARK_MODEL,
    choices: [{ finish_reason: "length", message: { content: null } }],
    usage: { prompt_tokens: 64, completion_tokens: 1000 },
  });
  await expect(
    generateReply({ message: "Is the fix released?", channel: "chat" }),
  ).rejects.toMatchObject({
    stage: "completion",
    generation: {
      provider: "meta",
      model: META_SPARK_MODEL,
      inputTokens: 165,
      outputTokens: 1031,
    },
  });
  expect(state.completion).toHaveBeenCalledTimes(2);
  expect(state.google).not.toHaveBeenCalled();
});

test("a later transport failure preserves the first measured attempt in the saved review response", async () => {
  state.completion.mockResolvedValueOnce(
    output({ text: "The fix is live. Your issue is resolved." }),
  );
  state.completion.mockRejectedValueOnce({ status: 503 });
  expect(
    await answerKnowledge(
      "app-1",
      { message: "Is the fix released?", channel: "chat" },
      { mode: "keyword" },
    ),
  ).toMatchObject({
    status: "needs_review",
    provider: "meta",
    model: META_SPARK_MODEL,
    inputTokens: 101,
    outputTokens: 31,
  });
  expect(state.completion).toHaveBeenCalledTimes(2);
  expect(state.google).not.toHaveBeenCalled();
});

test("Meta grounded answers retain citations and image content", async () => {
  state.hits = [hit];
  state.completion.mockResolvedValue(
    output({
      status: "answered",
      answer: "Search captions using all query words.",
      citations: ["chunk-1"],
    }),
  );
  const answer = await answerKnowledge(
    "app-1",
    { message: "How can I find a saved caption?" },
    { mode: "keyword", images: [{ mimeType: "image/png", data: "aGVsbG8=" }] },
  );
  expect(answer).toMatchObject({
    status: "answered",
    citedIds: ["chunk-1"],
    provider: "meta",
    inputTokens: 101,
  });
  expect(state.completion.mock.calls[0][0].messages[1].content[1].type).toBe(
    "image_url",
  );
  expect(state.google).not.toHaveBeenCalled();
});

test("rejected Meta citations retain actual usage and never ask a different provider", async () => {
  state.hits = [hit];
  state.completion.mockResolvedValue(
    output({
      status: "answered",
      answer: "Invented",
      citations: ["foreign-chunk"],
    }),
  );
  const answer = await answerKnowledge(
    "app-1",
    { message: "How can I find a saved caption?" },
    { mode: "keyword" },
  );
  expect(answer).toMatchObject({
    status: "needs_review",
    provider: "meta",
    model: META_SPARK_MODEL,
    inputTokens: 101,
    outputTokens: 31,
  });
  expect(state.completion).toHaveBeenCalledTimes(1);
  expect(state.google).not.toHaveBeenCalled();
});

test("rejected Meta schema retains actual usage and never falls back", async () => {
  state.hits = [hit];
  state.completion.mockResolvedValue(
    output({
      status: "answered",
      answer: "Invented",
      citations: ["chunk-1"],
      extra: true,
    }),
  );
  expect(
    await answerKnowledge(
      "app-1",
      { message: "How can I search?" },
      { mode: "keyword" },
    ),
  ).toMatchObject({
    status: "needs_review",
    inputTokens: 101,
    outputTokens: 31,
  });
  expect(state.completion).toHaveBeenCalledTimes(1);
  expect(state.google).not.toHaveBeenCalled();
});

test("approved FAQs and missing product evidence do not masquerade as Meta generation", async () => {
  state.hits = [
    { ...hit, question: "How can I search?", answer: "Use all caption words." },
  ];
  expect(
    await answerKnowledge(
      "app-1",
      { message: "How can I search?" },
      { mode: "keyword" },
    ),
  ).toMatchObject({ provider: "approved-faq", model: "none", inputTokens: 0 });
  state.hits = [];
  expect(
    await answerKnowledge(
      "app-1",
      { message: "What is the enterprise price?" },
      { mode: "keyword" },
    ),
  ).toMatchObject({ provider: "none", status: "needs_review" });
  expect(state.completion).not.toHaveBeenCalled();
  expect(state.google).not.toHaveBeenCalled();
});

test("a screenshot bypasses text-only FAQ and missing-evidence shortcuts", async () => {
  const images = [{ mimeType: "image/png" as const, data: "aGVsbG8=" }];
  state.completion.mockResolvedValue(
    output({ text: "What happens immediately after you save the change?" }),
  );
  expect(
    await answerKnowledge(
      "app-1",
      { message: "Please inspect this screenshot.", channel: "chat" },
      { mode: "keyword", images },
    ),
  ).toMatchObject({ provider: "meta", inputTokens: 101 });
  state.hits = [
    { ...hit, question: "How can I search?", answer: "Use all caption words." },
  ];
  state.completion.mockResolvedValue(
    output({
      status: "answered",
      answer: "Search captions using all query words.",
      citations: ["chunk-1"],
    }),
  );
  expect(
    await answerKnowledge(
      "app-1",
      { message: "How can I search?" },
      { mode: "keyword", images },
    ),
  ).toMatchObject({ provider: "meta" });
  expect(state.completion).toHaveBeenCalledTimes(2);
  expect(state.google).not.toHaveBeenCalled();
});

test("Meta classification and specification preserve their strict public shapes", async () => {
  const classification = {
    kind: "bug",
    priority: "P2",
    tags: ["caption"],
    matchedIssueId: null,
    confidence: 0.8,
    reason: "Caption changes revert.",
  };
  state.completion.mockResolvedValueOnce(output(classification));
  expect(
    await classifyReport({
      report: { body: "Caption edit disappears" },
      candidates: [],
    }),
  ).toEqual(classification);
  const spec = {
    need: "Persistent captions",
    specification: "Save edits.",
    acceptanceCriteria: [
      "Changes survive reload",
      "Other memories stay private",
    ],
  };
  state.completion.mockResolvedValueOnce(output(spec));
  expect(
    await generateSpec({ issue: { title: "Persistent captions" } }),
  ).toEqual(spec);
  expect(state.google).not.toHaveBeenCalled();
});

test("the result-bearing classifier exposes actual model usage while the legacy classifier remains value-only", async () => {
  const classification = {
    kind: "bug",
    priority: "P2",
    tags: ["caption"],
    matchedIssueId: null,
    confidence: 0.8,
    reason: "Caption changes revert.",
  };
  state.completion.mockResolvedValue(output(classification));
  const context = {
    report: { body: "Caption edit disappears" },
    candidates: [],
  };
  expect(await classifyReportWithGeneration(context)).toMatchObject({
    result: classification,
    generation: {
      provider: "meta",
      model: META_SPARK_MODEL,
      requestedModel: META_SPARK_MODEL,
      inputTokens: 101,
      outputTokens: 31,
    },
  });
  expect(await classifyReport(context)).toEqual(classification);
});

test("Meta Growth qualification and writing preserve constraints and report the actual provider", async () => {
  state.completion.mockResolvedValueOnce(
    output({
      need: "Caption search",
      eligible: true,
      matched: true,
      fit: "High",
      reasons: ["Explicit request"],
    }),
  );
  expect(
    await qualifyGrowth(
      "Anyone recommend a photo journal with caption search?",
      {},
    ),
  ).toMatchObject({ eligible: true });
  const link = "https://example.test/g/current";
  const reply = "Example finds captions using all query words: " + link;
  state.completion.mockResolvedValueOnce(output({ reply }));
  expect(
    await generateGrowthDraft(
      "Anyone recommend caption search?",
      ["Find captions using all query words"],
      link,
      "Example",
    ),
  ).toMatchObject({
    text: reply,
    generation: {
      provider: "meta",
      model: META_SPARK_MODEL,
      reportedModel: META_SPARK_MODEL,
      inputTokens: 101,
      outputTokens: 31,
    },
  });
  state.completion.mockRejectedValue({ status: 503 });
  await expect(
    generateGrowthDraft(
      "Anyone recommend caption search?",
      ["Find captions using all query words"],
      link,
      "Example",
    ),
  ).rejects.toEqual({ status: 503 });
  expect(state.google).not.toHaveBeenCalled();
});
