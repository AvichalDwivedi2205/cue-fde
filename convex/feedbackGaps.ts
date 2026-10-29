import { v, ConvexError } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { authorize } from "./cue";
import { answerOutcome } from "./feedbackSchema";
import schema from "./schema";
import { chunkKnowledge } from "../lib/knowledge-policy";

const scope = {
  secret: v.string(),
  workspaceId: v.string(),
  appId: v.string(),
};
async function answerContext(
  ctx: QueryCtx,
  appId: string,
  owner: string,
  caseId: Id<"cases">,
  messageId: Id<"messages">,
) {
  const c = await ctx.db.get("cases", caseId),
    m = await ctx.db.get("messages", messageId);
  if (
    !owner.startsWith(`widget:${appId}:`) ||
    !c ||
    c.owner !== owner ||
    c.appId !== appId ||
    c.channel !== "chat" ||
    !m ||
    m.caseId !== caseId ||
    !["cue", "staff"].includes(m.role)
  )
    throw new ConvexError("Answer not found in your conversation");
  const questions = await ctx.db
    .query("messages")
    .withIndex("by_caseId_and_role_and_createdAt", (q) =>
      q
        .eq("caseId", caseId)
        .eq("role", "customer")
        .lte("createdAt", m.createdAt),
    )
    .order("desc")
    .take(20);
  const question = questions.find((q) => q._creationTime < m._creationTime);
  if (!question) throw new ConvexError("Original customer question not found");
  return { c, m, question };
}

// Called by the existing intake/voice transaction after the answer is stored.
export async function recordGap(
  ctx: MutationCtx,
  a: {
    workspaceId: string;
    appId: string;
    owner: string;
    caseId: Id<"cases">;
    messageId: Id<"messages">;
    reason: "unanswered" | "needs_help";
  },
) {
  const { c, question } = await answerContext(
    ctx,
    a.appId,
    a.owner,
    a.caseId,
    a.messageId,
  );
  if (/^(Synthetic|Verification)/i.test(c.provenance)) return null;
  const existingReport = await ctx.db
    .query("knowledgeGapReports")
    .withIndex("by_messageId", (q) => q.eq("messageId", a.messageId))
    .unique();
  if (existingReport) {
    if (a.reason === "needs_help" && existingReport.reason !== "needs_help")
      await ctx.db.patch("knowledgeGapReports", existingReport._id, {
        reason: "needs_help",
      });
    return existingReport.gapId;
  }
  const original = question.body.slice(0, 2000),
    questionKey = original.toLowerCase().replace(/\s+/g, " ").trim();
  const now = Date.now();
  let gap = await ctx.db
    .query("knowledgeGaps")
    .withIndex("by_workspaceId_and_appId_and_questionKey", (q) =>
      q
        .eq("workspaceId", a.workspaceId)
        .eq("appId", a.appId)
        .eq("questionKey", questionKey),
    )
    .unique();
  const gapId =
    gap?._id ||
    (await ctx.db.insert("knowledgeGaps", {
      workspaceId: a.workspaceId,
      appId: a.appId,
      questionKey,
      question: original,
      state: "open",
      reportCount: 0,
      createdAt: now,
      updatedAt: now,
    }));
  if (!gap) gap = await ctx.db.get("knowledgeGaps", gapId);
  await ctx.db.insert("knowledgeGapReports", {
    gapId,
    caseId: a.caseId,
    messageId: a.messageId,
    question: original,
    customer: c.customer,
    reason: a.reason,
    excludedVerification: false,
    createdAt: now,
  });
  await ctx.db.patch("knowledgeGaps", gapId, {
    reportCount: (gap?.reportCount || 0) + 1,
    updatedAt: now,
    ...(gap?.state === "ignored" ? { state: "open" as const } : {}),
  });
  return gapId;
}

