import { readIntegrations } from "./integration-config";
export const GROWTH_MODELS = ["gemini-2.5-flash", "claude-sonnet-4.6"] as const;
export type GrowthModel = (typeof GROWTH_MODELS)[number];
export async function configuredSupportModel() {
  return (
    (await readIntegrations()).workspace?.supportModel ||
    process.env.CUE_SUPPORT_MODEL ||
    "gemini-2.5-flash"
  );
}
export async function configuredGrowthModel(): Promise<GrowthModel> {
  const model =
    (await readIntegrations()).workspace?.growthModel ||
    process.env.CUE_GROWTH_MODEL ||
    "gemini-2.5-flash";
  if (!GROWTH_MODELS.includes(model as GrowthModel))
    throw new Error("Unsupported Growth draft model");
  return model as GrowthModel;
}
