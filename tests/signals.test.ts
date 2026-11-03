/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const secret = "isolated-test-secret";
const auth = { secret };
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", secret));
afterEach(() => vi.unstubAllEnvs());

const posts = [
  { id: "p01", author: "Rhea M.", text: "We lost a board to an accidental clear-out. Any recovery path?" },
  { id: "p02", author: "Sam O.", text: "The same thing happened to us. Please add a way to restore cleared boards." },
  { id: "p03", author: "SpamBot", text: "Buy followers now at spam.example.com" },
];

const goodOutput = {
  dispositions: [
    {
      postId: "p01",
      outcome: "evidence",
      clusterId: "c-recover",
      quote: "Any recovery path?",
      reason: "Direct recovery request.",
    },
    {
      postId: "p02",
      outcome: "evidence",
      clusterId: "c-recover",
      quote: "Please add a way to restore cleared boards.",
      reason: "Same need, different author.",
    },
    { postId: "p03", outcome: "spam", reason: "Promotional." },
  ],
  clusters: [
    {
      id: "c-recover",
      need: "Recover boards after accidental clears",
      rationale: "Two people lost work to destructive actions.",
      sentiment: "frustrated",
      proposal: {
        title: "Board recovery window",
        assumptions: ["Retention window length is a proposal for review"],
        specification: {
          need: "Restore recently cleared boards",
          specification: "A recovery window lists and restores cleared boards.",
          acceptanceCriteria: [
            "Cleared boards appear for their members",
            "Restore returns members and lists",
          ],
        },
      },
    },
  ],
};

const receipt = {
  provider: "meta",
  model: "muse-spark-1.3",
  requestedModel: "muse-spark-1.3",
  inputTokens: 500,
  outputTokens: 220,
  durationMs: 2400,
};

type TestConvex = ReturnType<typeof convexTest>;

const setup = async () => {
  const t = convexTest(schema, modules);
  const { appId } = await t.mutation(api.appPacks.register, {
    secret,
    name: "LatchGrid",
    origins: ["https://latchgrid.example.com"],
  });
  return { t, appId };
};

const importBatch = (
  t: TestConvex,
  appId: string,
  overrides: { requestKey?: string; posts?: typeof posts; provenance?: { kind: string; note?: string } } = {},
) =>
  t.mutation(api.signals.createSignalBatch, {
    secret,
    appId,
    requestKey: "fixture-v1",
    provenance: {
      kind: "synthetic-fixture",
      fixture: "quiet-signals-evaluation",
      version: "v1",
    },
    posts,
    actor: "Avi Dwivedi",
    ...overrides,
  });

const fingerprintOf = async (t: TestConvex, batchId: string) =>
  (await t.query(api.signals.getSignalBatch, {
    secret,
    batchId: batchId as never,
  }))!.inputFingerprint;

const claim = async (t: TestConvex, batchId: string) =>
  t.mutation(api.signals.analyzeSignalBatch, {
    secret,
    batchId: batchId as never,
    expectedFingerprint: await fingerprintOf(t, batchId),
  });

const getBatch = (t: TestConvex, batchId: string) =>
  t.query(api.signals.getSignalBatch, { secret, batchId: batchId as never });

