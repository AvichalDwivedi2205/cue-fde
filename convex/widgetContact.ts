import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { authorize } from "./cue";
import { packByAppId } from "./appPacks";
import { notificationEmail } from "./supportDeliveryValidators";

// Only the signed widget gateway supplies owner; it never comes from a browser body.
export const set = mutation({
  args: {
    secret: v.string(),
    owner: v.string(),
    appId: v.string(),
    caseId: v.id("cases"),
    contact: v.union(
      v.object({ kind: v.literal("opt_in"), address: v.string() }),
      v.object({ kind: v.literal("revoke") }),
    ),
  },
  returns: notificationEmail,
  handler: async (ctx, args) => {
    authorize(args.secret);
    const conversation = await ctx.db.get("cases", args.caseId);
    const pack = await packByAppId(ctx, args.appId);
    if (
      !pack ||
      pack.status !== "active" ||
      !args.owner.startsWith(`widget:${args.appId}:`) ||
      !conversation ||
      conversation.appId !== args.appId ||
      conversation.owner !== args.owner ||
      conversation.sourceKey !== args.owner ||
      conversation.channel !== "chat"
    )
      throw new ConvexError("Wrong app conversation");
    const revision = (conversation.notificationEmail?.revision ?? 0) + 1;
    const now = Date.now();
    const value =
      args.contact.kind === "opt_in"
        ? {
            kind: "opted_in" as const,
            address: args.contact.address.trim().toLowerCase(),
            revision,
            consentedAt: now,
          }
        : { kind: "revoked" as const, revision, revokedAt: now };
    if (
      value.kind === "opted_in" &&
      (value.address.length > 254 ||
        !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value.address))
    )
      throw new ConvexError("Enter a valid notification email address");
    const previous = conversation.notificationEmail;
    if (
      previous?.kind === "opted_in" &&
      value.kind === "opted_in" &&
      previous.address === value.address
    )
      return previous;
    if (previous?.kind === "revoked" && value.kind === "revoked")
      return previous;
    await ctx.db.patch("cases", args.caseId, {
      notificationEmail: value,
      updatedAt: now,
    });
    return value;
  },
});
