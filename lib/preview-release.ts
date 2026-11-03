import { createHash } from "node:crypto";
import { z } from "zod";
import { engineeringInput, packageDirectoryInput } from "./app-pack-schema";

const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const deploymentId = z.string().regex(/^dpl_[A-Za-z0-9]+$/);
export const previewRunIdInput = z.string().regex(/^[A-Za-z0-9_]{8,128}$/);
export const previewSettingsInput = z.object({
  project: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
  scope: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
});
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createPreviewPlan(input: { run: unknown; pack: unknown; issue: unknown; settings: unknown }) {
  const run = z.object({
    _id: previewRunIdInput, issueId: z.string(), targetId: z.string(),
    status: z.literal("approved"), approval: z.string().trim().min(1),
    kind: z.enum(["bug", "feature"]), deploymentMode: z.literal("pull_request"),
    commit: sha, repository: z.string(), prUrl: z.string().url(),
    codingPolicy: engineeringInput, approvedSpec: z.string().optional(),
  }).parse(input.run);
  const pack = z.object({ appId: z.string(), status: z.literal("active"), engineering: engineeringInput }).parse(input.pack);
  const issue = z.object({
    _id: z.string(), appId: z.string(), kind: z.enum(["bug", "feature"]),
    spec: z.string().optional(), specApprovedAt: z.number().optional(),
  }).parse(input.issue);
  if (run.targetId !== pack.appId || issue.appId !== pack.appId || issue._id !== run.issueId || issue.kind !== run.kind)
    throw new Error("Preview application and issue must match the approved run");
  if (run.repository !== run.codingPolicy.repository || JSON.stringify(run.codingPolicy) !== JSON.stringify(pack.engineering))
    throw new Error("Repository policy changed after implementation approval");
  if (run.kind === "feature" && (!run.approvedSpec || !issue.specApprovedAt || issue.spec !== run.approvedSpec))
    throw new Error("Product approval changed after implementation review");
  const pr = new URL(run.prUrl);
  const match = /^\/([^/]+)\/([^/]+)\/pull\/([1-9][0-9]{0,8})$/.exec(pr.pathname);
  if (pr.origin !== "https://github.com" || pr.username || pr.password || pr.search || pr.hash || !match ||
      `${match[1]}/${match[2]}`.toLowerCase() !== run.repository.toLowerCase())
    throw new Error("Approved PR URL does not identify the bound GitHub repository");
  return {
    runId: run._id, issueId: run.issueId, appId: pack.appId, commit: run.commit,
    repository: run.repository, baseBranch: run.codingPolicy.baseBranch,
    prUrl: run.prUrl, prNumber: Number(match[3]), policy: run.codingPolicy,
    policyDigest: hash(run.codingPolicy), approvedSpec: run.approvedSpec,
    settings: previewSettingsInput.parse(input.settings),
  };
}
export type PreviewPlan = ReturnType<typeof createPreviewPlan>;

export function assertPreviewPullRequest(raw: unknown, plan: PreviewPlan) {
  const repository = z.object({ full_name: z.string(), private: z.literal(true) });
  const pr = z.object({
    number: z.number().int(), state: z.literal("open"), html_url: z.string(),
    head: z.object({ sha, repo: repository }),
    base: z.object({ ref: z.string(), repo: repository }),
  }).parse(raw);
  if (pr.number !== plan.prNumber || pr.html_url.toLowerCase() !== plan.prUrl.toLowerCase() ||
      pr.head.sha !== plan.commit || pr.base.ref !== plan.baseBranch ||
      pr.head.repo.full_name.toLowerCase() !== plan.repository.toLowerCase() ||
      pr.base.repo.full_name.toLowerCase() !== plan.repository.toLowerCase())
    throw new Error("Private PR head, repository or base changed after approval");
}

export function verifyPreviewProject(raw: unknown, plan: PreviewPlan) {
  const project = z.object({
    id: z.string().regex(/^prj_[A-Za-z0-9]+$/), name: z.string(), accountId: z.string().min(1),
    rootDirectory: z.string().nullable().optional(),
  }).parse(raw);
  if (plan.settings.project !== project.id && plan.settings.project !== project.name)
    throw new Error("Vercel returned a different project");
  const packageDirectory = packageDirectoryInput.parse(plan.policy.packageDirectory ?? ".");
  if ((project.rootDirectory || ".") !== packageDirectory)
    throw new Error("Vercel Root Directory must match the frozen packageDirectory; deploy from repository root");
  return { projectId: project.id, orgId: project.accountId, packageDirectory };
}
export type PreviewProject = ReturnType<typeof verifyPreviewProject>;
export const previewFingerprint = (plan: PreviewPlan, project: PreviewProject) => hash({ plan, project });

