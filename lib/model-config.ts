import { z } from "zod";
import { readIntegrations } from "./integration-config";
import { geminiReady } from "./google-client";
import { getMetaConnection, META_SPARK_MODEL, type MetaModel } from "./meta";

export const SUPPORT_MODELS = [
  "gemini-2.5-flash",
  "nova-lite",
  "claude-haiku",
  "claude-sonnet-4.6",
  META_SPARK_MODEL,
] as const;
export const GROWTH_MODELS = [
  "gemini-2.5-flash",
  "claude-sonnet-4.6",
  META_SPARK_MODEL,
] as const;
export type GrowthModel = (typeof GROWTH_MODELS)[number];
export type Purpose =
  | "support"
  | "triage"
  | "specification"
  | "qualification"
  | "growth"
  | "workspace";
export type ModelRoute =
  | { kind: "meta"; model: MetaModel }
  | { kind: "google"; model: string }
  | {
      kind: "litellm";
      model: "nova-lite" | "claude-haiku" | "claude-sonnet-4.6";
    };

export function modelRoute(model: string): ModelRoute {
  if (model === META_SPARK_MODEL) return { kind: "meta", model };
  if (model.startsWith("gemini-")) return { kind: "google", model };
  const proxy = z
    .enum(["nova-lite", "claude-haiku", "claude-sonnet-4.6"])
    .safeParse(model);
  if (proxy.success) return { kind: "litellm", model: proxy.data };
  throw new Error("Unsupported generation model");
}
export async function configuredSupportModel() {
  return z
    .enum(SUPPORT_MODELS)
    .parse(
      (await readIntegrations()).workspace?.supportModel ||
        process.env.CUE_SUPPORT_MODEL ||
        "gemini-2.5-flash",
    );
}
export async function configuredGrowthModel(): Promise<GrowthModel> {
  return z
    .enum(GROWTH_MODELS)
    .parse(
      (await readIntegrations()).workspace?.growthModel ||
        process.env.CUE_GROWTH_MODEL ||
        "gemini-2.5-flash",
    );
}

export async function configuredRoute(args: {
  purpose: Purpose;
  override?: string;
}): Promise<ModelRoute> {
  const selected =
    args.override ||
    (args.purpose === "support"
      ? await configuredSupportModel()
      : args.purpose === "growth"
        ? await configuredGrowthModel()
        : process.env.CUE_AGENT_MODEL ||
          process.env.GEMINI_MODEL ||
          "gemini-2.5-flash");
  if (args.purpose === "support") z.enum(SUPPORT_MODELS).parse(selected);
  if (args.purpose === "growth") z.enum(GROWTH_MODELS).parse(selected);
  return modelRoute(selected);
}

export function routeReadiness(
  route: ModelRoute,
): { kind: "ready" } | { kind: "unavailable"; reason: string } {
  if (route.kind === "meta") {
    try {
      getMetaConnection();
      return { kind: "ready" };
    } catch {
      return { kind: "unavailable", reason: "Meta is not configured" };
    }
  }
  if (route.kind === "google")
    return geminiReady()
      ? { kind: "ready" }
      : { kind: "unavailable", reason: "Gemini is not configured" };
  return process.env.LITELLM_API_KEY
    ? { kind: "ready" }
    : { kind: "unavailable", reason: "LiteLLM is not configured" };
}
