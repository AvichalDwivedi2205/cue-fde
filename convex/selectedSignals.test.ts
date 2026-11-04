/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { signalsExportSchema } from "../lib/signals-schema";

const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts"]);
const secret = "selected-signals-secret";
const receipt = { provider: "meta", requestedModel: "test-model", model: "test-model", inputTokens: 20, outputTokens: 10, durationMs: 2 };
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", secret));
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const appId of ["application-a", "application-b"])
      await ctx.db.insert("appPacks", { appId, name: appId, status: "active", origins: [], createdAt: 1, updatedAt: 1 });
  });
  return t;
}
type TestStore = Awaited<ReturnType<typeof setup>>;
async function source(t: TestStore, index: number, overrides: Partial<Omit<Doc<"cases">, "_id" | "_creationTime">> = {}) {
  return t.run((ctx) => ctx.db.insert("cases", {
    appId: "application-a", channel: "x", customer: index === 1 ? "@firsthandle" : "@renamedhandle",
    providerAuthorId: "7358192", sourceKey: `x:${2109012253718773800n + BigInt(index)}`,
    externalId: `x-api:x:${2109012253718773800n + BigInt(index)}`,
    sourceUrl: `https://x.com/${index === 1 ? "firsthandle" : "renamedhandle"}/status/${2109012253718773800n + BigInt(index)}`,
    title: "Recovery", body: index === 1 ? "Please recover cleared boards." : "We need board recovery too.",
    initials: "U", status: "new", priority: "low", tags: [],
    provenance: "Imported from official X API · public post and author supplied by X", createdAt: index, updatedAt: index, ...overrides,
  }));
}
function imported(t: TestStore, caseIds: Id<"cases">[], requestKey = "selected") {
  return t.mutation(api.signals.createNativeSignalBatch, { secret, appId: "application-a", requestKey, caseIds, actor: "Reviewer" });
}
async function analyze(t: TestStore, batchId: Id<"signalBatches">) {
  const batch = await t.query(api.signals.getSignalBatch, { secret, batchId });
  if (!batch) throw new Error("Batch missing");
  const claim = await t.mutation(api.signals.analyzeSignalBatch, { secret, batchId, expectedFingerprint: batch.inputFingerprint });
  if (!("token" in claim) || typeof claim.token !== "string") throw new Error("Claim rejected");
  await t.mutation(api.signals.completeSignalAttempt, { secret, batchId, token: claim.token, receipt, output: {
    dispositions: batch.posts.map((post) => ({ postId: post.id, outcome: "evidence", clusterId: "c-recover", quote: post.text, reason: "Requests recovery." })),
    clusters: [{ id: "c-recover", need: "Recover cleared boards", rationale: "The posts request recovery.", proposal: {
      title: "Recover cleared boards", assumptions: [], specification: { need: "Recover cleared boards", specification: "List and restore cleared boards.", acceptanceCriteria: ["Cleared boards are listed", "Restoring returns saved content"] },
    } }],
  } });
  const result = await t.query(api.signals.getSignalBatch, { secret, batchId });
  if (!result?.analysis) throw new Error("Analysis missing");
  return result;
}
async function review(t: TestStore, batchId: Id<"signalBatches">) {
  const batch = await t.query(api.signals.getSignalBatch, { secret, batchId });
  if (!batch?.analysis) throw new Error("Analysis missing");
  return t.mutation(api.signals.reviewSignalExport, { secret, batchId, expectedFingerprint: batch.inputFingerprint, expectedAnalysisRevision: batch.analysis.revision, actor: "Reviewer" });
}

test("selected native sources freeze exact saved content, source references and stable author IDs; same key replays without analysis", async () => {
  const t = await setup();
  const one = await source(t, 1), two = await source(t, 2);
  const eligible = await t.query(api.signals.listNativeSignalSources, { secret, appId: "application-a" });
  expect(eligible).toHaveLength(2);
  expect(eligible.some((post) => post.sourceRef === "https://x.com/firsthandle/status/2109012253718773801")).toBe(true);
  expect(JSON.stringify(eligible)).not.toContain("7358192");
  const created = await imported(t, [one, two]);
  expect(await imported(t, [two, one])).toEqual({ batchId: created.batchId, created: false });
  const saved = await t.query(api.signals.getSignalBatch, { secret, batchId: created.batchId });
  expect(saved).toMatchObject({ state: "ready", provenance: { kind: "native-x" }, attempts: [] });
  expect(saved!.posts[0]).toMatchObject({ providerAuthorId: "7358192", sourceRef: "https://x.com/firsthandle/status/2109012253718773801", text: "Please recover cleared boards." });
  await t.run((ctx) => ctx.db.patch("cases", one, { body: "Different saved input" }));
  await expect(imported(t, [one, two])).rejects.toThrow(/different input/);
  expect((await t.query(api.signals.getSignalBatch, { secret, batchId: created.batchId }))!.posts).toEqual(saved!.posts);
});

