import type { Doc } from "../convex/_generated/dataModel";
import { packContext } from "./app-pack";
import { answerKnowledge, type KnowledgeAnswer } from "./knowledge-answer";
import type { ReplyContext } from "./reply-policy";

export type SupportReplyContext = {
  case: Pick<
    Doc<"cases">,
    "_id" | "appId" | "issueId" | "channel" | "title" | "body"
  >;
  issue?: Pick<
    Doc<"issues">,
    | "_id"
    | "appId"
    | "kind"
    | "status"
    | "title"
    | "description"
    | "fingerprint"
  > | null;
  run?: Pick<
    Doc<"runs">,
    | "issueId"
    | "targetId"
    | "kind"
    | "status"
    | "deployed"
    | "verified"
    | "commit"
    | "releaseCommit"
    | "releaseEvidence"
    | "deploymentMode"
    | "createdAt"
    | "updatedAt"
  > | null;
  messages?: Pick<Doc<"messages">, "caseId" | "role" | "body" | "createdAt">[];
};

function manualReview(): KnowledgeAnswer {
  return {
    text: "Your report is saved for review. I can’t verify an answer from the available application information yet.",
    status: "needs_review",
    hits: [],
    citedIds: [],
    provider: "none",
    model: "none",
    inputTokens: 0,
    outputTokens: 0,
    retrieval: "not-attempted",
  };
}

// Only stored case bindings select the application. In particular, an unbound
// historical case must not go through the legacy Bloom app-pack resolver.
export async function prepareSupportReply(
  context: SupportReplyContext,
): Promise<KnowledgeAnswer> {
  const { case: report, issue, run } = context;
  if (!report.appId) return manualReview();
  if (
    (issue && (issue._id !== report.issueId || issue.appId !== report.appId)) ||
    (report.issueId && !issue) ||
    (run &&
      (!issue ||
        run.issueId !== issue._id ||
        (run.targetId && run.targetId !== report.appId))) ||
    context.messages?.some((message) => message.caseId !== report._id)
  )
    return manualReview();

  const pack = await packContext(report.appId);
  if (!pack || pack.status !== "active") return manualReview();

  const messages = [...(context.messages || [])].sort(
    (a, b) => a.createdAt - b.createdAt,
  );
  const latestCustomer = messages
    .filter((message) => message.role === "customer")
    .at(-1);
  // Rehearsal/preview acceptance is not production release proof. The legacy
  // production path has no deploymentMode; PR runs need the release receipt.
  const releaseAllowed =
    !run?.deploymentMode ||
    (run.deploymentMode === "pull_request" &&
      /^[a-f0-9]{40}$/.test(run.releaseCommit || "") &&
      (run.releaseEvidence?.trim().length || 0) >= 80);
  const replyContext: ReplyContext = {
    appName: pack.name,
    channel: report.channel,
    case: report,
    issue,
    run: run && {
      ...run,
      deployed: releaseAllowed && run.deployed,
      verified: releaseAllowed && run.verified,
    },
    messages,
    message: latestCustomer?.body || report.body,
  };
  return answerKnowledge(pack.appId, replyContext, { allowDirectFaq: false });
}
