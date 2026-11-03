import {
  engineeringSlackContext,
  verifyHandoff,
  currentHandoff,
} from "./engineeringHandoffState";
import { runExecutionMode } from "../lib/coding-policy";
import { engineeringInput } from "../lib/app-pack-schema";
import { packByAppId } from "./appPacks";
import schema from "./schema";
import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { authorize } from "./cue";

export const claim = mutation({
  args: {
    secret: v.string(),
    worker: v.string(),
    executionMode: v.optional(v.literal("pull_request")),
    provider: v.optional(v.literal("Meta")),
  },
  returns: v.union(v.null(), schema.doc("jobs")),
  handler: async (ctx, args) => {
    authorize(args.secret);
    // Expired executions are surfaced for review, never replayed blindly.
    for (const old of await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .take(20)) {
      if (old.leaseUntil < Date.now()) {
        await ctx.db.patch("jobs", old._id, { status: "failed" });
        const run = await ctx.db.get("runs", old.runId);
        if (run && run.status === "running") {
          await ctx.db.patch("runs", old.runId, {
            status: "failed",
            phase: "worker_interrupted",
            error: "Worker lease expired. Review the checkout and retry.",
            updatedAt: Date.now(),
          });
          await ctx.db.patch("issues", run.issueId, {
            status: run.kind === "feature" ? "approved" : "open",
          });
        }
      }
    }
    // All companions share one coding slot, including concurrent claim calls.
    const running = await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "running"))
      .first();
    if (running) return null;
    const candidates = await ctx.db
      .query("jobs")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(args.executionMode || args.provider ? 100 : 1);
    let job: (typeof candidates)[number] | undefined = candidates[0];
    if (args.executionMode || args.provider) {
      job = undefined;
      for (const candidate of candidates) {
        if (candidate.kind !== "investigate" && candidate.kind !== "feature")
          continue;
        const run = await ctx.db.get("runs", candidate.runId);
        if (
          !run ||
          (args.executionMode &&
            runExecutionMode(run) !== args.executionMode) ||
          (args.provider && run.provider !== args.provider)
        )
          continue;
        job = candidate;
        break;
      }
    }
    if (!job) return null;
    const claimed = {
      worker: args.worker,
      status: "running",
      leaseUntil: Date.now() + 30000,
    };
    await ctx.db.patch("jobs", job._id, claimed);
    return { ...job, ...claimed };
  },
});
export const heartbeat = mutation({
  args: { secret: v.string(), jobId: v.id("jobs"), worker: v.string() },
  returns: v.object({ cancel: v.boolean() }),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const j = await ctx.db.get("jobs", a.jobId);
    if (!j || j.worker !== a.worker || j.status !== "running")
      return { cancel: true };
    await ctx.db.patch("jobs", j._id, { leaseUntil: Date.now() + 30000 });
    return { cancel: j.cancel };
  },
});
export const finish = mutation({
  args: { secret: v.string(), jobId: v.id("jobs"), worker: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const j = await ctx.db.get("jobs", a.jobId);
    if (j?.worker === a.worker)
      await ctx.db.patch("jobs", j._id, { status: "done" });
    return null;
  },
});
export const decide = mutation({
  args: {
    secret: v.string(),
    runId: v.id("runs"),
    commit: v.string(),
    actor: v.string(),
    approve: v.boolean(),
    reason: v.optional(v.string()),
    slack: v.optional(engineeringSlackContext),
    legacySlack: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const r = await ctx.db.get("runs", a.runId);
    if (!r || r.status !== "awaiting_approval" || r.commit !== a.commit)
      throw new ConvexError("Approval must match the pending commit");
    const issue = await ctx.db.get("issues", r.issueId);
    if (a.slack && !issue?.engineeringHandoff)
      throw new ConvexError("Engineering handoff missing");
    if (issue?.engineeringHandoff) {
      if (!a.slack) throw new ConvexError("Decide this fix in its assigned Slack thread");
      if (a.legacySlack)
        throw new ConvexError("Engineering handoff card context required");
      const h = a.slack
        ? await verifyHandoff(ctx, issue, a.slack)
        : await currentHandoff(ctx, issue);
      if (
        h.kind !== "started" ||
        h.runId !== r._id ||
        r.targetId !== h.appId ||
        r.repository !== h.policy.repository ||
        r.reproduction !== h.reproduction ||
        JSON.stringify(r.codingPolicy) !== JSON.stringify(h.policy)
      )
        throw new ConvexError("Engineering run context changed");
      if (a.slack) {
        const delivery = await ctx.db
          .query("deliveries")
          .withIndex("by_key", (q) =>
            q.eq("key", `approval:${r._id}:${a.commit}`),
          )
          .unique();
        if (
          !delivery ||
          delivery.status !== "sent" ||
          delivery.destination !== h.channel ||
          delivery.receipt !== `${h.channel}:${a.slack.cardTs}`
        )
          throw new ConvexError("Approval card context changed");
      }
      if (r.deploymentMode !== "pull_request")
        throw new ConvexError("Handoff approval cannot deploy production");
    }
    if (a.approve && r.codingPolicy) {
      const pack = await packByAppId(ctx, r.targetId || "bloom");
      if (
        !pack ||
        pack.status !== "active" ||
        !pack.engineering ||
        JSON.stringify(engineeringInput.parse(pack.engineering)) !==
          JSON.stringify(engineeringInput.parse(r.codingPolicy))
      )
        throw new ConvexError(
          "Repository policy changed after implementation started",
        );
    }
    if (a.approve && r.kind === "feature") {
      const issue = await ctx.db.get("issues", r.issueId);
      if (!issue?.specApprovedAt || issue.spec !== r.approvedSpec)
        throw new ConvexError("Product must approve the current specification");
    }
    await ctx.db.patch("runs", r._id, {
      status: a.approve
        ? r.deploymentMode === "pull_request"
          ? "approved"
          : "running"
        : "rejected",
      phase: a.approve
        ? r.deploymentMode === "pull_request"
          ? "approved"
          : "deploying"
        : "rejected",
      approval: a.actor,
      error: a.approve ? undefined : a.reason,
      updatedAt: Date.now(),
    });
    await ctx.db.patch("issues", r.issueId, {
      status: a.approve
        ? r.deploymentMode === "pull_request"
          ? "implemented"
          : "investigating"
        : r.kind === "feature"
          ? "approved"
          : "open",
    });
    await ctx.db.insert("events", {
      runId: r._id,
      issueId: r.issueId,
      title: a.approve ? "Exact commit approved" : "Change rejected",
      detail: `${a.actor}: ${a.commit}${a.reason ? " · " + a.reason : ""}`,
      kind: a.approve ? "approval" : "failure",
      createdAt: Date.now(),
    });
    if (a.approve && r.deploymentMode !== "pull_request")
      await ctx.db.insert("jobs", {
        runId: r._id,
        kind: "deploy",
        status: "queued",
        leaseUntil: 0,
        cancel: false,
        createdAt: Date.now(),
      });
    return null;
  },
});
export const cancel = mutation({
  args: { secret: v.string(), runId: v.id("runs") },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const r = await ctx.db.get("runs", a.runId);
    if (!r || r.phase === "deploying" || r.status !== "running")
      throw new ConvexError("This run cannot be canceled now");
    for (const j of await ctx.db.query("jobs").take(100))
      if (j.runId === a.runId)
        await ctx.db.patch("jobs", j._id, {
          cancel: true,
          status: j.status === "queued" ? "done" : j.status,
        });
    await ctx.db.patch("runs", r._id, {
      status: "canceled",
      phase: "canceled",
      updatedAt: Date.now(),
    });
    await ctx.db.patch("issues", r.issueId, {
      status: r.kind === "feature" ? "approved" : "open",
    });
    await ctx.db.insert("events", {
      runId: r._id,
      issueId: r.issueId,
      title: "Investigation canceled",
      detail:
        "Queued work stopped; active worker receives cancellation on its next heartbeat.",
      kind: "failure",
      createdAt: Date.now(),
    });
    return null;
  },
});
export const status = query({
  args: { secret: v.string() },
  returns: v.array(schema.doc("jobs")),
  handler: async (ctx, a) => {
    authorize(a.secret);
    return await ctx.db.query("jobs").take(100);
  },
});
