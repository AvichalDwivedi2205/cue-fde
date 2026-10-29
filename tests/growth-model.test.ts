import { afterEach, beforeEach, expect, test, vi } from "vitest";
const { generate, completion, configure } = vi.hoisted(() => ({
  generate: vi.fn(),
  completion: vi.fn(),
  configure: vi.fn(),
}));
vi.mock("../lib/gemini", () => ({
  client: () => ({ models: { generateContent: generate } }),
}));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: completion } };
  },
}));
vi.mock("neatlogs", async (original) => ({
  ...(await original<object>()),
  wrapOpenAI: (sdk: unknown) => sdk,
}));
vi.mock("../lib/model-config", async (original) => ({
  ...(await original<object>()),
  configuredGrowthModel: configure,
}));
import {
  draftGrowth,
  generateGrowthDraft,
  qualifyGrowth,
} from "../lib/growth-model";
import { DEFAULT_BRAND } from "../lib/company-context-policy";
import type { Id } from "../convex/_generated/dataModel";
const link = "https://cue.test/g/opaque";
const claims = ["Find saved memories using all words in a caption query"];
beforeEach(() => {
  vi.resetAllMocks();
  configure.mockResolvedValue("gemini-2.5-flash");
  vi.stubEnv("LITELLM_API_KEY", "test-key");
});
afterEach(() => vi.unstubAllEnvs());
test("unsupported qualification retains the actual request when the model copies a capability need", async () => {
  const source =
    "Anyone recommend a photo journal app that exports memories with photos and captions into a PDF?";
  generate.mockResolvedValue({
    text: JSON.stringify({
      need: "Find older memories by caption",
      matched: true,
      eligible: true,
      fit: "High",
      reasons: ["Caption capability matches"],
    }),
  });
  expect(await qualifyGrowth(source, { claims })).toMatchObject({
    need: source,
    matched: false,
    eligible: false,
    reasons: [
      "Unsupported need: no verified export, sync or collaboration capability",
    ],
  });
});
test.each([
  "Cue finds saved caption words: ",
  "Bloom finds captions using any query word: ",
  "Bloom supports collaborative albums: ",
  "Bloom syncs captions across phones: ",
])("rejects unverified model wording: %s", async (wording) => {
  generate.mockResolvedValue({ text: wording + link });
  await expect(
    draftGrowth("Find saved captions", claims, link, "Bloom"),
  ).rejects.toThrow("supported-claim policy");
});
test.each([`${link} ${link}`, `${link} https://unrelated.test`])(
  "rejects duplicate or additional destinations",
  async (urls) => {
    generate.mockResolvedValue({ text: "Find saved captions: " + urls });
    await expect(
      draftGrowth("Find saved captions", claims, link, "Bloom"),
    ).rejects.toThrow("supported-claim policy");
  },
);
test("passes the actual product name and preserves all-word search", async () => {
  const text = "Bloom finds saved captions using all query words: " + link;
  generate.mockResolvedValue({ text });
  expect(await draftGrowth("Find saved captions", claims, link, "Bloom")).toBe(
    text,
  );
  expect(JSON.parse(generate.mock.calls[0][0].contents).productName).toBe(
    "Bloom",
  );
});
test("selected Claude route uses the same verified context and records actual token usage", async () => {
  const text = "Bloom finds saved captions using all query words: " + link;
  completion.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ reply: text }) } }],
    usage: { prompt_tokens: 421, completion_tokens: 39 },
  });
  const context = {
    brand: {
      ...DEFAULT_BRAND,
      enabled: true,
      guidelines: "Warm plain language",
    },
    hits: [
      {
        _id: "passage" as Id<"knowledgeChunks">,
        sourceId: "source" as Id<"knowledgeSources">,
        versionId: "version" as Id<"knowledgeVersions">,
        title: "Caption search",
        text: claims[0],
        heading: "Search",
      },
    ],
  };
  const result = await generateGrowthDraft(
    "Find saved captions",
    claims,
    link,
    "Bloom",
    context,
    { model: "claude-sonnet-4.6" },
  );
  expect(result).toMatchObject({
    text,
    generation: {
      provider: "litellm",
      model: "claude-sonnet-4.6",
      inputTokens: 421,
      outputTokens: 39,
    },
  });
  expect(result.generation).not.toHaveProperty("fallbackFrom");
  const call = completion.mock.calls[0][0];
  expect(call.model).toBe("claude-sonnet-4.6");
  expect(JSON.parse(call.messages[1].content)).toMatchObject({
    source: "Find saved captions",
    claims,
    link,
    productName: "Bloom",
    groundingDocuments: [
      { id: "passage", title: "Caption search", passage: claims[0] },
    ],
    brandStyle: { guidelines: "Warm plain language" },
  });
  expect(call.messages[0].content).toContain("never a source of product facts");
  expect(generate).not.toHaveBeenCalled();
});
test("a real campaign-length link leaves an explicit prose budget for Sonnet", async () => {
  const campaignLink =
    "https://cue.latchgrid.in/g/vyUbtPHkMCdPN0phxEyXCrfNt-dAzOaL.e84cf674cc774c0129d40e8650350be68ac41a7e5e2dee688aa16bc50dd91337";
  const text =
    "Bloom finds memories using all words in your caption query. " +
    campaignLink;
  completion.mockResolvedValue({
    choices: [{ message: { content: JSON.stringify({ reply: text }) } }],
  });
  const result = await generateGrowthDraft(
    "Anyone recommend a photo journal where I can find memories by words in captions?",
    claims,
    campaignLink,
    "Bloom",
    undefined,
    { model: "claude-sonnet-4.6" },
  );
  const call = completion.mock.calls[0][0];
  const budget = 280 - campaignLink.length - 1;
  expect(call.messages[0].content).toContain(
    `Prose before the link must be at most ${budget} characters`,
  );
  expect(call.messages[0].content).toContain(
    "Aim for 100 characters of prose or fewer",
  );
  expect(result.text).toBe(text);
  expect(result.text.length).toBeLessThanOrEqual(280);
});
test("a campaign URL leaving no room for a grounded reply fails before spending model tokens", async () => {
  const oversizedLink = "https://cue.test/g/" + "a".repeat(240);
  await expect(
    generateGrowthDraft(
      "Find saved captions",
      claims,
      oversizedLink,
      "Bloom",
      undefined,
      {
        model: "claude-sonnet-4.6",
      },
    ),
  ).rejects.toThrow(
    "Campaign link leaves insufficient space for a grounded reply",
  );
  expect(completion).not.toHaveBeenCalled();
  expect(generate).not.toHaveBeenCalled();
});
test.each([
  "not JSON",
  JSON.stringify({ reply: "Bloom syncs captions: " + link }),
  JSON.stringify({ reply: "Bloom finds captions: " + link, extra: "ignored" }),
  JSON.stringify({ reply: "x".repeat(281) }),
])(
  "invalid Claude output remains blocked without another model: %s",
  async (content) => {
    completion.mockResolvedValue({ choices: [{ message: { content } }] });
    await expect(
      generateGrowthDraft(
        "Find saved captions",
        claims,
        link,
        "Bloom",
        undefined,
        { model: "claude-sonnet-4.6" },
      ),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  },
);
test("a LiteLLM overload falls back to Gemini with identical facts and honest provider metadata", async () => {
  completion.mockRejectedValue({ status: 503 });
  const text = "Bloom finds saved captions using all query words: " + link;
  generate.mockResolvedValue({
    text,
    usageMetadata: { promptTokenCount: 512, candidatesTokenCount: 32 },
  });
  const result = await generateGrowthDraft(
    "Find saved captions",
    claims,
    link,
    "Bloom",
    undefined,
    { model: "claude-sonnet-4.6" },
  );
  expect(generate.mock.calls[0][0].contents).toBe(
    completion.mock.calls[0][0].messages[1].content,
  );
  expect(result.generation).toMatchObject({
    provider: "google",
    model: "gemini-2.5-flash",
    fallbackFrom: "claude-sonnet-4.6",
    inputTokens: 512,
    outputTokens: 32,
  });
});
test.each([400, 401, 403])(
  "configuration error %i does not switch models",
  async (status) => {
    completion.mockRejectedValue({ status });
    await expect(
      generateGrowthDraft(
        "Find saved captions",
        claims,
        link,
        "Bloom",
        undefined,
        { model: "claude-sonnet-4.6" },
      ),
    ).rejects.toMatchObject({ status });
    expect(generate).not.toHaveBeenCalled();
  },
);
