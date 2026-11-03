import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authorize } from "./cue";
import { packByAppId } from "./appPacks";
import { engineeringInput } from "../lib/app-pack-schema";
import {
  supportTarget,
  supportReviewHash,
  type SupportReview,
  type SupportTarget,
} from "./supportDeliveryValidators";
import schema from "./schema";

const authId = { secret: v.string(), id: v.id("deliveries") };
const exactReview = { ...authId, reviewHash: v.string() };

async function evidence(
  ctx: MutationCtx,
  caseId: Id<"cases">,
  runId: Id<"runs">,
  target: SupportTarget,
) {
  const conversation = await ctx.db.get("cases", caseId);
  const run = await ctx.db.get("runs", runId);
  const issue = run && (await ctx.db.get("issues", run.issueId));
  const pack = issue?.appId && (await packByAppId(ctx, issue.appId));
  const latest =
    issue &&
    (await ctx.db
      .query("runs")
      .withIndex("by_issueId_and_createdAt", (q) => q.eq("issueId", issue._id))
      .order("desc")
      .first());
  if (
    !conversation ||
    !run ||
    !issue ||
    !issue.appId ||
    !pack ||
    pack.status !== "active" ||
    conversation.appId !== issue.appId ||
    conversation.issueId !== issue._id ||
    run.targetId !== issue.appId ||
    run.status !== "approved" ||
    !run.approval ||
    run.deploymentMode !== "pull_request" ||
    !run.commit ||
    latest?._id !== run._id ||
    !run.codingPolicy ||
    !pack.engineering ||
    JSON.stringify(engineeringInput.parse(run.codingPolicy)) !==
      JSON.stringify(engineeringInput.parse(pack.engineering)) ||
    !run.previewDeployment ||
    !run.previewAcceptance ||
    run.previewDeployment.commit !== run.commit ||
    run.previewAcceptance.commit !== run.commit ||
    run.previewAcceptance.deploymentId !== run.previewDeployment.id
  )
    throw new ConvexError(
      "Current approved application preview and acceptance required",
    );
  if (
    run.kind === "feature" &&
    (!issue.specApprovedAt || issue.spec !== run.approvedSpec)
  )
    throw new ConvexError(
      "Product approval changed after implementation review",
    );
  if (target.kind === "x") {
    if (
      conversation.channel !== "x" ||
      !/^\d{1,30}$/.test(target.postId) ||
      conversation.sourceKey !== `x:${target.postId}` ||
      conversation.externalId !== `x-api:x:${target.postId}` ||
      !conversation.providerAuthorId ||
      !/^\d{1,30}$/.test(target.brandUserId) ||
      !/^[A-Za-z0-9_]{1,15}$/.test(target.brandUsername)
    )
      throw new ConvexError(
        "Only the original native X report may receive this reply",
      );
  } else {
    const consent = conversation.notificationEmail;
    if (
      conversation.channel !== "chat" ||
      !conversation.owner?.startsWith(`widget:${issue.appId}:`) ||
      conversation.sourceKey !== conversation.owner ||
      consent?.kind !== "opted_in" ||
      consent.address !== target.recipient ||
      consent.revision !== target.consentRevision ||
      !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(target.sender)
    )
      throw new ConvexError(
        "Widget email requires current explicit recipient consent",
      );
  }
  return {
    appId: issue.appId,
    issueId: issue._id,
    deployment: run.previewDeployment,
    acceptance: run.previewAcceptance,
  };
}

async function reviewed(
  ctx: MutationCtx | QueryCtx,
  id: Id<"deliveries">,
  hash?: string,
) {
  const delivery = await ctx.db.get("deliveries", id);
  if (
    !delivery?.supportIntent ||
    (hash !== undefined && delivery.supportIntent.reviewHash !== hash) ||
    (await supportReviewHash(delivery.body, delivery.supportIntent.review)) !==
      delivery.supportIntent.reviewHash
  )
    throw new ConvexError("Exact immutable customer update review required");
  return { delivery, intent: delivery.supportIntent };
}

