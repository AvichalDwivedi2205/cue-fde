import { v } from "convex/values";
export const agentId = v.union(
  v.literal("x"),
  v.literal("reddit"),
  v.literal("growth"),
  v.literal("engineering"),
);
export const taskState = v.union(
  v.literal("queued"),
  v.literal("running"),
  v.literal("awaiting"),
  v.literal("blocked"),
  v.literal("retrying"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
  v.literal("canceling"),
);
export const taskAction = v.union(
  v.literal("recommendation"),
  v.literal("discover"),
  v.literal("qualify"),
  v.literal("draft"),
  v.literal("collect"),
  v.literal("investigate"),
  v.literal("delegate"),
);
export const commandAction = v.union(
  v.literal("collect"),
  v.literal("investigate"),
  v.literal("delegate"),
);
export const actor = v.object({
  id: v.string(),
  name: v.string(),
  role: v.union(
    v.literal("owner"),
    v.literal("engineering"),
    v.literal("product"),
    v.literal("support"),
  ),
});

// Coding policy is frozen onto each run; app-pack writes use the same shape.
export const engineeringBinding = v.object({
  repository: v.string(),
  baseBranch: v.string(),
  allowedPaths: v.array(v.string()),
  testCommands: v.array(
    v.object({ program: v.string(), args: v.array(v.string()) }),
  ),
  packageDirectory: v.optional(v.string()),
  packageManager: v.optional(
    v.union(v.literal("npm"), v.literal("bun"), v.literal("none")),
  ),
});

// Shared validator for what a model call actually returned. Stored beside the
// output it produced; never trusted as evidence by itself.
export const generationReceipt = v.object({
  provider: v.string(),
  model: v.string(),
  requestedModel: v.string(),
  inputTokens: v.number(),
  outputTokens: v.number(),
  durationMs: v.number(),
  requestId: v.optional(v.string()),
  traceId: v.optional(v.string()),
});

export const signalPost = v.object({
  id: v.string(),
  author: v.string(),
  text: v.string(),
  sourceRef: v.optional(v.string()),
});

export const signalProvenance = v.object({
  kind: v.string(),
  fixture: v.optional(v.string()),
  version: v.optional(v.string()),
  note: v.optional(v.string()),
});

export const signalDisposition = v.object({
  postId: v.string(),
  outcome: v.union(
    v.literal("evidence"),
    v.literal("duplicate"),
    v.literal("spam"),
    v.literal("off-topic"),
    v.literal("insufficient"),
    v.literal("other-need"),
  ),
  clusterId: v.optional(v.string()),
  quote: v.optional(v.string()),
  reason: v.string(),
});

export const signalCluster = v.object({
  id: v.string(),
  need: v.string(),
  rationale: v.string(),
  sentiment: v.optional(
    v.union(
      v.literal("frustrated"),
      v.literal("concerned"),
      v.literal("mixed"),
      v.literal("neutral"),
      v.literal("positive"),
    ),
  ),
  sources: v.array(
    v.object({
      postId: v.string(),
      author: v.string(),
      quote: v.string(),
    }),
  ),
  distinctAuthors: v.number(),
  repeatedEvidence: v.boolean(),
  proposal: v.object({
    title: v.string(),
    assumptions: v.array(v.string()),
    specification: v.object({
      need: v.string(),
      specification: v.string(),
      acceptanceCriteria: v.array(v.string()),
    }),
  }),
});

export const signalAnalysis = v.object({
  revision: v.number(),
  dispositions: v.array(signalDisposition),
  clusters: v.array(signalCluster),
  stats: v.object({
    posts: v.number(),
    evidencePosts: v.number(),
    distinctEvidenceAuthors: v.number(),
    duplicatePosts: v.number(),
    spamPosts: v.number(),
    offTopicPosts: v.number(),
    insufficientPosts: v.number(),
    otherNeedPosts: v.number(),
  }),
  receipt: v.optional(generationReceipt),
  completedAt: v.number(),
});

export const signalAttemptRecord = v.object({
  number: v.number(),
  status: v.union(
    v.literal("running"),
    v.literal("completed"),
    v.literal("failed"),
  ),
  startedAt: v.number(),
  finishedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  receipt: v.optional(generationReceipt),
});

export const signalBatchState = v.union(
  v.literal("ready"),
  v.literal("analyzing"),
  v.literal("analyzed"),
  v.literal("failed"),
);

export const signalPromotion = v.object({
  clusterId: v.string(),
  analysisRevision: v.number(),
  issueId: v.id("issues"),
  createdAt: v.number(),
});
