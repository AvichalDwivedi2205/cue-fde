import OpenAI from "openai";
import { z } from "zod";
import { client } from "./google-client";
import { metaCompletion, modelImageSchema, type ModelImage } from "./meta";
import { routeReadiness, type ModelRoute } from "./model-config";
import { annotateTelemetry, currentTraceId } from "./observability";

export type GenerationReceipt = {
  provider: ModelRoute["kind"];
  model: string;
  requestedModel: string;
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  requestId?: string;
  traceId?: string;
};
export class ModelOutputError extends Error {
  constructor(
    readonly generation: GenerationReceipt,
    readonly stage: "json" | "schema",
  ) {
    super("Generated output failed " + stage + " validation");
    this.name = "ModelOutputError";
  }
}
type GenerationInput = {
  route: ModelRoute;
  system: string;
  payload: unknown;
  images?: readonly ModelImage[];
  maxOutputTokens: number;
  temperature: number;
};

async function completion(args: GenerationInput & { schema?: z.ZodType }) {
  const readiness = routeReadiness(args.route);
  if (readiness.kind === "unavailable") throw new Error(readiness.reason);
  const started = Date.now();
  let result: {
    text: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    requestId?: string;
  };
  if (args.route.kind === "meta")
    result = await metaCompletion({ ...args, model: args.route.model });
  else if (args.route.kind === "google") {
    const images = z
      .array(modelImageSchema)
      .max(4)
      .parse(args.images || []);
    const response = await client().models.generateContent({
      model: args.route.model,
      contents: images.length
        ? [
            {
              role: "user",
              parts: [
                { text: JSON.stringify(args.payload) },
                ...images.map(({ data, mimeType }) => ({
                  inlineData: { data, mimeType },
                })),
              ],
            },
          ]
        : JSON.stringify(args.payload),
      config: {
        systemInstruction: args.system,
        temperature: args.temperature,
        thinkingConfig: { thinkingBudget: 0 },
        maxOutputTokens: args.maxOutputTokens,
        ...(args.schema
          ? {
              responseMimeType: "application/json",
              responseJsonSchema: z.toJSONSchema(args.schema),
            }
          : {}),
      },
    });
    result = {
      text: response.text || "",
      model: response.modelVersion || args.route.model,
      inputTokens: response.usageMetadata?.promptTokenCount || 0,
      outputTokens: response.usageMetadata?.candidatesTokenCount || 0,
    };
  } else {
    const images = z
      .array(modelImageSchema)
      .max(4)
      .parse(args.images || []);
    const sdk = new OpenAI({
      apiKey: process.env.LITELLM_API_KEY,
      baseURL: "https://litellm.vision.aivar.app/v1",
      maxRetries: 0,
      timeout: 30000,
    });
    const response = await sdk.chat.completions.create({
      model: args.route.model,
      messages: [
        {
          role: "system",
          content:
            args.system +
            (args.schema
              ? "\nReturn exactly one valid JSON object, with no Markdown or extra keys."
              : ""),
        },
        {
          role: "user",
          content: images.length
            ? [
                { type: "text", text: JSON.stringify(args.payload) },
                ...images.map(
                  (
                    image,
                  ): OpenAI.Chat.Completions.ChatCompletionContentPart => ({
                    type: "image_url",
                    image_url: {
                      url: `data:${image.mimeType};base64,${image.data}`,
                    },
                  }),
                ),
              ]
            : JSON.stringify(args.payload),
        },
      ],
      temperature: args.temperature,
      max_tokens: args.maxOutputTokens,
    });
    result = {
      text: response.choices[0]?.message.content || "",
      model: response.model || args.route.model,
      inputTokens: response.usage?.prompt_tokens || 0,
      outputTokens: response.usage?.completion_tokens || 0,
      ...(response._request_id ? { requestId: response._request_id } : {}),
    };
  }
  const generation: GenerationReceipt = {
    provider: args.route.kind,
    model: result.model,
    requestedModel: args.route.model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    durationMs: Date.now() - started,
    ...(result.requestId ? { requestId: result.requestId } : {}),
    ...(currentTraceId() ? { traceId: currentTraceId() } : {}),
  };
  annotateTelemetry({
    "cue.model.provider": generation.provider,
    "cue.model.requested": generation.requestedModel,
    "cue.model.reported": generation.model,
    "gen_ai.usage.input_tokens": generation.inputTokens,
    "gen_ai.usage.output_tokens": generation.outputTokens,
    "cue.model.duration_ms": generation.durationMs,
    ...(generation.requestId
      ? { "cue.model.request_id": generation.requestId }
      : {}),
  });
  return { text: result.text, generation };
}

export async function generateObject<S extends z.ZodType>(
  args: GenerationInput & { schema: S },
): Promise<{ value: z.output<S>; generation: GenerationReceipt }> {
  const result = await completion(args);
  let value: unknown;
  try {
    value = JSON.parse(result.text);
  } catch {
    throw new ModelOutputError(result.generation, "json");
  }
  const parsed = args.schema.safeParse(value);
  if (!parsed.success) throw new ModelOutputError(result.generation, "schema");
  return { value: parsed.data, generation: result.generation };
}

export async function generateText(args: GenerationInput) {
  if (args.route.kind === "meta") {
    const result = await generateObject({
      ...args,
      system:
        args.system +
        '\nReturn exactly one JSON object {"text":"the complete reply"}.',
      schema: z.object({ text: z.string().trim().min(1) }).strict(),
    });
    return { value: result.value.text, generation: result.generation };
  }
  const result = await completion(args);
  return {
    value: z.string().trim().min(1).parse(result.text),
    generation: result.generation,
  };
}