describe("signal batch persistence", () => {
  test("create, claim, complete, and read back one analyzed batch", async () => {
    const { t, appId } = await setup();
    const { batchId, created } = await importBatch(t, appId);
    expect(created).toBe(true);
    const { token } = await claim(t, batchId);
    await t.mutation(api.signals.completeSignalAttempt, {
      secret,
      batchId: batchId as never,
      token,
      output: goodOutput,
      receipt,
    });
    const batch = await getBatch(t, batchId);
    expect(batch!.state).toBe("analyzed");
    expect(batch!.analysis!.revision).toBe(1);
    expect(batch!.analysis!.clusters[0].distinctAuthors).toBe(2);
    expect(batch!.analysis!.clusters[0].repeatedEvidence).toBe(true);
    expect(batch!.analysis!.receipt).toEqual(receipt);
    expect(batch!.attempts).toHaveLength(1);
    expect(batch!.attempts[0].status).toBe("completed");
  });

  test("replaying the same key and content returns the existing batch; changed content conflicts", async () => {
    const { t, appId } = await setup();
    const first = await importBatch(t, appId);
    const replay = await importBatch(t, appId);
    expect(replay.batchId).toBe(first.batchId);
    expect(replay.created).toBe(false);
    await expect(
      importBatch(t, appId, {
        posts: [...posts, { id: "p04", author: "New", text: "Another post" }],
      }),
    ).rejects.toThrow(/already holds different input/);
  });

  test("an unknown application is refused", async () => {
    const { t } = await setup();
    await expect(
      importBatch(t, "cue_app_missing", { requestKey: "k" }),
    ).rejects.toThrow(/Unknown application/);
  });

  test("a second claim while analyzing is refused, and wrong tokens cannot complete or fail", async () => {
    const { t, appId } = await setup();
    const { batchId } = await importBatch(t, appId);
    const first = await claim(t, batchId);
    await expect(claim(t, batchId)).rejects.toThrow(/already running/);
    await expect(
      t.mutation(api.signals.completeSignalAttempt, {
        secret,
        batchId: batchId as never,
        token: "not-the-token",
        output: goodOutput,
      }),
    ).rejects.toThrow(/older attempt/);
    await expect(
      t.mutation(api.signals.failSignalAttempt, {
        secret,
        batchId: batchId as never,
        token: "not-the-token",
        error: "late failure",
      }),
    ).rejects.toThrow(/older attempt/);
    await t.mutation(api.signals.completeSignalAttempt, {
      secret,
      batchId: batchId as never,
      token: first.token,
      output: goodOutput,
    });
  });

  test("an expired claim cannot complete and must be failed explicitly before retry", async () => {
    const { t, appId } = await setup();
    const { batchId } = await importBatch(t, appId);
    const { token } = await claim(t, batchId);
    await t.run((ctx) =>
      ctx.db.patch("signalBatches", batchId as never, {
        attempt: {
          token,
          number: 1,
          startedAt: Date.now() - 60_000,
          expiresAt: Date.now() - 1000,
        },
      }),
    );
    await expect(
      t.mutation(api.signals.completeSignalAttempt, {
        secret,
        batchId: batchId as never,
        token,
        output: goodOutput,
      }),
    ).rejects.toThrow(/claim expired/);
    await t.mutation(api.signals.failSignalAttempt, {
      secret,
      batchId: batchId as never,
      token,
      error: "Operator reconciled the expired claim",
    });
    const batch = await getBatch(t, batchId);
    expect(batch!.state).toBe("failed");
    expect(batch!.attempt).toBeUndefined();
  });

  test("a late result cannot replace a newer attempt and analyzed is terminal", async () => {
    const { t, appId } = await setup();
    const { batchId } = await importBatch(t, appId);
    const first = await claim(t, batchId);
    await t.mutation(api.signals.failSignalAttempt, {
      secret,
      batchId: batchId as never,
      token: first.token,
      error: "Provider timeout",
    });
    const second = await claim(t, batchId);
    expect(second.attemptNumber).toBe(2);
    await expect(
      t.mutation(api.signals.completeSignalAttempt, {
        secret,
        batchId: batchId as never,
        token: first.token,
        output: goodOutput,
      }),
    ).rejects.toThrow(/older attempt/);
    await t.mutation(api.signals.completeSignalAttempt, {
      secret,
      batchId: batchId as never,
      token: second.token,
      output: goodOutput,
    });
    await expect(claim(t, batchId)).rejects.toThrow(/already analyzed/);
  });

  test("at most one explicit retry is allowed, and failures keep their receipts", async () => {
    const { t, appId } = await setup();
    const { batchId } = await importBatch(t, appId);
    for (let attempt = 0; attempt < 2; attempt++) {
      const { token } = await claim(t, batchId);
      await t.mutation(api.signals.failSignalAttempt, {
        secret,
        batchId: batchId as never,
        token,
        error: "Meta returned invalid JSON",
        receipt,
      });
    }
    const batch = await getBatch(t, batchId);
    expect(batch!.attempts).toHaveLength(2);
    expect(batch!.attempts[0].receipt).toEqual(receipt);
    await expect(claim(t, batchId)).rejects.toThrow(/one explicit retry/);
  });

  test("model output that fails validation is stored as a failed attempt", async () => {
    const { t, appId } = await setup();
    const { batchId } = await importBatch(t, appId);
    const { token } = await claim(t, batchId);
    const fabricated = structuredClone(goodOutput) as typeof goodOutput & {
      dispositions: { quote: string }[];
    };
    fabricated.dispositions[0].quote = "a quote the customer never wrote";
    const rejected = await t.mutation(api.signals.completeSignalAttempt, {
      secret,
      batchId: batchId as never,
      token,
      output: fabricated,
      receipt,
    });
    expect(rejected.outcome).toBe("rejected");
    expect(rejected.error).toContain("not an exact substring");
    const batch = await getBatch(t, batchId);
    expect(batch!.state).toBe("failed");
    expect(batch!.analysis).toBeUndefined();
    expect(batch!.attempts[0].error).toContain("Model output rejected");
    expect(batch!.attempts[0].receipt).toBeUndefined();
  });

  test("an all-noise batch analyzes with zero clusters and cannot promote", async () => {
    const { t, appId } = await setup();
    const { batchId } = await importBatch(t, appId, {
      requestKey: "all-noise",
      posts: [{ id: "n1", author: "Spam", text: "buy now" }],
    });
    const { token } = await claim(t, batchId);
    await t.mutation(api.signals.completeSignalAttempt, {
      secret,
      batchId: batchId as never,
      token,
      output: {
        dispositions: [
          { postId: "n1", outcome: "spam", reason: "Promotional." },
        ],
        clusters: [],
      },
    });
    const batch = await getBatch(t, batchId);
    expect(batch!.state).toBe("analyzed");
    expect(batch!.analysis!.clusters).toEqual([]);
    await expect(
      t.mutation(api.signals.promoteSignalProposal, {
        secret,
        batchId: batchId as never,
        expectedAnalysisRevision: 1,
        clusterId: "c-none",
        actor: "Avi",
      }),
    ).rejects.toThrow(/Cluster not found/);
  });
});

