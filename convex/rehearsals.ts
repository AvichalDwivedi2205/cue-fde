import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./cue";
import { rehearsalForApp } from "./rehearsalScope";
import {
  validateRehearsal,
  rehearsalFingerprint,
} from "../lib/rehearsal-policy";

const registration = v.object({
  appId: v.string(),
  key: v.string(),
  frontendOrigin: v.string(),
  backendOrigin: v.string(),
  cueOrigin: v.string(),
  repository: v.optional(v.string()),
});

// Only the authenticated companion can register an owned loopback fixture.
// Each app is permanently bound to one scenario; fresh rehearsals get new app IDs.
export const register = mutation({
  args: { secret: v.string(), registration },
  returns: v.id("issues"),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const value = validateRehearsal(a.registration);
    const old = await rehearsalForApp(ctx, value.appId);
    if (
      old &&
      (
        [
          "appId",
          "key",
          "frontendOrigin",
          "backendOrigin",
          "cueOrigin",
          "repository",
        ] as const
      ).some((field) => old[field] !== value[field])
    )
      throw new ConvexError(
        "Rehearsal registration is immutable; use a new app",
      );
    if (!old)
      await ctx.db.insert("serverState", {
        key: `rehearsal:${value.appId}`,
        value: JSON.stringify(value),
        version: 1,
        updatedAt: Date.now(),
      });
    const fingerprint = rehearsalFingerprint(value.appId, value.key);
    const issue = await ctx.db
      .query("issues")
      .withIndex("by_fingerprint", (q) => q.eq("fingerprint", fingerprint))
      .unique();
    if (issue) return issue._id;
    const issueId = await ctx.db.insert("issues", {
      appId: value.appId,
      fingerprint,
      kind: "bug",
      status: "open",
      priority: "P1",
      title: "Photos above 2 MB fail to upload",
      description:
        "Controlled regression on an owned isolated journal. The interface promises 5 MB while this fixture rejects a valid 3 MB PNG. Production Bloom is unaffected.",
      tags: ["Uploads", "Controlled rehearsal"],
      createdAt: Date.now(),
    });
    await ctx.db.insert("events", {
      issueId,
      title: "Isolated rehearsal registered",
      kind: "system",
      detail: `Scenario ${value.key}; app ${value.appId}; frontend ${value.frontendOrigin}; protected upload service ${value.backendOrigin}. No customer report, Codex execution, approval or release is claimed by registration.`,
      createdAt: Date.now(),
    });
    return issueId;
  },
});

export const get = query({
  args: { secret: v.string(), appId: v.string() },
  returns: v.union(v.null(), registration),
  handler: async (ctx, a) => {
    authorize(a.secret);
    return await rehearsalForApp(ctx, a.appId);
  },
});
