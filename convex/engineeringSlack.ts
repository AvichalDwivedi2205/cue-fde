import { mutation } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { authorize } from "./cue";
import { packByAppId } from "./appPacks";
import { engineeringInput } from "../lib/app-pack-schema";
import {
  engineeringHandoff,
  issueContext,
  currentHandoff,
} from "./engineeringHandoffState";

export const prepare = mutation({
  args: {
    secret: v.string(),
    issueId: v.id("issues"),
    reproduction: v.string(),
    reproductionDigest: v.string(),
    expectedIssueContext: v.string(),
    team: v.string(),
    channel: v.string(),
    member: v.string(),
    actor: v.string(),
    body: v.string(),
  },
  returns: v.object({ handoff: engineeringHandoff, created: v.boolean() }),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const issue = await ctx.db.get("issues", a.issueId);
    if (!issue || issue.kind !== "bug" || !issue.appId)
      throw new ConvexError("Registered bug issue required");
    if (issueContext(issue) !== a.expectedIssueContext)
      throw new ConvexError("Issue context changed before handoff");
    const reproduction = a.reproduction.trim();
    if (
      reproduction.length < 20 ||
      reproduction.length > 12000 ||
      !/^[a-f0-9]{64}$/.test(a.reproductionDigest)
    )
      throw new ConvexError("Valid reproduction required");
    if (issue.engineeringHandoff) {
      const h = await currentHandoff(ctx, issue);
      if (
        h.reproduction !== reproduction ||
        h.reproductionDigest !== a.reproductionDigest ||
        h.team !== a.team ||
        h.channel !== a.channel ||
        h.assignedMember !== a.member
      )
        throw new ConvexError("Engineering handoff is frozen; context changed");
      return { handoff: h, created: false };
    }
    const previous = await ctx.db
      .query("runs")
      .withIndex("by_issueId_and_createdAt", (q) => q.eq("issueId", issue._id))
      .first();
    if (previous) throw new ConvexError("An engineering run already exists");
    const pack = await packByAppId(ctx, issue.appId);
    if (
      !pack ||
      pack.status !== "active" ||
      !pack.engineering ||
      pack.routing?.engineeringMemberId !== a.member ||
      (pack.routing?.engineeringChannel &&
        pack.routing.engineeringChannel !== a.channel)
    )
      throw new ConvexError("Assigned engineer or app policy changed");
    const deliveryId = await ctx.db.insert("deliveries", {
      key: `engineering-handoff:${issue._id}:1`,
      channel: "slack",
      destination: a.channel,
      body: a.body,
      actor: a.actor,
      status: "pending",
      createdAt: Date.now(),
    });
    const handoff = {
      kind: "posting",
      revision: 1,
      appId: pack.appId,
      team: a.team,
      channel: a.channel,
      assignedMember: a.member,
      ...(pack.routing?.engineeringChannel
        ? { routingChannel: pack.routing.engineeringChannel }
        : {}),
      reproduction,
      reproductionDigest: a.reproductionDigest,
      issueContext: issueContext(issue),
      policy: engineeringInput.parse(pack.engineering),
      deliveryId,
    } satisfies import("./engineeringHandoffState").EngineeringHandoff;
    await ctx.db.patch(issue._id, { engineeringHandoff: handoff });
    return { handoff, created: true };
  },
});
export const posted = mutation({
  args: {
    secret: v.string(),
    issueId: v.id("issues"),
    revision: v.number(),
    channel: v.string(),
    ts: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const issue = await ctx.db.get("issues", a.issueId);
    if (!issue) throw new ConvexError("Issue missing");
    const h = await currentHandoff(ctx, issue);
    if (
      h.kind !== "posting" ||
      h.revision !== a.revision ||
      h.channel !== a.channel ||
      !/^\d+\.\d+$/.test(a.ts)
    )
      throw new ConvexError("Handoff receipt changed");
    await ctx.db.patch(issue._id, {
      engineeringHandoff: { ...h, kind: "ready", rootTs: a.ts },
    });
    await ctx.db.patch(h.deliveryId, {
      status: "sent",
      receipt: `${a.channel}:${a.ts}`,
    });
    return null;
  },
});