async function current(ctx: MutationCtx, review: SupportReview) {
  const latest = await evidence(
    ctx,
    review.caseId,
    review.runId,
    review.target,
  );
  if (
    latest.appId !== review.appId ||
    latest.issueId !== review.issueId ||
    JSON.stringify(latest.deployment) !==
      JSON.stringify(review.evidence.deployment) ||
    JSON.stringify(latest.acceptance) !==
      JSON.stringify(review.evidence.acceptance)
  )
    throw new ConvexError(
      "Preview evidence changed; prepare and approve a new update",
    );
}

export const prepare = mutation({
  args: {
    secret: v.string(),
    caseId: v.id("cases"),
    runId: v.id("runs"),
    body: v.string(),
    target: supportTarget,
    configDigest: v.string(),
    actor: v.string(),
  },
  returns: v.object({ id: v.id("deliveries"), reviewHash: v.string() }),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const observed = await evidence(ctx, args.caseId, args.runId, args.target);
    if (
      !/^[a-f0-9]{64}$/.test(args.configDigest) ||
      !args.actor.trim() ||
      args.actor.length > 200 ||
      !args.body.includes(observed.deployment.url) ||
      !/\bpreview\b/i.test(args.body) ||
      !args.body.includes("Production is unchanged.") ||
      /\b(shipped|released|resolved|fixed|production[- ]ready)\b/i.test(
        args.body,
      ) ||
      args.body.length > (args.target.kind === "x" ? 280 : 8000)
    )
      throw new ConvexError(
        "Preview text must offer the checked preview and accurately state production is unchanged",
      );
    const review: SupportReview = {
      stage: "preview_ready",
      appId: observed.appId,
      caseId: args.caseId,
      runId: args.runId,
      issueId: observed.issueId,
      evidence: {
        deployment: observed.deployment,
        acceptance: observed.acceptance,
      },
      target: args.target,
      configDigest: args.configDigest,
    };
    const reviewHash = await supportReviewHash(args.body, review);
    const key = `support-review:${args.caseId}:${args.runId}:${reviewHash}`;
    const previous = await ctx.db
      .query("deliveries")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (previous) return { id: previous._id, reviewHash };
    const id = await ctx.db.insert("deliveries", {
      key,
      channel: args.target.kind,
      destination:
        args.target.kind === "x" ? args.target.postId : args.target.recipient,
      body: args.body,
      actor: args.actor,
      status: "prepared",
      createdAt: Date.now(),
      supportIntent: { review, reviewHash, state: { kind: "prepared" } },
    });
    return { id, reviewHash };
  },
});

export const get = query({
  args: authId,
  returns: schema.doc("deliveries"),
  handler: async (ctx, args) => {
    authorize(args.secret);
    return (await reviewed(ctx, args.id)).delivery;
  },
});

export const approve = mutation({
  args: { ...exactReview, actor: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const { intent } = await reviewed(ctx, args.id, args.reviewHash);
    if (!args.actor.trim() || args.actor.length > 200)
      throw new ConvexError("Authenticated approver required");
    if (intent.state.kind === "approved") return null;
    if (intent.state.kind !== "prepared")
      throw new ConvexError("Customer update was already claimed");
    await current(ctx, intent.review);
    await ctx.db.patch("deliveries", args.id, {
      status: "approved",
      supportIntent: {
        ...intent,
        state: { kind: "approved", actor: args.actor, approvedAt: Date.now() },
      },
    });
    return null;
  },
});

export const claim = mutation({
  args: { ...exactReview, target: supportTarget, configDigest: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const { intent } = await reviewed(ctx, args.id, args.reviewHash);
    if (intent.state.kind !== "approved") return false;
    if (
      intent.review.configDigest !== args.configDigest ||
      JSON.stringify(intent.review.target) !== JSON.stringify(args.target)
    )
      throw new ConvexError(
        "Outbound configuration or destination changed; fresh review required",
      );
    await current(ctx, intent.review);
    const siblings = await ctx.db
      .query("deliveries")
      .withIndex("by_supportCaseId_and_supportRunId", (q) =>
        q
          .eq("supportIntent.review.caseId", intent.review.caseId)
          .eq("supportIntent.review.runId", intent.review.runId),
      )
      .take(101);
    if (siblings.length > 100)
      throw new ConvexError(
        "Too many customer update revisions; reconcile before sending",
      );
    if (
      siblings.some(
        (row) =>
          row._id !== args.id &&
          row.supportIntent &&
          !["prepared", "approved"].includes(row.supportIntent.state.kind),
      )
    )
      return false;
    await ctx.db.patch("deliveries", args.id, {
      status: "sending",
      supportIntent: {
        ...intent,
        state: { ...intent.state, kind: "sending", startedAt: Date.now() },
      },
    });
    return true;
  },
});

