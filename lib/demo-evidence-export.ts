import type { FunctionReturnType } from "convex/server";
import type { api } from "../convex/_generated/api";
import { runExportSchema } from "./signals-schema";
import {
  checkObservationsSchema,
  observeRunChecks,
  summarizeObservedChecks,
} from "./demo-check-evidence";

export function createPublicRunExport(
  evidence: FunctionReturnType<typeof api.demoEvidence.runEvidence>,
  generatedAt: string,
) {
  const observations = checkObservationsSchema.parse(
    evidence.observations ?? observeRunChecks(undefined, null, null),
  );
  const summaries = summarizeObservedChecks(observations);
  const complete =
    evidence.completeHistory && evidence.totals.aggregateAgreement;
  const firstEventAt = evidence.timeline.firstEventAt;
  return runExportSchema.parse({
    schemaVersion: 1,
    status: complete ? "complete-history" : "aggregate-only",
    run: {
      kind: evidence.run.kind ?? "unknown",
      provider: evidence.run.provider,
      finalStatus: evidence.run.status,
      verified: evidence.run.verified,
      deployed: evidence.run.deployed,
    },
    totals: complete
      ? {
          modelCalls: evidence.totals.calls,
          inputTokens: evidence.totals.inputTokens,
          outputTokens: evidence.totals.outputTokens,
          aggregateAgreement: evidence.totals.aggregateAgreement,
        }
      : {
          modelCalls: evidence.run.modelCalls ?? evidence.totals.calls,
          inputTokens: evidence.run.inputTokens ?? evidence.totals.inputTokens,
          outputTokens:
            evidence.run.outputTokens ?? evidence.totals.outputTokens,
          aggregateAgreement: evidence.totals.aggregateAgreement,
        },
    calls: complete
      ? evidence.calls.map((call) => ({
          call: call.modelCalls,
          model: call.model,
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          deltaIn: call.deltaIn,
          deltaOut: call.deltaOut,
          offsetMs:
            firstEventAt === null ? null : call.createdAt - firstEventAt,
        }))
      : [],
    timeline: {
      firstEventAt:
        firstEventAt === null ? null : new Date(firstEventAt).toISOString(),
      lastEventAt:
        evidence.timeline.lastEventAt === null
          ? null
          : new Date(evidence.timeline.lastEventAt).toISOString(),
      eventCount: evidence.timeline.eventCount,
      compressionNote: "Recorded run history · timeline compressed",
    },
    checks: {
      observations,
      beforeSummary: summaries.beforeSummary,
      afterSummary: summaries.afterSummary,
      provenanceNote:
        "Observed fixed-command results. Public content still requires operator review.",
    },
    generatedAt,
  });
}
