import { afterEach, expect, test, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import {
  dockerCommand,
  localCodingReadiness,
  localContainerArgs,
} from "../lib/local-coding-runtime";

const temporary: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    temporary
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});
async function fakeDocker(available = true) {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "cue-docker-boundary-"),
  );
  temporary.push(directory);
  const log = path.join(directory, "calls.jsonl");
  await fs.writeFile(
    path.join(directory, "docker"),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(args)+'\\n');
if (args.includes('context')) console.log(JSON.stringify('unix:///private/local-docker.sock'));
else if (args.includes('info')) console.log('linux');
else if (args.includes('image')) {
  if (${available}) console.log(JSON.stringify({Id:'sha256:'+'a'.repeat(64),Config:{Volumes:null}}));
  else process.exitCode=1;
} else if(args.includes('environment')) console.log(JSON.stringify({meta:!!process.env.META_API_KEY,github:!!process.env.GH_TOKEN}));
else if(args.includes('overflow')) process.stdout.write('x'.repeat(4096));
else if(args.includes('wait')) setTimeout(()=>{},30000);
`,
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", directory + path.delimiter + process.env.PATH);
  vi.stubEnv("CUE_DOCKER_CONTEXT", "colima-cue-code");
  vi.stubEnv("CUE_CODING_IMAGE", "cue-coding-runtime:node24-bun1.3.2");
  return log;
}
test("readiness inspects explicit local context, daemon and immutable image without creation or pulls", async () => {
  const log = await fakeDocker();
  expect((await localCodingReadiness()).ready).toBe(true);
  const calls: string[][] = (await fs.readFile(log, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(calls).toHaveLength(3);
  for (const args of calls) {
    expect(args.slice(0, 2)).toEqual(["--context", "colima-cue-code"]);
    expect(args).not.toEqual(expect.arrayContaining(["create"]));
    expect(args).not.toEqual(expect.arrayContaining(["pull"]));
  }
});
test("missing local image fails readiness closed", async () => {
  await fakeDocker(false);
  expect((await localCodingReadiness()).ready).toBe(false);
});
test("an unresolved cleanup record survives process exit and blocks readiness and new runs", async () => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "cue-cleanup-ledger-"),
  );
  temporary.push(directory);
  const moduleUrl = pathToFileURL(
    path.resolve("lib/local-coding-runtime.ts"),
  ).href;
  const code = `(async()=>{
    const runtime=await import(${JSON.stringify(moduleUrl)});
    const file=await runtime.recordLocalCleanup({context:'synthetic',containers:['known-container'],images:['known-image:tag'],reason:'synthetic transport ambiguity',daemonOutcomeUnknown:true});
    const readiness=await runtime.localCodingReadiness();
    let runError='';try{await runtime.resolveLocalCodingRuntime();}catch(error){runError=error.message;}
    console.log(JSON.stringify({file,readiness,runError}));
  })().catch(error=>{console.error(error);process.exit(1);});`;
  const output = await promisify(execFile)(
    process.execPath,
    [
      "--import",
      path.resolve("node_modules/tsx/dist/loader.mjs"),
      "--eval",
      code,
    ],
    {
      cwd: directory,
      env: { NODE_ENV: "test", PATH: process.env.PATH, HOME: process.env.HOME },
      timeout: 10_000,
    },
  );
  const receipt = JSON.parse(output.stdout);
  expect(receipt.readiness).toMatchObject({
    ready: false,
    detail: expect.stringContaining("operator reconciliation"),
  });
  expect(receipt.runError).toContain("operator reconciliation");
  expect(JSON.parse(await fs.readFile(receipt.file, "utf8"))).toMatchObject({
    context: "synthetic",
    containers: ["known-container"],
    images: ["known-image:tag"],
    daemonOutcomeUnknown: true,
  });
  expect((await fs.stat(receipt.file)).mode & 0o777).toBe(0o600);
});
test("Docker CLI does not inherit supervisor model or GitHub credentials", async () => {
  await fakeDocker();
  vi.stubEnv("META_API_KEY", "synthetic-meta");
  vi.stubEnv("GH_TOKEN", "synthetic-github");
  const result = await dockerCommand("colima-cue-code", ["environment"]);
  expect(JSON.parse(result.stdout.toString())).toEqual({
    meta: false,
    github: false,
  });
});
test("command output and cancellation remain bounded at the process boundary", async () => {
  await fakeDocker();
  await expect(
    dockerCommand("colima-cue-code", ["overflow"], { maxOutputBytes: 32 }),
  ).rejects.toThrow("output budget");
  const controller = new AbortController();
  const running = dockerCommand("colima-cue-code", ["wait"], {
    signal: controller.signal,
  });
  controller.abort();
  await expect(running).rejects.toThrow("cancelled");
});
test("check containers have no host binds, network or privileges and have finite resources", () => {
  const args = localContainerArgs({
    name: "cue-synthetic",
    imageId: "sha256:" + "a".repeat(64),
    purpose: "verification",
    seconds: 840,
    runId: "synthetic",
    network: false,
  });
  expect(args).toEqual(
    expect.arrayContaining([
      "--network",
      "none",
      "--read-only",
      "--mount",
      "type=volume,target=/workspace",
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges:true",
      "--cpus=2",
      "--memory=4g",
      "--memory-swap=4g",
      "--pids-limit=256",
      "--pull=never",
    ]),
  );
  expect(
    args.filter(
      (arg) =>
        arg.includes("type=bind") ||
        arg.includes("docker.sock") ||
        arg === "--privileged",
    ),
  ).toEqual([]);
  expect(args.at(-1)).toBe("840");
  expect(args.filter((_, n) => args[n - 1] === "--env")).toEqual([
    "CI=true",
    "NODE_ENV=test",
    "HOME=/tmp/cue-home",
  ]);
});
