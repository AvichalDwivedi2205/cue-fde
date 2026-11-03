import OpenAI from "openai";
import { z } from "zod";

export const META_SPARK_MODEL = "muse-spark-1.3";
export const META_WONDER_MODEL = "muse-wonder-1.0";
export const META_MODELS = [META_SPARK_MODEL, META_WONDER_MODEL] as const;
export type MetaModel = (typeof META_MODELS)[number];

const connectionSchema = z.object({
  apiKey: z.string().trim().min(1),
  baseURL: z.url().refine((url) => new URL(url).protocol === "https:"),
});

export function getMetaConnection() {
  const result = connectionSchema.safeParse({
    apiKey: process.env.META_API_KEY,
    baseURL: process.env.META_BASE_URL || "https://api.meta.ai/v1",
  });
  if (!result.success) throw new Error("Meta is not configured");
  return result.data;
}

export function metaClient() {
  return new OpenAI({ ...getMetaConnection(), maxRetries: 0, timeout: 30000 });
}

export const modelImageSchema = z
  .object({
    mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
    data: z
      .string()
      .min(4)
      .max(6_000_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
// Pixel and MIME validation belongs to the screenshot intake boundary.
export type ModelImage = z.infer<typeof modelImageSchema>;

const completionSchema = z.object({
  model: z.enum(META_MODELS),
  choices: z
    .array(
      z.object({
        finish_reason: z.literal("stop"),
        message: z.object({ content: z.string().trim().min(1) }),
      }),
    )
    .min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative().max(10_000_000),
    completion_tokens: z.number().int().nonnegative().max(10_000_000),
  }),
});

export async function metaCompletion(args: {
  model: MetaModel;
  system: string;
  payload: unknown;
  images?: readonly ModelImage[];
  maxOutputTokens: number;
  temperature: number;
  schema?: z.ZodType;
}) {
  const images = z
    .array(modelImageSchema)
    .max(4)
    .parse(args.images || []);
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: JSON.stringify(args.payload) },
    ...images.map(
      (image): OpenAI.Chat.Completions.ChatCompletionContentPart => ({
        type: "image_url",
        image_url: { url: `data:${image.mimeType};base64,${image.data}` },
      }),
    ),
  ];
  const response = await metaClient().chat.completions.create({
    model: args.model,
    messages: [
      { role: "system", content: args.system },
      { role: "user", content },
    ],
    temperature: args.temperature,
    max_tokens: args.maxOutputTokens,
    ...(args.schema
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "cue_response",
              strict: true,
              schema: z.toJSONSchema(args.schema),
            },
          } satisfies OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"],
        }
      : {}),
  });
  const parsed = completionSchema.parse(response);
  if (parsed.model !== args.model)
    throw new Error("Meta returned a different model than requested");
  return {
    text: parsed.choices[0].message.content,
    model: parsed.model,
    inputTokens: parsed.usage.prompt_tokens,
    outputTokens: parsed.usage.completion_tokens,
    ...(response._request_id ? { requestId: response._request_id } : {}),
  };
}
