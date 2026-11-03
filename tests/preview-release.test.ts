import { describe, expect, test } from "vitest";
import {
  assertPreviewPullRequest, createPreviewPlan, previewDeploySelector, previewFingerprint, previewSelector,
  previewStateInput, verifyPreviewDeployment, verifyPreviewProject,
} from "../lib/preview-release";

const commit = "a".repeat(40), tree = "b".repeat(40);
const policy = {
  repository: "owner/private-app", baseBranch: "main", packageDirectory: "creati-frontend", packageManager: "bun",
  allowedPaths: ["creati-frontend/src/components/canvas/Canvas.tsx"],
  testCommands: [{ program: "node", args: ["node_modules/vitest/vitest.mjs", "run"] }],
};
function input() {
  return {
    run: {
      _id: "run_demo123", issueId: "issue1", targetId: "app1", status: "approved", approval: "Engineer",
      kind: "bug", deploymentMode: "pull_request", commit, repository: policy.repository,
      prUrl: "https://github.com/owner/private-app/pull/12", codingPolicy: structuredClone(policy),
    },
    pack: { appId: "app1", status: "active", engineering: structuredClone(policy) },
    issue: { _id: "issue1", appId: "app1", kind: "bug" },
    settings: { project: "latchgrid-preview", scope: "trusted-team" },
  };
}
const projectResponse = { id: "prj_test123", name: "latchgrid-preview", accountId: "team_trusted", rootDirectory: "creati-frontend" };
function prResponse() {
  return {
    number: 12, state: "open", html_url: "https://github.com/owner/private-app/pull/12",
    head: { sha: commit, repo: { full_name: policy.repository, private: true } },
    base: { ref: "main", repo: { full_name: policy.repository, private: true } },
  };
}
function deployment() {
  const plan = createPreviewPlan(input());
  return {
    id: "dpl_demo123", url: "latchgrid-demo123.vercel.app", projectId: projectResponse.id,
    team: { id: projectResponse.accountId }, readyState: "READY", target: null,
    meta: { cueRunId: plan.runId, cueApprovedCommit: commit, cuePolicyDigest: plan.policyDigest, cueSourceTree: tree, githubCommitSha: commit },
  };
}

