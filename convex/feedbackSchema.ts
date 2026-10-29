import { defineTable } from "convex/server";
import { v } from "convex/values";

export const answerOutcome = v.union(
  v.literal("solved"),
  v.literal("needs_help"),
);
export const feedbackTables = {
  answerOutcomes: defineTable({
    workspaceId: v.string(),
    appId: v.string(),
    owner: v.string(),
    caseId: v.id("cases"),
    messageId: v.id("messages"),
    outcome: answerOutcome,
    createdAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_caseId", ["caseId"]),
  knowledgeGaps: defineTable({
    workspaceId: v.string(),
    appId: v.string(),
    questionKey: v.string(),
    question: v.string(),
    state: v.union(
      v.literal("open"),
      v.literal("drafted"),
      v.literal("ignored"),
    ),
    reportCount: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    reviewedBy: v.optional(v.string()),
    reviewedThrough: v.optional(v.number()),
    draftSourceId: v.optional(v.id("knowledgeSources")),
    draftRevision: v.optional(v.number()),
  })
    .index("by_workspaceId_and_appId_and_questionKey", [
      "workspaceId",
      "appId",
      "questionKey",
    ])
    .index("by_workspaceId_and_appId_and_updatedAt", [
      "workspaceId",
      "appId",
      "updatedAt",
    ]),
  knowledgeGapReports: defineTable({
    gapId: v.id("knowledgeGaps"),
    caseId: v.id("cases"),
    messageId: v.id("messages"),
    question: v.string(),
    customer: v.string(),
    reason: v.union(v.literal("unanswered"), v.literal("needs_help")),
    excludedVerification: v.optional(v.boolean()),
    createdAt: v.number(),
  })
    .index("by_messageId", ["messageId"])
    .index("by_gapId", ["gapId"]),
};
