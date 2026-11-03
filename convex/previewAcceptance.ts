import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authorize } from "./cue";
import { packByAppId } from "./appPacks";
import { engineeringInput } from "../lib/app-pack-schema";
import { previewAcceptance } from "./previewAcceptanceValidators";

async function approvedRun(ctx: MutationCtx, runId: Id<"runs">, commit: string) {
  const run = await ctx.db.get("runs", runId);
  const issue = run && await ctx.db.get("issues", run.issueId);
  const pack = issue?.appId && await packByAppId(ctx, issue.appId);
  if (!run || !issue || !pack || pack.status !== "active" ||
      run.status !== "approved" || !run.approval || run.deploymentMode !== "pull_request" ||
      run.targetId !== issue.appId || !/^[a-f0-9]{40}$/.test(commit) || run.commit !== commit ||
      !run.codingPolicy || !pack.engineering ||
      JSON.stringify(engineeringInput.parse(run.codingPolicy)) !== JSON.stringify(engineeringInput.parse(pack.engineering)))
    throw new ConvexError("Preview must match the approved commit and current application policy");
  if (run.kind === "feature" && (!issue.specApprovedAt || issue.spec !== run.approvedSpec))
    throw new ConvexError("Product approval changed after implementation review");
  return { run, issue };
}

// Only the trusted deployment verifier calls this after provider read-back.
export const registerDeployment = mutation({
  args: { secret: v.string(), runId: v.id("runs"), deployment: v.object({ id: v.string(), url: v.string(), commit: v.string(), policyDigest: v.string() }) },
  returns: v.null(),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const { run } = await approvedRun(ctx, args.runId, args.deployment.commit);
    const url = new URL(args.deployment.url);
    if (!/^dpl_[A-Za-z0-9]+$/.test(args.deployment.id) || !/^[a-f0-9]{64}$/.test(args.deployment.policyDigest) ||
        url.protocol !== "https:" || !/^[A-Za-z0-9-]+\.vercel\.app$/.test(url.hostname) ||
        url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      throw new ConvexError("Invalid verified preview deployment");
    const previous = run.previewDeployment;
    if (previous) {
      if (previous.id === args.deployment.id && previous.url === args.deployment.url && previous.commit === args.deployment.commit && previous.policyDigest === args.deployment.policyDigest)
        return null;
      throw new ConvexError("Preview deployment already registered; reconcile its existing identity");
    }
    await ctx.db.patch("runs", run._id, { previewDeployment: { ...args.deployment, verifiedAt: Date.now() } });
    return null;
  },
});

export const record = mutation({
  args: { secret: v.string(), runId: v.id("runs"), commit: v.string(), deploymentId: v.string(), observations: v.string(), actor: v.string() },
  returns: previewAcceptance,
  handler: async (ctx, args) => {
    authorize(args.secret);
    const { run, issue } = await approvedRun(ctx, args.runId, args.commit);
    const deployment = run.previewDeployment;
    const observations = args.observations.trim(), actor = args.actor.trim();
    if (!deployment || deployment.id !== args.deploymentId || deployment.commit !== args.commit)
      throw new ConvexError("Verified preview deployment required before browser acceptance");
    if (observations.length < 80 || observations.length > 8000 || !actor || actor.length > 200)
      throw new ConvexError("Describe the observed preview action and reload result");
    if (run.previewAcceptance) {
      if (run.previewAcceptance.deploymentId === args.deploymentId && run.previewAcceptance.commit === args.commit && run.previewAcceptance.observations === observations)
        return run.previewAcceptance;
      throw new ConvexError("Preview acceptance already recorded; its observations are immutable");
    }
    const now = Date.now();
    const receipt = { deploymentId: args.deploymentId, commit: args.commit, observations, actor, observedAt: now };
    const cases = await ctx.db.query("cases").withIndex("by_issueId", (q) => q.eq("issueId", issue._id)).take(201);
    if (cases.length > 200) throw new ConvexError("Preview update requires batched notification");
    if (cases.some((c) => c.appId !== issue.appId)) throw new ConvexError("Preview conversation application mismatch");
    await ctx.db.patch("runs", run._id, { previewAcceptance: receipt });
    for (const conversation of cases.filter((c) => c.channel === "chat")) {
      await ctx.db.insert("messages", { caseId: conversation._id, author: "Cue", role: "cue", createdAt: now,
        body: `The approved preview passed an operator browser check for this issue. You can try it here: ${deployment.url}. Production has not been verified or released by this preview check.` });
      await ctx.db.patch("cases", conversation._id, { updatedAt: now });
    }
    await ctx.db.insert("events", { runId: run._id, issueId: issue._id, title: "Preview browser acceptance recorded", detail: `Operator observation by ${actor}. Commit ${args.commit}. Deployment ${args.deploymentId}. ${observations} Production remains unchanged.`, kind: "preview", createdAt: now });
    return receipt;
  },
});
