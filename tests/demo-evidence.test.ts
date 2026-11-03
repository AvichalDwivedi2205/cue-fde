/// <reference types="vite/client" />
import { readFileSync } from "node:fs";
import { convexTest } from "convex-test";
import { beforeEach, afterEach, describe, expect, test, vi } from "vitest";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { signalsExportSchema } from "../lib/signals-schema";

const modules = import.meta.glob("../convex/**/*.{ts,js}");
const secret = "isolated-test-secret";
const auth = { secret };
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", secret));
afterEach(() => vi.unstubAllEnvs());

// Seeded evidence fixture: a Meta-coded run whose 17 recorded model calls end
// exactly at the run document's own aggregate totals.
const BASE = 1_700_000_000_000;
const MODEL = "muse-spark-1.3";
const CALLS = 17;
const INPUT_TOTAL = 673_361;
const OUTPUT_TOTAL = 120_000;
const FAKE_REPO_PATH = "/tmp/fake-repo-copy";
const FAKE_COMMIT = "fake-sha-not-a-real-commit";
const FAKE_PR_URL = "https://pr.invalid/fake";

// Per-call deltas that sum exactly to the totals; the last call absorbs the
// remainder so the final cumulative matches the run document.
const cumulativeUsage = (
  total: number,
  count: number,
  base: number,
  step: number,
) => {
  const deltas = Array.from({ length: count }, (_, i) => base + i * step);
  deltas[count - 1] = total - deltas.slice(0, -1).reduce((a, b) => a + b, 0);
  const cumulative: number[] = [];
  let sum = 0;
  for (const delta of deltas) {
    sum += delta;
    cumulative.push(sum);
  }
  return cumulative;
};
const cumIn = cumulativeUsage(INPUT_TOTAL, CALLS, 30_000, 500);
const cumOut = cumulativeUsage(OUTPUT_TOTAL, CALLS, 5_000, 100);

const callDetail = (call: number) =>
  JSON.stringify({
    requestedModel: MODEL,
    model: MODEL,
    inputTokens: cumIn[call - 1],
    outputTokens: cumOut[call - 1],
    modelCalls: call,
    requestId: `req_fake_${call}`,
    modelMatched: true,
    status: "completed",
    incompleteReason: null,
  });

type TestConvex = ReturnType<typeof convexTest>;

let fixtureCounter = 0;
const seedRun = async (
  t: TestConvex,
  callNumbers: number[] = Array.from({ length: CALLS }, (_, i) => i + 1),
) => {
  fixtureCounter += 1;
  const issueId = await t.run((ctx) =>
    ctx.db.insert("issues", {
      title: "Evidence fixture issue",
      description: "Seeded issue for demo-evidence export tests.",
      kind: "bug",
      fingerprint: `evidence-fixture:${fixtureCounter}`,
      status: "awaiting_approval",
      priority: "P1",
      tags: ["Evidence"],
      createdAt: BASE,
    }),
  );
  const runId = await t.run((ctx) =>
    ctx.db.insert("runs", {
      issueId,
      status: "awaiting_approval",
      phase: "awaiting_review",
      provider: "Meta",
      kind: "bug",
      model: MODEL,
      requestedModel: MODEL,
      inputTokens: INPUT_TOTAL,
      outputTokens: OUTPUT_TOTAL,
      modelCalls: CALLS,
      repoPath: FAKE_REPO_PATH,
      commit: FAKE_COMMIT,
      prUrl: FAKE_PR_URL,
      before: "Before checks: 2 failing on the unfixed source.",
      after: "After checks: all 5 checks pass on the fixed source.",
      createdAt: BASE,
      updatedAt: BASE + 30 * 60_000,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("events", {
      runId,
      issueId,
      title: "Run started",
      detail: "Investigation started for the evidence fixture.",
      kind: "intake",
      createdAt: BASE,
    });
    for (const call of callNumbers)
      await ctx.db.insert("events", {
        runId,
        issueId,
        title: "Meta coding response",
        detail: callDetail(call),
        kind: "agent",
        createdAt: BASE + call * 60_000,
      });
  });
  return { runId, issueId };
};

const collectAllEventTimestamps = async (t: TestConvex, runId: string) => {
  const timestamps: number[] = [];
  let cursor: string | undefined;
  let isDone = false;
  while (!isDone) {
    const page = await t.query(api.demoEvidence.runEvents, {
      secret,
      runId: runId as never,
      numItems: 5,
      ...(cursor ? { cursor } : {}),
    });
    for (const event of page.page) timestamps.push(event.createdAt);
    isDone = page.isDone;
    cursor = page.continueCursor;
  }
  return timestamps;
};

const posts = [
  {
    id: "p01",
    author: "Rhea M.",
    text: "We lost a board to an accidental clear-out. Any recovery path?",
  },
  {
    id: "p02",
    author: "Sam O.",
    text: "The same thing happened to us. Please add a way to restore cleared boards.",
  },
  {
    id: "p03",
    author: "SpamBot",
    text: "Buy followers now at spam.example.com",
  },
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

const seedAnalyzedBatch = async (inputPosts = posts, output = goodOutput) => {
  const t = convexTest(schema, modules);
  const { appId } = await t.mutation(api.appPacks.register, {
    secret,
    name: "LatchGrid",
    origins: ["https://latchgrid.example.com"],
  });
  const { batchId } = await t.mutation(api.signals.createSignalBatch, {
    secret,
    appId,
    requestKey: "fixture-v1",
    provenance: {
      kind: "synthetic-fixture",
      fixture: "quiet-signals-evaluation",
      version: "v1",
    },
    posts: inputPosts,
    actor: "Avi Dwivedi",
  });
  const claim = await t.mutation(api.signals.analyzeSignalBatch, {
    secret,
    batchId: batchId as never,
    expectedFingerprint: (await t.query(api.signals.getSignalBatch, {
      secret,
      batchId: batchId as never,
    }))!.inputFingerprint,
  });
  if (!("token" in claim) || typeof claim.token !== "string")
    throw new Error("Claim unexpectedly rejected");
  const token: string = claim.token;
  await t.mutation(api.signals.completeSignalAttempt, {
    secret,
    batchId: batchId as never,
    token,
    output,
    receipt,
  });
  return { t, batchId: batchId as never };
};

const collectKeys = (value: unknown, into: Set<string>) => {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      into.add(key);
      collectKeys(child, into);
    }
  }
};

