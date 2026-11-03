import { v, ConvexError } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import schema, { triageGeneration } from "./schema";
import { signalBatchState, signalPost, signalProvenance } from "./workspaceValidators";
import { authorize } from "./cue";
import { packByAppId } from "./appPacks";
import {
  ATTEMPT_TTL_MS,
  MAX_ATTEMPTS,
  signalsProvenanceSchema,
  validateBatchInputs,
  validateSignalsAnalysis,
  postsFingerprint,
} from "../lib/signals-schema";

const stamp = () => Date.now();
const mintToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

async function requireBatch(ctx: MutationCtx, batchId: Id<"signalBatches">) {
  const batch = await ctx.db.get("signalBatches", batchId);
  if (!batch) throw new ConvexError("Signal batch not found");
  return batch;
}

async function requireApp(ctx: MutationCtx, appId: string) {
  const pack = await packByAppId(ctx, appId);
  if (!pack) throw new ConvexError("Unknown application");
  return pack;
}

export const createSignalBatch = mutation({
  args: {
    secret: v.string(),
    appId: v.string(),
    requestKey: v.string(),
    provenance: signalProvenance,
    posts: v.array(signalPost),
    actor: v.string(),
  },
  returns: v.object({ batchId: v.id("signalBatches"), created: v.boolean() }),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const key = args.requestKey.trim();
    if (key.length < 1 || key.length > 80)
      throw new ConvexError("Use a request key between 1 and 80 characters");
    await requireApp(ctx, args.appId);
    const provenance = signalsProvenanceSchema.parse(args.provenance);
    try {
      validateBatchInputs(args.posts);
    } catch (error) {
      throw new ConvexError(
        error instanceof Error ? error.message : "Invalid batch input",
      );
    }
    const fingerprint = postsFingerprint(args.posts);
    const existing = await ctx.db
      .query("signalBatches")
      .withIndex("by_appId_and_requestKey", (q) =>
        q.eq("appId", args.appId).eq("requestKey", key),
      )
      .unique();
    if (existing) {
      // Same app/key with identical content replays the same batch; different
      // content under a reused key is a conflict, never a silent overwrite.
      if (existing.inputFingerprint !== fingerprint)
        throw new ConvexError(
          "This request key already holds different input. Use a new key.",
        );
      return { batchId: existing._id, created: false };
    }
    const now = stamp();
    const batchId = await ctx.db.insert("signalBatches", {
      appId: args.appId,
      requestKey: key,
      creator: args.actor.slice(0, 100),
      provenance,
      posts: args.posts,
      inputFingerprint: fingerprint,
      state: "ready",
      attempts: [],
      promoted: [],
      createdAt: now,
      updatedAt: now,
    });
    return { batchId, created: true };
  },
});

// Claims the single analysis slot. The model call itself happens outside the
// database in lib/signals; completion must present the minted token.
export const analyzeSignalBatch = mutation({
  args: {
    secret: v.string(),
    batchId: v.id("signalBatches"),
    expectedFingerprint: v.string(),
  },
  returns: v.object({ token: v.string(), attemptNumber: v.number() }),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const batch = await requireBatch(ctx, args.batchId);
    if (batch.inputFingerprint !== args.expectedFingerprint)
      throw new ConvexError(
        "Saved input changed since this page was loaded. Refresh and review the batch.",
      );
    if (batch.state === "analyzed")
      throw new ConvexError(
        "This batch is already analyzed. Import a new batch for another analysis.",
      );
    if (batch.state === "analyzing")
      throw new ConvexError("An analysis attempt is already running");
    if (batch.attempts.length >= MAX_ATTEMPTS)
      throw new ConvexError(
        "The one explicit retry has been used for this batch",
      );
    const token = mintToken();
    const number = batch.attempts.length + 1;
    const now = stamp();
    await ctx.db.patch("signalBatches", batch._id, {
      state: "analyzing",
      attempt: {
        token,
        number,
        startedAt: now,
        expiresAt: now + ATTEMPT_TTL_MS,
      },
      attempts: [
        ...batch.attempts,
        { number, status: "running" as const, startedAt: now },
      ],
      updatedAt: now,
    });
    return { token, attemptNumber: number };
  },
});

