import { engineeringBinding } from "./workspaceValidators";
import { ConvexError, v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc } from "./_generated/dataModel";
import { authorize } from "./cue";
import {
  appInput,
  engineeringInput,
  widgetOptionsInput,
} from "../lib/app-pack-schema";

// Owner of the app-pack aggregate: one row per registered app carrying the
// state every enforcement point needs in-transaction (is it live? may it
// code? what does the team call it?). All writes go through this module;
// lib/app-pack.ts is the Node-side read model and must never write.

type PackDoc = Doc<"appPacks">;

function mintAppId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return (
    "cue_app_" +
    Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

export async function packByAppId(
  ctx: QueryCtx | MutationCtx,
  appId: string,
): Promise<PackDoc | null> {
  const exact = await ctx.db
    .query("appPacks")
    .withIndex("by_appId", (q) => q.eq("appId", appId))
    .unique();
  if (exact) return exact;
  // Legacy alias (e.g. "bloom" predating packs): the table is tiny, scan it.
  const all = await ctx.db.query("appPacks").collect();
  return all.find((p) => (p.aliases ?? []).includes(appId)) ?? null;
}

async function requirePack(ctx: MutationCtx, appId: string): Promise<PackDoc> {
  const pack = await packByAppId(ctx, appId);
  if (!pack) throw new ConvexError("Unknown application");
  return pack;
}

export const register = mutation({
  args: { secret: v.string(), name: v.string(), origins: v.array(v.string()) },
  returns: v.object({ appId: v.string() }),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const input = appInput.parse({ name: a.name, origins: a.origins });
    const now = Date.now();
    const appId = mintAppId();
    await ctx.db.insert("appPacks", {
      appId,
      name: input.name,
      status: "draft",
      origins: input.origins,
      createdAt: now,
      updatedAt: now,
    });
    return { appId };
  },
});

// Backfill/migration upsert: keyed by appId, never mints. Used to project
// the existing vault app (Bloom) into Convex before the code flip.
export const ensure = mutation({
  args: {
    secret: v.string(),
    appId: v.string(),
    name: v.string(),
    origins: v.array(v.string()),
    status: v.union(
      v.literal("draft"),
      v.literal("active"),
      v.literal("suspended"),
    ),
    widget: v.optional(
      v.object({
        answers: v.boolean(),
        voice: v.boolean(),
        screenshots: v.boolean(),
      }),
    ),
    engineering: v.optional(engineeringBinding),
    aliases: v.optional(v.array(v.string())),
  },
  returns: v.id("appPacks"),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const identity = appInput.parse({ name: a.name, origins: a.origins });
    const widget = a.widget ? widgetOptionsInput.parse(a.widget) : undefined;
    const engineering = a.engineering
      ? engineeringInput.parse(a.engineering)
      : undefined;
    const existing = await packByAppId(ctx, a.appId);
    const fields = {
      name: identity.name,
      status: a.status,
      origins: identity.origins,
      widget,
      engineering,
      aliases: a.aliases,
      updatedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, fields);
      return existing._id;
    }
    return await ctx.db.insert("appPacks", {
      appId: a.appId,
      ...fields,
      createdAt: Date.now(),
    });
  },
});

export const activate = mutation({
  args: { secret: v.string(), appId: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const pack = await requirePack(ctx, a.appId);
    if (pack.status === "active") return null;
    if (pack.status !== "draft")
      throw new ConvexError("Use reactivate for a suspended application");
    if (!pack.installCheckedAt)
      throw new ConvexError(
        "Send one message through the installed widget before activating",
      );
    await ctx.db.patch(pack._id, {
      status: "active",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const reactivate = mutation({
  args: { secret: v.string(), appId: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const pack = await requirePack(ctx, a.appId);
    if (pack.status === "active") return null;
    if (pack.status !== "suspended")
      throw new ConvexError("Only a suspended application can be reactivated");
    await ctx.db.patch(pack._id, {
      status: "active",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const suspend = mutation({
  args: { secret: v.string(), appId: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const pack = await requirePack(ctx, a.appId);
    if (pack.status === "suspended") return null;
    await ctx.db.patch(pack._id, {
      status: "suspended",
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const bindEngineering = mutation({
  args: {
    secret: v.string(),
    appId: v.string(),
    repository: v.string(),
    baseBranch: v.string(),
    packageDirectory: v.optional(v.string()),
    packageManager: v.optional(
      v.union(v.literal("npm"), v.literal("bun"), v.literal("none")),
    ),
    allowedPaths: v.array(v.string()),
    testCommands: v.array(
      v.object({ program: v.string(), args: v.array(v.string()) }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const pack = await requirePack(ctx, a.appId);
    const binding = engineeringInput.parse({
      repository: a.repository,
      baseBranch: a.baseBranch,
      packageDirectory: a.packageDirectory,
      packageManager: a.packageManager,
      allowedPaths: a.allowedPaths,
      testCommands: a.testCommands,
    });
    await ctx.db.patch(pack._id, {
      engineering: binding,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const unbindEngineering = mutation({
  args: { secret: v.string(), appId: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const pack = await requirePack(ctx, a.appId);
    await ctx.db.patch(pack._id, {
      engineering: undefined,
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const setWidget = mutation({
  args: {
    secret: v.string(),
    appId: v.string(),
    answers: v.boolean(),
    voice: v.boolean(),
    screenshots: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const pack = await requirePack(ctx, a.appId);
    const widget = widgetOptionsInput.parse({
      answers: a.answers,
      voice: a.voice,
      screenshots: a.screenshots,
    });
    await ctx.db.patch(pack._id, { widget, updatedAt: Date.now() });
    return null;
  },
});

export const setRouting = mutation({
  args: {
    secret: v.string(),
    appId: v.string(),
    label: v.optional(v.string()),
    engineeringChannel: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const pack = await requirePack(ctx, a.appId);
    const label = a.label?.trim();
    if (a.engineeringChannel !== undefined && a.engineeringChannel !== "")
      if (!/^[CG][A-Z0-9]+$/.test(a.engineeringChannel))
        throw new ConvexError("Use a Slack channel ID");
    await ctx.db.patch(pack._id, {
      routing: {
        label: label && label.length > 0 ? label.slice(0, 60) : undefined,
        engineeringChannel:
          a.engineeringChannel && a.engineeringChannel.length > 0
            ? a.engineeringChannel
            : undefined,
      },
      updatedAt: Date.now(),
    });
    return null;
  },
});

export const recordInstallCheck = mutation({
  args: { secret: v.string(), appId: v.string() },
  returns: v.null(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const pack = await requirePack(ctx, a.appId);
    const produced = await ctx.db
      .query("cases")
      .filter((q) => q.eq(q.field("appId"), a.appId))
      .first();
    if (!produced)
      throw new ConvexError(
        "No case has been delivered through this app's widget yet",
      );
    if (!pack.installCheckedAt)
      await ctx.db.patch(pack._id, {
        installCheckedAt: Date.now(),
        updatedAt: Date.now(),
      });
    return null;
  },
});

export const get = query({
  args: { secret: v.string(), appId: v.string() },
  returns: v.union(v.null(), v.any()),
  handler: async (ctx, a) => {
    authorize(a.secret);
    return await packByAppId(ctx, a.appId);
  },
});

export const list = query({
  args: { secret: v.string() },
  returns: v.array(v.any()),
  handler: async (ctx, a) => {
    authorize(a.secret);
    return await ctx.db.query("appPacks").collect();
  },
});
