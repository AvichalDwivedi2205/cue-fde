/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts"]);
const scope = {
    secret: "context-test",
    workspaceId: "cue-configured-workspace",
    appId: "bloom-context",
  },
  actor = { id: "owner-id", name: "Owner", role: "owner" as const },
  release = "a".repeat(40),
  voice = {
    ...scope,
    actor,
    expectedVersion: 0,
    enabled: true,
    label: "Bloom",
    tone: "warm" as const,
    guidelines: "Plain words",
    examples: ["A little moment worth keeping."],
  };
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", scope.secret));
afterEach(() => vi.unstubAllEnvs());
async function setup(visibility: "customer" | "internal" = "customer") {
  const t = convexTest(schema, modules);
  const sourceId = await t.mutation(api.knowledge.save, {
    ...scope,
    actor: actor.id,
    title: "Caption search",
    kind: "text",
    visibility,
    text: "Find saved captions using all query words",
    hash: "source-hash",
    passages: [
      { text: "Find saved captions using all query words", heading: "Search" },
    ],
  });
  const publish = async () => {
    const detail = await t.query(api.knowledge.detail, { ...scope, sourceId }),
      versionId = detail.version!._id;
    await t.run((ctx) =>
      ctx.db.patch("knowledgeSources", sourceId, {
        pendingVersionId: versionId,
      }),
    );
    const job = await t.mutation(api.knowledge.beginIndex, {
      secret: scope.secret,
      sourceId,
      versionId,
    });
    await t.mutation(api.knowledge.vectors, {
      secret: scope.secret,
      sourceId,
      versionId,
      vectors: job!.chunks.map((c) => ({
        id: c._id,
        embedding: Array(768).fill(0.1),
      })),
    });
    expect(
      await t.mutation(api.knowledge.commit, {
        secret: scope.secret,
        sourceId,
        versionId,
      }),
    ).toBe(true);
    return job!.chunks[0]._id;
  };
  return { t, sourceId, publish };
}
test("voice edits require saved role, a current version and bounded examples; reads isolate apps", async () => {
  const { t } = await setup();
  await expect(
    t.mutation(api.companyContext.saveBrand, {
      ...voice,
      actor: { ...actor, role: "support" },
    }),
  ).rejects.toThrow("Product role");
  await expect(
    t.mutation(api.companyContext.saveBrand, { ...voice, secret: "wrong" }),
  ).rejects.toThrow();
  expect(await t.mutation(api.companyContext.saveBrand, voice)).toBe(1);
  await expect(t.mutation(api.companyContext.saveBrand, voice)).rejects.toThrow(
    "reload",
  );
  await expect(
    t.mutation(api.companyContext.saveBrand, {
      ...voice,
      expectedVersion: 1,
      examples: Array(4).fill("example"),
    }),
  ).rejects.toThrow("Invalid brand");
  expect(await t.query(api.companyContext.brand, scope)).toMatchObject({
    enabled: true,
    version: 1,
  });
  expect(
    await t.query(api.companyContext.brand, { ...scope, appId: "another-app" }),
  ).toMatchObject({ enabled: false, version: 0, examples: [] });
  expect(
    await t.query(api.companyContext.brand, {
      ...scope,
      workspaceId: "another-company",
    }),
  ).toMatchObject({ version: 0 });
});
test("coverage manifest rejects cross-app sources, duplicate requirements and stale edits", async () => {
  const { t, sourceId } = await setup(),
    requirements = [
      {
        id: "capabilities",
        label: "Product capabilities",
        sourceIds: [sourceId],
        audience: "customer" as const,
      },
    ],
    args = { ...scope, actor, expectedRevision: 0, requirements };
  expect(await t.mutation(api.companyContext.saveManifest, args)).toBe(1);
  await expect(
    t.mutation(api.companyContext.saveManifest, args),
  ).rejects.toThrow("reload");
  await expect(
    t.mutation(api.companyContext.saveManifest, {
      ...args,
      appId: "another-app",
    }),
  ).rejects.toThrow("another app");
  await expect(
    t.mutation(api.companyContext.saveManifest, {
      ...args,
      expectedRevision: 1,
      requirements: [...requirements, ...requirements],
    }),
  ).rejects.toThrow("Invalid coverage");
  await expect(
    t.mutation(api.companyContext.saveManifest, {
      ...args,
      expectedRevision: 1,
      requirements: [{ ...requirements[0], maxAgeDays: -1 }],
    }),
  ).rejects.toThrow("Invalid coverage");
  await expect(
    t.mutation(api.companyContext.saveManifest, {
      ...args,
      actor: { ...actor, role: "engineering" },
    }),
  ).rejects.toThrow("Product role");
  expect(
    (
      await t.query(api.companyContext.snapshot, {
        ...scope,
        appId: "another-app",
      })
    ).manifest,
  ).toBeNull();
});
test("coverage tracks actual indexed active revisions separately from newer drafts and failed indexing", async () => {
  const s = await setup();
  let snapshot = await s.t.query(api.companyContext.snapshot, scope);
  expect(snapshot.sources[0]).toMatchObject({
    status: "draft",
    latestPassageCount: 1,
  });
  expect(snapshot.sources[0].activePassageCount).toBeUndefined();
  await s.publish();
  snapshot = await s.t.query(api.companyContext.snapshot, scope);
  expect(snapshot.sources[0]).toMatchObject({
    status: "published",
    activePassageCount: 1,
    activeIndexedPassageCount: 1,
    activeRevision: 1,
  });
  expect(snapshot.sources[0].publishedAt).toBeGreaterThan(0);
  await s.t.mutation(api.knowledge.save, {
    ...scope,
    actor: actor.id,
    sourceId: s.sourceId,
    expectedRevision: 1,
    title: "Search v2",
    kind: "text",
    visibility: "customer",
    text: "New guidance",
    hash: "v2",
    passages: [
      { text: "New guidance", heading: "Search" },
      { text: "Another passage", heading: "More" },
    ],
  });
  snapshot = await s.t.query(api.companyContext.snapshot, scope);
  expect(snapshot.sources[0]).toMatchObject({
    activeRevision: 1,
    revision: 2,
    latestPassageCount: 2,
    activePassageCount: 1,
  });
  expect(snapshot.sources[0].activeVersionId).not.toBe(
    snapshot.sources[0].latestVersionId,
  );
  const versionId = snapshot.sources[0].latestVersionId!;
  await s.t.run((ctx) =>
    ctx.db.patch("knowledgeSources", s.sourceId, {
      pendingVersionId: versionId,
    }),
  );
  expect(
    await s.t.mutation(api.knowledge.commit, {
      secret: scope.secret,
      sourceId: s.sourceId,
      versionId,
      error: "Embedding unavailable",
    }),
  ).toBe(false);
  expect(
    (await s.t.query(api.companyContext.snapshot, scope)).sources[0],
  ).toMatchObject({ indexStatus: "failed", activeRevision: 1 });
});
test("metadata backfill is bounded and never invents a historical publication date", async () => {
  const s = await setup();
  await s.publish();
  await s.t.run((ctx) =>
    ctx.db.patch("knowledgeSources", s.sourceId, {
      activePassageCount: undefined,
      latestPassageCount: undefined,
      publishedAt: undefined,
    }),
  );
  expect(await s.t.mutation(api.companyContext.backfill, scope)).toBe(1);
  const saved = (await s.t.query(api.companyContext.snapshot, scope))
    .sources[0];
  expect(saved).toMatchObject({
    activePassageCount: 1,
    activeIndexedPassageCount: 1,
    latestPassageCount: 1,
  });
  expect(saved.publishedAt).toBeUndefined();
  expect(await s.t.mutation(api.companyContext.backfill, scope)).toBe(0);
});
async function growthSetup(visibility: "customer" | "internal" = "customer") {
  const s = await setup(visibility),
    chunkId = await s.publish(),
    link = "https://cue.test/g/context",
    text = "Bloom finds saved captions using all query words: " + link;
  const { capabilityId, opportunityId, touchId } = await s.t.run(
    async (ctx) => {
      const capabilityId = await ctx.db.insert("growthCapabilities", {
        appId: scope.appId,
        name: "Caption search",
        need: "Find saved captions",
        claims: ["Search captions using all words"],
        release,
        evidence: "Isolated acceptance fixture",
        version: 1,
        valid: true,
        checkedAt: Date.now(),
      });
      const campaignId = await ctx.db.insert("growthCampaigns", {
        appId: scope.appId,
        capabilityId,
        name: "Search",
        query: "caption journal",
        paused: true,
        dailyLimit: 20,
        used: 0,
        budgetDay: "2026-10-12",
      });
      const opportunityId = await ctx.db.insert("growthOpportunities", {
        appId: scope.appId,
        campaignId,
        sourceKey: "x:123",
        sourceUrl: "https://x.test/status/123",
        channel: "x",
        author: "@fixture",
        text: "Anyone recommend a photo journal app to find saved captions?",
        sourceAt: Date.now(),
        provenance: "Isolated fixture",
        controlled: true,
        eligible: true,
        capabilityId,
        status: "qualified",
        reasons: ["Explicit request"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const touchId = await ctx.db.insert("growthTouches", {
        appId: scope.appId,
        campaignId,
        opportunityId,
        tokenHash: "b".repeat(64),
        link,
        expiresAt: Date.now() + 86400000,
        destination: "https://bloom.test",
        status: "unpublished",
        clicks: 0,
        createdAt: Date.now(),
      });
      return { capabilityId, opportunityId, touchId };
    },
  );
  const grounding = {
    workspaceId: scope.workspaceId,
    chunkIds: [chunkId],
    retrieval: "hybrid",
    brandVersion: 0,
  };
  const args = {
    secret: scope.secret,
    actor,
    appId: scope.appId,
    opportunityId,
    release,
    text,
    hash: "c".repeat(64),
    grounding,
  };
  return { ...s, capabilityId, opportunityId, touchId, args, grounding };
}
async function review(s: Awaited<ReturnType<typeof growthSetup>>) {
  const draftId = await s.t.mutation(api.growth.saveDraft, s.args),
    args = {
      secret: scope.secret,
      actor,
      appId: scope.appId,
      draftId,
      release,
      hash: s.args.hash,
    };
  await s.t.mutation(api.growth.requestReview, args);
  return { draftId, args };
}
test.each(["withdraw", "supersede", "brand"])(
  "%s invalidates exact Growth approval and keeps original evidence",
  async (change) => {
    const s = await growthSetup(),
      d = await review(s);
    if (change === "withdraw")
      await s.t.mutation(api.knowledge.withdraw, {
        ...scope,
        sourceId: s.sourceId,
      });
    else if (change === "brand")
      await s.t.mutation(api.companyContext.saveBrand, voice);
    else {
      await s.t.mutation(api.knowledge.save, {
        ...scope,
        actor: actor.id,
        sourceId: s.sourceId,
        expectedRevision: 1,
        title: "Updated search",
        kind: "text",
        visibility: "customer",
        text: "All caption query words",
        hash: "changed",
        passages: [{ text: "All caption query words", heading: "Search" }],
      });
      await s.publish();
    }
    await expect(
      s.t.mutation(api.growth.decide, { ...d.args, approve: true }),
    ).rejects.toThrow("knowledge or brand voice changed");
    const evidence = await s.t.query(api.companyContext.growthEvidence, {
      ...scope,
      draftIds: [d.draftId],
    });
    expect(evidence[0]).toMatchObject({
      current: false,
      legacy: false,
      brandVersion: 0,
      passages: [{ title: "Caption search", revision: 1 }],
    });
    expect(
      (
        await s.t.query(api.growth.snapshot, {
          secret: scope.secret,
          appId: scope.appId,
        })
      ).drafts[0].status,
    ).toBe("requested");
    // A reviewer can still reject stale text.
    await s.t.mutation(api.growth.decide, { ...d.args, approve: false });
  },
);
test("private and cross-app passages cannot ground public Growth or disclose through evidence", async () => {
  const s = await growthSetup("internal");
  await expect(s.t.mutation(api.growth.saveDraft, s.args)).rejects.toThrow(
    "knowledge or brand voice changed",
  );
  const publicSetup = await growthSetup();
  const d = await review(publicSetup);
  await expect(
    publicSetup.t.query(api.companyContext.growthEvidence, {
      ...scope,
      appId: "other-app",
      draftIds: [d.draftId],
    }),
  ).rejects.toThrow("another app");
  await expect(
    publicSetup.t.mutation(api.growth.saveDraft, {
      ...publicSetup.args,
      grounding: { ...publicSetup.grounding, workspaceId: "other-company" },
    }),
  ).rejects.toThrow("knowledge or brand voice changed");
});
test("source changes during generation cannot save a draft; new receipts force a new text version even for identical text", async () => {
  const s = await growthSetup();
  const first = await s.t.mutation(api.growth.saveDraft, s.args);
  await s.t.mutation(api.companyContext.saveBrand, voice);
  await expect(s.t.mutation(api.growth.saveDraft, s.args)).rejects.toThrow(
    "knowledge or brand voice changed",
  );
  const second = await s.t.mutation(api.growth.saveDraft, {
    ...s.args,
    grounding: { ...s.grounding, brandVersion: 1 },
  });
  expect(second).not.toBe(first);
  const drafts = (
    await s.t.query(api.growth.snapshot, {
      secret: scope.secret,
      appId: scope.appId,
    })
  ).drafts;
  expect(drafts.map((d) => d.version)).toEqual([2, 1]);
  expect(drafts[0].status).toBe("draft");
});
test("source and voice are rechecked both before publication report and after the provider read", async () => {
  const s = await growthSetup(),
    d = await review(s);
  await s.t.mutation(api.growth.decide, { ...d.args, approve: true });
  const report = { ...d.args, publicationUrl: "https://x.test/status/999" };
  await s.t.mutation(api.growthAttribution.report, report);
  await s.t.mutation(api.companyContext.saveBrand, voice);
  await expect(
    s.t.mutation(api.growthAttribution.report, report),
  ).rejects.toThrow("knowledge or brand voice changed");
  await expect(
    s.t.mutation(api.growthAttribution.verify, {
      secret: scope.secret,
      touchId: s.touchId,
      hash: d.args.hash,
      publicationUrl: report.publicationUrl,
      ok: true,
      method: "Isolated read",
    }),
  ).rejects.toThrow("knowledge or brand voice changed");
  expect(
    (
      await s.t.query(api.growth.snapshot, {
        secret: scope.secret,
        appId: scope.appId,
      })
    ).touches[0].status,
  ).toBe("reported");
});
test.each(["text", "voice"])(
  "%s widget answers recheck brand version atomically before delivery",
  async (medium) => {
    const s = await setup(),
      chunkId = await s.publish(),
      owner = "widget:" + scope.appId + ":context-verification";
    const knowledge = {
      workspaceId: scope.workspaceId,
      usedChunkIds: [chunkId],
      citedChunkIds: [chunkId],
      status: "answered",
      provider: "google",
      model: "gemini-2.5-flash",
      inputTokens: 20,
      outputTokens: 10,
      brandVersion: 0,
    };
    await s.t.mutation(api.companyContext.saveBrand, voice);
    let caseId: Id<"cases">;
    if (medium === "text")
      caseId = (
        await s.t.mutation(api.intake.widgetMessage, {
          secret: scope.secret,
          owner,
          appId: scope.appId,
          customer: "Fixture",
          title: "Search",
          body: "Find captions",
          initialBody: "Find captions",
          sourceUrl: "https://bloom.test",
          ack: "Stale styled answer",
          knowledge,
        })
      ).caseId;
    else {
      const sessionId = await s.t.mutation(api.voice.start, {
          secret: scope.secret,
          owner,
          appId: scope.appId,
          customer: "Fixture",
        }),
        key = "a0000000-0000-4000-8000-000000000011";
      await s.t.mutation(api.voice.claim, {
        secret: scope.secret,
        owner,
        sessionId,
        key,
      });
      caseId = await s.t.mutation(api.voice.finish, {
        secret: scope.secret,
        owner,
        sessionId,
        key,
        transcript: "Find captions",
        reply: "Stale styled answer",
        knowledge,
      });
    }
    const messages = await s.t.run((ctx) =>
      ctx.db
        .query("messages")
        .withIndex("by_caseId_and_createdAt", (q) => q.eq("caseId", caseId))
        .take(20),
    );
    expect(messages.some((m) => m.body === "Stale styled answer")).toBe(false);
    expect(messages.some((m) => m.body.includes("information changed"))).toBe(
      true,
    );
    expect(
      await s.t.run((ctx) =>
        ctx.db
          .query("knowledgeEvidence")
          .withIndex("by_caseId", (q) => q.eq("caseId", caseId))
          .take(20),
      ),
    ).toHaveLength(0);
  },
);