export const completeSignalAttempt = mutation({
  args: {
    secret: v.string(),
    batchId: v.id("signalBatches"),
    token: v.string(),
    output: v.any(),
    receipt: v.optional(triageGeneration),
  },
  returns: v.union(
    v.object({ outcome: v.literal("completed") }),
    v.object({ outcome: v.literal("rejected"), error: v.string() }),
  ),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const batch = await requireBatch(ctx, args.batchId);
    if (batch.state !== "analyzing" || !batch.attempt)
      throw new ConvexError("No analysis attempt is running for this batch");
    if (batch.attempt.token !== args.token)
      throw new ConvexError(
        "This analysis result belongs to an older attempt and was discarded",
      );
    if (batch.attempt.expiresAt < stamp())
      throw new ConvexError(
        "The analysis claim expired. Record the failure and retry explicitly.",
      );
    if (args.receipt) {
      const g = args.receipt;
      if (
        [g.provider, g.model, g.requestedModel].some(
          (value) => !value.trim() || value.length > 200,
        ) ||
        !Number.isSafeInteger(g.inputTokens) ||
        g.inputTokens < 0 ||
        !Number.isSafeInteger(g.outputTokens) ||
        g.outputTokens < 0 ||
        !Number.isFinite(g.durationMs) ||
        g.durationMs < 0
      )
        throw new ConvexError("Invalid generation receipt");
    }
    // A completed-but-invalid model answer is a failed attempt, not output.
    // Recording the failure and reporting the rejection in one committed
    // transaction keeps both the attempt ledger and the caller honest.
    let validated;
    try {
      validated = validateSignalsAnalysis(batch.posts, args.output);
    } catch (error) {
      const message = `Model output rejected: ${error instanceof Error ? error.message : "invalid"}`;
      const now = stamp();
      const number = batch.attempt.number;
      await ctx.db.patch("signalBatches", batch._id, {
        state: "failed",
        attempt: undefined,
        attempts: batch.attempts.map((a) =>
          a.number === number
            ? {
                ...a,
                status: "failed" as const,
                finishedAt: now,
                error: message.slice(0, 900),
              }
            : a,
        ),
        updatedAt: now,
      });
      return { outcome: "rejected" as const, error: message.slice(0, 900) };
    }
    const number = batch.attempt.number;
    const now = stamp();
    await ctx.db.patch("signalBatches", batch._id, {
      state: "analyzed",
      attempt: undefined,
      attempts: batch.attempts.map((a) =>
        a.number === number
          ? {
              ...a,
              status: "completed" as const,
              finishedAt: now,
              ...(args.receipt ? { receipt: args.receipt } : {}),
            }
          : a,
      ),
      analysis: {
        revision: 1,
        dispositions: validated.dispositions,
        clusters: validated.clusters,
        stats: validated.stats,
        ...(args.receipt ? { receipt: args.receipt } : {}),
        completedAt: now,
      },
      updatedAt: now,
    });
    return { outcome: "completed" as const };
  },
});

// Failure and retry stay explicit: an unknown provider outcome is never
// replayed automatically, and a paid failed attempt keeps its receipt.
export const failSignalAttempt = mutation({
  args: {
    secret: v.string(),
    batchId: v.id("signalBatches"),
    token: v.string(),
    error: v.string(),
    receipt: v.optional(triageGeneration),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const batch = await requireBatch(ctx, args.batchId);
    if (batch.state === "analyzed")
      throw new ConvexError("Analysis already completed");
    if (batch.state !== "analyzing" || !batch.attempt)
      throw new ConvexError("No analysis attempt is running for this batch");
    if (batch.attempt.token !== args.token)
      throw new ConvexError("This failure belongs to an older attempt");
    const now = stamp();
    const number = batch.attempt.number;
    await ctx.db.patch("signalBatches", batch._id, {
      state: "failed",
      attempt: undefined,
      attempts: batch.attempts.map((a) =>
        a.number === number
          ? {
              ...a,
              status: "failed" as const,
              finishedAt: now,
              error: args.error.slice(0, 900),
              ...(args.receipt ? { receipt: args.receipt } : {}),
            }
          : a,
      ),
      updatedAt: now,
    });
    return null;
  },
});

