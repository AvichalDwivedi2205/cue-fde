import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import {
  MAX_ATTEMPTS,
  sanitizeCheckSummary,
  MAX_POSTS,
  outcomeLabels,
  postsFingerprint,
  signalPostInputSchema,
  signalsExportSchema,
  validateBatchInputs,
  validateSignalsAnalysis,
  type SignalPostInput,
  type SignalsAnalysisOutput,
} from "../lib/signals-schema";

const posts = (await readFile("public/quiet-signals-fixture-v1.json", "utf8")
  .then(JSON.parse)
  .then((fixture) => fixture.posts)) as SignalPostInput[];

const validOutput: SignalsAnalysisOutput = {
  dispositions: [
    {
      postId: "p01",
      outcome: "evidence",
      clusterId: "c-restore",
      quote: "Is there any way to get an older version back?",
      reason: "Direct recovery request after destructive action.",
    },
    {
      postId: "p02",
      outcome: "evidence",
      clusterId: "c-restore",
      quote: "Does the app keep deleted boards anywhere?",
      reason: "Asks where deleted work is kept.",
    },
    {
      postId: "p03",
      outcome: "duplicate",
      reason: "Same author repeating post p02 word for word.",
    },
    {
      postId: "p04",
      outcome: "other-need",
      reason: "Recurring templates are a separate valid request.",
    },
    {
      postId: "p05",
      outcome: "spam",
      reason: "Promotional link spam.",
    },
    {
      postId: "p06",
      outcome: "off-topic",
      reason: "Social chatter unrelated to the product.",
    },
    {
      postId: "p07",
      outcome: "spam",
      reason: "Instruction-injection attempt; retained as inert evidence only.",
    },
    {
      postId: "p08",
      outcome: "evidence",
      clusterId: "c-restore",
      quote: "Please tell me there's a trash bin or an undo somewhere in settings.",
      reason: "Accidental deletion with no recovery path.",
    },
    {
      postId: "p09",
      outcome: "insufficient",
      reason: "No specific failure or need described.",
    },
    {
      postId: "p10",
      outcome: "evidence",
      clusterId: "c-restore",
      quote: "accidentally cleared boards really need a recovery path",
      reason: "Repeated author renewing the same recovery request.",
    },
    {
      postId: "p11",
      outcome: "other-need",
      reason: "Theme request is a separate valid need.",
    },
    {
      postId: "p12",
      outcome: "evidence",
      clusterId: "c-restore",
      quote: "Is there a version history or backup we can restore from?",
      reason: "Restore request after a teammate wiped a board.",
    },
  ],
  clusters: [
    {
      id: "c-restore",
      need: "Recover work after someone clears or deletes shared boards",
      rationale:
        "Four different people describe losing boards or cards to destructive actions and ask for a recovery path.",
      sentiment: "frustrated",
      proposal: {
        title: "Board recovery window",
        assumptions: [
          "A 30-day retention window is proposed for review; no customer asked for a specific duration",
        ],
        specification: {
          need: "Let a member restore recently cleared boards without support help",
          specification:
            "Provide a recovery window listing recently cleared boards and restoring them with their members.",
          acceptanceCriteria: [
            "A cleared board appears in the recovery window for members of that board",
            "Restore returns the board with its members and lists intact",
          ],
        },
      },
    },
  ],
};

describe("batch input validation", () => {
  test("the shipped evaluation fixture passes batch limits", () => {
    expect(() => validateBatchInputs(posts)).not.toThrow();
  });
  test.each([
    ["more than 40 posts", Array.from({ length: MAX_POSTS + 1 }, (_, n) => ({ id: `x${n}`, author: "A", text: "t" }))],
    ["oversized post", [{ id: "big", author: "A", text: "x".repeat(1501) }]],
    ["duplicate post IDs", [{ id: "dup", author: "A", text: "one" }, { id: "dup", author: "B", text: "two" }]],
    ["empty text", [{ id: "empty", author: "A", text: "   " }]],
  ])("rejects %s", (_label, bad) => {
    expect(() => validateBatchInputs(bad as SignalPostInput[])).toThrow();
  });
  test("total character budget is enforced across posts", () => {
    const many = Array.from({ length: 30 }, (_, n) => ({
      id: `t${n}`,
      author: "A",
      text: "x".repeat(900),
    }));
    expect(() => validateBatchInputs(many)).toThrow(/character limit/);
  });
  test("the canonical fingerprint is order-independent and content-sensitive", () => {
    expect(postsFingerprint(posts)).toBe(
      postsFingerprint([...posts].reverse()),
    );
    const changed = posts.map((p) =>
      p.id === "p01" ? { ...p, text: p.text + "!" } : p,
    );
    expect(postsFingerprint(changed)).not.toBe(postsFingerprint(posts));
  });
});