describe("demo evidence export", () => {
  test("runEvents paginates a run's events in createdAt order", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedRun(t);
    const timestamps = await collectAllEventTimestamps(t, runId);
    expect(timestamps).toHaveLength(18);
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
    await expect(
      t.query(api.demoEvidence.runEvents, {
        secret,
        runId: runId as never,
        numItems: 501,
      }),
    ).rejects.toThrow(/between 1 and 500/);
    await expect(
      t.query(api.demoEvidence.runEvents, {
        secret,
        runId: runId as never,
        numItems: 0,
      }),
    ).rejects.toThrow(/between 1 and 500/);
  });

  test("runEvidence returns a complete allowlisted call history", async () => {
    const t = convexTest(schema, modules);
    const { runId } = await seedRun(t);
    const result = await t.query(api.demoEvidence.runEvidence, {
      secret,
      runId: runId as never,
    });
    expect(result.completeHistory).toBe(true);
    expect(result.calls).toHaveLength(CALLS);
    expect(result.calls.map((c) => c.modelCalls)).toEqual(
      Array.from({ length: CALLS }, (_, i) => i + 1),
    );
    const deltaIn = result.calls.reduce((sum, c) => sum + (c.deltaIn ?? 0), 0);
    const deltaOut = result.calls.reduce(
      (sum, c) => sum + (c.deltaOut ?? 0),
      0,
    );
    expect(deltaIn).toBe(INPUT_TOTAL);
    expect(deltaOut).toBe(OUTPUT_TOTAL);
    expect(result.totals).toEqual({
      calls: CALLS,
      inputTokens: INPUT_TOTAL,
      outputTokens: OUTPUT_TOTAL,
      aggregateAgreement: true,
    });
    expect(result.run.status).toBe("awaiting_approval");
    expect(result.run.kind).toBe("bug");
    expect(result.run.provider).toBe("Meta");
    expect(result.run.verified).toBeNull();
    expect(result.run.deployed).toBeNull();
    expect(result.run.approvedSpecPresent).toBe(false);
    expect(result.run.commitPresent).toBe(true);
    expect(result.run.prPresent).toBe(true);
    expect(result.timeline.eventCount).toBe(CALLS + 1);
    // Allowlist projection: no repo paths, commit SHAs, PR URLs or provider
    // request IDs anywhere in the returned evidence.
    const text = JSON.stringify(result);
    for (const banned of [
      FAKE_REPO_PATH,
      FAKE_COMMIT,
      FAKE_PR_URL,
      "req_fake_",
    ])
      expect(text).not.toContain(banned);
    const keys = new Set<string>();
    collectKeys(result, keys);
    for (const banned of ["repoPath", "commit", "prUrl", "requestId"])
      expect(keys.has(banned)).toBe(false);
  });

  test("a broken call chain degrades to aggregate-only without per-call deltas", async () => {
    const t = convexTest(schema, modules);
    // Second run mirrors the first with event 5 deleted: the run document
    // still records 17 calls, but only 16 call events remain.
    const { runId } = await seedRun(t, [
      ...Array.from({ length: 4 }, (_, i) => i + 1),
      ...Array.from({ length: CALLS - 5 + 1 }, (_, i) => i + 6),
    ]);
    const result = await t.query(api.demoEvidence.runEvidence, {
      secret,
      runId: runId as never,
    });
    expect(result.completeHistory).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.calls).toHaveLength(CALLS - 1);
    expect(
      result.calls.every((c) => c.deltaIn === null && c.deltaOut === null),
    ).toBe(true);
    // The final cumulative event still agrees with the run's own aggregates,
    // independently of the broken chain.
    expect(result.totals.aggregateAgreement).toBe(true);
    expect(result.totals.inputTokens).toBe(INPUT_TOTAL);
    expect(result.totals.outputTokens).toBe(OUTPUT_TOTAL);
  });

  test("signalEvidence exports a validated batch and marks promoted handoffs", async () => {
    const { t, batchId } = await seedAnalyzedBatch();
    const before = signalsExportSchema.parse(
      await t.query(api.demoEvidence.signalEvidence, { secret, batchId }),
    );
    expect(before.schemaVersion).toBe(1);
    expect(before.provenance).toEqual({
      kind: "synthetic-fixture",
      label:
        "Synthetic operator fixture quiet-signals-evaluation v1 · fictional authors",
      syntheticAuthors: true,
    });
    expect(before.batch).toEqual({
      fingerprint: before.batch.fingerprint,
      posts: 3,
      authors: 3,
      totalChars: posts.reduce((sum, p) => sum + p.text.length, 0),
    });
    expect(before.clusters[0].handoffLabel).toBeNull();
    expect(before.clusters[0].handoffState).toBeNull();
    expect(before.receipt).toEqual(receipt);
    expect(before.attempts).toEqual([
      { number: 1, status: "completed", error: null },
    ]);
    expect(before.completedAt).not.toBeNull();

    const issueId = await t.mutation(api.signals.promoteSignalProposal, {
      secret,
      batchId,
      expectedAnalysisRevision: 1,
      clusterId: "c-recover",
      actor: "Avi Dwivedi",
    });
    const after = signalsExportSchema.parse(
      await t.query(api.demoEvidence.signalEvidence, { secret, batchId }),
    );
    expect(after.clusters[0].handoffLabel).toBe("handoff-1");
    expect(after.clusters[0].handoffState).toBe("spec_ready");
    await t.run((ctx) => ctx.db.patch("issues", issueId, { status: "approved" }));
    const approved = await t.query(api.demoEvidence.signalEvidence, { secret, batchId });
    expect(approved.clusters[0].handoffState).toBe("approved");
    await t.run((ctx) => ctx.db.delete("issues", issueId));
    const missing = await t.query(api.demoEvidence.signalEvidence, { secret, batchId });
    expect(missing.clusters[0].handoffState).toBeNull();
    expect(after.posts.find((p) => p.id === "post-3")!.disposition).toEqual({
      outcome: "spam",
      clusterId: null,
      quote: null,
      reason: "Promotional.",
    });
  });

  test("all three queries reject a wrong secret", async () => {
    const { t, batchId } = await seedAnalyzedBatch();
    const { runId } = await seedRun(t);
    await expect(
      t.query(api.demoEvidence.runEvents, {
        secret: "wrong",
        runId: runId as never,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      t.query(api.demoEvidence.runEvidence, {
        secret: "wrong",
        runId: runId as never,
      }),
    ).rejects.toThrow("Unauthorized");
    await expect(
      t.query(api.demoEvidence.signalEvidence, { secret: "wrong", batchId }),
    ).rejects.toThrow("Unauthorized");
  });
});