export function previewSelector(value: string) {
  const url = new URL(value.startsWith("https://") ? value : `https://${value}`);
  if (url.protocol !== "https:" || !/^[A-Za-z0-9-]+\.vercel\.app$/.test(url.hostname) ||
      url.port || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("Expected a Vercel preview deployment URL");
  return url.hostname;
}

const cliDeploymentLocator = z.object({
  id: deploymentId, url: z.string().url(),
  readyState: z.enum(["QUEUED", "INITIALIZING", "BUILDING", "READY"]).optional(),
  status: z.never().optional(), deployment: z.never().optional(), error: z.never().optional(),
});
const cliDeploymentOutput = z.union([
  cliDeploymentLocator.transform((deployment) => deployment.url),
  z.object({
    status: z.literal("ok"), deployment: cliDeploymentLocator,
    id: z.never().optional(), url: z.never().optional(), error: z.never().optional(),
  }).transform((result) => result.deployment.url),
]);
export function previewDeploySelector(value: string) {
  if (Buffer.byteLength(value, "utf8") > 64 * 1024)
    throw new Error("Vercel deployment JSON exceeds 64 KiB; reconcile the saved creation intent before retrying");
  try {
    return previewSelector(cliDeploymentOutput.parse(JSON.parse(value)));
  } catch {
    throw new Error("Expected one successful Vercel deployment JSON result; reconcile the saved creation intent before retrying");
  }
}

const deploymentInput = z.object({
  id: deploymentId, url: z.string(), readyState: z.string(),
  target: z.string().nullable().optional(), customEnvironment: z.unknown().optional(),
  projectId: z.string().optional(), project: z.object({ id: z.string() }).optional(),
  ownerId: z.string().optional(), teamId: z.string().optional(),
  team: z.object({ id: z.string() }).nullable().optional(), userId: z.string().optional(),
  meta: z.object({
    cueRunId: z.string(), cueApprovedCommit: sha, cuePolicyDigest: digest,
    cueSourceTree: sha, githubCommitSha: sha,
  }),
  gitSource: z.object({ sha: sha.optional() }).nullable().optional(),
});
export const previewDeploymentInput = z.object({
  id: z.string(), url: z.string().url(), projectId: z.string(), orgId: z.string(),
  readyState: z.string(), target: z.literal("preview"), gitSha: sha,
  gitShaSource: z.enum(["gitSource", "trusted-clean-checkout-metadata"]),
});
export function verifyPreviewDeployment(raw: unknown, plan: PreviewPlan, project: PreviewProject, sourceTree: string) {
  const deployment = deploymentInput.parse(raw);
  const projectIds = [deployment.projectId, deployment.project?.id].filter((id) => id !== undefined);
  const owners = [deployment.ownerId, deployment.teamId, deployment.team?.id ?? undefined].filter((id) => id !== undefined);
  if (!owners.length && deployment.userId) owners.push(deployment.userId);
  if (!projectIds.length || projectIds.some((id) => id !== project.projectId) || owners.some((id) => id !== project.orgId))
    throw new Error("Vercel deployment belongs to another project or scope");
  if ((deployment.target ?? "preview") !== "preview" || deployment.customEnvironment)
    throw new Error("Only preview deployments are accepted");
  if (deployment.meta.cueRunId !== plan.runId || deployment.meta.cueApprovedCommit !== plan.commit ||
      deployment.meta.githubCommitSha !== plan.commit || deployment.meta.cuePolicyDigest !== plan.policyDigest ||
      deployment.meta.cueSourceTree !== sourceTree || (deployment.gitSource?.sha && deployment.gitSource.sha !== plan.commit))
    throw new Error("Vercel deployment metadata does not match the approved checkout");
  return previewDeploymentInput.parse({
    id: deployment.id, url: `https://${previewSelector(deployment.url)}`,
    projectId: project.projectId, orgId: project.orgId, readyState: deployment.readyState,
    target: "preview", gitSha: plan.commit,
    gitShaSource: deployment.gitSource?.sha ? "gitSource" : "trusted-clean-checkout-metadata",
  });
}

const stateBase = z.object({
  version: z.literal(1), runId: previewRunIdInput, commit: sha, policyDigest: digest,
  fingerprint: digest, sourceTree: sha, projectId: z.string(), orgId: z.string(), scope: z.string(),
});
export const previewStateInput = z.discriminatedUnion("phase", [
  stateBase.extend({ phase: z.literal("creating") }),
  stateBase.extend({ phase: z.literal("submitted"), selector: z.string() }),
  stateBase.extend({ phase: z.literal("ready"), deployment: previewDeploymentInput.extend({ readyState: z.literal("READY") }), verifiedAt: z.string().datetime() }),
]);
export type PreviewState = z.infer<typeof previewStateInput>;