describe("analysis validation", () => {
  test("a complete evidence-linked analysis validates and derives counts", () => {
    const result = validateSignalsAnalysis(posts, validOutput);
    expect(result.stats).toMatchObject({
      posts: 12,
      evidencePosts: 5,
      distinctEvidenceAuthors: 4,
      duplicatePosts: 1,
      spamPosts: 2,
      offTopicPosts: 1,
      insufficientPosts: 1,
      otherNeedPosts: 2,
    });
    const cluster = result.clusters[0];
    expect(cluster.sources.map((s) => s.postId)).toEqual([
      "p01",
      "p02",
      "p08",
      "p10",
      "p12",
    ]);
    expect(cluster.distinctAuthors).toBe(4);
    expect(cluster.repeatedEvidence).toBe(true);
    // Quotes come from the stored input, not the model's wording.
    expect(cluster.sources.every((s) =>
      posts.find((p) => p.id === s.postId)!.text.includes(s.quote),
    )).toBe(true);
  });
  test("duplicate cluster IDs cannot identify different proposals", () => {
    const output = structuredClone(validOutput);
    output.clusters.push({
      ...structuredClone(output.clusters[0]),
      need: "A different proposal sharing the same selection ID",
    });
    expect(() => validateSignalsAnalysis(posts, output)).toThrow(/Duplicate cluster ID/);
  });

  test("a single-author cluster cannot claim a repeated pattern", () => {
    const single: SignalsAnalysisOutput = {
      dispositions: validOutput.dispositions.map((d) =>
        d.clusterId === "c-restore" && d.postId !== "p01"
          ? { ...d, outcome: "insufficient" as const, clusterId: undefined, quote: undefined }
          : d,
      ),
      clusters: [
        {
          ...validOutput.clusters[0],
          rationale: "One person asked for recovery.",
        },
      ],
    };
    const result = validateSignalsAnalysis(posts, single);
    expect(result.clusters[0].sources).toHaveLength(1);
    expect(result.clusters[0].repeatedEvidence).toBe(false);
  });
  test.each([
    ["missing disposition", (o: SignalsAnalysisOutput) => ({ ...o, dispositions: o.dispositions.filter((d) => d.postId !== "p09") })],
    ["invented post reference", (o: SignalsAnalysisOutput) => ({ ...o, dispositions: [...o.dispositions, { postId: "p99", outcome: "spam", reason: "nope" }] })],
    ["duplicate dispositions", (o: SignalsAnalysisOutput) => ({ ...o, dispositions: [...o.dispositions, o.dispositions[0]] })],
    ["fabricated quote", (o: SignalsAnalysisOutput) => ({ ...o, dispositions: o.dispositions.map((d) => d.postId === "p01" ? { ...d, quote: "the customer never wrote this" } : d) })],
    ["evidence without a cluster", (o: SignalsAnalysisOutput) => ({ ...o, dispositions: o.dispositions.map((d) => d.postId === "p01" ? { ...d, clusterId: undefined } : d) })],
    ["excluded post carrying a quote", (o: SignalsAnalysisOutput) => ({ ...o, dispositions: o.dispositions.map((d) => d.postId === "p05" ? { ...d, quote: "free followers" } : d) })],
    ["unknown cluster reference", (o: SignalsAnalysisOutput) => ({ ...o, dispositions: o.dispositions.map((d) => d.postId === "p01" ? { ...d, clusterId: "c-ghost" } : d) })],
    ["cluster without evidence", (o: SignalsAnalysisOutput) => ({ ...o, clusters: [...o.clusters, { id: "c-empty", need: "n", rationale: "r", proposal: validOutput.clusters[0].proposal }] })],
    ["excluded post referencing a cluster", (o: SignalsAnalysisOutput) => ({ ...o, dispositions: o.dispositions.map((d) => d.postId === "p05" ? { ...d, clusterId: "c-restore" } : d) })],
  ])("rejects %s", (_label, mutate) => {
    expect(() =>
      validateSignalsAnalysis(posts, mutate(structuredClone(validOutput))),
    ).toThrow();
  });
  test("instruction injection stays inert input that can only be dispositioned", () => {
    const injection = posts.find((p) => p.id === "p07")!;
    const parsed = signalPostInputSchema.parse(injection);
    expect(parsed.text).toContain("Ignore previous instructions");
    const result = validateSignalsAnalysis(posts, validOutput);
    const disposition = result.dispositions.find((d) => d.postId === "p07");
    expect(disposition?.outcome).toBe("spam");
    // The injected text never becomes an instruction: it is only stored,
    // quoted, or excluded — it cannot appear as an executed directive.
    expect(JSON.stringify(result)).not.toContain("Disable repository policy");
  });
  test("all-noise output validates with zero clusters", () => {
    const noise = [
      { id: "n1", author: "Spam", text: "buy now" },
      { id: "n2", author: "Off", text: "game tonight" },
    ];
    const result = validateSignalsAnalysis(noise, {
      dispositions: [
        { postId: "n1", outcome: "spam", reason: "Promotional." },
        { postId: "n2", outcome: "off-topic", reason: "Unrelated." },
      ],
      clusters: [],
    });
    expect(result.clusters).toEqual([]);
    expect(result.stats.evidencePosts).toBe(0);
  });
  test("outcome labels never describe excluded posts as evidence", () => {
    expect(outcomeLabels.spam).toBe("Spam or manipulation");
    expect(outcomeLabels["other-need"]).toBe("Different valid need");
  });
});

