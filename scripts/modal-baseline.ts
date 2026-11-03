import nextEnv from "@next/env";
import { parseArgs } from "node:util";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { codingInput } from "../lib/app-pack-schema";
import { readSourceSnapshot, withModalCoding } from "../lib/coding-workspace";
nextEnv.loadEnvConfig(process.cwd());

// Operator-supplied policy stays outside public source. This performs no model
// calls, Git changes, PR creation, deployment or product-state writes.
const { values } = parseArgs({
  options: { repo: { type: "string" }, policy: { type: "string" } },
});
if (!values.repo || !values.policy)
  throw new Error(
    "Usage: modal-baseline --repo /checkout --policy /private/policy.json",
  );
const repo = await fs.realpath(path.resolve(values.repo));
const policy = codingInput.parse(
  JSON.parse(await fs.readFile(values.policy, "utf8")),
);
const exec = promisify(execFile);
const revision = await exec("git", ["rev-parse", "HEAD"], { cwd: repo });
const changed = await exec("git", ["diff", "HEAD", "--name-only", "-z"], {
  cwd: repo,
});
if (changed.stdout)
  throw new Error("Baseline source must match its recorded commit");
const signal = AbortSignal.timeout(14 * 60_000);
const source = await readSourceSnapshot(repo, signal);
await withModalCoding(
  {
    repo,
    source,
    policy,
    runId: "baseline-" + revision.stdout.trim().slice(0, 12),
    signal,
    event: async (title, detail, kind) => {
      console.log(JSON.stringify({ title, detail, kind }));
    },
  },
  async (execution) => {
    const baseline = await execution.open("baseline");
    const results = [];
    for (let index = 0; index < policy.testCommands.length; index++) {
      const result = await baseline.check(index);
      results.push({ index, ...result });
      console.log(
        JSON.stringify({ commit: revision.stdout.trim(), index, ...result }),
      );
    }
    await execution.close(baseline);
    const passed = results.every((r) => r.passed);
    console.log(
      JSON.stringify({
        baselinePassed: passed,
        commit: revision.stdout.trim(),
        checks: results.length,
      }),
    );
    if (!passed) process.exitCode = 1;
  },
);
