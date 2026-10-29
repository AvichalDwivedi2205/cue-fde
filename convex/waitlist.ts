import { v } from "convex/values";
import { RateLimiter, MINUTE } from "@convex-dev/rate-limiter";
import { components } from "./_generated/api";
import { mutation } from "./_generated/server";
import { authorize } from "./cue";
import { waitlistEmail } from "../lib/waitlist-policy";

const limiter = new RateLimiter(components.rateLimiter, {
  signup: { kind: "token bucket", rate: 5, period: MINUTE, capacity: 10 },
  total: { kind: "token bucket", rate: 60, period: MINUTE, capacity: 100 },
});

export const join = mutation({
  args: { secret: v.string(), email: v.string(), clientKey: v.string() },
  returns: v.union(
    v.object({ status: v.literal("ok") }),
    v.object({ status: v.literal("rate_limited"), retryAfterMs: v.number() }),
  ),
  handler: async (ctx, args) => {
    // Only Cue's server can write signups; emails have no public read endpoint.
    authorize(args.secret);
    const email = waitlistEmail.parse(args.email);
    if (!/^[a-f0-9]{64}$/.test(args.clientKey))
      throw new Error("Invalid signup");
    const local = await limiter.limit(ctx, "signup", { key: args.clientKey });
    if (!local.ok)
      return {
        status: "rate_limited" as const,
        retryAfterMs: local.retryAfter,
      };
    const global = await limiter.limit(ctx, "total");
    if (!global.ok)
      return {
        status: "rate_limited" as const,
        retryAfterMs: global.retryAfter,
      };

    const existing = await ctx.db
      .query("waitlist")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!existing)
      await ctx.db.insert("waitlist", {
        email,
        joinedAt: Date.now(),
        source: "cue-waitlist",
      });
    // Return the same acknowledgement for new and existing addresses.
    return { status: "ok" as const };
  },
});