export const accepted = mutation({
  args: { ...authId, providerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const { intent } = await reviewed(ctx, args.id);
    const state = intent.state;
    if (state.kind === "accepted" || state.kind === "verified") {
      if (state.providerId !== args.providerId)
        throw new ConvexError("Provider identity is immutable");
      return null;
    }
    if (
      state.kind !== "sending" ||
      !args.providerId ||
      args.providerId.length > 200
    )
      throw new ConvexError("Claimed provider send required");
    await ctx.db.patch("deliveries", args.id, {
      status: "provider_accepted",
      receipt: args.providerId,
      supportIntent: {
        ...intent,
        state: {
          kind: "accepted",
          actor: state.actor,
          approvedAt: state.approvedAt,
          startedAt: state.startedAt,
          providerId: args.providerId,
        },
      },
    });
    return null;
  },
});

export const unknown = mutation({
  args: { ...authId, detail: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const { intent } = await reviewed(ctx, args.id);
    if (intent.state.kind !== "sending") return null;
    const state = intent.state;
    await ctx.db.patch("deliveries", args.id, {
      status: "unknown",
      supportIntent: {
        ...intent,
        state: {
          ...state,
          kind: "unknown",
          detail: args.detail.slice(0, 1000),
        },
      },
    });
    return null;
  },
});

const readback = v.union(
  v.object({
    kind: v.literal("x"),
    providerId: v.string(),
    authorId: v.string(),
    postId: v.string(),
    body: v.string(),
  }),
  v.object({
    kind: v.literal("widget_email"),
    providerId: v.string(),
    sender: v.string(),
    recipient: v.string(),
    body: v.string(),
  }),
);
export const verify = mutation({
  args: { ...authId, readback },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const { intent, delivery } = await reviewed(ctx, args.id);
    const target = intent.review.target,
      proof = args.readback,
      state = intent.state;
    if (!["sending", "unknown", "accepted", "verified"].includes(state.kind))
      throw new ConvexError("No send to reconcile");
    if (
      !proof.providerId ||
      proof.body !== delivery.body ||
      proof.kind !== target.kind ||
      (proof.kind === "x" &&
        target.kind === "x" &&
        (proof.authorId !== target.brandUserId ||
          proof.postId !== target.postId)) ||
      (proof.kind === "widget_email" &&
        target.kind === "widget_email" &&
        (proof.sender !== target.sender ||
          proof.recipient !== target.recipient)) ||
      ((state.kind === "accepted" || state.kind === "verified") &&
        state.providerId !== proof.providerId)
    )
      throw new ConvexError(
        "Independent provider readback does not match the approved update",
      );
    if (state.kind === "prepared" || state.kind === "approved")
      throw new ConvexError("No send to reconcile");
    if (state.kind === "verified") return null;
    await ctx.db.patch("deliveries", args.id, {
      status: "verified",
      receipt: proof.providerId,
      supportIntent: {
        ...intent,
        state: {
          kind: "verified",
          actor: state.actor,
          approvedAt: state.approvedAt,
          startedAt: state.startedAt,
          providerId: proof.providerId,
          verifiedAt: Date.now(),
        },
      },
    });
    if (target.kind === "x") {
      await ctx.db.insert("messages", {
        caseId: intent.review.caseId, body: delivery.body,
        role: "staff", author: "Cue · X reply", createdAt: Date.now(),
      });
      await ctx.db.patch("cases", intent.review.caseId, { updatedAt: Date.now() });
    }
    await ctx.db.insert("events", {
      issueId: intent.review.issueId,
      runId: intent.review.runId,
      title:
        target.kind === "x"
          ? "Preview reply read back from X"
          : "Preview email read back from provider",
      detail:
        target.kind === "x"
          ? "Exact approved body, brand author and original reply target verified. Production unchanged."
          : "Provider record matches approved sender, recipient and text. Inbox delivery is not implied. Production unchanged.",
      kind: "preview",
      createdAt: Date.now(),
    });
    return null;
  },
});
