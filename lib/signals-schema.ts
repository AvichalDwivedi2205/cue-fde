import { checkObservationsSchema } from "./demo-check-evidence";
import { z } from "zod";

// One bounded Quiet signals batch: immutable synthetic/operator-supplied
// posts, one analysis attempt at a time, validated evidence-linked output.
// The digest is a canonical form of the posts, so persistence can recompute
// and compare it without Node-only crypto in the Convex runtime.

export const MAX_POSTS = 40;
export const MAX_POST_CHARS = 1500;
export const MAX_TOTAL_CHARS = 24000;
export const MAX_CLUSTERS = 6;
export const MAX_ATTEMPTS = 2;
export const ATTEMPT_TTL_MS = 10 * 60 * 1000;

export const postIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);
export const clusterIdSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/);

export const signalPostInputSchema = z
  .object({
    id: postIdSchema,
    author: z.string().trim().min(1).max(60),
    text: z
      .string()
      .trim()
      .min(1)
      .max(MAX_POST_CHARS),
    sourceRef: z.string().trim().min(1).max(300).optional(),
  })
  .strict();
export type SignalPostInput = z.infer<typeof signalPostInputSchema>;

export const signalsProvenanceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("synthetic-fixture"),
      fixture: z.string().trim().min(1).max(80),
      version: z.string().trim().min(1).max(40),
    })
    .strict(),
  z
    .object({
      kind: z.literal("operator-capture"),
      note: z.string().trim().min(3).max(300),
    })
    .strict(),
]);
export type SignalsProvenance = z.infer<typeof signalsProvenanceSchema>;

export function canonicalPosts(posts: readonly SignalPostInput[]): string {
  const canonical = [...posts]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((p) =>
      JSON.stringify([
        p.id,
        p.author,
        p.text,
        p.sourceRef === undefined ? null : p.sourceRef,
      ]),
    );
  return JSON.stringify(canonical);
}

// Small pure FNV-1a fingerprint for display and quick equality checks. The
// canonical string itself stays the integrity source of truth.
export function postsFingerprint(posts: readonly SignalPostInput[]): string {
  const text = canonicalPosts(posts);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < text.length; index++) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function validateBatchInputs(posts: readonly SignalPostInput[]): void {
  const parsed = z.array(signalPostInputSchema).max(MAX_POSTS).parse(posts);
  const ids = new Set<string>();
  let total = 0;
  for (const post of parsed) {
    if (ids.has(post.id))
      throw new Error(`Duplicate post ID: ${post.id}`);
    ids.add(post.id);
    total += post.text.length;
  }
  if (total > MAX_TOTAL_CHARS)
    throw new Error(
      `Batch text exceeds the ${MAX_TOTAL_CHARS} character limit (${total})`,
    );
}

export const dispositionOutcomeSchema = z.enum([
  "evidence",
  "duplicate",
  "spam",
  "off-topic",
  "insufficient",
  "other-need",
]);
export type DispositionOutcome = z.infer<typeof dispositionOutcomeSchema>;

export const outcomeLabels: Record<DispositionOutcome, string> = {
  evidence: "Evidence",
  duplicate: "Duplicate",
  spam: "Spam or manipulation",
  "off-topic": "Off-topic",
  insufficient: "Insufficient detail",
  "other-need": "Different valid need",
};

export const signalDispositionSchema = z
  .object({
    postId: postIdSchema,
    outcome: dispositionOutcomeSchema,
    clusterId: clusterIdSchema.optional(),
    quote: z.string().min(1).max(MAX_POST_CHARS).optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();
export type SignalDisposition = z.infer<typeof signalDispositionSchema>;

// The existing three-field specification shape; generation receipts are
// stored beside it, never inside it.
export const specificationSchema = z
  .object({
    need: z.string().trim().min(1),
    specification: z.string().trim().min(1),
    acceptanceCriteria: z.array(z.string().trim().min(1)).min(2).max(10),
  })
  .strict();
export type SignalSpecification = z.infer<typeof specificationSchema>;

export const signalProposalSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    assumptions: z.array(z.string().trim().min(1).max(300)).max(6),
    specification: specificationSchema,
  })
  .strict();