test("check summaries are redacted of paths and URLs before export", async () => {
  const { sanitizeCheckSummary } = await import("../lib/signals-schema");
  const raw =
    "FAIL src/repo/helpers/upload.test.ts /Users/operator/private/checkout/lib/x.ts passed 8 of 8 · see https://internal.example.com/logs/1";
  const clean = sanitizeCheckSummary(raw)!;
  expect(clean).not.toContain("/Users/operator");
  expect(clean).not.toContain("https://internal.example.com");
  expect(clean).toContain("[path]");
  expect(clean).toContain("[url]");
  expect(clean).toContain("passed 8 of 8");
  expect(sanitizeCheckSummary(null)).toBeNull();
  expect(sanitizeCheckSummary("   ")).toBeNull();
  expect(sanitizeCheckSummary("x".repeat(900))!.length).toBeLessThanOrEqual(
    600,
  );
});

test("public run evidence never copies raw check logs", async () => {
  const t = convexTest(schema, modules);
  const { runId } = await seedRun(t);
  const marker =
    "req_private_123 private@example.com 0123456789abcdef0123456789abcdef01234567";
  await t.run((ctx) =>
    ctx.db.patch("runs", runId, { before: marker, after: marker }),
  );
  const result = await t.query(api.demoEvidence.runEvidence, { secret, runId });
  expect(JSON.stringify(result)).not.toContain(marker);
  expect(result.run.beforeSummary).toBeNull();
  expect(result.run.afterSummary).toBeNull();
});

