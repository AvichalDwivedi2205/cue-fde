import { readIntegrations } from "./integration-config";
export async function configuredSupportModel() {
  return (
    (await readIntegrations()).workspace?.supportModel ||
    process.env.CUE_SUPPORT_MODEL ||
    "gemini-2.5-flash"
  );
}