export type SignalProposal = z.infer<typeof signalProposalSchema>;

export const signalSentimentSchema = z.enum([
  "frustrated",
  "concerned",
  "mixed",
  "neutral",
  "positive",
]);

// The model returns one disposition per input plus cluster content. Evidence
// assignments, quotes, counts, and repeated-pattern claims are derived from
// validated dispositions on the server, never trusted from cluster text.
export const signalsAnalysisOutputSchema = z
  .object({
    dispositions: z.array(signalDispositionSchema).max(MAX_POSTS),
    clusters: z
      .array(
        z
          .object({
            id: clusterIdSchema,
            need: z.string().trim().min(3).max(600),
            rationale: z.string().trim().min(3).max(1200),
            sentiment: signalSentimentSchema.optional(),
            proposal: signalProposalSchema,
          })
          .strict(),
      )
      .max(MAX_CLUSTERS),
  })
  .strict();
export type SignalsAnalysisOutput = z.infer<typeof signalsAnalysisOutputSchema>;

export type ValidatedCluster = {
  id: string;
  need: string;
  rationale: string;
  sentiment?: "frustrated" | "concerned" | "mixed" | "neutral" | "positive";
  sources: { postId: string; author: string; quote: string }[];
  distinctAuthors: number;
  repeatedEvidence: boolean;
  proposal: SignalProposal;
};

export type ValidatedAnalysis = {
  dispositions: SignalDisposition[];
  clusters: ValidatedCluster[];
  stats: {
    posts: number;
    evidencePosts: number;
    distinctEvidenceAuthors: number;
    duplicatePosts: number;
    spamPosts: number;
    offTopicPosts: number;
    insufficientPosts: number;
    otherNeedPosts: number;
  };
};

export function signalsPersistenceOutput(analysis: ValidatedAnalysis): SignalsAnalysisOutput {
  return {
    dispositions: analysis.dispositions,
    clusters: analysis.clusters.map(({ id, need, rationale, sentiment, proposal }) => ({
      id,
      need,
      rationale,
      ...(sentiment === undefined ? {} : { sentiment }),
      proposal,
    })),
  };
}

export class SignalsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SignalsValidationError";
  }
}

