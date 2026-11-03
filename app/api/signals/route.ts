import { NextRequest, NextResponse } from "next/server";
import { api, db, secret } from "@/lib/server-store";
import { operator, sameOrigin } from "@/lib/access";
import { requirePermission } from "@/lib/roles";
import { listPacks } from "@/lib/app-pack";
import { z } from "zod";
import {
  signalsProvenanceSchema,
  signalPostInputSchema,
} from "@/lib/signals-schema";
import {
  analyzeSignalPosts,
  SignalsGenerationError,
} from "@/lib/signals";
import type { Id } from "@/convex/_generated/dataModel";

export const runtime = "nodejs";

const batchIdInput = z.string().regex(/^[a-z0-9]{32}$/);
const fingerprintInput = z.string().regex(/^[0-9a-f]{16}$/);
const requestKeyInput = z.string().trim().min(1).max(80);

export async function GET(request: NextRequest) {
  try {
    await operator(request);
    const store = db(),
      auth = secret();
    const params = request.nextUrl.searchParams;
    if (params.has("batchId")) {
      const batchId = batchIdInput.parse(params.get("batchId"));
      const batch = await store.query(api.signals.getSignalBatch, {
        secret: auth,
        batchId: batchId as Id<"signalBatches">,
      });
      if (!batch) throw new Error("Signal batch not found");
      return NextResponse.json({ batch }, { headers: { "cache-control": "no-store" } });
    }
    const appId = z.string().min(1).max(200).parse(params.get("appId") || "");
    const batches = await store.query(api.signals.listSignalBatches, {
      secret: auth,
      appId,
    });
    return NextResponse.json(
      { batches },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }
}

const importInput = z.object({
  appId: z.string().min(1).max(200),
  requestKey: requestKeyInput,
  provenance: z.union([
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
  ]),
  posts: z.array(signalPostInputSchema).min(1),
});

export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const actor = await operator(request);
    const body = await request.json();
    const store = db(),
      auth = secret();
    switch (body.action) {
      case "import": {
        // Importing and analyzing mint specification material, so they share
        // the spec permission with generateSpec.
        requirePermission(actor, "spec");
        const input = importInput.parse(body);
        const result = await store.mutation(api.signals.createSignalBatch, {
          secret: auth,
          appId: input.appId,
          requestKey: input.requestKey,
          provenance: input.provenance,
          posts: input.posts,
          actor: actor.name,
        });
        return NextResponse.json(result);
      }
      case "analyze":
      case "retry": {
        requirePermission(actor, "spec");
        const batchId = batchIdInput.parse(body.batchId);
        const expectedFingerprint = fingerprintInput.parse(
          body.expectedFingerprint,
        );
        const batch = await store.query(api.signals.getSignalBatch, {
          secret: auth,
          batchId: batchId as Id<"signalBatches">,
        });
        if (!batch) throw new Error("Signal batch not found");
        const claim = await store.mutation(api.signals.analyzeSignalBatch, {
          secret: auth,
          batchId: batchId as Id<"signalBatches">,
          expectedFingerprint,
        });
        // The model call runs outside database mutations; the claim token
        // proves the completion belongs to this attempt.
        const packs = await listPacks();
        const appName =
          packs.find((p) => p.appId === batch.appId)?.name || batch.appId;
        try {
          const result = await analyzeSignalPosts({
            appName,
            provenance: signalsProvenanceSchema.parse(batch.provenance),
            posts: batch.posts,
          });
          await store.mutation(api.signals.completeSignalAttempt, {
            secret: auth,
            batchId: batchId as Id<"signalBatches">,
            token: claim.token,
            output: {
              dispositions: result.analysis.dispositions,
              clusters: result.analysis.clusters,
            },
            receipt: result.receipt,
          });
          return NextResponse.json({
            state: "analyzed",
            attemptNumber: claim.attemptNumber,
          });
        } catch (error) {
          // Persist the honest failure with any paid receipt, then report it.
          const message =
            error instanceof Error ? error.message : "Analysis failed";
          const receipt =
            error instanceof SignalsGenerationError
              ? error.receipt
              : undefined;
          await store.mutation(api.signals.failSignalAttempt, {
            secret: auth,
            batchId: batchId as Id<"signalBatches">,
            token: claim.token,
            error: message.slice(0, 900),
            ...(receipt ? { receipt } : {}),
          });
          return NextResponse.json({
            state: "failed",
            attemptNumber: claim.attemptNumber,
            error: message,
          });
        }
      }
      case "promote": {
        requirePermission(actor, "spec");
        const batchId = batchIdInput.parse(body.batchId);
        const expectedAnalysisRevision = z
          .number()
          .int()
          .min(1)
          .parse(body.expectedAnalysisRevision);
        const clusterId = z
          .string()
          .regex(/^[a-z0-9][a-z0-9_-]{0,63}$/)
          .parse(body.clusterId);
        const issueId = await store.mutation(api.signals.promoteSignalProposal, {
          secret: auth,
          batchId: batchId as Id<"signalBatches">,
          expectedAnalysisRevision,
          clusterId,
          actor: actor.name,
        });
        return NextResponse.json({ issueId });
      }
      default:
        throw new Error("Unknown action");
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
