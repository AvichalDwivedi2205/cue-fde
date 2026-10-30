import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { Codex } from "@openai/codex-sdk";
import { api, db, secret } from "./server-store";
import {
  bugPrompt,
  featurePrompt,
  permittedChange,
  protectedSource,
} from "./coding-policy";
import { requireActivePack, asCodingConfig } from "./app-pack";
import type { CodingConfig } from "./integration-config";
import { sendSlackRunUpdate } from "./delivery";
import type { Id } from "../convex/_generated/dataModel";
import { observed, recordWorkflowFailure } from "./observability";
import { runCodexSession } from "./codex-session";
const exec = promisify(execFile);

type PullRequestFlavor = {
  kind: "feature" | "bug";
  promptFor: (policy: CodingConfig) => string;
  prTitle: string;
  commitMessage: string;
  prBody: (parts: {
    issue: { title: string; description: string; spec?: string };
    summary: string;
    before: string;
    after: string;
    commit: string;
    reproductionStatus?: "reproduced" | "not_reproduced";
  }) => string;
  // feature: baseline checks must pass before Codex starts. bug: the baseline
  // is recorded as-is — a failing baseline is the honest reproduction signal,
  // a passing one is reported as not_reproduced.
  baseline: "must_pass" | "record_only";
  rootCause: string;
};

