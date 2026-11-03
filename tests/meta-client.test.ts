import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { z } from "zod";

const google = vi.hoisted(() => vi.fn());
vi.mock("../lib/google-client", () => ({
  client: () => ({ models: { generateContent: google } }),
  geminiReady: () => true,
}));

import { generateObject, generateText } from "../lib/model-generation";
import {
  getMetaConnection,
  META_SPARK_MODEL,
  META_WONDER_MODEL,
} from "../lib/meta";
import { redactTelemetry } from "../lib/observability";

const fetcher = vi.fn<typeof fetch>();
const schema = z.object({ answer: z.string().min(1).max(100) }).strict();
const request = {
  route: { kind: "meta", model: META_SPARK_MODEL },
  system: "Answer using the supplied evidence.",
  payload: { fact: "Caption changes persist." },
  schema,
  maxOutputTokens: 100,
  temperature: 0,
} satisfies Parameters<typeof generateObject>[0];
function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: "meta-response-1",
    model: META_SPARK_MODEL,
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: '{"answer":"Saved"}' },
      },
    ],
    usage: { prompt_tokens: 42, completion_tokens: 9 },
    ...overrides,
  };
}
function respond(body: unknown = wire(), status = 200) {
  fetcher.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "content-type": "application/json",
        "x-request-id": "meta-request-1",
      },
    }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("META_API_KEY", "unit-meta-key-never-exported");
  vi.stubEnv("META_BASE_URL", "https://api.meta.ai/v1");
  vi.stubGlobal("fetch", fetcher);
  respond();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("real SDK request sends a strict schema and returns reported Meta identity and usage", async () => {
  const result = await generateObject(request);
  expect(result).toMatchObject({
    value: { answer: "Saved" },
    generation: {
      provider: "meta",
      model: META_SPARK_MODEL,
      requestedModel: META_SPARK_MODEL,
      inputTokens: 42,
      outputTokens: 9,
      requestId: "meta-request-1",
    },
  });
  expect(result.generation.durationMs).toBeGreaterThanOrEqual(0);
  const [url, init] = fetcher.mock.calls[0];
  expect(String(url)).toBe("https://api.meta.ai/v1/chat/completions");
  const body = JSON.parse(String(init?.body));
  expect(body).toMatchObject({
    model: META_SPARK_MODEL,
    max_tokens: 4096,
    response_format: {
      type: "json_schema",
      json_schema: {
        strict: true,
        schema: { additionalProperties: false, required: ["answer"] },
      },
    },
  });
  expect(google).not.toHaveBeenCalled();
});

test.each([
  {
    model: META_SPARK_MODEL,
    finish_reason: "length",
    content: null,
    reason: "length",
  },
  {
    model: META_SPARK_MODEL,
    finish_reason: "stop",
    content: "",
    reason: "empty_content",
  },
  {
    model: META_WONDER_MODEL,
    finish_reason: "stop",
    content: '{"answer":"Saved"}',
    reason: "model_mismatch",
  },
  {
    model: "unexpected-provider-model",
    finish_reason: "stop",
    content: '{"answer":"Saved"}',
    reason: "model_mismatch",
  },
])(
  "rejected completions preserve actual model and usage: %j",
  async ({ model, finish_reason, content, reason }) => {
    respond(
      wire({
        model,
        choices: [{ finish_reason, message: { content } }],
        usage: { prompt_tokens: 64, completion_tokens: 1000 },
      }),
    );
    await expect(generateObject(request)).rejects.toMatchObject({
      name: "ModelOutputError",
      stage: "completion",
      completion: { reason, finishReason: finish_reason },
      generation: {
        provider: "meta",
        requestedModel: META_SPARK_MODEL,
        model,
        inputTokens: 64,
        outputTokens: 1000,
        requestId: "meta-request-1",
      },
    });
    expect(google).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
);

test("the reasoning budget floor preserves a larger explicit Meta limit and leaves Google limits unchanged", async () => {
  await generateObject({ ...request, maxOutputTokens: 8192 });
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body)).max_tokens).toBe(
    8192,
  );
  google.mockResolvedValue({ text: '{"answer":"Saved"}' });
  await generateObject({
    ...request,
    route: { kind: "google", model: "gemini-2.5-flash" },
    maxOutputTokens: 250,
  });
  expect(google.mock.calls[0][0].config.maxOutputTokens).toBe(250);
});

test.each([
  { usage: undefined },
  { usage: { prompt_tokens: -1, completion_tokens: 9 } },
  { usage: { prompt_tokens: 42, completion_tokens: 1.5 } },
  { model: undefined },
  { model: META_WONDER_MODEL },
  { choices: [] },
  {
    choices: [
      { finish_reason: "length", message: { content: '{"answer":"Saved"}' } },
    ],
  },
  { choices: [{ finish_reason: "stop", message: { content: null } }] },
  { choices: [{ finish_reason: "stop", message: { content: "not JSON" } }] },
  {
    choices: [
      {
        finish_reason: "stop",
        message: { content: '{"answer":"Saved","extra":true}' },
      },
    ],
  },
])(
  "invalid Meta output remains rejected without another provider: %j",
  async (override) => {
    respond(wire(override));
    await expect(generateObject(request)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(google).not.toHaveBeenCalled();
  },
);

test.each([401, 403, 429, 500, 503])(
  "Meta status %i never switches providers or retries implicitly",
  async (status) => {
    respond({ error: { message: "Bounded provider failure" } }, status);
    await expect(generateObject(request)).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(google).not.toHaveBeenCalled();
  },
);

test("Meta network errors never switch providers", async () => {
  fetcher.mockRejectedValue(new TypeError("Network unavailable"));
  await expect(generateObject(request)).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(google).not.toHaveBeenCalled();
});

test("image content is delivered as pixels and redacted from telemetry", async () => {
  const image = { mimeType: "image/png", data: "aGVsbG8=" } as const;
  await generateObject({ ...request, images: [image] });
  const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
  expect(body.messages[1].content[1]).toEqual({
    type: "image_url",
    image_url: { url: "data:image/png;base64,aGVsbG8=" },
  });
  const redacted = JSON.stringify(
    redactTelemetry({
      messages: body.messages,
      images: [image],
      apiKey: "unit-meta-key-never-exported",
    }),
  );
  expect(redacted).not.toContain(image.data);
  expect(redacted).not.toContain("unit-meta-key-never-exported");
});

test("invalid image envelope fails before any network call", async () => {
  await expect(
    generateObject({
      ...request,
      images: [{ mimeType: "image/png", data: "not base64!" }],
    }),
  ).rejects.toThrow();
  expect(fetcher).not.toHaveBeenCalled();
});

test("Meta prose uses a strict envelope too", async () => {
  respond(
    wire({
      choices: [
        {
          finish_reason: "stop",
          message: { content: '{"text":"Your report is saved."}' },
        },
      ],
    }),
  );
  const result = await generateText(request);
  expect(result.value).toBe("Your report is saved.");
  expect(
    JSON.parse(String(fetcher.mock.calls[0][1]?.body)).response_format
      .json_schema.strict,
  ).toBe(true);
});

test("connection errors expose neither credentials nor malformed connection input", () => {
  vi.stubEnv(
    "META_BASE_URL",
    "http://private:unit-meta-key-never-exported@localhost",
  );
  expect(getMetaConnection).toThrow("Meta is not configured");
  vi.stubEnv("META_BASE_URL", "https://api.meta.ai/v1");
  vi.stubEnv("META_API_KEY", "");
  expect(getMetaConnection).toThrow("Meta is not configured");
});
