import { v } from "convex/values";

export const previewDeployment = v.object({
  id: v.string(), url: v.string(), commit: v.string(), policyDigest: v.string(),
  verifiedAt: v.number(),
});
export const previewAcceptance = v.object({
  deploymentId: v.string(), commit: v.string(), observations: v.string(),
  observedAt: v.number(), actor: v.string(),
});
