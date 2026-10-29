import { v, ConvexError } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import { authorize } from "./cue";
import schema from "./schema";
import { actor } from "./workspaceValidators";
import {
  brandFields,
  contextRequirement,
  growthGrounding,
  growthSourceReceipt,
} from "./companyContextSchema";
import { DEFAULT_BRAND } from "../lib/company-context-policy";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../lib/knowledge-policy";

const scope = {
  secret: v.string(),
  workspaceId: v.string(),
  appId: v.string(),
};
export async function currentBrand(
  ctx: QueryCtx,
  workspaceId: string,
  appId: string,
) {
  const b = await ctx.db
    .query("brandVoices")
    .withIndex("by_workspaceId_and_appId", (q) =>
      q.eq("workspaceId", workspaceId).eq("appId", appId),
    )
    .unique();
  return b
    ? {
        enabled: b.enabled,
        label: b.label,
        tone: b.tone,
        guidelines: b.guidelines,
        examples: b.examples,
        version: b.version,
      }
    : DEFAULT_BRAND;
}
export async function brandCurrent(
  ctx: QueryCtx,
  workspaceId: string,
  appId: string,
  version?: number,
) {
  return (
    version === undefined ||
    (await currentBrand(ctx, workspaceId, appId)).version === version
  );
}
export async function groundingCurrent(
  ctx: QueryCtx,
  appId: string,
  g?: typeof growthGrounding.type,
) {
  if (!g) return true; // Retained legacy evidence has no knowledge receipt.
  if (
    g.chunkIds.length > 4 ||
    new Set(g.chunkIds).size !== g.chunkIds.length ||
    !(await brandCurrent(ctx, g.workspaceId, appId, g.brandVersion))
  )
    return false;
  for (const id of g.chunkIds) {
    const c = await ctx.db.get("knowledgeChunks", id);
    if (!c || c.workspaceId !== g.workspaceId || c.appId !== appId)
      return false;
    const s = await ctx.db.get("knowledgeSources", c.sourceId);
    if (
      !s ||
      s.workspaceId !== g.workspaceId ||
      s.appId !== appId ||
      s.status !== "published" ||
      s.visibility !== "customer" ||
      s.activeVersionId !== c.versionId
    )
      return false;
  }
  return true;
}
export async function requireGrounding(
  ctx: QueryCtx,
  appId: string,
  g?: typeof growthGrounding.type,
) {
  if (!(await groundingCurrent(ctx, appId, g)))
    throw new ConvexError(
      "Company knowledge or brand voice changed. Generate a new draft before review or publication.",
    );
}
export const brand = query({
  args: scope,
  returns: v.object({ ...brandFields, version: v.number() }),
  handler: async (ctx, a) => {
    authorize(a.secret);
    return currentBrand(ctx, a.workspaceId, a.appId);
  },
});
export const snapshot = query({
  args: scope,
  returns: v.object({
    brand: v.object({ ...brandFields, version: v.number() }),
    manifest: v.union(v.null(), schema.doc("contextManifests")),
    sources: v.array(schema.doc("knowledgeSources")),
  }),
  handler: async (ctx, a) => {
    authorize(a.secret);
    return {
      brand: await currentBrand(ctx, a.workspaceId, a.appId),
      manifest: await ctx.db
        .query("contextManifests")
        .withIndex("by_workspaceId_and_appId", (q) =>
          q.eq("workspaceId", a.workspaceId).eq("appId", a.appId),
        )
        .unique(),
      sources: await ctx.db
        .query("knowledgeSources")
        .withIndex("by_workspaceId_and_appId", (q) =>
          q.eq("workspaceId", a.workspaceId).eq("appId", a.appId),
        )
        .order("desc")
        .take(100),
    };
  },
});
export const growthEvidence = query({
  args: { ...scope, draftIds: v.array(v.id("growthDrafts")) },
  returns: v.array(
    v.object({
      draftId: v.id("growthDrafts"),
      current: v.boolean(),
      legacy: v.boolean(),
      brandVersion: v.optional(v.number()),
      retrieval: v.optional(v.string()),
      passages: v.array(growthSourceReceipt),
    }),
  ),
  handler: async (ctx, a) => {
    authorize(a.secret);
    if (a.draftIds.length > 100) throw new ConvexError("Too many drafts");
    const result = [];
    for (const id of a.draftIds) {
      const d = await ctx.db.get("growthDrafts", id);
      const o = d && (await ctx.db.get("growthOpportunities", d.opportunityId));
      if (!d || o?.appId !== a.appId)
        throw new ConvexError("Draft belongs to another app");
      const g = d.grounding;
      if (g && g.workspaceId !== a.workspaceId)
        throw new ConvexError("Draft belongs to another workspace");
      const passages = d.contextSources ? [...d.contextSources] : [];
      for (const chunkId of (d.contextSources ? [] : g?.chunkIds || []).slice(
        0,
        4,
      )) {
        const c = await ctx.db.get("knowledgeChunks", chunkId);
        if (!c || c.workspaceId !== a.workspaceId || c.appId !== a.appId)
          continue;
        const version = await ctx.db.get("knowledgeVersions", c.versionId);
        if (version)
          passages.push({
            sourceId: c.sourceId,
            versionId: c.versionId,
            title: version.title,
            revision: version.revision,
            heading: c.heading,
            excerpt: c.text,
          });
      }
      result.push({
        draftId: id,
        current: await groundingCurrent(ctx, a.appId, g),
        legacy: !g,
        passages,
        ...(g ? { brandVersion: g.brandVersion, retrieval: g.retrieval } : {}),
      });
    }
    return result;
  },
});
export const saveBrand = mutation({
  args: { ...scope, actor, expectedVersion: v.number(), ...brandFields },
  returns: v.number(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    if (!["owner", "product"].includes(a.actor.role))
      throw new ConvexError("Owner or Product role required");
    if (
      a.label.length > 80 ||
      a.guidelines.length > 1000 ||
      a.examples.length > 3 ||
      a.examples.some((e) => !e.trim() || e.length > 1200)
    )
      throw new ConvexError(
        "Invalid brand voice; use up to three examples of 1,200 characters",
      );
    const old = await ctx.db
      .query("brandVoices")
      .withIndex("by_workspaceId_and_appId", (q) =>
        q.eq("workspaceId", a.workspaceId).eq("appId", a.appId),
      )
      .unique();
    if (a.expectedVersion !== (old?.version || 0))
      throw new ConvexError("Brand voice changed; reload before saving");
    const data = {
      workspaceId: a.workspaceId,
      appId: a.appId,
      enabled: a.enabled,
      label: a.label.trim(),
      tone: a.tone,
      guidelines: a.guidelines.trim(),
      examples: a.examples.map((e) => e.trim()),
      version: (old?.version || 0) + 1,
      updatedBy: a.actor.id,
      updatedAt: Date.now(),
    };
    if (old) await ctx.db.patch("brandVoices", old._id, data);
    else await ctx.db.insert("brandVoices", data);
    return data.version;
  },
});
export const saveManifest = mutation({
  args: {
    ...scope,
    actor,
    expectedRevision: v.number(),
    requirements: v.array(contextRequirement),
  },
  returns: v.number(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    if (!["owner", "product"].includes(a.actor.role))
      throw new ConvexError("Owner or Product role required");
    if (
      a.requirements.length > 20 ||
      new Set(a.requirements.map((r) => r.id)).size !== a.requirements.length ||
      a.requirements.some(
        (r) =>
          !r.id ||
          r.id.length > 80 ||
          !r.label.trim() ||
          r.label.length > 100 ||
          r.sourceIds.length > 10 ||
          new Set(r.sourceIds).size !== r.sourceIds.length ||
          (r.maxAgeDays !== undefined &&
            (!Number.isInteger(r.maxAgeDays) ||
              r.maxAgeDays < 1 ||
              r.maxAgeDays > 3650)),
      )
    )
      throw new ConvexError("Invalid coverage requirements");
    for (const id of new Set(a.requirements.flatMap((r) => r.sourceIds))) {
      const s = await ctx.db.get("knowledgeSources", id);
      if (!s || s.workspaceId !== a.workspaceId || s.appId !== a.appId)
        throw new ConvexError(
          "Required source belongs to another app or workspace",
        );
    }
    const old = await ctx.db
      .query("contextManifests")
      .withIndex("by_workspaceId_and_appId", (q) =>
        q.eq("workspaceId", a.workspaceId).eq("appId", a.appId),
      )
      .unique();
    if (a.expectedRevision !== (old?.revision || 0))
      throw new ConvexError(
        "Coverage requirements changed; reload before saving",
      );
    const data = {
      workspaceId: a.workspaceId,
      appId: a.appId,
      requirements: a.requirements,
      revision: (old?.revision || 0) + 1,
      updatedBy: a.actor.id,
      updatedAt: Date.now(),
    };
    if (old) await ctx.db.patch("contextManifests", old._id, data);
    else await ctx.db.insert("contextManifests", data);
    return data.revision;
  },
});
// Bounded one-time metadata backfill for sources published before coverage existed.
export const backfill = mutation({
  args: scope,
  returns: v.number(),
  handler: async (ctx, a) => {
    authorize(a.secret);
    const sources = await ctx.db
      .query("knowledgeSources")
      .withIndex("by_workspaceId_and_appId", (q) =>
        q.eq("workspaceId", a.workspaceId).eq("appId", a.appId),
      )
      .take(100);
    let count = 0;
    for (const s of sources
      .filter(
        (s) =>
          s.latestPassageCount === undefined ||
          (s.activeVersionId && s.activePassageCount === undefined),
      )
      .slice(0, 5)) {
      const latest = s.latestVersionId
        ? await ctx.db
            .query("knowledgeChunks")
            .withIndex("by_versionId", (q) =>
              q.eq("versionId", s.latestVersionId!),
            )
            .take(161)
        : [];
      const active =
        s.activeVersionId === s.latestVersionId
          ? latest
          : s.activeVersionId
            ? await ctx.db
                .query("knowledgeChunks")
                .withIndex("by_versionId", (q) =>
                  q.eq("versionId", s.activeVersionId!),
                )
                .take(161)
            : [];
      const version = s.activeVersionId
        ? await ctx.db.get("knowledgeVersions", s.activeVersionId)
        : null;
      await ctx.db.patch("knowledgeSources", s._id, {
        latestPassageCount: latest.length,
        ...(s.activeVersionId
          ? {
              activePassageCount: active.length,
              activeIndexedPassageCount: active.filter(
                (c) =>
                  c.embeddingModel === EMBEDDING_MODEL &&
                  c.embedding?.length === EMBEDDING_DIMENSIONS,
              ).length,
              activeRevision: version?.revision,
            }
          : {}),
      });
      count++;
    }
    return count;
  },
});