export function validateSignalsAnalysis(
  posts: readonly SignalPostInput[],
  output: unknown,
): ValidatedAnalysis {
  const parsed = signalsAnalysisOutputSchema.parse(output);
  const byId = new Map(posts.map((p) => [p.id, p]));
  const seen = new Set<string>();
  for (const disposition of parsed.dispositions) {
    if (!byId.has(disposition.postId))
      throw new SignalsValidationError(
        `Disposition references unknown post ${disposition.postId}`,
      );
    if (seen.has(disposition.postId))
      throw new SignalsValidationError(
        `Post ${disposition.postId} has more than one disposition`,
      );
    seen.add(disposition.postId);
    if (disposition.outcome === "evidence") {
      if (!disposition.clusterId)
        throw new SignalsValidationError(
          `Evidence disposition for ${disposition.postId} must name a cluster`,
        );
      if (!disposition.quote)
        throw new SignalsValidationError(
          `Evidence disposition for ${disposition.postId} must quote the source`,
        );
      continue;
    }
    if (disposition.clusterId !== undefined)
      throw new SignalsValidationError(
        `Excluded post ${disposition.postId} cannot reference a cluster`,
      );
    if (disposition.quote !== undefined)
      throw new SignalsValidationError(
        `Excluded post ${disposition.postId} cannot carry evidence quotes`,
      );
  }
  const missing = posts.filter((p) => !seen.has(p.id));
  if (missing.length)
    throw new SignalsValidationError(
      `No disposition for input posts: ${missing.map((p) => p.id).join(", ")}`,
    );
  const clusterIds = new Set<string>();
  for (const cluster of parsed.clusters) {
    if (clusterIds.has(cluster.id))
      throw new SignalsValidationError(`Duplicate cluster ID: ${cluster.id}`);
    clusterIds.add(cluster.id);
  }
  for (const disposition of parsed.dispositions) {
    if (
      disposition.outcome === "evidence" &&
      !clusterIds.has(disposition.clusterId!)
    )
      throw new SignalsValidationError(
        `Disposition for ${disposition.postId} references unknown cluster ${disposition.clusterId}`,
      );
  }
  // Quotes must be exact substrings of the cited input, taken from stored
  // posts rather than the model's memory of them.
  for (const disposition of parsed.dispositions) {
    if (disposition.outcome !== "evidence" || !disposition.quote) continue;
    const post = byId.get(disposition.postId)!;
    if (!post.text.includes(disposition.quote))
      throw new SignalsValidationError(
        `Quote for ${disposition.postId} is not an exact substring of the saved input`,
      );
  }
  const clusters = parsed.clusters.map((cluster) => {
    const sources = parsed.dispositions
      .filter(
        (d) => d.outcome === "evidence" && d.clusterId === cluster.id && d.quote,
      )
      .map((d) => ({
        postId: d.postId,
        author: byId.get(d.postId)!.author,
        quote: d.quote!,
      }));
    if (!sources.length)
      throw new SignalsValidationError(
        `Cluster ${cluster.id} has no validated evidence`,
      );
    const distinctAuthors = new Set(sources.map((s) => s.author)).size;
    return {
      id: cluster.id,
      need: cluster.need,
      rationale: cluster.rationale,
      ...(cluster.sentiment ? { sentiment: cluster.sentiment } : {}),
      sources,
      distinctAuthors,
      repeatedEvidence: distinctAuthors >= 2,
      proposal: cluster.proposal,
    };
  });
  const count = (outcome: DispositionOutcome) =>
    parsed.dispositions.filter((d) => d.outcome === outcome).length;
  const evidence = parsed.dispositions.filter((d) => d.outcome === "evidence");
  return {
    dispositions: parsed.dispositions,
    clusters,
    stats: {
      posts: posts.length,
      evidencePosts: evidence.length,
      distinctEvidenceAuthors: new Set(
        evidence.map((d) => byId.get(d.postId)!.author),
      ).size,
      duplicatePosts: count("duplicate"),
      spamPosts: count("spam"),
      offTopicPosts: count("off-topic"),
      insufficientPosts: count("insufficient"),
      otherNeedPosts: count("other-need"),
    },
  };
}

// Public-safe projection for the operator-reviewed signals export. Safe
// labels only: no backend IDs, no private URLs, no provider request IDs.
export const signalsExportSchema = z
  .object({
    schemaVersion: z.literal(1),
    provenance: z.object({
      kind: z.string(),
      label: z.string(),
      syntheticAuthors: z.boolean(),
    }),
    batch: z.object({
      fingerprint: z.string(),
      posts: z.number(),
      authors: z.number(),
      totalChars: z.number(),
    }),
    posts: z.array(
      z.object({
        id: z.string(),
        author: z.string(),
        text: z.string(),
        disposition: z.object({
          outcome: dispositionOutcomeSchema,
          clusterId: z.string().nullable(),
          quote: z.string().nullable(),
          reason: z.string(),
        }),
      }),
    ),
    clusters: z.array(
      z.object({
        id: z.string(),
        need: z.string(),
        rationale: z.string(),
        sentiment: z.string().nullable(),
        sources: z.array(
          z.object({
            postId: z.string(),
            author: z.string(),
            quote: z.string(),
          }),
        ),
        distinctAuthors: z.number(),
        repeatedEvidence: z.boolean(),
        proposal: signalProposalSchema,
        handoffLabel: z.string().nullable(),
        handoffState: z.string().nullable(),
      }),
    ),
    receipt: z
      .object({
        provider: z.string(),
        requestedModel: z.string(),
        model: z.string(),
        inputTokens: z.number(),
        outputTokens: z.number(),
        durationMs: z.number(),
      })
      .nullable(),
    attempts: z.array(
      z.object({
        number: z.number(),
        status: z.string(),
        error: z.string().nullable(),
      }),
    ),
    completedAt: z.string().nullable(),
  })
  .strict();
