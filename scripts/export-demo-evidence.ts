import nextEnv from "@next/env";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { Id } from "../convex/_generated/dataModel";
import {
  runExportSchema,
  sanitizeCheckSummary,
  signalsExportSchema,
} from "../lib/signals-schema";

// Export public-safe demo evidence as JSON files:
//   --run-id <id>    writes <out>/run.json (recorded model-call history)
//   --batch-id <id>  writes <out>/signals.json (reviewed signals batch)
//   --out <dir>      destination directory (required)
// Validation is strict: when the recorded evidence does not validate, the
// script fails loudly instead of substituting plausible values.
nextEnv.loadEnvConfig(process.cwd());
const { db, api, secret } = await import("../lib/server-store");

const argv = process.argv.slice(2);
const readFlag = (name: string) => {
  const index = argv.indexOf(name);
  if (index === -1) return null;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
};

// CLI flags arrive as plain strings; the backend argument validators reject
// malformed identifiers when the query runs.
const runId = readFlag("--run-id") as Id<"runs"> | null;
const batchId = readFlag("--batch-id") as Id<"signalBatches"> | null;
const out = readFlag("--out");
if (!runId && !batchId) {
  console.error(
    "Usage: npx tsx scripts/export-demo-evidence.ts (--run-id <id> | --batch-id <id>) --out <dir>",
  );
  process.exit(1);
}
if (!out) {
  console.error("A destination directory is required: --out <dir>");
  process.exit(1);
}

try {
  await fs.mkdir(out, { recursive: true });

  if (runId) {
    const evidence = await db().query(api.demoEvidence.runEvidence, {
      secret: secret(),
      runId,
    });
    for (const problem of evidence.issues)
      console.warn(`warning · ${problem}`);
    // Per-call rows and offsets are only exported when the recorded event
    // chain is complete and agrees with the run's own aggregates. Otherwise
    // the export degrades to aggregate-only totals and never invents
    // per-call timings.
    const complete =
      evidence.completeHistory && evidence.totals.aggregateAgreement;
    const firstEventAt = evidence.timeline.firstEventAt;
    const parsed = runExportSchema.parse({
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
        beforeSummary: sanitizeCheckSummary(evidence.run.beforeSummary),
        afterSummary: sanitizeCheckSummary(evidence.run.afterSummary),
        provenanceNote:
          "Checked and approved provenance are recorded separately by the operator.",
      },
      generatedAt: new Date().toISOString(),
    });
    const target = path.join(out, "run.json");
    await fs.writeFile(target, `${JSON.stringify(parsed, null, 2)}\n`);
    console.log(
      `${target} · ${parsed.status} · ${parsed.totals.modelCalls} model calls · ${parsed.totals.inputTokens} input / ${parsed.totals.outputTokens} output tokens · ${parsed.timeline.eventCount} events`,
    );
  }

  if (batchId) {
    const evidence = await db().query(api.demoEvidence.signalEvidence, {
      secret: secret(),
      batchId,
    });
    const parsed = signalsExportSchema.parse(evidence);
    const target = path.join(out, "signals.json");
    await fs.writeFile(target, `${JSON.stringify(parsed, null, 2)}\n`);
    const promoted = parsed.clusters.filter((c) => c.handoffLabel !== null)
      .length;
    console.log(
      `${target} · ${parsed.provenance.kind} · ${parsed.batch.posts} posts by ${parsed.batch.authors} authors · ${parsed.clusters.length} clusters · ${promoted} promoted`,
    );
  }
} catch (error) {
  console.error(
    "Export failed:",
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