// Preserve verification evidence while excluding generated reports from the queue.
export async function excludeVerificationGaps(
  ctx: MutationCtx,
  messageIds: Id<"messages">[],
) {
  for (const messageId of messageIds.slice(0, 100)) {
    const report = await ctx.db
      .query("knowledgeGapReports")
      .withIndex("by_messageId", (q) => q.eq("messageId", messageId))
      .unique();
    if (!report || report.excludedVerification) continue;
    const gap = await ctx.db.get("knowledgeGaps", report.gapId);
    await ctx.db.patch("knowledgeGapReports", report._id, {
      excludedVerification: true,
    });
    if (gap)
      await ctx.db.patch("knowledgeGaps", gap._id, {
        reportCount: Math.max(0, gap.reportCount - 1),
      });
  }
}

export const submitOutcome = mutation({
  args: {
    ...scope,
    owner: v.string(),
    caseId: v.id("cases"),
    messageId: v.id("messages"),
    outcome: answerOutcome,
  },
  returns: v.object({ duplicate: v.boolean(), outcome: answerOutcome }),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const { c, question } = await answerContext(
      ctx,
      a.appId,
      a.owner,
      a.caseId,
      a.messageId,
    );
    const previous = await ctx.db
      .query("answerOutcomes")
      .withIndex("by_messageId", (q) => q.eq("messageId", a.messageId))
      .unique();
    if (previous) {
      if (
        previous.owner !== a.owner ||
        previous.appId !== a.appId ||
        previous.workspaceId !== a.workspaceId ||
        previous.outcome !== a.outcome
      )
        throw new ConvexError("Answer feedback has already been saved");
      return { duplicate: true, outcome: previous.outcome };
    }
    await ctx.db.insert("answerOutcomes", {
      workspaceId: a.workspaceId,
      appId: a.appId,
      owner: a.owner,
      caseId: a.caseId,
      messageId: a.messageId,
      outcome: a.outcome,
      createdAt: Date.now(),
    });
    if (a.outcome === "needs_help") {
      await recordGap(ctx, { ...a, reason: "needs_help" });
      await ctx.db.patch("cases", c._id, {
        status: "open",
        tags: [...new Set(["Needs human reply", ...c.tags])].slice(0, 12),
        updatedAt: Date.now(),
      });
      await ctx.db.insert("messages", {
        caseId: c._id,
        author: "Cue",
        role: "note",
        createdAt: Date.now(),
        body: `Customer selected “Still need help” for the answer to: ${question.body.slice(0, 2000)}. The original conversation is preserved for a person to review.`,
      });
    }
    return { duplicate: false, outcome: a.outcome };
  },
});

export const outcomes = query({
  args: { ...scope, owner: v.string(), caseId: v.id("cases") },
  returns: v.array(
    v.object({ messageId: v.id("messages"), outcome: answerOutcome }),
  ),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const c = await ctx.db.get("cases", a.caseId);
    if (
      !c ||
      c.appId !== a.appId ||
      c.owner !== a.owner ||
      !a.owner.startsWith(`widget:${a.appId}:`)
    )
      throw new ConvexError("Conversation not found");
    const rows = await ctx.db
      .query("answerOutcomes")
      .withIndex("by_caseId", (q) => q.eq("caseId", a.caseId))
      .take(100);
    return rows
      .filter(
        (r) =>
          r.workspaceId === a.workspaceId &&
          r.appId === a.appId &&
          r.owner === a.owner,
      )
      .map((r) => ({ messageId: r.messageId, outcome: r.outcome }));
  },
});