describe("trusted preview boundary", () => {
  test("requires approved exact run and unchanged frozen policy", () => {
    expect(createPreviewPlan(input()).policy.packageDirectory).toBe("creati-frontend");
    const pending = input(); pending.run.status = "awaiting_approval";
    expect(() => createPreviewPlan(pending)).toThrow();
    const changed = input(); changed.pack.engineering.baseBranch = "other";
    expect(() => createPreviewPlan(changed)).toThrow("policy changed");
    const otherApp = input(); otherApp.issue.appId = "other";
    expect(() => createPreviewPlan(otherApp)).toThrow("application and issue");
  });
  test("requires current Product approval for feature previews", () => {
    const feature = input(); feature.run.kind = "feature"; feature.issue.kind = "feature";
    expect(() => createPreviewPlan(feature)).toThrow("Product approval");
    expect(() => createPreviewPlan({ ...feature, run: { ...feature.run, approvedSpec: "approved" }, issue: { ...feature.issue, spec: "approved", specApprovedAt: 1 } })).not.toThrow();
  });
  test("verifies same private repository, PR head and base", () => {
    const plan = createPreviewPlan(input());
    expect(() => assertPreviewPullRequest(prResponse(), plan)).not.toThrow();
    const moved = prResponse(); moved.head.sha = "c".repeat(40);
    expect(() => assertPreviewPullRequest(moved, plan)).toThrow("head");
    const fork = prResponse(); fork.head.repo.full_name = "attacker/fork";
    expect(() => assertPreviewPullRequest(fork, plan)).toThrow("repository");
    const publicRepo = prResponse(); publicRepo.base.repo.private = false;
    expect(() => assertPreviewPullRequest(publicRepo, plan)).toThrow();
    const otherBase = prResponse(); otherBase.base.ref = "other";
    expect(() => assertPreviewPullRequest(otherBase, plan)).toThrow("base");
  });
  test("requires project root to match nested package directory", () => {
    const plan = createPreviewPlan(input());
    expect(verifyPreviewProject(projectResponse, plan).packageDirectory).toBe("creati-frontend");
    expect(() => verifyPreviewProject({ ...projectResponse, rootDirectory: null }, plan)).toThrow("Root Directory");
    expect(() => verifyPreviewProject({ ...projectResponse, name: "another" }, plan)).toThrow("different project");
  });
  test("binds private reuse fingerprint to approved source, policy, project and scope", () => {
    const plan = createPreviewPlan(input()), project = verifyPreviewProject(projectResponse, plan);
    const fingerprint = previewFingerprint(plan, project);
    expect(previewFingerprint(createPreviewPlan(input()), project)).toBe(fingerprint);
    expect(previewFingerprint({ ...plan, commit: "c".repeat(40) }, project)).not.toBe(fingerprint);
    expect(previewFingerprint({ ...plan, settings: { ...plan.settings, scope: "other" } }, project)).not.toBe(fingerprint);
    expect(previewFingerprint(plan, { ...project, projectId: "prj_other" })).not.toBe(fingerprint);
  });
  test("checks Vercel identity rather than accepting a printed URL", () => {
    const plan = createPreviewPlan(input()), project = verifyPreviewProject(projectResponse, plan);
    expect(verifyPreviewDeployment(deployment(), plan, project, tree)).toMatchObject({ gitSha: commit, target: "preview", readyState: "READY", gitShaSource: "trusted-clean-checkout-metadata" });
    expect(() => verifyPreviewDeployment({ ...deployment(), projectId: "prj_wrong" }, plan, project, tree)).toThrow("project or scope");
    expect(() => verifyPreviewDeployment({ ...deployment(), target: "production" }, plan, project, tree)).toThrow("Only preview");
    expect(() => verifyPreviewDeployment({ ...deployment(), gitSource: { sha: "c".repeat(40) } }, plan, project, tree)).toThrow("metadata");
    const spoofed = deployment(); spoofed.meta.cueRunId = "another_run";
    expect(() => verifyPreviewDeployment(spoofed, plan, project, tree)).toThrow("metadata");
  });
  test("distinguishes provider gitSource identity from local-upload attestation", () => {
    const plan = createPreviewPlan(input()), project = verifyPreviewProject(projectResponse, plan);
    expect(verifyPreviewDeployment({ ...deployment(), gitSource: { sha: commit } }, plan, project, tree).gitShaSource).toBe("gitSource");
  });
  test.each(["https://evil.example", "https://safe.vercel.app/path", "https://safe.vercel.app/?token=secret", "https://safe.vercel.app@evil.example", "http://safe.vercel.app"])("rejects arbitrary deployment locator %s", (url) => {
    expect(() => previewSelector(url)).toThrow();
  });
  test("selects only the canonical deployment URL from supported flat or wrapped CLI JSON", () => {
    const locator = { id: "dpl_demo123", url: "https://safe.vercel.app", readyState: "BUILDING",
      productionUrl: "https://production.vercel.app", inspectorUrl: "https://vercel.com/inspection" };
    expect(previewDeploySelector(JSON.stringify(locator))).toBe("safe.vercel.app");
    expect(previewDeploySelector(JSON.stringify({ status: "ok", deployment: locator,
      next: [{ command: "vercel inspect https://another.vercel.app" }] }))).toBe("safe.vercel.app");
  });
  test.each([
    { status: "error", deployment: { id: "dpl_demo123", url: "https://safe.vercel.app" } },
    { status: "action_required", deployment: { id: "dpl_demo123", url: "https://safe.vercel.app" } },
    { id: "dpl_demo123", url: "https://safe.vercel.app", error: { message: "failed" } },
    { status: "ok", id: "dpl_one", url: "https://one.vercel.app", deployment: { id: "dpl_two", url: "https://two.vercel.app" } },
    [{ id: "dpl_one", url: "https://one.vercel.app" }, { id: "dpl_two", url: "https://two.vercel.app" }],
    { url: "https://safe.vercel.app" },
    { id: "invalid", url: "https://safe.vercel.app" },
    { id: "dpl_demo123", productionUrl: "https://safe.vercel.app" },
    { id: "dpl_demo123", url: "https://safe.vercel.app", readyState: "ERROR" },
    { id: "dpl_demo123", url: "https://evil.example" },
    { id: "dpl_demo123", url: "http://safe.vercel.app" },
    { id: "dpl_demo123", url: "https://safe.vercel.app/?token=secret" },
  ])("rejects CLI output without one unambiguous successful deployment: %j", (output) => {
    expect(() => previewDeploySelector(JSON.stringify(output))).toThrow("one successful Vercel deployment JSON result");
  });
  test("rejects malformed, concatenated and oversized CLI JSON without scanning prose for URLs", () => {
    const locator = { id: "dpl_demo123", url: "https://safe.vercel.app" };
    for (const value of ["https://safe.vercel.app", "Deployment: https://safe.vercel.app", "{", JSON.stringify(locator) + "\n" + JSON.stringify(locator)])
      expect(() => previewDeploySelector(value)).toThrow("one successful Vercel deployment JSON result");
    const oversized = JSON.stringify({ ...locator, message: "é".repeat(33 * 1024) });
    expect(oversized.length).toBeLessThan(64 * 1024);
    expect(() => previewDeploySelector(oversized)).toThrow("exceeds 64 KiB");
  });
  test("receipt preserves preview stage without any resolution field", () => {
    const plan = createPreviewPlan(input()), project = verifyPreviewProject(projectResponse, plan);
    const ready = previewStateInput.parse({
      version: 1, phase: "ready", runId: plan.runId, commit, policyDigest: plan.policyDigest,
      fingerprint: previewFingerprint(plan, project), sourceTree: tree, projectId: project.projectId,
      orgId: project.orgId, scope: plan.settings.scope, verifiedAt: "2026-11-03T00:00:00.000Z",
      deployment: verifyPreviewDeployment(deployment(), plan, project, tree),
    });
    expect(ready.phase).toBe("ready");
    expect(ready).not.toHaveProperty("resolved");
    if (ready.phase !== "ready") throw new Error("Expected READY preview receipt");
    expect(() => previewStateInput.parse({ ...ready, deployment: { ...ready.deployment, readyState: "BUILDING" } })).toThrow();
  });
});