async function runPullRequestPipeline(
  runId: Id<"runs">,
  flavor: PullRequestFlavor,
  signal: AbortSignal,
) {
  const store = db(),
    auth = secret(),
    repo = path.join(process.cwd(), ".cue", "runs", runId);
  let issueId: Id<"issues"> | undefined;
  const log = async (title: string, detail: string, kind = "agent") => {
    await store.mutation(api.cue.event, {
      secret: auth,
      runId,
      ...(issueId ? { issueId } : {}),
      title,
      detail: detail.slice(-12000),
      kind,
    });
  };
  const update = async (
    fields: Parameters<
      typeof store.mutation<typeof api.cue.updateRun>
    >[1]["fields"],
  ) => {
    await store.mutation(api.cue.updateRun, { secret: auth, runId, fields });
  };
  const testEnv: Record<string, string> & NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    CI: "true",
  };
  for (const key of ["HOME", "PATH", "TMPDIR", "LANG", "CODEX_HOME"])
    if (process.env[key]) testEnv[key] = process.env[key]!;
  const command = async (
    file: string,
    args: string[],
    timeout = 60_000,
    isolated = false,
  ) => {
    const r = await exec(file, args, {
      cwd: repo,
      timeout,
      signal,
      maxBuffer: 2 * 1024 * 1024,
      ...(isolated ? { env: testEnv } : {}),
    });
    return (r.stdout + r.stderr).trim();
  };
  const hash = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  try {
    const state = await store.query(api.cue.snapshot, { secret: auth }),
      run = state.runs.find((r) => r._id === runId),
      issue = state.issues.find((i) => i._id === run?.issueId);
    if (!run || !issue) throw new Error("Run not found");
    if (flavor.kind === "feature") {
      if (
        run.kind !== "feature" ||
        !run.approvedSpec ||
        issue.spec !== run.approvedSpec
      )
        throw new Error("Approved feature specification changed");
    } else {
      if (run.kind !== "bug" || run.deploymentMode !== "pull_request")
        throw new Error("Run is not a pull-request bug fix");
      if (!run.reproduction)
        throw new Error("Reproduction context missing for bug fix run");
    }
    issueId = issue._id;
    // The pack is the single policy source; the run must reference exactly
    // the binding it was created with.
    const pack = await requireActivePack(run.targetId ?? "bloom");
    const policy = asCodingConfig(pack);
    if (policy.repository !== run.repository)
      throw new Error("Connected repository policy does not match the run");
    await fs.mkdir(path.dirname(repo), { recursive: true });
    // The supervisor clones before Codex starts; the coding agent has no network access.
    await exec(
      "gh",
      [
        "repo",
        "clone",
        policy.repository,
        repo,
        "--",
        "--branch",
        policy.baseBranch,
        "--single-branch",
      ],
      { timeout: 60_000, signal, maxBuffer: 2 * 1024 * 1024 },
    );
    const base = await command("git", ["rev-parse", "HEAD"]);
    const branch = `cue/${flavor.kind}-${runId}`;
    await command("git", ["checkout", "-b", branch]);
    await command("git", ["config", "user.name", "Cue"]);
    await command("git", ["config", "user.email", "cue@localhost"]);
    await update({
      repoPath: repo,
      baseCommit: base,
      phase: "validating_baseline",
    });
    if (
      await fs.access(path.join(repo, "package-lock.json")).then(
        () => true,
        () => false,
      )
    )
      await command(
        "npm",
        ["ci", "--ignore-scripts", "--no-audit", "--no-fund"],
        120_000,
        true,
      );
    const tracked = (await command("git", ["ls-files"])).split("\n");
    const protectedHashes = new Map<string, string>();
    for (const file of tracked)
      if (!permittedChange(file, policy) || protectedSource(file))
        protectedHashes.set(
          file,
          hash(await fs.readFile(path.join(repo, file))),
        );
    const checks = async () => {
      const output: string[] = [];
      for (const check of policy.testCommands)
        output.push(
          `${check.program} ${check.args.join(" ")}\n${await command(check.program, check.args, 120_000, true)}`,
        );
      return output.join("\n\n").slice(-20000);
    };
    let before = "";
    let baselineFailed = false;
    if (flavor.baseline === "must_pass") {
      before = await checks();
      await log("Repository baseline passed", before, "success");
    } else {
      try {
        before = await checks();
        await log(
          "Repository baseline passed",
          "The repository's own checks pass at the base commit; they do not reproduce the reported failure. The PR body will say so.",
          "success",
        );
      } catch (e) {
        baselineFailed = true;
        const err = e as { stdout?: string; stderr?: string; message?: string };
        before = `${err.stdout || ""}${err.stderr || ""}\n${err.message || ""}`
          .trim()
          .slice(-20000);
        await log(
          "Repository baseline check failed",
          "The repository's own checks fail at the base commit — this is the reproduction signal for the reported bug.",
          "success",
        );
      }
    }
    await update({
      before,
      phase: "implementing",
      rootCause: flavor.rootCause,
    });
    const agent = new Codex({
      env: testEnv,
      ...(process.env.CUE_CODEX_PATH
        ? { codexPathOverride: process.env.CUE_CODEX_PATH }
        : {}),
    });
    const thread = agent.startThread({
      workingDirectory: repo,
      sandboxMode: "workspace-write",
      approvalPolicy: "never",
      networkAccessEnabled: false,
      webSearchMode: "disabled",
    });
    await log(
      "Codex implementing change",
      `Repository ${policy.repository}; base ${base}. Allowed paths: ${policy.allowedPaths.join(", ")}.`,
    );
    let summary = "";
    await runCodexSession(
      thread,
      flavor.promptFor(policy),
      signal,
      async (e) => {
        if (e.type === "item.completed" && e.item.type === "command_execution")
          await log(
            "Codex repository check",
            e.item.command + "\n" + e.item.aggregated_output.slice(-4500),
          );
        if (e.type === "item.completed" && e.item.type === "file_change")
          await log(
            "Codex proposed patch",
            e.item.changes
              .map((c) => `${c.kind}: ${path.basename(c.path)}`)
              .join("\n"),
          );
        if (e.type === "item.completed" && e.item.type === "agent_message")
          summary = e.item.text;
        if (e.type === "turn.failed") throw new Error(e.error.message);
        if (e.type === "error") throw new Error(e.message);
      },
    );
    if (signal.aborted) throw new Error("Run canceled");
    if ((await command("git", ["rev-parse", "HEAD"])) !== base)
      throw new Error("Agent changed Git history");
    const changed = (await command("git", ["diff", "HEAD", "--name-only"]))
      .split("\n")
      .filter(Boolean);
    const added = (
      await command("git", ["ls-files", "--others", "--exclude-standard"])
    )
      .split("\n")
      .filter(Boolean);
    if (!changed.length && !added.length)
      throw new Error("Agent produced no implementation");
    for (const file of [...changed, ...added]) {
      if (
        !permittedChange(file, policy) ||
        (tracked.includes(file) && protectedSource(file))
      )
        throw new Error(`Patch violates repository policy: ${file}`);
      if (!(await fs.lstat(path.join(repo, file))).isFile())
        throw new Error(`Patch contains a non-file: ${file}`);
    }
    for (const [file, expected] of protectedHashes)
      if (hash(await fs.readFile(path.join(repo, file))) !== expected)
        throw new Error(`Protected source changed: ${file}`);
    if (flavor.kind === "feature") {
      const fresh = await store.query(api.cue.snapshot, { secret: auth });
      if (
        fresh.issues.find((i) => i._id === issue._id)?.spec !== run.approvedSpec
      )
        throw new Error("Feature specification changed during implementation");
    }
    const after = await checks();
    await log("Independent checks passed", after, "success");
    await command("git", ["add", "--", ...changed, ...added]);
    const diff = await command("git", ["diff", "--cached"]);
    if (diff.length > 200000)
      throw new Error("Patch exceeds review size limit");
    await command("git", ["commit", "-m", flavor.commitMessage]);
    const commit = await command("git", ["rev-parse", "HEAD"]);
    await command("git", ["push", "origin", branch]);
    const reproductionStatus: "reproduced" | "not_reproduced" | undefined =
      flavor.kind === "bug"
        ? baselineFailed
          ? "reproduced"
          : "not_reproduced"
        : undefined;
    const bodyFile = path.join(process.cwd(), ".cue", `pr-${runId}.txt`);
    await fs.writeFile(
      bodyFile,
      flavor.prBody({
        issue,
        summary,
        before,
        after,
        commit,
        reproductionStatus,
      }),
      { mode: 0o600 },
    );
    const pr = await command("gh", [
      "pr",
      "create",
      "--repo",
      policy.repository,
      "--base",
      policy.baseBranch,
      "--head",
      branch,
      "--draft",
      "--title",
      flavor.prTitle,
      "--body-file",
      bodyFile,
    ]);
    await update({
      status: "awaiting_approval",
      phase: "awaiting_approval",
      commit,
      diff,
      after,
      summary,
      prUrl: pr,
      ...(reproductionStatus ? { reproductionStatus } : {}),
    });
    await log(
      "PR ready for Engineering review",
      `${pr}\nExact commit ${commit}. Deployment remains subject to the connected repository's release process.`,
      "approval",
    );
    await sendSlackRunUpdate(runId);
  } catch (e) {
    recordWorkflowFailure(e);
    const error = e instanceof Error ? e.message : String(e);
    await update({
      status: signal.aborted ? "canceled" : "failed",
      phase: signal.aborted ? "canceled" : "failed",
      error,
    }).catch(() => {});
    await log("Implementation needs attention", error, "failure");
  }
}