export const snapshot = query({
  args: scope,
  returns: v.array(
    v.object({
      gap: schema.doc("knowledgeGaps"),
      reports: v.array(schema.doc("knowledgeGapReports")),
      publication: v.union(
        v.literal("none"),
        v.literal("draft"),
        v.literal("indexing"),
        v.literal("failed"),
        v.literal("published"),
        v.literal("withdrawn"),
        v.literal("changed"),
      ),
    }),
  ),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const gaps = await ctx.db
      .query("knowledgeGaps")
      .withIndex("by_workspaceId_and_appId_and_updatedAt", (q) =>
        q.eq("workspaceId", a.workspaceId).eq("appId", a.appId),
      )
      .order("desc")
      .take(100);
    return Promise.all(
      gaps
        .filter((gap) => gap.reportCount > 0)
        .map(async (gap) => {
          const source = gap.draftSourceId
            ? await ctx.db.get("knowledgeSources", gap.draftSourceId)
            : null;
          let publication:
            | "none"
            | "draft"
            | "indexing"
            | "failed"
            | "published"
            | "withdrawn"
            | "changed" = "none";
          if (
            source &&
            source.workspaceId === a.workspaceId &&
            source.appId === a.appId
          ) {
            publication =
              source.status === "withdrawn"
                ? "withdrawn"
                : source.indexStatus === "failed"
                  ? "failed"
                  : source.activeRevision === gap.draftRevision &&
                      source.status === "published"
                    ? "published"
                    : source.revision !== gap.draftRevision
                      ? "changed"
                      : ["queued", "indexing"].includes(source.indexStatus)
                        ? "indexing"
                        : "draft";
          }
          const reports = await ctx.db
            .query("knowledgeGapReports")
            .withIndex("by_gapId", (q) => q.eq("gapId", gap._id))
            .order("desc")
            .take(20);
          return {
            gap,
            reports: reports
              .filter((r) => !r.excludedVerification)
              .slice(0, 10),
            publication,
          };
        }),
    );
  },
});

export const review = mutation({
  args: {
    ...scope,
    gapId: v.id("knowledgeGaps"),
    action: v.union(v.literal("ignore"), v.literal("reopen")),
    actor: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const gap = await ctx.db.get("knowledgeGaps", a.gapId);
    if (!gap || gap.workspaceId !== a.workspaceId || gap.appId !== a.appId)
      throw new ConvexError("Knowledge gap not found");
    await ctx.db.patch("knowledgeGaps", gap._id, {
      state: a.action === "ignore" ? "ignored" : "open",
      reviewedBy: a.actor,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const teach = mutation({
  args: {
    ...scope,
    gapId: v.id("knowledgeGaps"),
    actor: v.string(),
    question: v.string(),
    answer: v.string(),
    hash: v.string(),
    expectedReportCount: v.number(),
  },
  returns: v.object({
    sourceId: v.id("knowledgeSources"),
    revision: v.number(),
  }),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const gap = await ctx.db.get("knowledgeGaps", a.gapId);
    if (!gap || gap.workspaceId !== a.workspaceId || gap.appId !== a.appId)
      throw new ConvexError("Knowledge gap not found");
    if (gap.reportCount !== a.expectedReportCount)
      throw new ConvexError("New reports arrived; reload before reviewing");
    if (
      !a.question.trim() ||
      a.question.length > 500 ||
      !a.answer.trim() ||
      a.answer.length > 5000
    )
      throw new ConvexError("FAQ needs a question and a reviewed answer");
    if (gap.draftSourceId)
      throw new ConvexError(
        "This gap already has an FAQ draft; open it to review or publish",
      );
    const text = `${a.question.trim()}\n\n${a.answer.trim()}`;
    const sourceId: Id<"knowledgeSources"> = await ctx.runMutation(
      api.knowledge.save,
      {
        secret: a.secret,
        workspaceId: a.workspaceId,
        appId: a.appId,
        kind: "faq",
        visibility: "customer",
        title: a.question.trim().slice(0, 160),
        question: a.question.trim(),
        answer: a.answer.trim(),
        text,
        hash: a.hash,
        passages: chunkKnowledge([{ text, heading: a.question.trim() }]),
        actor: a.actor,
      },
    );
    const source = await ctx.db.get("knowledgeSources", sourceId);
    await ctx.db.patch("knowledgeGaps", gap._id, {
      state: "drafted",
      draftSourceId: sourceId,
      draftRevision: source!.revision,
      reviewedThrough: gap.reportCount,
      reviewedBy: a.actor,
      updatedAt: Date.now(),
    });
    return { sourceId, revision: source!.revision };
  },
});