test("public signal aliases preserve exact quote and source links", async () => {
  const { t, batchId } = await seedAnalyzedBatch();
  const evidence = await t.query(api.demoEvidence.signalEvidence, {
    secret,
    batchId,
  });
  for (const value of [
    "p01",
    "p02",
    "p03",
    "c-recover",
    "Rhea M.",
    "Sam O.",
    "SpamBot",
  ])
    expect(JSON.stringify(evidence)).not.toContain(value);
  for (const cluster of evidence.clusters)
    for (const source of cluster.sources) {
      const post = evidence.posts.find((post) => post.id === source.postId)!;
      expect(post.author).toBe(source.author);
      expect(post.text).toContain(source.quote);
      expect(post.disposition.clusterId).toBe(cluster.id);
    }
});

test("operator captures require a reviewed projection", async () => {
  const { t, batchId } = await seedAnalyzedBatch();
  await t.run((ctx) =>
    ctx.db.patch("signalBatches", batchId, {
      provenance: { kind: "operator-capture" },
    }),
  );
  await expect(
    t.query(api.demoEvidence.signalEvidence, { secret, batchId }),
  ).rejects.toThrow(/reviewed projection/);
});

test("a synthetic label does not permit private evidence text", async () => {
  const { t, batchId } = await seedAnalyzedBatch();
  await t.run(async (ctx) => {
    const batch = (await ctx.db.get("signalBatches", batchId))!;
    await ctx.db.patch("signalBatches", batchId, {
      posts: batch.posts.map((p, index) =>
        index
          ? p
          : {
              ...p,
              text: `${p.text} Contact private@example.com req_private_123`,
            },
      ),
    });
  });
  await expect(
    t.query(api.demoEvidence.signalEvidence, { secret, batchId }),
  ).rejects.toThrow(/private identifier/);
});

test("known private identifiers are rejected even when their shape looks ordinary", async () => {
  const { t, batchId } = await seedAnalyzedBatch();
  await t.run(async (ctx) => {
    const batch = (await ctx.db.get("signalBatches", batchId))!;
    await ctx.db.patch("signalBatches", batchId, {
      posts: batch.posts.map((p, index) =>
        index ? p : { ...p, text: `${p.text} Rhea M. p01` },
      ),
    });
  });
  await expect(
    t.query(api.demoEvidence.signalEvidence, { secret, batchId }),
  ).rejects.toThrow(/private identifier/);
});

test("attempt errors become neutral while recorded failed status stays failed", async () => {
  const { t, batchId } = await seedAnalyzedBatch();
  await t.run(async (ctx) => {
    const batch = (await ctx.db.get("signalBatches", batchId))!;
    await ctx.db.patch("signalBatches", batchId, {
      attempts: [
        ...batch.attempts,
        {
          number: 2,
          status: "failed",
          startedAt: BASE,
          error: "private@example.com req_private_123",
        },
      ],
    });
  });
  const evidence = await t.query(api.demoEvidence.signalEvidence, {
    secret,
    batchId,
  });
  expect(evidence.attempts[1]).toEqual({
    number: 2,
    status: "failed",
    error: "Analysis attempt failed. Operator review required.",
  });
  expect(JSON.stringify(evidence)).not.toContain("private@example.com");
});