async function implementFeatureImpl(runId: Id<"runs">, signal: AbortSignal) {
  const store = db(),
    auth = secret();
  const state = await store.query(api.cue.snapshot, { secret: auth }),
    run = state.runs.find((r) => r._id === runId),
    issue = state.issues.find((i) => i._id === run?.issueId);
  if (!run?.approvedSpec || !issue?.spec)
    throw new Error("Approved feature specification changed");
  const spec = JSON.parse(run.approvedSpec);
  return await runPullRequestPipeline(
    runId,
    {
      kind: "feature",
      promptFor: (policy) =>
        featurePrompt(issue.title, run.approvedSpec!, policy),
      prTitle: `Implement ${issue.title.slice(0, 100)}`,
      commitMessage: `Implement ${issue.title.slice(0, 100)}`,
      prBody: ({ summary, after, commit }) =>
        `${issue.title}\n\n${spec.specification}\n\nApproved acceptance criteria:\n${spec.acceptanceCriteria
          .map((c: string) => `- ${c}`)
          .join(
            "\n",
          )}\n\nImplementation:\n${summary}\n\nValidation:\n${after}\n\nEngineering review must approve exact commit ${commit}. This draft PR has not been merged or deployed.`,
      baseline: "must_pass",
      rootCause: `Implement the approved specification: ${issue.title}`,
    },
    signal,
  );
}

export const implementFeature = observed(
  "Cue feature implementation",
  implementFeatureImpl,
  {
    input: (runId) => ({ runId }),
  },
);

async function implementFixImpl(runId: Id<"runs">, signal: AbortSignal) {
  const store = db(),
    auth = secret();
  const state = await store.query(api.cue.snapshot, { secret: auth }),
    run = state.runs.find((r) => r._id === runId),
    issue = state.issues.find((i) => i._id === run?.issueId);
  if (!issue || !run?.reproduction)
    throw new Error("Reproduction context missing for bug fix run");
  return await runPullRequestPipeline(
    runId,
    {
      kind: "bug",
      promptFor: (policy) =>
        bugPrompt(issue.title, issue.description, run.reproduction!, policy),
      prTitle: `Fix ${issue.title.slice(0, 100)}`,
      commitMessage: `Fix ${issue.title.slice(0, 100)}`,
      prBody: ({
        summary,
        before,
        after,
        commit,
        reproductionStatus,
      }) =>
        `${issue.title}\n\nReported reproduction:\n${run.reproduction}\n\nRepository check at base commit: ${
          reproductionStatus === "reproduced"
            ? "FAILED (matches the reported failure)"
            : "PASSED (the repository's checks did not reproduce the reported failure)"
        }\n\nInvestigation summary:\n${summary}\n\nBaseline output:\n${before}\n\nChecks after the change:\n${after}\n\nEngineering review must approve exact commit ${commit}. This draft PR has not been merged or deployed, and nothing here claims the fix is verified for customers.`,
      baseline: "record_only",
      rootCause: `Investigate and fix the reported bug: ${issue.title}`,
    },
    signal,
  );
}

export const implementFix = observed("Cue bug fix implementation", implementFixImpl, {
  input: (runId) => ({ runId }),
});
