import { api, db, secret } from "./server-store";
import { classifyReport, geminiReady } from "./gemini";
import type { Id } from "../convex/_generated/dataModel";
export async function triage(caseId: Id<"cases">) {
  if (!geminiReady()) return;
  const store = db(),
    auth = secret(),
    state = await store.query(api.cue.snapshot, { secret: auth }),
    report = state.cases.find((c) => c._id === caseId);
  if (!report) return;
  try {
    const result = await classifyReport({
      report: { title: report.title, body: report.body },
      candidates: state.issues
        .filter(
          (i) =>
            i.appId === report.appId &&
            (i._id !== report.issueId || !i.fingerprint.startsWith("report:")),
        )
        .map((i) => ({
          id: i._id,
          title: i.title,
          description: i.description,
          kind: i.kind,
          fingerprint: i.fingerprint,
        })),
    });
    const match = state.issues.find(
      (i) => i._id === result.matchedIssueId && i.kind === result.kind,
    );
    // Preserve strong symptom matches; model-only merges stay conservative.
    const existing = state.issues.find((i) => i._id === report.issueId);
    await store.mutation(api.cue.triage, {
      secret: auth,
      caseId,
      issueId:
        existing?.fingerprint.startsWith("report:") &&
        match &&
        result.confidence >= 0.95
          ? match._id
          : undefined,
      priority: result.priority,
      tags: result.tags,
      reason: result.reason,
      kind: result.kind,
    });
  } catch {
    await store.mutation(api.cue.event, {
      secret: auth,
      issueId: report.issueId,
      title: "AI triage unavailable",
      detail:
        "Report is saved. Symptom matching and operator review remain available.",
      kind: "failure",
    });
  }
}
