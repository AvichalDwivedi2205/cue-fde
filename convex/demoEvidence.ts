import { paginationResultValidator } from "convex/server";
import schema from "./schema";
import { query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { authorize } from "./cue";
import { assertPublicText } from "../lib/signals-schema";
import {
  observeRunChecks,
  summarizeObservedChecks,
} from "../lib/demo-check-evidence";

// Generic demo-evidence export: public-safe projections of one coding run's
// recorded model-call history and one signals batch's reviewed analysis.
// Everything here is an allowlist projection — raw prompt text, provider
// request IDs, repo paths, commit SHAs and PR URLs never leave the backend.

// One "Meta coding response" event decoded from its detail JSON. Fields are
// narrowed before use; anything malformed is skipped and reported.
type ModelCallRecord = {
  modelCalls: number;
  requestedModel: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  status: string | null;
  modelMatched: boolean;
  createdAt: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;
const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === "string";

export const runEvents = query({
  args: {
    secret: v.string(),
    runId: v.id("runs"),
    cursor: v.optional(v.string()),
    numItems: v.optional(v.number()),
  },
  returns: paginationResultValidator(schema.doc("events")),
  handler: async (ctx, args) => {
    authorize(args.secret);
    if (!(await ctx.db.get("runs", args.runId)))
      throw new ConvexError("Run not found");
    const numItems = args.numItems ?? 200;
    if (!Number.isSafeInteger(numItems) || numItems < 1 || numItems > 500)
      throw new ConvexError("numItems must be an integer between 1 and 500");
    return await ctx.db
      .query("events")
      .withIndex("by_runId_and_createdAt", (q) => q.eq("runId", args.runId))
      .order("asc")
      .paginate({ cursor: args.cursor ?? null, numItems });
  },
});

// Bounded read of one run's event history. 1000 events covers any honest demo
// run; longer histories would need pagination before they are evidence anyway.
const MAX_EVENTS_PER_RUN = 1000;
const MODEL_CALL_EVENT_TITLE = "Meta coding response";

export const runEvidence = query({
  args: { secret: v.string(), runId: v.id("runs") },
  returns: v.object({
    run: v.object({
      status: v.string(),
      kind: v.nullable(v.string()),
      provider: v.string(),
      phase: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
      verified: v.nullable(v.boolean()),
      deployed: v.nullable(v.boolean()),
      approvedSpecPresent: v.boolean(),
      commitPresent: v.boolean(),
      prPresent: v.boolean(),
      // The run document's own recorded aggregates and check summaries. They
      // let the export report aggregate-only totals honestly when the
      // per-call event chain is broken.
      inputTokens: v.nullable(v.number()),
      outputTokens: v.nullable(v.number()),
      modelCalls: v.nullable(v.number()),
      beforeSummary: v.nullable(v.string()),
      afterSummary: v.nullable(v.string()),
    }),
    observations: v.object({
      baseline: v.nullable(v.object({ passed: v.number(), total: v.number() })),
      acceptance: v.nullable(
        v.object({ passed: v.number(), total: v.number() }),
      ),
      typescript: v.nullable(v.boolean()),
      defaultTests: v.nullable(
        v.object({ passed: v.number(), total: v.number() }),
      ),
    }),
    completeHistory: v.boolean(),
    calls: v.array(
      v.object({
        modelCalls: v.number(),
        requestedModel: v.string(),
        model: v.string(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        deltaIn: v.nullable(v.number()),
        deltaOut: v.nullable(v.number()),
        createdAt: v.number(),
      }),
    ),
    totals: v.object({
      calls: v.number(),
      inputTokens: v.number(),
      outputTokens: v.number(),
      aggregateAgreement: v.boolean(),
    }),
    timeline: v.object({
      firstEventAt: v.nullable(v.number()),
      lastEventAt: v.nullable(v.number()),
      eventCount: v.number(),
    }),
    issues: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const run = await ctx.db.get("runs", args.runId);
    if (!run) throw new ConvexError("Run not found");
    const privateValues = [
      args.secret,
      run._id,
      run.issueId,
      run.repoPath,
      run.commit,
      run.baseCommit,
      run.releaseCommit,
      run.prUrl,
      run.codingPolicy?.repository,
    ].filter(isString);
    const publicText = (text: string) => assertPublicText(text, privateValues);
    const events = await ctx.db
      .query("events")
      .withIndex("by_runId_and_createdAt", (q) => q.eq("runId", args.runId))
      .order("asc")
      .take(MAX_EVENTS_PER_RUN);

    const issues: string[] = [];
    const calls: ModelCallRecord[] = [];
    for (const event of events) {
      if (event.title !== MODEL_CALL_EVENT_TITLE) continue;
      let detail: unknown;
      try {
        detail = JSON.parse(event.detail);
      } catch {
        issues.push(
          `Model-call event at ${new Date(event.createdAt).toISOString()} holds unparsable detail and was skipped.`,
        );
        continue;
      }
      if (
        !isRecord(detail) ||
        !isNumber(detail.modelCalls) ||
        !isString(detail.requestedModel) ||
        !isString(detail.model) ||
        !isNumber(detail.inputTokens) ||
        !isNumber(detail.outputTokens)
      ) {
        issues.push(
          `Model-call event at ${new Date(event.createdAt).toISOString()} is missing required usage fields and was skipped.`,
        );
        continue;
      }
      calls.push({
        modelCalls: detail.modelCalls,
        requestedModel: detail.requestedModel,
        model: detail.model,
        inputTokens: detail.inputTokens,
        outputTokens: detail.outputTokens,
        status: isString(detail.status) ? detail.status : null,
        modelMatched: detail.modelMatched === true,
        createdAt: event.createdAt,
      });
    }
    if (events.length === MAX_EVENTS_PER_RUN)
      issues.push(
        `Event history was truncated at ${MAX_EVENTS_PER_RUN} events; the run may have more.`,
      );

    // The chain is only complete when call numbers run 1..N in order, every
    // call completed on the requested model, and cumulative usage never went
    // backwards. Only then may per-call deltas be derived.
    let chainComplete = true;
    calls.forEach((call, index) => {
      const expected = index + 1;
      if (call.modelCalls !== expected) {
        chainComplete = false;
        issues.push(
          `Model call sequence is not contiguous: position ${expected} reports call number ${call.modelCalls}.`,
        );
      }
    });
    for (const call of calls) {
      if (call.status !== "completed") {
        chainComplete = false;
        issues.push(`Model call ${call.modelCalls} did not complete.`);
      }
      if (!call.modelMatched || call.model !== call.requestedModel) {
        chainComplete = false;
        issues.push(
          `Model call ${call.modelCalls} was not served by the requested model.`,
        );
      }
    }
    for (let index = 1; index < calls.length; index++) {
      const previous = calls[index - 1];
      const call = calls[index];
      if (call.inputTokens < previous.inputTokens) {
        chainComplete = false;
        issues.push(
          `Cumulative input tokens decreased at model call ${call.modelCalls}.`,
        );
      }
      if (call.outputTokens < previous.outputTokens) {
        chainComplete = false;
        issues.push(
          `Cumulative output tokens decreased at model call ${call.modelCalls}.`,
        );
      }
    }

    const callsOut = calls.map((call, index) => ({
      modelCalls: call.modelCalls,
      requestedModel: publicText(call.requestedModel),
      model: publicText(call.model),
      inputTokens: call.inputTokens,
      outputTokens: call.outputTokens,
      deltaIn:
        chainComplete && index === 0
          ? call.inputTokens
          : chainComplete
            ? call.inputTokens - calls[index - 1].inputTokens
            : null,
      deltaOut:
        chainComplete && index === 0
          ? call.outputTokens
          : chainComplete
            ? call.outputTokens - calls[index - 1].outputTokens
            : null,
      createdAt: call.createdAt,
    }));

    // Aggregate agreement compares the final cumulative event totals with the
    // run document's own recorded fields, wherever those fields are present.
    const final = calls.length ? calls[calls.length - 1] : null;
    let aggregateAgreement = true;
    if (run.inputTokens !== undefined) {
      if (!final) {
        aggregateAgreement = false;
        issues.push(
          "The run records input tokens but no model-call events were found.",
        );
      } else if (final.inputTokens !== run.inputTokens) {
        aggregateAgreement = false;
        issues.push(
          `Final cumulative input tokens (${final.inputTokens}) do not match the run's recorded input tokens (${run.inputTokens}).`,
        );
      }
    }
    if (run.outputTokens !== undefined) {
      if (!final) {
        aggregateAgreement = false;
        issues.push(
          "The run records output tokens but no model-call events were found.",
        );
      } else if (final.outputTokens !== run.outputTokens) {
        aggregateAgreement = false;
        issues.push(
          `Final cumulative output tokens (${final.outputTokens}) do not match the run's recorded output tokens (${run.outputTokens}).`,
        );
      }
    }
    if (run.modelCalls !== undefined) {
      if (!final) {
        aggregateAgreement = false;
        issues.push(
          "The run records model calls but no model-call events were found.",
        );
      } else if (final.modelCalls !== run.modelCalls) {
        aggregateAgreement = false;
        issues.push(
          `Final model call number (${final.modelCalls}) does not match the run's recorded model calls (${run.modelCalls}).`,
        );
      }
    }

    const observations = observeRunChecks(
      run.codingPolicy,
      run.before,
      run.after,
    );
    const summaries = summarizeObservedChecks(observations);
    return {
      observations,
      run: {
        status: publicText(run.status),
        kind: run.kind === undefined ? null : publicText(run.kind),
        provider: publicText(run.provider),
        phase: publicText(run.phase),
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        verified: run.verified ?? null,
        deployed: run.deployed ?? null,
        approvedSpecPresent:
          typeof run.approvedSpec === "string" &&
          run.approvedSpec.trim() !== "",
        commitPresent:
          typeof run.commit === "string" && run.commit.trim() !== "",
        prPresent: typeof run.prUrl === "string" && run.prUrl.trim() !== "",
        inputTokens: run.inputTokens ?? null,
        outputTokens: run.outputTokens ?? null,
        modelCalls: run.modelCalls ?? null,
        beforeSummary: summaries.beforeSummary,
        afterSummary: summaries.afterSummary,
      },
      completeHistory: chainComplete,
      calls: callsOut,
      totals: {
        calls: calls.length,
        inputTokens: final ? final.inputTokens : 0,
        outputTokens: final ? final.outputTokens : 0,
        aggregateAgreement,
      },
      timeline: {
        firstEventAt: events.length ? events[0].createdAt : null,
        lastEventAt: events.length ? events[events.length - 1].createdAt : null,
        eventCount: events.length,
      },
      issues,
    };
  },
});

const dispositionOutcome = v.union(
  v.literal("evidence"),
  v.literal("duplicate"),
  v.literal("spam"),
  v.literal("off-topic"),
  v.literal("insufficient"),
  v.literal("other-need"),
);

export const signalEvidence = query({
  args: { secret: v.string(), batchId: v.id("signalBatches") },
  returns: v.object({
    schemaVersion: v.literal(1),
    provenance: v.object({
      kind: v.string(),
      label: v.string(),
      syntheticAuthors: v.boolean(),
    }),
    batch: v.object({
      fingerprint: v.string(),
      posts: v.number(),
      authors: v.number(),
      totalChars: v.number(),
    }),
    posts: v.array(
      v.object({
        id: v.string(),
        author: v.string(),
        text: v.string(),
        disposition: v.object({
          outcome: dispositionOutcome,
          clusterId: v.nullable(v.string()),
          quote: v.nullable(v.string()),
          reason: v.string(),
        }),
      }),
    ),
    clusters: v.array(
      v.object({
        id: v.string(),
        need: v.string(),
        rationale: v.string(),
        sentiment: v.nullable(v.string()),
        sources: v.array(
          v.object({
            postId: v.string(),
            author: v.string(),
            quote: v.string(),
          }),
        ),
        distinctAuthors: v.number(),
        repeatedEvidence: v.boolean(),
        proposal: v.object({
          title: v.string(),
          assumptions: v.array(v.string()),
          specification: v.object({
            need: v.string(),
            specification: v.string(),
            acceptanceCriteria: v.array(v.string()),
          }),
        }),
        handoffLabel: v.nullable(v.string()),
        handoffState: v.nullable(v.string()),
      }),
    ),
    receipt: v.nullable(
      v.object({
        provider: v.string(),
        requestedModel: v.string(),
        model: v.string(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        durationMs: v.number(),
      }),
    ),
    attempts: v.array(
      v.object({
        number: v.number(),
        status: v.string(),
        error: v.nullable(v.string()),
      }),
    ),
    completedAt: v.nullable(v.string()),
  }),
  handler: async (ctx, args) => {
    authorize(args.secret);
    const batch = await ctx.db.get("signalBatches", args.batchId);
    if (!batch) throw new ConvexError("Signal batch not found");
    const analysis = batch.analysis;
    if (!analysis)
      throw new ConvexError("Signal batch has not been analyzed yet");

    if (batch.provenance.kind !== "synthetic-fixture")
      throw new ConvexError(
        "Operator captures require a reviewed projection before export",
      );
    const privateValues = [
      args.secret,
      batch._id,
      batch.appId,
      batch.requestKey,
      batch.creator,
      ...batch.posts.flatMap((post) => [post.id, post.sourceRef]),
      ...analysis.clusters.map((cluster) => cluster.id),
      ...batch.promoted.map((promotion) => promotion.issueId),
      analysis.receipt?.requestId,
      analysis.receipt?.traceId,
      ...batch.attempts.flatMap((attempt) => [
        attempt.receipt?.requestId,
        attempt.receipt?.traceId,
      ]),
    ].filter(isString);
    const publicText = (text: string) => assertPublicText(text, privateValues);
    const label = `Synthetic operator fixture ${publicText(batch.provenance.fixture ?? "unknown")} ${publicText(batch.provenance.version ?? "unknown")} · fictional authors`;
    const postAliases = new Map(
      batch.posts.map((post, index) => [post.id, `post-${index + 1}`]),
    );
    const authors = [...new Set(batch.posts.map((post) => post.author))];
    const authorAliases = new Map(
      authors.map((author, index) => [author, `Author ${index + 1}`]),
    );
    const clusterAliases = new Map(
      analysis.clusters.map((cluster, index) => [
        cluster.id,
        `cluster-${index + 1}`,
      ]),
    );
    const alias = (aliases: Map<string, string>, value: string) => {
      const label = aliases.get(value);
      if (!label)
        throw new ConvexError("Stored analysis has an invalid reference");
      return label;
    };

    const narrativeAliases = new Map([...postAliases, ...clusterAliases]);
    const narrativePattern = new RegExp(
      `(^|[^A-Za-z0-9_-])(${[...narrativeAliases.keys()]
        .sort((left, right) => right.length - left.length)
        .map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join("|")})(?=$|[^A-Za-z0-9_-])`,
      "g",
    );
    const privateNarrativeValues = privateValues.filter(
      (value) => !narrativeAliases.has(value),
    );
    const publicNarrative = (text: string) => assertPublicText(
      text.replace(narrativePattern, (_, prefix: string, id: string) =>
        prefix + alias(narrativeAliases, id),
      ),
      privateNarrativeValues,
    );

    const dispositionsByPost = new Map(
      analysis.dispositions.map((d) => [d.postId, d]),
    );
    const promotedIssues = await Promise.all(
      batch.promoted.map((promotion) => ctx.db.get("issues", promotion.issueId)),
    );
    const promotionNumber = (clusterId: string) => {
      const index = batch.promoted.findIndex(
        (p) =>
          p.clusterId === clusterId && p.analysisRevision === analysis.revision,
      );
      return index === -1 ? null : index + 1;
    };

    return {
      schemaVersion: 1 as const,
      provenance: {
        kind: batch.provenance.kind,
        label,
        syntheticAuthors: true,
      },
      batch: {
        fingerprint: publicText(batch.inputFingerprint),
        posts: batch.posts.length,
        authors: new Set(batch.posts.map((p) => p.author)).size,
        totalChars: batch.posts.reduce((sum, p) => sum + p.text.length, 0),
      },
      posts: batch.posts.map((post) => {
        const disposition = dispositionsByPost.get(post.id);
        if (!disposition)
          throw new ConvexError("Stored analysis is missing a disposition");
        return {
          id: alias(postAliases, post.id),
          author: alias(authorAliases, post.author),
          text: publicText(post.text),
          disposition: {
            outcome: disposition.outcome,
            clusterId:
              disposition.clusterId === undefined
                ? null
                : alias(clusterAliases, disposition.clusterId),
            quote:
              disposition.quote === undefined
                ? null
                : publicText(disposition.quote),
            reason: publicNarrative(disposition.reason),
          },
        };
      }),
      clusters: analysis.clusters.map((cluster) => {
        const promoted = promotionNumber(cluster.id);
        const issue = promoted === null ? null : promotedIssues[promoted - 1];
        return {
          id: alias(clusterAliases, cluster.id),
          need: publicNarrative(cluster.need),
          rationale: publicNarrative(cluster.rationale),
          sentiment:
            cluster.sentiment === undefined
              ? null
              : publicText(cluster.sentiment),
          sources: cluster.sources.map((s) => {
            const post = batch.posts.find((post) => post.id === s.postId);
            if (
              !post ||
              post.author !== s.author ||
              !post.text.includes(s.quote)
            )
              throw new ConvexError(
                "Stored analysis has an invalid source citation",
              );
            return {
              postId: alias(postAliases, s.postId),
              author: alias(authorAliases, s.author),
              quote: publicText(s.quote),
            };
          }),
          distinctAuthors: cluster.distinctAuthors,
          repeatedEvidence: cluster.repeatedEvidence,
          proposal: {
            title: publicNarrative(cluster.proposal.title),
            assumptions: cluster.proposal.assumptions.map(publicNarrative),
            specification: {
              need: publicNarrative(cluster.proposal.specification.need),
              specification: publicNarrative(
                cluster.proposal.specification.specification,
              ),
              acceptanceCriteria:
                cluster.proposal.specification.acceptanceCriteria.map(
                  publicNarrative,
                ),
            },
          },
          handoffLabel: promoted === null ? null : `handoff-${promoted}`,
          handoffState: issue ? publicText(issue.status) : null,
        };
      }),
      // Receipt is picked field-by-field: requestId/traceId never leave.
      receipt: analysis.receipt
        ? {
            provider: publicText(analysis.receipt.provider),
            requestedModel: publicText(analysis.receipt.requestedModel),
            model: publicText(analysis.receipt.model),
            inputTokens: analysis.receipt.inputTokens,
            outputTokens: analysis.receipt.outputTokens,
            durationMs: analysis.receipt.durationMs,
          }
        : null,
      attempts: batch.attempts.map((attempt) => ({
        number: attempt.number,
        status: attempt.status,
        error:
          attempt.error === undefined
            ? null
            : "Analysis attempt failed. Operator review required.",
      })),
      completedAt: new Date(analysis.completedAt).toISOString(),
    };
  },
});
