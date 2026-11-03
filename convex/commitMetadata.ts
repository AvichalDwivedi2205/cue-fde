import { ConvexError, v, type Infer } from "convex/values";
import { z } from "zod";
import { engineeringInput } from "../lib/app-pack-schema";
import { internalMutation } from "./_generated/server";
import { packByAppId } from "./appPacks";

const gitObjectId = z.string().regex(/^[a-f0-9]{40}$/);
const attestationInput = z.object({
  expectedOldCommit: gitObjectId,
  newCommit: gitObjectId,
  oldTree: gitObjectId,
  newTree: gitObjectId,
  oldParent: gitObjectId,
  newParent: gitObjectId,
  githubLogin: z.string().regex(/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i),
  githubUserId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  authorName: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[^\r\n\u0000]+$/),
  authorEmail: z.string().max(254),
  reason: z.string().trim().min(1).max(1000),
});
const reauthorResult = v.object({
  outcome: v.union(v.literal("updated"), v.literal("already_current")),
  commit: v.string(),
});

// Deploy-owner CLI only. The caller must verify Git objects, author/committer,
// the owned PR branch's exact lease, and its remote head before invoking this.
// Git object claims are trusted attestations, not independently checked here.
export const reauthor = internalMutation({
  args: {
    runId: v.id("runs"),
    expectedOldCommit: v.string(),
    newCommit: v.string(),
    oldTree: v.string(),
    newTree: v.string(),
    oldParent: v.string(),
    newParent: v.string(),
    githubLogin: v.string(),
    githubUserId: v.number(),
    authorName: v.string(),
    authorEmail: v.string(),
    reason: v.string(),
  },
  returns: reauthorResult,
  handler: async (ctx, args): Promise<Infer<typeof reauthorResult>> => {
    const parsed = attestationInput.safeParse(args);
    if (!parsed.success)
      throw new ConvexError("Invalid commit identity attestation");
    const a = parsed.data;
    if (
      a.expectedOldCommit === a.newCommit ||
      a.oldTree !== a.newTree ||
      a.oldParent !== a.newParent
    )
      throw new ConvexError(
        "Re-authoring must preserve the Git tree and parent",
      );
    if (
      a.authorEmail.toLowerCase() !==
      `${a.githubUserId}+${a.githubLogin}@users.noreply.github.com`.toLowerCase()
    )
      throw new ConvexError("GitHub identity must match the no-reply email");

    const run = await ctx.db.get("runs", args.runId);
    if (!run) throw new ConvexError("Run not found");
    // Content-addressed retries never patch anything, including a later fresh
    // approval or release. This does not claim a prior attestation was recorded.
    if (run.commit === a.newCommit)
      return { outcome: "already_current", commit: a.newCommit };
    if (run.commit !== a.expectedOldCommit)
      throw new ConvexError(
        "Run commit changed; re-authoring compare-and-set failed",
      );
    if (
      run.status !== "approved" ||
      run.phase !== "approved" ||
      !run.approval?.trim() ||
      run.deploymentMode !== "pull_request" ||
      (run.kind !== "bug" && run.kind !== "feature")
    )
      throw new ConvexError(
        "Re-authoring requires an approved pull-request run",
      );
    if (
      run.deployed ||
      run.verified ||
      run.releaseCommit !== undefined ||
      run.releaseEvidence !== undefined
    )
      throw new ConvexError("Deployed or released runs cannot be re-authored");
    if (run.baseCommit !== a.oldParent)
      throw new ConvexError(
        "Git parent must match the run's original base commit",
      );

    const issue = await ctx.db.get("issues", run.issueId);
    if (
      !issue ||
      issue.kind !== run.kind ||
      (issue.appId || "bloom") !== run.targetId ||
      issue.status === "resolved"
    )
      throw new ConvexError(
        "Run must retain its original unresolved application issue",
      );
    const pack = run.targetId ? await packByAppId(ctx, run.targetId) : null;
    if (
      !pack ||
      pack.status !== "active" ||
      !pack.engineering ||
      !run.codingPolicy ||
      run.repository !== run.codingPolicy.repository ||
      JSON.stringify(engineeringInput.parse(pack.engineering)) !==
        JSON.stringify(engineeringInput.parse(run.codingPolicy))
    )
      throw new ConvexError(
        "Repository policy changed after implementation started",
      );
    if (
      run.kind === "feature" &&
      (!issue.specApprovedAt ||
        !run.approvedSpec ||
        issue.spec !== run.approvedSpec)
    )
      throw new ConvexError("Product must approve the current specification");

    const now = Date.now();
    await ctx.db.patch("runs", run._id, {
      commit: a.newCommit,
      status: "awaiting_approval",
      phase: "awaiting_approval",
      approval: undefined,
      updatedAt: now,
    });
    await ctx.db.patch("issues", issue._id, { status: "awaiting_approval" });
    await ctx.db.insert("events", {
      runId: run._id,
      issueId: issue._id,
      title: "Commit identity corrected; approval required",
      detail: [
        a.reason,
        `Requested GitHub identity: ${a.githubLogin} (${a.githubUserId}), ${a.authorName} <${a.authorEmail}>. Author and committer attested by the trusted Git verifier.`,
        `Commit: ${a.expectedOldCommit} -> ${a.newCommit}. Trees: ${a.oldTree} = ${a.newTree}. Parent: ${a.oldParent}.`,
        `Previous approval by ${run.approval} applies only to ${a.expectedOldCommit}; the replacement requires a new exact-commit approval.`,
        `Existing verification and model history is unchanged. Baseline provenance remains ${run.baseCommit}; patched-tree verification remains attributed to ${a.expectedOldCommit}. This is a same-tree attestation, not a rerun: no checks or model calls were rerun for ${a.newCommit}.`,
      ].join("\n"),
      kind: "step",
      createdAt: now,
    });
    return { outcome: "updated", commit: a.newCommit };
  },
});