test("cross-app, inactive, forged native, missing author and inconsistent source references are rejected before import", async () => {
  const t = await setup();
  const rejected = [
    await source(t, 1, { appId: "application-b" }),
    await source(t, 2, { provenance: "Operator URL" }),
    await source(t, 3, { providerAuthorId: undefined }),
    await source(t, 4, { sourceKey: "x:999" }),
    await source(t, 5, { externalId: "notification:123" }),
  ];
  for (const id of rejected) await expect(imported(t, [id])).rejects.toThrow();
  expect(await t.query(api.signals.listNativeSignalSources, { secret, appId: "application-a" })).toEqual([]);
  const good = await source(t, 6);
  await t.run(async (ctx) => {
    const pack = await ctx.db.query("appPacks").withIndex("by_appId", (q) => q.eq("appId", "application-a")).unique();
    if (pack) await ctx.db.patch("appPacks", pack._id, { status: "draft" });
  });
  await expect(imported(t, [good])).rejects.toThrow(/not active/);
});

test("generic imports cannot claim native provenance or stable provider identity; operator references remain exact", async () => {
  const t = await setup();
  const args = { secret, appId: "application-a", requestKey: "manual", actor: "Reviewer", posts: [{ id: "manual", author: "Display", text: "Recover boards", sourceRef: "https://x.com/user/status/123?exact=1" }] };
  await expect(t.mutation(api.signals.createSignalBatch, { ...args, provenance: { kind: "native-x" } })).rejects.toThrow();
  await expect(t.mutation(api.signals.createSignalBatch, { ...args, provenance: { kind: "operator-capture", note: "Captured manually" }, posts: [{ ...args.posts[0], providerAuthorId: "123" }] })).rejects.toThrow(/selected saved X/);
  const { batchId } = await t.mutation(api.signals.createSignalBatch, { ...args, provenance: { kind: "operator-capture", note: "Captured manually" } });
  expect((await t.query(api.signals.getSignalBatch, { secret, batchId }))!.posts[0].sourceRef).toBe(args.posts[0].sourceRef);
  await expect(t.mutation(api.signals.createSignalBatch, { ...args, provenance: { kind: "synthetic-fixture", fixture: "spoof", version: "1" } })).rejects.toThrow(/different input/);
});

test("verified same-author handles count once and v2 aliases use stable identity, with exact approved quotes and no private data", async () => {
  const t = await setup();
  const cases = [await source(t, 1), await source(t, 2)];
  const { batchId } = await imported(t, cases);
  const batch = await analyze(t, batchId);
  expect(batch.analysis!.stats.distinctEvidenceAuthors).toBe(1);
  expect(batch.analysis!.clusters[0]).toMatchObject({ distinctAuthors: 1, repeatedEvidence: false });
  await expect(t.query(api.demoEvidence.signalEvidence, { secret, batchId })).rejects.toThrow(/reviewed projection/);
  await expect(t.mutation(api.signals.reviewSignalExport, { secret, batchId, expectedFingerprint: "0".repeat(16), expectedAnalysisRevision: 1, actor: "Reviewer" })).rejects.toThrow(/Review must match/);
  await expect(t.mutation(api.signals.reviewSignalExport, { secret, batchId, expectedFingerprint: batch.inputFingerprint, expectedAnalysisRevision: 2, actor: "Reviewer" })).rejects.toThrow(/Review must match/);
  await review(t, batchId);
  const evidence = signalsExportSchema.parse(await t.query(api.demoEvidence.signalEvidence, { secret, batchId }));
  expect(evidence).toMatchObject({ schemaVersion: 2, sourceKind: "selected-public", provenance: { kind: "native-x", syntheticAuthors: false }, review: { inputFingerprint: batch.inputFingerprint, analysisRevision: 1 } });
  expect(evidence.posts.map((post) => post.author)).toEqual(["Author 1", "Author 1"]);
  expect(evidence.posts.map((post) => post.text)).toEqual(batch.posts.map((post) => post.text));
  expect(evidence.clusters[0].sources.map((post) => post.quote)).toEqual(batch.posts.map((post) => post.text));
  const serialized = JSON.stringify(evidence);
  for (const privateValue of [...cases, "firsthandle", "renamedhandle", "7358192", "sourceRef", "providerAuthorId", "https://", batchId, "Reviewer", "2109012253718773801"]) expect(serialized).not.toContain(privateValue);
  await t.run((ctx) => ctx.db.patch("signalBatches", batchId, { analysis: { ...batch.analysis!, revision: 2 } }));
  await expect(t.query(api.demoEvidence.signalEvidence, { secret, batchId })).rejects.toThrow(/matching the saved input/);
});