// Promotion atomically creates or returns one ordinary feature issue per
// batch revision and cluster, at spec_ready — never approved.
export const promoteSignalProposal = mutation({
  args: {
    secret: v.string(),
    batchId: v.id("signalBatches"),
    expectedAnalysisRevision: v.number(),
    clusterId: v.string(),
    actor: v.string(),
  },
  returns: v.id("issues"),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const batch = await requireBatch(ctx, args.batchId);
    if (batch.state !== "analyzed" || !batch.analysis)
      throw new ConvexError("Batch analysis is not complete");
    if (batch.analysis.revision !== args.expectedAnalysisRevision)
      throw new ConvexError(
        "The analysis was superseded. Review the current revision before promoting.",
      );
    const cluster = batch.analysis.clusters.find(
      (c) => c.id === args.clusterId,
    );
    if (!cluster) throw new ConvexError("Cluster not found in this analysis");
    const promoted = batch.promoted.find(
      (p) =>
        p.clusterId === args.clusterId &&
        p.analysisRevision === args.expectedAnalysisRevision,
    );
    if (promoted) return promoted.issueId;
    const fingerprint = `${batch.appId}:signals:${batch._id}:${args.clusterId}`;
    const existing = await ctx.db
      .query("issues")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
      .unique();
    if (existing) return existing._id;
    const now = stamp();
    const issueId = await ctx.db.insert("issues", {
      title: cluster.proposal.title,
      description: cluster.need,
      kind: "feature",
      fingerprint,
      appId: batch.appId,
      status: "spec_ready",
      priority: "P2",
      tags: ["Quiet signals"],
      spec: JSON.stringify(cluster.proposal.specification),
      ...(batch.analysis.receipt
        ? { specGeneration: batch.analysis.receipt }
        : {}),
      sourceSignals: {
        batchId: batch._id,
        inputFingerprint: batch.inputFingerprint,
        analysisRevision: batch.analysis.revision,
        clusterId: args.clusterId,
      },
      createdAt: now,
    });
    await ctx.db.patch("signalBatches", batch._id, {
      promoted: [
        ...batch.promoted,
        {
          clusterId: args.clusterId,
          analysisRevision: batch.analysis.revision,
          issueId,
          createdAt: now,
        },
      ],
      updatedAt: now,
    });
    await ctx.db.insert("events", {
      issueId,
      title: "Build handoff created from Quiet signals",
      detail: `${batch.creator} promoted a proposal inferred from ${cluster.sources.length} ${batch.provenance.kind === "synthetic-fixture" ? "synthetic" : "operator-supplied"} posts (${cluster.distinctAuthors} ${cluster.distinctAuthors === 1 ? "author" : "authors"}). The handoff needs Product approval before any implementation.`,
      kind: "intake",
      createdAt: now,
    });
    return issueId;
  },
});

export const getSignalBatch = query({
  args: { secret: v.string(), batchId: v.id("signalBatches") },
  returns: v.union(v.null(), schema.doc("signalBatches")),
  handler: async (ctx, args) => {
    authorize(args.secret);
    return await ctx.db.get("signalBatches", args.batchId);
  },
});

export const listSignalBatches = query({
  args: { secret: v.string(), appId: v.string() },
  returns: v.array(
    v.object({
      batchId: v.id("signalBatches"),
      requestKey: v.string(),
      state: signalBatchState,
      provenance: signalProvenance,
      postCount: v.number(),
      inputFingerprint: v.string(),
      clusterCount: v.number(),
      promotedCount: v.number(),
      createdAt: v.number(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const rows = await ctx.db
      .query("signalBatches")
      .withIndex("by_appId_and_updatedAt", (q) => q.eq("appId", args.appId))
      .order("desc")
      .take(20);
    return rows.map((row) => ({
      batchId: row._id,
      requestKey: row.requestKey,
      state: row.state,
      provenance: row.provenance,
      postCount: row.posts.length,
      inputFingerprint: row.inputFingerprint,
      clusterCount: row.analysis?.clusters.length ?? 0,
      promotedCount: row.promoted.length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));
  },
});