export type SignalsExport = z.infer<typeof signalsExportSchema>;

// Public-safe projection of one coding run's evidence for run.json. Only
// aggregated usage, per-call cumulative usage derived from recorded events,
// and neutral timing offsets are exported — no prompt text, provider request
// IDs, repo paths, commit SHAs or PR URLs. When the recorded event chain is
// broken, the export degrades to "aggregate-only" and omits per-call rows
// entirely rather than inventing timings.
export const runExportSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.enum(["complete-history", "aggregate-only"]),
    run: z
      .object({
        kind: z.string(),
        provider: z.string(),
        finalStatus: z.string(),
        verified: z.boolean().nullable(),
        deployed: z.boolean().nullable(),
      })
      .strict(),
    totals: z
      .object({
        modelCalls: z.number(),
        inputTokens: z.number(),
        outputTokens: z.number(),
        aggregateAgreement: z.boolean(),
      })
      .strict(),
    calls: z.array(
      z
        .object({
          call: z.number(),
          model: z.string(),
          inputTokens: z.number(),
          outputTokens: z.number(),
          deltaIn: z.number().nullable(),
          deltaOut: z.number().nullable(),
          offsetMs: z.number().nullable(),
        })
        .strict(),
    ),
    timeline: z
      .object({
        firstEventAt: z.string().nullable(),
        lastEventAt: z.string().nullable(),
        eventCount: z.number(),
        compressionNote: z.string(),
      })
      .strict(),
    checks: z
      .object({
        observations: checkObservationsSchema.optional(),
        beforeSummary: z.string().nullable(),
        afterSummary: z.string().nullable(),
        provenanceNote: z.string(),
      })
      .strict(),
    generatedAt: z.string(),
  })
  .strict();
export type RunExport = z.infer<typeof runExportSchema>;

export function redactPublicText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s<>"']+/gi, "[url]")
    .replace(
      /\b[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+\b/gi,
      "[email]",
    )
    .replace(/(^|[\s'"(=])\/(?:[A-Za-z0-9._-]+\/)+[A-Za-z0-9._-]+/g, "$1[path]")
    .replace(/\b[A-Za-z]:\\(?:[^\\/\s]+\\)*[^\\/\s]+/g, "[path]")
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "[id]",
    )
    .replace(/\b[0-9a-f]{40}\b/gi, "[commit]")
    .replace(/\b[a-z0-9]{32}\b/g, "[id]")
    .replace(/\b(?:req(?:uest)?|run|trace)[_-][A-Za-z0-9_-]+\b/gi, "[id]")
    .replace(
      /\b((?:run|request|trace)[ _-]?id)\s*(?:[:=]\s*)?[A-Za-z0-9_-]+\b/gi,
      "$1 [id]",
    );
}

export function assertPublicText(
  text: string,
  privateValues: readonly string[] = [],
): string {
  if (
    redactPublicText(text) !== text ||
    privateValues.some(
      (value) =>
        value.length > 0 && text.toLowerCase().includes(value.toLowerCase()),
    )
  )
    throw new Error("Export text contains a private identifier or location");
  return text;
}

export function sanitizeCheckSummary(
  text: string | null | undefined,
): string | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const compact = redactPublicText(text).replace(/\s+/g, " ").trim();
  return compact.length > 600 ? compact.slice(0, 597) + "…" : compact;
}
