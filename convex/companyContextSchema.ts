import { defineTable } from "convex/server";
import { v } from "convex/values";

export const brandFields = {
  enabled: v.boolean(),
  label: v.string(),
  tone: v.union(
    v.literal("warm"),
    v.literal("direct"),
    v.literal("professional"),
    v.literal("playful"),
  ),
  guidelines: v.string(),
  examples: v.array(v.string()),
};
export const contextRequirement = v.object({
  id: v.string(),
  label: v.string(),
  audience: v.union(v.literal("customer"), v.literal("staff")),
  sourceIds: v.array(v.id("knowledgeSources")),
  maxAgeDays: v.optional(v.number()),
});
export const growthGrounding = v.object({
  workspaceId: v.string(),
  chunkIds: v.array(v.id("knowledgeChunks")),
  retrieval: v.string(),
  brandVersion: v.number(),
});
export const growthSourceReceipt = v.object({
  sourceId: v.id("knowledgeSources"),
  versionId: v.id("knowledgeVersions"),
  title: v.string(),
  heading: v.string(),
  excerpt: v.string(),
  revision: v.number(),
});
export const companyContextTables = {
  brandVoices: defineTable({
    workspaceId: v.string(),
    appId: v.string(),
    ...brandFields,
    version: v.number(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("by_workspaceId_and_appId", ["workspaceId", "appId"]),
  contextManifests: defineTable({
    workspaceId: v.string(),
    appId: v.string(),
    requirements: v.array(contextRequirement),
    revision: v.number(),
    updatedAt: v.number(),
    updatedBy: v.string(),
  }).index("by_workspaceId_and_appId", ["workspaceId", "appId"]),
};
