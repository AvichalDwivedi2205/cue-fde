import { api, db, secret } from "./server-store";
import { classifyReport } from "./gemini";
import { configuredRoute, routeReadiness } from "./model-config";
import type { Id } from "../convex/_generated/dataModel";
import { observed, annotateTelemetry } from "./observability";
import { parseScreenshot } from "./attachment";
import type { ModelImage } from "./meta";

export async function savedReportImages(args: {
  caseId: string;
  owner?: string;
  attachments: readonly {
    caseId?: string;
    owner: string;
    url: string | null;
  }[];
}): Promise<ModelImage[]> {
  const configured =
    process.env.CUE_CONVEX_URL ||
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.CONVEX_URL;
  if (!configured) return [];
  let origin: string;
  try {
    origin = new URL(configured).origin;
  } catch {
    return [];
  }
  const images: ModelImage[] = [];
  for (const attachment of args.attachments
    .filter(
      (a) =>
        a.caseId === args.caseId && (!args.owner || a.owner === args.owner),
    )
    .slice(-2)) {
    try {
      if (!attachment.url) continue;
      const url = new URL(attachment.url);
      if (
        url.protocol !== "https:" ||
        url.origin !== origin ||
        !url.pathname.startsWith("/api/storage/")
      )
        continue;
      const response = await fetch(url, {
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok || !response.body) continue;
      const maxBytes = 4_000_000;
      if (Number(response.headers.get("content-length") || 0) > maxBytes)
        continue;
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > maxBytes) throw new Error("Screenshot too large");
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel();
      }
      const mimeType = (response.headers.get("content-type") || "")
        .split(";")[0]
        .trim();
      images.push(
        await parseScreenshot(
          `data:${mimeType};base64,${Buffer.concat(chunks).toString("base64")}`,
        ),
      );
    } catch {
      annotateTelemetry({ "cue.triage.image_unavailable": 1 });
    }
  }
  return images;
}
function provisionalIssue(issue: { fingerprint: string; appId?: string }) {
  return issue.fingerprint.startsWith(
    issue.appId ? `${issue.appId}:report:` : "report:",
  );
}
export async function triage(caseId: Id<"cases">) {
  const queued = await db().mutation(api.triageQueue.request, {
    secret: secret(),
    caseId,
  });
  if (queued) return;
  try {
    await classifySavedReport(caseId);
  } catch {
    await db().mutation(api.cue.event, {
      secret: secret(),
      title: "AI triage unavailable",
      detail:
        "Report is saved. Symptom matching and operator review remain available.",
      kind: "failure",
    });
  }
}

async function classifySavedReportImpl(
  caseId: Id<"cases">,
  receiptId?: Id<"triageReceipts">,
) {
  const route = await configuredRoute({ purpose: "triage" });
  if (routeReadiness(route).kind === "unavailable")
    throw new Error("AI triage unavailable");
  const store = db(),
    auth = secret(),
    state = await store.query(api.cue.snapshot, { secret: auth }),
    report = state.cases.find((c) => c._id === caseId);
  if (!report) throw new Error("Saved report unavailable");
  const images = await savedReportImages({
    caseId,
    owner: report.owner,
    attachments: state.attachments || [],
  });
  const result = await classifyReport(
    {
      report: {
        title: report.title,
        body: report.body,
        recentCustomerMessages: state.messages
          .filter((m) => m.caseId === caseId && m.role === "customer")
          .slice(-6)
          .map((m) => m.body),
      },
      candidates: state.issues
        .filter(
          (i) =>
            i.appId === report.appId &&
            (i._id !== report.issueId || !provisionalIssue(i)),
        )
        .map((i) => ({
          id: i._id,
          title: i.title,
          description: i.description,
          kind: i.kind,
          fingerprint: i.fingerprint,
          appId: i.appId,
        })),
    },
    { route, images },
  );
  const match = state.issues.find(
    (i) =>
      i._id === result.matchedIssueId &&
      i.kind === result.kind &&
      i.appId === report.appId,
  );
  // Preserve strong symptom matches; model-only merges stay conservative.
  const existing = state.issues.find((i) => i._id === report.issueId);
  await store.mutation(api.cue.triage, {
    secret: auth,
    caseId,
    receiptId,
    issueId:
      existing &&
      provisionalIssue(existing) &&
      match &&
      result.confidence >= 0.95
        ? match._id
        : undefined,
    priority: result.priority,
    tags: result.tags,
    reason: result.reason,
    kind: result.kind,
  });
}

export const classifySavedReport = observed(
  "Cue saved report triage",
  classifySavedReportImpl,
);