test("actual query output becomes a schema-valid export without trusting summary prose", async () => {
  const { createPublicRunExport } = await import("../lib/demo-evidence-export");
  const t = convexTest(schema, modules);
  const { runId } = await seedRun(t);
  const policy = {
    repository: "synthetic/repository",
    baseBranch: "main",
    allowedPaths: ["src/"],
    testCommands: [
      {
        program: "node",
        args: [
          "node_modules/typescript/bin/tsc",
          "--noEmit",
          "--incremental",
          "false",
        ],
      },
      {
        program: "node",
        args: ["node_modules/vitest/vitest.mjs", "run", "--cache=false"],
      },
      {
        program: "node",
        args: [
          "node_modules/vitest/vitest.mjs",
          "run",
          "--cache=false",
          "--config",
          "vitest.acceptance.config.ts",
        ],
      },
    ],
  };
  const outputs = (summary: string, exit = 0) =>
    `node (cwd /private/checkout; exit 0)\n\nnode (cwd /private/checkout; exit 0)\n Test Files 1 passed (1)\n Tests 17 passed (17)\n Start at 12:00:00\n Duration 1s\n\nnode (cwd /private/checkout; exit ${exit})\n Test Files 1 passed (1)\n Tests ${summary}\n Start at 12:00:00\n Duration 1s\n`;
  await t.run((ctx) =>
    ctx.db.patch("runs", runId, {
      codingPolicy: policy,
      before: outputs("1 failed | 2 passed (3)", 1),
      after: outputs("3 passed (3)"),
    }),
  );
  const evidence = await t.query(api.demoEvidence.runEvidence, {
    secret,
    runId,
  });
  const exported = createPublicRunExport(
    {
      ...evidence,
      run: {
        ...evidence.run,
        beforeSummary: "req_private_123",
        afterSummary: "private@example.com",
      },
    },
    new Date(BASE).toISOString(),
  );
  expect(exported.checks.observations).toEqual({
    baseline: { passed: 2, total: 3 },
    acceptance: { passed: 3, total: 3 },
    defaultTests: { passed: 17, total: 17 },
    typescript: true,
  });
  expect(exported.checks.beforeSummary).toBe(
    "Baseline acceptance tests 2/3 passed.",
  );
  expect(JSON.stringify(exported)).not.toContain("req_private_123");
  expect(JSON.stringify(exported)).not.toContain("private@example.com");
  expect(JSON.stringify(exported)).not.toContain("/private/checkout");
});

for (const version of ["v1", "v2-heldout", "v3-all-noise"]) {
  test(`public ${version} fixture exports exact source text with aliased authors`, async () => {
    const fixture = JSON.parse(readFileSync(new URL(`../public/quiet-signals-fixture-${version}.json`, import.meta.url), "utf8"));
    const { t, batchId } = await seedAnalyzedBatch(fixture.posts, {
      dispositions: fixture.posts.map((post: { id: string }) => ({ postId: post.id, outcome: "spam", reason: "Synthetic export test disposition" })),
      clusters: [],
    });
    const result = signalsExportSchema.parse(await t.query(api.demoEvidence.signalEvidence, { secret, batchId }));
    expect(result.posts.map((post) => post.text)).toEqual(fixture.posts.map((post: { text: string }) => post.text));
    expect(result.posts.every((post) => /^Author [0-9]+$/.test(post.author))).toBe(true);
  });
}

test("generated prose preserves slash alternatives and aliases referenced posts", async () => {
  const output = structuredClone(goodOutput);
  output.dispositions[1].reason = "Same need as p01.";
  output.clusters[0].proposal.specification.acceptanceCriteria[0] = "Restore board/workspace/card with its contents intact";
  const { t, batchId } = await seedAnalyzedBatch(posts, output);
  const result = await t.query(api.demoEvidence.signalEvidence, { secret, batchId });
  expect(result.posts[1].disposition.reason).toBe("Same need as post-1.");
  expect(result.clusters[0].proposal.specification.acceptanceCriteria[0]).toBe("Restore board/workspace/card with its contents intact");
});