describe("promotion into ordinary feature governance", () => {
  test("promotion creates one spec_ready feature with lineage and receipt, idempotently", async () => {
    const { t, appId } = await setup();
    const { batchId } = await importBatch(t, appId);
    const { token } = await claim(t, batchId);
    await t.mutation(api.signals.completeSignalAttempt, {
      secret,
      batchId: batchId as never,
      token,
      output: goodOutput,
      receipt,
    });
    const issueId = await t.mutation(api.signals.promoteSignalProposal, {
      secret,
      batchId: batchId as never,
      expectedAnalysisRevision: 1,
      clusterId: "c-recover",
      actor: "Avi Dwivedi",
    });
    const again = await t.mutation(api.signals.promoteSignalProposal, {
      secret,
      batchId: batchId as never,
      expectedAnalysisRevision: 1,
      clusterId: "c-recover",
      actor: "Avi Dwivedi",
    });
    expect(again).toBe(issueId);
    const s = await t.query(api.cue.snapshot, auth);
    const issue = s.issues.find((i) => i._id === issueId)!;
    expect(issue.kind).toBe("feature");
    expect(issue.status).toBe("spec_ready");
    expect(issue.specApprovedAt).toBeUndefined();
    expect(issue.sourceSignals).toMatchObject({
      batchId,
      analysisRevision: 1,
      clusterId: "c-recover",
    });
    expect(issue.specGeneration).toEqual(receipt);
    const spec = JSON.parse(issue.spec!);
    expect(spec.acceptanceCriteria).toHaveLength(2);
    // The workspace snapshot projects batch evidence so the feature views can
    // show source quotes and honest counts, plus the actual job state.
    const projection = s.signals.find((b) => b.batchId === batchId);
    expect(projection).toMatchObject({
      appId: issue.appId,
      state: "analyzed",
      postCount: 3,
      analysisRevision: 1,
    });
    expect(projection!.clusters[0]).toMatchObject({
      id: "c-recover",
      distinctAuthors: 2,
      repeatedEvidence: true,
    });
    expect(projection!.clusters[0].promotedIssueId).toBe(issueId);
    expect(Array.isArray(s.jobs)).toBe(true);
    // Promotion never approves; implementation still requires Product.
    await expect(
      t.mutation(api.cue.startFeature, {
        secret,
        issueId,
        expectedSpec: issue.spec!,
        targetId: issue.appId!,
      }),
    ).rejects.toThrow(/current approved specification/);
  });

  test("promotion is refused against a stale analysis revision or unknown cluster", async () => {
    const { t, appId } = await setup();
    const { batchId } = await importBatch(t, appId);
    const { token } = await claim(t, batchId);
    await t.mutation(api.signals.completeSignalAttempt, {
      secret,
      batchId: batchId as never,
      token,
      output: goodOutput,
    });
    await expect(
      t.mutation(api.signals.promoteSignalProposal, {
        secret,
        batchId: batchId as never,
        expectedAnalysisRevision: 2,
        clusterId: "c-recover",
        actor: "Avi",
      }),
    ).rejects.toThrow(/superseded/);
    await expect(
      t.mutation(api.signals.promoteSignalProposal, {
        secret,
        batchId: batchId as never,
        expectedAnalysisRevision: 1,
        clusterId: "c-ghost",
        actor: "Avi",
      }),
    ).rejects.toThrow(/Cluster not found/);
  });
});

describe("scope and authorization", () => {
  test("listings are app-scoped and mutations require the backend secret", async () => {
    const { t, appId } = await setup();
    const { batchId } = await importBatch(t, appId);
    const second = await t.mutation(api.appPacks.register, {
      secret,
      name: "OtherApp",
      origins: ["https://other.example.com"],
    });
    await importBatch(t, second.appId, { requestKey: "other-app" });
    const mine = await t.query(api.signals.listSignalBatches, {
      secret,
      appId,
    });
    expect(mine).toHaveLength(1);
    expect(mine[0].batchId).toBe(batchId);
    const other = await t.query(api.signals.listSignalBatches, {
      secret,
      appId: second.appId,
    });
    expect(other).toHaveLength(1);
    await expect(
      t.query(api.signals.getSignalBatch, { secret: "wrong", batchId: batchId as never }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      t.mutation(api.signals.createSignalBatch, {
        secret: "wrong",
        appId,
        requestKey: "k",
        provenance: { kind: "operator-capture", note: "test" },
        posts,
        actor: "Anon",
      }),
    ).rejects.toThrow("Unauthorized");
  });
});
