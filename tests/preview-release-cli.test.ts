import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { z } from "zod";

const exec = promisify(execFile);
const root = fileURLToPath(new URL("../", import.meta.url));
const runId = "run_preview123";
const callInput = z.object({
  program: z.enum(["gh", "vercel"]), args: z.array(z.string()),
  projectId: z.string().nullable(), orgId: z.string().nullable(),
});
const uploadInput = z.object({
  head: z.string(), tree: z.string(), status: z.string(),
  gitignore: z.string(), envFile: z.boolean(), linkFile: z.boolean(),
});

async function fixture({ change = "none", output = "flat" }: {
  change?: "none" | "approval" | "project" | "source";
  output?: "flat" | "wrapped" | "malformed";
} = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cue-preview-cli-"));
  const repository = path.join(directory, "origin"), gateway = path.join(directory, "gateway");
  const bin = path.join(directory, "bin"), callsPath = path.join(directory, "calls.jsonl");
  const fixturePath = path.join(directory, "fixture.json");
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test", HOME: directory, PATH: `${bin}:/usr/bin:/bin`,
    GIT_CONFIG_NOSYSTEM: "1", CI: "true", NO_COLOR: "1",
    CUE_PREVIEW_FIXTURE: fixturePath,
    CUE_VERCEL_PROJECT: "preview-fixture", CUE_VERCEL_SCOPE: "trusted-fixture",
    VERCEL_PROJECT_ID: "prj_hostile", VERCEL_ORG_ID: "team_hostile",
  };
  const git = async (args: string[]) => (await exec("git", args, { cwd: repository, env })).stdout.trim();
  try {
    await fs.mkdir(path.join(repository, "frontend"), { recursive: true });
    await fs.mkdir(path.join(gateway, "scripts"), { recursive: true });
    await fs.mkdir(path.join(gateway, "lib"));
    await fs.mkdir(bin);
    await fs.writeFile(path.join(repository, ".gitignore"), ".vercel/\n.env.local\n");
    await fs.writeFile(path.join(repository, "frontend", "package.json"), '{"name":"preview-fixture","private":true}\n');
    await git(["init", "--initial-branch=main"]);
    await git(["add", "."]);
    await git(["-c", "user.name=Preview fixture", "-c", "user.email=preview@example.invalid", "commit", "-m", "Fixture source"]);
    const commit = await git(["rev-parse", "HEAD"]), tree = await git(["rev-parse", "HEAD^{tree}"]);
    await git(["update-ref", "refs/pull/12/head", commit]);
    const policy = {
      repository: "fixture/private-app", baseBranch: "main", packageDirectory: "frontend", packageManager: "none",
      allowedPaths: ["frontend/package.json"], testCommands: [{ program: "node", args: ["--version"] }],
    };
    const project = { id: "prj_verified", name: "preview-fixture", accountId: "team_verified", rootDirectory: "frontend" };
    await fs.writeFile(fixturePath, JSON.stringify({
      change, output, directory, repository, callsPath, project,
      snapshot: {
        runs: [{ _id: runId, issueId: "issue1", targetId: "app1", status: "approved", approval: "Engineer", kind: "bug",
          deploymentMode: "pull_request", commit, repository: policy.repository,
          prUrl: "https://github.com/fixture/private-app/pull/12", codingPolicy: policy }],
        issues: [{ _id: "issue1", appId: "app1", kind: "bug" }], events: [],
      },
      pack: { appId: "app1", status: "active", engineering: policy },
      pr: { number: 12, state: "open", html_url: "https://github.com/fixture/private-app/pull/12",
        head: { sha: commit, repo: { full_name: policy.repository, private: true } },
        base: { ref: "main", repo: { full_name: policy.repository, private: true } } },
    }));
    // Execute the saved production script verbatim in a separate project root.
    // Its real Next env loader can only search this credential-free fixture.
    await fs.copyFile(path.join(root, "scripts", "release-preview.ts"), path.join(gateway, "scripts", "release-preview.ts"));
    await fs.writeFile(path.join(gateway, "package.json"), '{"type":"module"}');
    await fs.writeFile(path.join(gateway, ".env.local"), "CUE_FORBIDDEN_ENV_LOAD=must-not-load\n");
    await fs.symlink(path.join(root, "node_modules"), path.join(gateway, "node_modules"), "dir");
    await fs.symlink(path.join(root, "lib", "preview-release.ts"), path.join(gateway, "lib", "preview-release.ts"));
    await fs.writeFile(path.join(gateway, "lib", "server-store.ts"), `
import fs from 'node:fs';
if (process.env.CUE_FORBIDDEN_ENV_LOAD) throw new Error('Fixture loaded an environment file');
const fixture = JSON.parse(fs.readFileSync(process.env.CUE_PREVIEW_FIXTURE, 'utf8'));
let snapshots = 0;
export const api = { cue: { snapshot: 'snapshot', event: 'event' }, appPacks: { get: 'pack' }, previewAcceptance: { registerDeployment: 'registerPreview' } };
export const secret = () => 'fixture-only';
export const db = () => ({
  query: async (name) => {
    if (name === 'pack') return fixture.pack;
    if (name !== 'snapshot') throw new Error('Unexpected fixture query');
    const snapshot = structuredClone(fixture.snapshot);
    if (++snapshots >= 3 && fixture.change === 'approval') snapshot.runs[0].status = 'awaiting_approval';
    return snapshot;
  },
  mutation: async (name, args) => {
    if (name === 'registerPreview') {
      if (args.runId !== fixture.snapshot.runs[0]._id || args.deployment.commit !== fixture.snapshot.runs[0].commit || args.deployment.id !== 'dpl_fixture') throw new Error('Incorrect registered preview identity');
      fs.appendFileSync(fixture.directory + '/registered-preview.jsonl', JSON.stringify(args) + '\\n');
      return null;
    }
    if (name !== 'event' || args.title !== 'Preview deployment ready') throw new Error('Unexpected fixture mutation');
    fs.appendFileSync(fixture.directory + '/events.jsonl', JSON.stringify(args) + '\\n');
  },
});
`);
    const fakeCli = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const fixture = JSON.parse(fs.readFileSync(process.env.CUE_PREVIEW_FIXTURE, 'utf8'));
const args = process.argv.slice(2), program = path.basename(process.argv[1]);
fs.appendFileSync(fixture.callsPath, JSON.stringify({program, args, projectId: process.env.VERCEL_PROJECT_ID ?? null, orgId: process.env.VERCEL_ORG_ID ?? null}) + '\\n');
const git = (repo, args) => cp.execFileSync('git', args, {cwd:repo, encoding:'utf8'}).trim();
const option = (name) => args[args.indexOf(name) + 1];
if (program === 'gh' && args[0] === 'api') process.stdout.write(JSON.stringify(fixture.pr));
else if (program === 'gh' && args[0] === 'repo' && args[1] === 'clone') {
  cp.execFileSync('git', ['clone', '--no-checkout', '--branch', 'main', fixture.repository, args[3]], {stdio:'pipe'});
  fs.writeFileSync(fixture.directory + '/clone-path', args[3]);
} else if (program === 'vercel' && args[0] === 'link') {
  // CLI65.1.0 repro: OIDC refresh appends .env*, changing approved source.
  const repo = option('--cwd');
  fs.mkdirSync(repo + '/.vercel');
  fs.writeFileSync(repo + '/.vercel/project.json', JSON.stringify({projectId:fixture.project.id, orgId:fixture.project.accountId}));
  fs.writeFileSync(repo + '/frontend/.env.local', 'FIXTURE_OIDC=fake-not-a-credential\\n');
  fs.appendFileSync(repo + '/.gitignore', '.env*\\n');
} else if (program === 'vercel' && args[0] === 'api' && args[1].startsWith('/v9/projects/')) {
  const countPath = fixture.directory + '/project-count';
  const count = (fs.existsSync(countPath) ? Number(fs.readFileSync(countPath, 'utf8')) : 0) + 1;
  fs.writeFileSync(countPath, String(count));
  if (count === 2 && fixture.change === 'source') fs.appendFileSync(fs.readFileSync(fixture.directory + '/clone-path', 'utf8') + '/.gitignore', '.env*\\n');
  process.stdout.write(JSON.stringify({...fixture.project, ...(count >= 3 && fixture.change === 'project' ? {id:'prj_changed'} : {})}));
} else if (program === 'vercel' && args[0] === 'deploy') {
  const repo = option('--cwd');
  fs.writeFileSync(fixture.directory + '/upload.json', JSON.stringify({head:git(repo,['rev-parse','HEAD']), tree:git(repo,['rev-parse','HEAD^{tree}']), status:git(repo,['status','--porcelain','--untracked-files=all']), gitignore:fs.readFileSync(repo+'/.gitignore','utf8'), envFile:fs.existsSync(repo+'/frontend/.env.local'), linkFile:fs.existsSync(repo+'/.vercel/project.json')}));
  const meta = {};
  args.forEach((arg, i) => {if(arg === '--meta') {const [key,value] = args[i+1].split('='); meta[key] = value;}});
  fs.writeFileSync(fixture.directory + '/deployment.json', JSON.stringify({id:'dpl_fixture',url:'fixture-preview.vercel.app',readyState:'READY',target:null,projectId:fixture.project.id,team:{id:fixture.project.accountId},meta}));
  const locator = {id:'dpl_fixture',url:'https://fixture-preview.vercel.app',productionUrl:'https://another-url.vercel.app',inspectorUrl:'https://vercel.com/fixture/deployment'};
  process.stdout.write(fixture.output === 'malformed' ? 'unparseable fixture output' : JSON.stringify(fixture.output === 'wrapped' ? {status:'ok',deployment:locator,next:[{command:'vercel inspect fixture-preview.vercel.app'}]} : locator));
} else if (program === 'vercel' && args[0] === 'api' && args[1].startsWith('/v13/deployments/')) process.stdout.write(fs.readFileSync(fixture.directory + '/deployment.json'));
else throw new Error('Unexpected fixture CLI invocation');
`;
    for (const name of ["gh", "vercel"]) await fs.writeFile(path.join(bin, name), fakeCli, { mode: 0o700 });
    return {
      directory, gateway, commit, tree, git,
      run: async () => {
        try {
          const result = await exec(process.execPath, ["--import", path.join(root, "node_modules", "tsx", "dist", "loader.mjs"), "scripts/release-preview.ts", runId], { cwd: gateway, env, timeout: 20_000, maxBuffer: 1024 * 1024 });
          return { code: 0, stdout: result.stdout, stderr: result.stderr };
        } catch (error) {
          if (!(error instanceof Error) || !("code" in error) || !("stderr" in error)) throw error;
          return { code: error.code, stdout: "", stderr: String(error.stderr) };
        }
      },
      calls: async () => (await fs.readFile(callsPath, "utf8")).trim().split("\n").map((line) => callInput.parse(JSON.parse(line))),
      cleanup: () => fs.rm(directory, { recursive: true, force: true }),
    };
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true });
    throw error;
  }
}

test.each(["flat", "wrapped"] as const)("preview CLI deploys unchanged approved source using authenticated IDs and %s JSON", async (output) => {
  const f = await fixture({ output });
  try {
    const result = await f.run();
    expect(result, result.stderr).toMatchObject({ code: 0 });
    const calls = await f.calls(), deploy = calls.find((call) => call.program === "vercel" && call.args[0] === "deploy");
    expect(calls.some((call) => ["link", "pull", "env"].includes(call.args[0]))).toBe(false);
    expect(deploy).toMatchObject({ projectId: "prj_verified", orgId: "team_verified" });
    expect(deploy?.args).toEqual(expect.arrayContaining(["--json", "--scope", "trusted-fixture", "--environment", "preview", `cueSourceTree=${f.tree}`, `cueApprovedCommit=${f.commit}`]));
    expect(calls.filter((call) => call !== deploy).every((call) => call.projectId === null && call.orgId === null)).toBe(true);
    expect(uploadInput.parse(JSON.parse(await fs.readFile(path.join(f.directory, "upload.json"), "utf8")))).toEqual({
      head: f.commit, tree: f.tree, status: "", gitignore: ".vercel/\n.env.local\n", envFile: false, linkFile: false,
    });
    expect(await f.git(["status", "--porcelain", "--untracked-files=all"])).toBe("");
    expect(JSON.parse(await fs.readFile(path.join(f.gateway, ".cue", "previews", `${runId}.json`), "utf8"))).toMatchObject({
      phase: "ready", sourceTree: f.tree, commit: f.commit, projectId: "prj_verified", orgId: "team_verified",
    });
    expect(await fs.readFile(path.join(f.directory, "events.jsonl"), "utf8")).toContain("Browser acceptance pending");
    expect(JSON.parse((await fs.readFile(path.join(f.directory, "registered-preview.jsonl"), "utf8")).trim())).toMatchObject({ runId, deployment: { id: "dpl_fixture", commit: f.commit, url: "https://fixture-preview.vercel.app" } });
  } finally { await f.cleanup(); }
}, 30_000);

test.each(["approval", "project", "source"] as const)("preview CLI refuses changed %s before deployment intent", async (change) => {
  const f = await fixture({ change });
  try {
    const result = await f.run();
    expect(result.code).not.toBe(0);
    if (change === "approval")
      expect(JSON.parse(result.stderr)).toEqual(expect.arrayContaining([
        expect.objectContaining({ code: "invalid_value", path: ["status"], values: ["approved"] }),
      ]));
    else expect(result.stderr).toContain(change === "project" ? "Approved preview inputs changed" : "git diff failed");
    expect((await f.calls()).some((call) => call.args[0] === "deploy")).toBe(false);
    await expect(fs.stat(path.join(f.gateway, ".cue", "previews", `${runId}.json`))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.stat(path.join(f.directory, "events.jsonl"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await f.cleanup(); }
}, 30_000);

test("unparseable deployment stdout preserves creation intent and refuses a second submission", async () => {
  const f = await fixture({ output: "malformed" });
  try {
    const first = await f.run();
    expect(first.code).not.toBe(0);
    expect(first.stderr).toContain("one successful Vercel deployment JSON result");
    const receiptPath = path.join(f.gateway, ".cue", "previews", `${runId}.json`);
    const receipt = await fs.readFile(receiptPath, "utf8");
    expect(JSON.parse(receipt)).toMatchObject({ phase: "creating", commit: f.commit, sourceTree: f.tree });
    const retry = await f.run();
    expect(retry.code).not.toBe(0);
    expect(retry.stderr).toContain("Previous preview submission outcome is unknown");
    expect((await f.calls()).filter((call) => call.program === "vercel" && call.args[0] === "deploy")).toHaveLength(1);
    expect(await fs.readFile(receiptPath, "utf8")).toBe(receipt);
    await expect(fs.stat(path.join(f.directory, "events.jsonl"))).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await f.cleanup(); }
}, 30_000);