test("same display handle with different verified author IDs counts twice", async () => {
  const t = await setup();
  const one = await source(t, 1, { customer: "@shared" }), two = await source(t, 2, { customer: "@shared", providerAuthorId: "8491273" });
  const { batchId } = await imported(t, [one, two]);
  const batch = await analyze(t, batchId);
  expect(batch.analysis!.clusters[0]).toMatchObject({ distinctAuthors: 2, repeatedEvidence: true });
  await review(t, batchId);
  const evidence = await t.query(api.demoEvidence.signalEvidence, { secret, batchId });
  expect(evidence.posts.map((post) => post.author)).toEqual(["Author 1", "Author 2"]);
});

test("reviewed real source export refuses unsafe exact text instead of redacting it", async () => {
  const t = await setup();
  const one = await source(t, 1, { body: "Recover my board and email me at private@example.com" });
  const { batchId } = await imported(t, [one]);
  const batch = await analyze(t, batchId);
  await review(t, batchId);
  await expect(t.query(api.demoEvidence.signalEvidence, { secret, batchId })).rejects.toThrow(/private identifier/);
  const saved = await t.query(api.signals.getSignalBatch, { secret, batchId });
  expect(saved!.analysis!.clusters[0].sources[0].quote).toBe(batch.posts[0].text);
  await t.run((ctx) => ctx.db.patch("signalBatches", batchId, { posts: [{ ...batch.posts[0], text: "Silently changed" }] }));
  await expect(t.query(api.demoEvidence.signalEvidence, { secret, batchId })).rejects.toThrow(/fingerprint/);
});

test("operator capture gets honest reviewed v2 provenance and preserves exact source input", async () => {
  const t = await setup();
  const { batchId } = await t.mutation(api.signals.createSignalBatch, { secret, appId: "application-a", requestKey: "operator", actor: "Reviewer", provenance: { kind: "operator-capture", note: "Manually captured public post" }, posts: [{ id: "capture1", author: "@manualhandle", text: "Please recover cleared boards.", sourceRef: "https://x.com/manualhandle/status/123" }] });
  await analyze(t, batchId);
  await review(t, batchId);
  const evidence = signalsExportSchema.parse(await t.query(api.demoEvidence.signalEvidence, { secret, batchId }));
  expect(evidence).toMatchObject({ schemaVersion: 2, provenance: { kind: "operator-capture", syntheticAuthors: false } });
  expect(evidence.provenance.label).toContain("not platform-verified");
  expect(JSON.stringify(evidence)).not.toContain("manualhandle");
});

test("native selection enforces post count, unique sources and aggregate character budget", async () => {
  const t = await setup();
  const one = await source(t, 1);
  await expect(imported(t, [])).rejects.toThrow(/between 1 and 40/);
  await expect(imported(t, [one, one])).rejects.toThrow(/between 1 and 40/);
  const many = [];
  for (let index = 10; index < 27; index++) many.push(await source(t, index, { body: "x".repeat(1500) }));
  await expect(imported(t, many)).rejects.toThrow(/24000/);
  await expect(imported(t, Array.from({ length: 41 }, () => one))).rejects.toThrow(/between 1 and 40/);
});


test("selected native proposals promote once to Product review without queueing implementation", async () => {
  const t = await setup();
  const { batchId } = await imported(t, [await source(t, 1)]);
  const batch = await analyze(t, batchId);
  const args = { secret, batchId, expectedAnalysisRevision: 1, clusterId: "c-recover", actor: "Product" };
  const issueId = await t.mutation(api.signals.promoteSignalProposal, args);
  expect(await t.mutation(api.signals.promoteSignalProposal, args)).toBe(issueId);
  const issue = await t.run((ctx) => ctx.db.get("issues", issueId));
  expect(issue).toMatchObject({ appId: "application-a", status: "spec_ready", sourceSignals: { batchId, inputFingerprint: batch.inputFingerprint, analysisRevision: 1, clusterId: "c-recover" } });
  expect(issue!.spec).toBe(JSON.stringify(batch.analysis!.clusters[0].proposal.specification));
  expect(issue!.specApprovedAt).toBeUndefined();
  const queues = await t.run(async (ctx) => ({ runs: await ctx.db.query("runs").take(1), jobs: await ctx.db.query("jobs").take(1) }));
  expect(queues).toEqual({ runs: [], jobs: [] });
});