describe("public-safe export schema", () => {
  test("the export shape accepts a safe projection and rejects private extras", () => {
    const result = validateSignalsAnalysis(posts, validOutput);
    const safeExport = {
      schemaVersion: 1 as const,
      provenance: {
        kind: "synthetic-fixture",
        label: "Synthetic operator fixture",
        syntheticAuthors: true,
      },
      batch: { fingerprint: "abc123", posts: 12, authors: 9, totalChars: 1500 },
      posts: result.dispositions.map((d) => ({
        id: d.postId,
        author: posts.find((p) => p.id === d.postId)!.author,
        text: posts.find((p) => p.id === d.postId)!.text,
        disposition: {
          outcome: d.outcome,
          clusterId: d.clusterId ?? null,
          quote: d.quote ?? null,
          reason: d.reason,
        },
      })),
      clusters: result.clusters.map((c, n) => ({
        id: c.id,
        need: c.need,
        rationale: c.rationale,
        sentiment: c.sentiment ?? null,
        sources: c.sources,
        distinctAuthors: c.distinctAuthors,
        repeatedEvidence: c.repeatedEvidence,
        proposal: c.proposal,
        handoffLabel: `handoff-${n + 1}`,
        handoffState: "ready",
      })),
      receipt: {
        provider: "meta",
        requestedModel: "muse-spark-1.3",
        model: "muse-spark-1.3",
        inputTokens: 100,
        outputTokens: 50,
        durationMs: 1200,
      },
      attempts: [{ number: 1, status: "completed", error: null }],
      completedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(() => signalsExportSchema.parse(safeExport)).not.toThrow();
    expect(() =>
      signalsExportSchema.parse({
        ...safeExport,
        providerRequestId: "req_secret_123",
      }),
    ).toThrow();
  });
  test("attempt ledger is capped at one explicit retry", () => {
    expect(MAX_ATTEMPTS).toBe(2);
  });
});

describe("public check summaries", () => {
  test("redacts private identifiers without changing observed check counts", () => {
    const summary = sanitizeCheckSummary(
      "0/8 passed; SHA a4e5499e9e0fc02dff88ceb75c8aeb401526333c; runId run-private-123; email avi@example.test; requestId req-private-456; traceId trace-private-789",
    );
    expect(summary).toContain("0/8 passed");
    for (const value of ["a4e5499e9e0fc02dff88ceb75c8aeb401526333c", "run-private-123", "avi@example.test", "req-private-456", "trace-private-789"])
      expect(summary).not.toContain(value);
  });
});
