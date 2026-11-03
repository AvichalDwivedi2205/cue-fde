// Trusted operator CLI: npx tsx scripts/release-preview.ts <runId>
// Requires CUE_VERCEL_PROJECT/CUE_VERCEL_SCOPE and authenticated gh/vercel CLIs.
// Creates previews only. Browser acceptance and production release are separate.
import nextEnv from "@next/env";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  assertPreviewPullRequest, createPreviewPlan, previewDeploySelector, previewFingerprint, previewRunIdInput,
  previewSelector, previewSettingsInput, previewStateInput, verifyPreviewDeployment,
  verifyPreviewProject, type PreviewState,
} from "../lib/preview-release";

const root = fileURLToPath(new URL("../", import.meta.url));
nextEnv.loadEnvConfig(root);
const exec = promisify(execFile);
const { api, db, secret } = await import("../lib/server-store");

async function main() {
  if (process.argv.length !== 3) throw new Error("Usage: npx tsx scripts/release-preview.ts <runId>");
  const requestedRunId = previewRunIdInput.parse(process.argv[2]);
  const settings = previewSettingsInput.parse({ project: process.env.CUE_VERCEL_PROJECT, scope: process.env.CUE_VERCEL_SCOPE });
  const store = db(), auth = secret();
  // Supervisor credentials reach only trusted CLIs, never model inputs or flags.
  const cliEnv: NodeJS.ProcessEnv = { ...process.env, CI: "true", NO_COLOR: "1", VERCEL_TELEMETRY_DISABLED: "1" };
  delete cliEnv.VERCEL_PROJECT_ID;
  delete cliEnv.VERCEL_ORG_ID;
  const command = async (program: string, args: string[], cwd = root, timeout = 90_000, env = cliEnv) => {
    try {
      const result = await exec(program, args, { cwd, env, timeout, maxBuffer: 4 * 1024 * 1024 });
      return result.stdout.trim();
    } catch {
      throw new Error(`${program} ${args[0]} failed; inspect the provider privately before retrying`);
    }
  };
  const vercelApi = async (endpoint: string) => JSON.parse(await command("vercel", ["api", endpoint, "--scope", settings.scope]));
  const context = async () => {
    const snapshot = await store.query(api.cue.snapshot, { secret: auth });
    const run = snapshot.runs.find((row) => row._id === requestedRunId);
    if (!run?.targetId) throw new Error("Approved application run not found");
    const issue = snapshot.issues.find((row) => row._id === run.issueId);
    if (!issue) throw new Error("Run issue not found");
    const pack = await store.query(api.appPacks.get, { secret: auth, appId: run.targetId });
    return { run, issue, plan: createPreviewPlan({ run, issue, pack, settings }) };
  };
  const initial = await context(), plan = initial.plan;
  const verifyPr = async () => assertPreviewPullRequest(
    JSON.parse(await command("gh", ["api", `repos/${plan.repository}/pulls/${plan.prNumber}`])), plan,
  );
  await verifyPr();
  const project = verifyPreviewProject(await vercelApi(`/v9/projects/${encodeURIComponent(settings.project)}`), plan);
  const fingerprint = previewFingerprint(plan, project);
  const assertCurrent = async () => {
    const current = await context();
    const currentProject = verifyPreviewProject(await vercelApi(`/v9/projects/${project.projectId}`), current.plan);
    if (previewFingerprint(current.plan, currentProject) !== fingerprint)
      throw new Error("Approved preview inputs changed while preparing deployment");
    await verifyPr();
  };

  const privateDirectory = path.join(root, ".cue", "previews");
  await fs.mkdir(privateDirectory, { recursive: true, mode: 0o700 });
  const receiptPath = path.join(privateDirectory, `${requestedRunId}.json`);
  const lockPath = path.join(privateDirectory, `${requestedRunId}.lock`);
  const lock = await fs.open(lockPath, "wx", 0o600).catch(() => {
    throw new Error("Preview operation locked. Reconcile any prior operation before removing its private lock");
  });
  let temporary: string | undefined;
  try {
    const save = async (state: PreviewState) => {
      const file = `${receiptPath}.${randomUUID()}.tmp`;
      await fs.writeFile(file, JSON.stringify(state, null, 2) + "\n", { mode: 0o600, flag: "wx" });
      await fs.rename(file, receiptPath);
    };
    let saved: PreviewState | null = null;
    try {
      const stat = await fs.lstat(receiptPath);
      if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077)) throw new Error("Preview receipt must be a private regular file");
      saved = previewStateInput.parse(JSON.parse(await fs.readFile(receiptPath, "utf8")));
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    if (saved && (saved.fingerprint !== fingerprint || saved.runId !== requestedRunId || saved.commit !== plan.commit ||
        saved.projectId !== project.projectId || saved.orgId !== project.orgId || saved.scope !== settings.scope || saved.policyDigest !== plan.policyDigest))
      throw new Error("Private preview receipt belongs to different approved inputs; refusing to overwrite it");
    if (saved?.phase === "creating")
      throw new Error("Previous preview submission outcome is unknown. Reconcile it in Vercel before another deployment");

    if (!saved) {
      temporary = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cue-preview-")));
      await fs.chmod(temporary, 0o700);
      const repo = path.join(temporary, "repository");
      await command("gh", ["repo", "clone", plan.repository, repo, "--", "--no-checkout", "--depth", "1", "--branch", plan.baseBranch]);
      await command("git", ["fetch", "--depth", "1", "origin", `refs/pull/${plan.prNumber}/head`], repo);
      await command("git", ["checkout", "--detach", "FETCH_HEAD"], repo);
      if (await command("git", ["rev-parse", "HEAD"], repo) !== plan.commit)
        throw new Error("Checkout does not match the approved PR commit");
      if (await command("git", ["status", "--porcelain", "--untracked-files=all"], repo))
        throw new Error("Preview checkout is not clean");
      const sourceTree = z.string().regex(/^[a-f0-9]{40}$/).parse(await command("git", ["rev-parse", "HEAD^{tree}"], repo));
      const packagePath = await fs.realpath(path.join(repo, project.packageDirectory));
      if (packagePath !== repo && !packagePath.startsWith(repo + path.sep)) throw new Error("Package directory escapes checkout");
      await assertCurrent();
      await command("git", ["diff", "--exit-code", "HEAD"], repo);
      const untracked = await command("git", ["ls-files", "--others", "--exclude-standard"], repo);
      if (untracked.split("\n").some((file) => file && !file.startsWith(".vercel/")))
        throw new Error("Unexpected untracked file in preview upload");
      await assertCurrent();
      const base = {
        version: 1, runId: plan.runId, commit: plan.commit, policyDigest: plan.policyDigest,
        fingerprint, sourceTree, projectId: project.projectId, orgId: project.orgId, scope: settings.scope,
      };
      // Persist intent first. A crash before learning the deployment ID never
      // silently creates another preview on retry.
      await save(previewStateInput.parse({ ...base, phase: "creating" }));
      // Bind only this deployment to the authenticated existing project. `link`
      // refreshes OIDC/env files and mutates .gitignore in the approved checkout.
      const deployEnv: NodeJS.ProcessEnv = {
        ...cliEnv, VERCEL_PROJECT_ID: project.projectId, VERCEL_ORG_ID: project.orgId,
      };
      const output = await command("vercel", [
        "deploy", "--json", "--yes", "--no-wait", "--environment", "preview", "--scope", settings.scope, "--cwd", repo,
        "--meta", `cueRunId=${plan.runId}`, "--meta", `cueApprovedCommit=${plan.commit}`,
        "--meta", `cuePolicyDigest=${plan.policyDigest}`, "--meta", `cueSourceTree=${sourceTree}`,
        "--meta", `githubCommitSha=${plan.commit}`,
      ], root, 180_000, deployEnv);
      // stdout supplies a locator only. The authenticated API verifies provider
      // identity/readiness and round-trips the trusted checkout attestation.
      // gitSource, when supplied by Vercel, separately checks its source SHA.
      const selector = previewDeploySelector(output);
      saved = previewStateInput.parse({ ...base, phase: "submitted", selector });
      await save(saved);
    }

    if (saved.phase === "creating") throw new Error("Preview submission requires reconciliation");
    const selector = saved.phase === "ready" ? saved.deployment.id : saved.selector;
    const deadline = Date.now() + 12 * 60_000;
    let ready: PreviewState | undefined;
    while (Date.now() < deadline) {
      const deployment = verifyPreviewDeployment(
        await vercelApi(`/v13/deployments/${encodeURIComponent(selector)}`), plan, project, saved.sourceTree,
      );
      if (saved.phase === "ready" && (deployment.id !== saved.deployment.id || deployment.url !== saved.deployment.url))
        throw new Error("Saved preview deployment identity changed");
      if (saved.phase === "submitted" && previewSelector(deployment.url) !== saved.selector)
        throw new Error("Deployment API returned another preview URL");
      if (deployment.readyState === "READY") {
        await assertCurrent();
        ready = previewStateInput.parse({
          ...saved, phase: "ready", deployment,
          verifiedAt: saved.phase === "ready" ? saved.verifiedAt : new Date().toISOString(),
        });
        await save(ready);
        break;
      }
      if (!["QUEUED", "INITIALIZING", "BUILDING"].includes(deployment.readyState))
        throw new Error(`Preview deployment is ${deployment.readyState}; no acceptance or resolution recorded`);
      console.log(`Preview ${deployment.id}: ${deployment.readyState}`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    if (!ready || ready.phase !== "ready") throw new Error("Preview readiness timed out; reuse the saved deployment on retry");
    await store.mutation(api.previewAcceptance.registerDeployment, {
      secret: auth, runId: initial.run._id,
      deployment: { id: ready.deployment.id, url: ready.deployment.url, commit: plan.commit, policyDigest: plan.policyDigest },
    });
    const detail = JSON.stringify({
      ...ready, repository: plan.repository, prUrl: plan.prUrl,
      acceptance: "Browser acceptance pending; preview only; customer case remains unresolved",
    });
    const snapshot = await store.query(api.cue.snapshot, { secret: auth });
    if (!snapshot.events.some((event) => event.runId === initial.run._id && event.title === "Preview deployment ready" && event.detail === detail))
      await store.mutation(api.cue.event, {
        secret: auth, runId: initial.run._id, issueId: initial.issue._id,
        title: "Preview deployment ready", detail, kind: "preview",
      });
    console.log(JSON.stringify({ runId: plan.runId, status: "preview_ready", commit: plan.commit, ...ready.deployment, browserAcceptance: "pending", caseResolved: false }, null, 2));
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
    await lock.close();
    await fs.unlink(lockPath);
  }
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Preview preparation failed");
  process.exitCode = 1;
});
