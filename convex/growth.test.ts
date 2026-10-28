/// <reference types="vite/client" />
/// <reference types="node" />
import { convexTest } from "convex-test";
import workpool from "@convex-dev/workpool/test";
import { beforeEach, afterEach, expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts"]);
const auth = { secret: "growth-test-secret" },
  actor = { id: "holly-member-id", name: "Holly", role: "product" as const },
  owner = { id: "owner-member-id", name: "Owner", role: "owner" as const },
  appId = "bloom-test",
  release = "a".repeat(40);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", auth.secret));
afterEach(() => vi.unstubAllEnvs());
async function setup(
  text = "Anyone recommend a photo journal app to find older memories by caption?",
) {
  const t = convexTest(schema, modules);
  workpool.register(t, "triagePool");
  const evidence = JSON.stringify({
    appId,
    release,
    origin: "https://bloom.test",
    passed: true,
    checks: ["owned search", "all terms", "negative control"],
  });
  const capabilityId = await t.mutation(api.growth.verifyCapability, {
    ...auth,
    actor: owner,
    appId,
    release,
    name: "Caption search",
    need: "Find older memories by caption",
    claims: ["Search saved captions using all words"],
    evidence,
  });
  const campaignId = await t.mutation(api.growth.createCampaign, {
    ...auth,
    actor,
    appId,
    release,
    capabilityId,
    query: "caption journal -is:retweet",
  });
  const opportunityId = await t.mutation(api.growth.capture, {
    ...auth,
    appId,
    campaignId,
    sourceKey: "x:123",
    sourceUrl: "https://x.com/test/status/123",
    channel: "x",
    author: "@test",
    text,
    sourceAt: Date.now(),
    provenance: "Official read fixture",
    controlled: true,
  });
  return { t, capabilityId, campaignId, opportunityId, evidence };
}
async function qualified(s: Awaited<ReturnType<typeof setup>>) {
  const taskId = await s.t.mutation(api.growth.request, {
    ...auth,
    actor,
    appId,
    release,
    campaignId: s.campaignId,
    opportunityId: s.opportunityId,
    action: "qualify",
  });
  const r = (
    await s.t.run((ctx) => ctx.db.query("growthReceipts").take(10))
  ).find((r) => r.taskId === taskId)!;
  await s.t.mutation(api.growthExecution.begin, {
    ...auth,
    receiptId: r._id,
    token: "lease",
  });
  await s.t.mutation(api.growth.qualify, {
    ...auth,
    receiptId: r._id,
    token: "lease",
    release,
    need: "Search captions",
    eligible: true,
    matched: true,
    fit: "High",
    reasons: ["Explicit request"],
  });
  return r;
}
async function drafted(s: Awaited<ReturnType<typeof setup>>) {
  await qualified(s);
  const link = "https://cue.test/g/opaque";
  const touch = await s.t.mutation(api.growthAttribution.prepare, {
    ...auth,
    actor,
    appId,
    opportunityId: s.opportunityId,
    tokenHash: "b".repeat(64),
    link,
    destination: "https://bloom.test",
    expiresAt: Date.now() + 86400000,
  });
  const text = "Search your saved memory captions in Bloom: " + link;
  const draftId = await s.t.mutation(api.growth.saveDraft, {
    ...auth,
    actor,
    appId,
    opportunityId: s.opportunityId,
    release,
    text,
    hash: hash(text),
  });
  return { draftId, text, hash: hash(text), touch };
}
async function published(s: Awaited<ReturnType<typeof setup>>) {
  const d = await drafted(s);
  await s.t.mutation(api.growth.requestReview, {
    ...auth,
    actor,
    appId,
    draftId: d.draftId,
    hash: d.hash,
    release,
  });
  await s.t.mutation(api.growth.decide, {
    ...auth,
    actor,
    appId,
    draftId: d.draftId,
    hash: d.hash,
    release,
    approve: true,
  });
  const url = "https://x.com/bloom/status/999";
  await s.t.mutation(api.growthAttribution.report, {
    ...auth,
    actor: owner,
    appId,
    draftId: d.draftId,
    hash: d.hash,
    publicationUrl: url,
    release,
  });
  await s.t.mutation(api.growthAttribution.verify, {
    ...auth,
    touchId: d.touch._id,
    hash: d.hash,
    publicationUrl: url,
    ok: true,
    method: "Isolated provider fixture; not live evidence",
  });
  return d;
}
test("capability and campaign gates reject wrong role, app and release; replay retains evidence version", async () => {
  const s = await setup();
  await expect(
    s.t.mutation(api.growth.verifyCapability, {
      ...auth,
      actor: { ...actor, role: "support" },
      appId,
      release,
      name: "Caption search",
      need: "Search",
      claims: ["Search"],
      evidence: s.evidence,
    }),
  ).rejects.toThrow("Saved role");
  expect(
    await s.t.mutation(api.growth.verifyCapability, {
      ...auth,
      actor: owner,
      appId,
      release,
      name: "Caption search",
      need: "Find older memories by caption",
      claims: ["Search saved captions using all words"],
      evidence: s.evidence,
    }),
  ).toBe(s.capabilityId);
  expect(
    (await s.t.query(api.growth.snapshot, { ...auth, appId })).capabilities[0]
      .version,
  ).toBe(1);
  await expect(
    s.t.mutation(api.growth.createCampaign, {
      ...auth,
      actor,
      appId: "other",
      release,
      capabilityId: s.capabilityId,
      query: "x",
    }),
  ).rejects.toThrow("app");
  await s.t.mutation(api.growth.observeRelease, {
    ...auth,
    appId,
    release: "b".repeat(40),
  });
  await expect(
    s.t.mutation(api.growth.request, {
      ...auth,
      actor,
      appId,
      release,
      campaignId: s.campaignId,
      action: "discover",
    }),
  ).rejects.toThrow("current deployed");
});
test("concurrent discovery instructions deduplicate receipts and daily reservation cannot exceed budget", async () => {
  const s = await setup();
  const args = {
    ...auth,
    actor,
    appId,
    release,
    campaignId: s.campaignId,
    action: "discover" as const,
  };
  const ids = await Promise.all([
    s.t.mutation(api.growth.request, args),
    s.t.mutation(api.growth.request, args),
  ]);
  expect(ids[0]).toBe(ids[1]);
  const page = { ...auth, campaignId: s.campaignId };
  expect(
    await s.t.mutation(api.growthExecution.reservePage, {
      ...page,
      token: "one",
    }),
  ).not.toBeNull();
  expect(
    await s.t.mutation(api.growthExecution.reservePage, {
      ...page,
      token: "overlap",
    }),
  ).toBeNull();
  await s.t.mutation(api.growthExecution.page, {
    ...page,
    token: "stale",
    newestId: "123",
  });
  expect(
    (await s.t.query(api.growth.snapshot, { ...auth, appId })).campaigns[0]
      .sinceId,
  ).toBeUndefined();
  await s.t.mutation(api.growthExecution.page, {
    ...page,
    token: "one",
    newestId: "123",
    nextToken: "page-two",
  });
  await s.t.mutation(api.growthExecution.reservePage, {
    ...page,
    token: "two",
  });
  await s.t.mutation(api.growthExecution.page, { ...page, token: "two" });
  await expect(
    s.t.mutation(api.growthExecution.reservePage, { ...page, token: "three" }),
  ).rejects.toThrow("budget exhausted");
  expect(
    (await s.t.query(api.growth.snapshot, { ...auth, appId })).campaigns[0],
  ).toMatchObject({ used: 20, sinceId: "123" });
});
test("unsupported PDF export cannot become a recommendation even when model proposes a match", async () => {
  const s = await setup(
    "Anyone recommend a photo journal app with PDF export and caption search?",
  );
  await qualified(s);
  const o = (await s.t.query(api.growth.snapshot, { ...auth, appId }))
    .opportunities[0];
  expect(o).toMatchObject({ eligible: false, status: "needs-feature" });
  await expect(
    s.t.mutation(api.growth.request, {
      ...auth,
      actor,
      appId,
      release,
      campaignId: s.campaignId,
      opportunityId: s.opportunityId,
      action: "draft",
    }),
  ).rejects.toThrow("eligible");
});
test("exact draft review cannot be reused after edit, capability revision or by wrong role", async () => {
  const s = await setup(),
    d = await drafted(s),
    review = {
      ...auth,
      actor,
      appId,
      draftId: d.draftId,
      hash: d.hash,
      release,
    };
  await s.t.mutation(api.growth.requestReview, review);
  await expect(
    s.t.mutation(api.growth.decide, {
      ...review,
      actor: { ...actor, role: "engineering" },
      approve: true,
    }),
  ).rejects.toThrow("Saved role");
  const changed = "Find saved captions with Bloom: " + d.touch.link;
  await s.t.mutation(api.growth.saveDraft, {
    ...auth,
    actor,
    appId,
    opportunityId: s.opportunityId,
    release,
    text: changed,
    hash: hash(changed),
  });
  await expect(
    s.t.mutation(api.growth.decide, { ...review, approve: true }),
  ).rejects.toThrow("changed");
  expect(
    (await s.t.query(api.growth.snapshot, { ...auth, appId })).drafts.filter(
      (d) => d.status === "approved",
    ),
  ).toHaveLength(0);
});
test("publication requires current reviewed content and Owner; unpublished links cannot attribute visits", async () => {
  const s = await setup(),
    d = await drafted(s);
  expect(
    await s.t.query(api.growthAttribution.lookup, {
      ...auth,
      tokenHash: d.touch.tokenHash,
    }),
  ).toBeNull();
  await expect(
    s.t.mutation(api.growthAttribution.report, {
      ...auth,
      actor,
      appId,
      draftId: d.draftId,
      hash: d.hash,
      release,
      publicationUrl: "https://x.com/bloom/status/999",
    }),
  ).rejects.toThrow("Owner");
  await expect(
    s.t.mutation(api.growthAttribution.report, {
      ...auth,
      actor: owner,
      appId,
      draftId: d.draftId,
      hash: d.hash,
      release,
      publicationUrl: "https://x.com/bloom/status/999",
    }),
  ).rejects.toThrow("approved");
  await expect(
    s.t.mutation(api.growth.saveDraft, {
      ...auth,
      actor,
      appId,
      opportunityId: s.opportunityId,
      release,
      text: "Bloom exports PDF " + d.touch.link,
      hash: "a".repeat(64),
    }),
  ).rejects.toThrow("unsupported");
});
test("trusted event IDs deduplicate; wrong apps, replay changes and future times are rejected; click is not session", async () => {
  const s = await setup(),
    d = await published(s);
  await s.t.mutation(api.growthAttribution.click, {
    ...auth,
    touchId: d.touch._id,
  });
  expect(
    (await s.t.query(api.growth.snapshot, { ...auth, appId })).browsers,
  ).toHaveLength(0);
  const event = {
    ...auth,
    appId,
    touchId: d.touch._id,
    browser: "c".repeat(64),
    eventId: "event-1",
    type: "session_confirmed" as const,
    occurredAt: Date.now(),
    internal: true,
    returning: false,
  };
  expect(await s.t.mutation(api.growthAttribution.ingest, event)).toBe(true);
  expect(await s.t.mutation(api.growthAttribution.ingest, event)).toBe(false);
  await expect(
    s.t.mutation(api.growthAttribution.ingest, {
      ...event,
      type: "memory_created",
    }),
  ).rejects.toThrow("changed payload");
  await expect(
    s.t.mutation(api.growthAttribution.ingest, {
      ...event,
      appId: "other",
      eventId: "wrong-app",
    }),
  ).rejects.toThrow("app");
  await expect(
    s.t.mutation(api.growthAttribution.ingest, {
      ...event,
      eventId: "future",
      occurredAt: Date.now() + 120000,
    }),
  ).rejects.toThrow("Invalid");
  expect(
    (await s.t.query(api.growth.snapshot, { ...auth, appId })).events,
  ).toHaveLength(1);
});
test("canceled and stale generation cannot overwrite operator edits", async () => {
  const s = await setup(),
    d = await drafted(s);
  const taskId = await s.t.mutation(api.growth.request, {
    ...auth,
    actor,
    appId,
    release,
    campaignId: s.campaignId,
    opportunityId: s.opportunityId,
    action: "draft",
  });
  const receipt = (
    await s.t.run((ctx) => ctx.db.query("growthReceipts").take(10))
  ).find((r) => r.taskId === taskId)!;
  await s.t.mutation(api.growthExecution.begin, {
    ...auth,
    receiptId: receipt._id,
    token: "one",
  });
  await expect(
    s.t.mutation(api.growthExecution.commitDraft, {
      ...auth,
      receiptId: receipt._id,
      token: "stale",
      release,
      text: d.text,
      hash: d.hash,
    }),
  ).rejects.toThrow("Stale");
  const edit = "Try caption search in Bloom: " + d.touch.link;
  await s.t.mutation(api.growth.saveDraft, {
    ...auth,
    actor,
    appId,
    opportunityId: s.opportunityId,
    release,
    text: edit,
    hash: hash(edit),
  });
  await expect(
    s.t.mutation(api.growthExecution.commitDraft, {
      ...auth,
      receiptId: receipt._id,
      token: "one",
      release,
      text: d.text,
      hash: d.hash,
    }),
  ).rejects.toThrow("edited during");
  await s.t.mutation(api.workspace.cancel, { ...auth, actor, appId, taskId });
  await s.t.mutation(api.growthExecution.commitDraft, {
    ...auth,
    receiptId: receipt._id,
    token: "one",
    release,
    text: d.text,
    hash: d.hash,
  });
  expect(
    (await s.t.query(api.growth.snapshot, { ...auth, appId })).drafts[0].text,
  ).toBe(edit);
});
