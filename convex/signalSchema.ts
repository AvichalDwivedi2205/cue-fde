import { defineTable } from "convex/server";
import { v } from "convex/values";
import {
  signalAnalysis,
  signalAttemptRecord,
  signalBatchState,
  signalPost,
  signalPromotion,
  signalProvenance,
} from "./workspaceValidators";

// One bounded Quiet signals aggregate per batch: immutable inputs, provenance,
// the single active attempt, the append-only attempt ledger, the validated
// analysis, and promotions into the ordinary feature workflow.
export const signalTables = {
  signalBatches: defineTable({
    appId: v.string(),
    requestKey: v.string(),
    creator: v.string(),
    provenance: signalProvenance,
    posts: v.array(signalPost),
    inputFingerprint: v.string(),
    state: signalBatchState,
    attempt: v.optional(
      v.object({
        token: v.string(),
        number: v.number(),
        startedAt: v.number(),
        expiresAt: v.number(),
      }),
    ),
    attempts: v.array(signalAttemptRecord),
    analysis: v.optional(signalAnalysis),
    promoted: v.array(signalPromotion),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_appId_and_requestKey", ["appId", "requestKey"])
    .index("by_appId_and_updatedAt", ["appId", "updatedAt"]),
};
