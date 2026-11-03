import nextEnv from "@next/env";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { withModalCoding, type SourceSnapshot } from "../lib/coding-workspace";
nextEnv.loadEnvConfig(process.cwd());

// Credentialed root smoke: synthetic source only, no GitHub or product records.
const repo = await fs.mkdtemp(path.join(os.tmpdir(), "cue-modal-smoke-"));
const source: SourceSnapshot = new Map([
  ["value.txt", { bytes: Buffer.from("1"), mode: 0o644 }],
  ["protected.test.mjs", { bytes: Buffer.from("protected"), mode: 0o644 }],
  [
    "check.mjs",
    {
      mode: 0o644,
      bytes: Buffer.from(`
import assert from 'node:assert/strict';
import fs from 'node:fs';
assert.equal(process.getuid(), 65534);
assert.equal(process.env.META_API_KEY, undefined);
assert.equal(process.env.CUE_DEMO_SECRET, undefined);
assert.equal(process.env.GH_TOKEN, undefined);
assert.throws(() => fs.writeFileSync('protected.test.mjs', 'tampered'));
assert.throws(() => fs.chmodSync('protected.test.mjs', 0o666));
assert.throws(() => fs.writeFileSync('added-source.txt', 'tampered'));
assert.match(fs.readFileSync('value.txt', 'utf8'), /^[12]$/);
console.log('Unprivileged checks passed; protected files and directories rejected writes.');
`),
    },
  ],
]);
const policy = {
  appId: "synthetic",
  repository: "synthetic/synthetic",
  baseBranch: "main",
  packageManager: "none" as const,
  allowedPaths: ["value.txt"],
  testCommands: [{ program: "node" as const, args: ["check.mjs"] }],
};
try {
  for (const [file, content] of source)
    await fs.writeFile(path.join(repo, file), content.bytes);
  await withModalCoding(
    {
      repo,
      source,
      policy,
      runId: "synthetic-readonly-smoke",
      signal: AbortSignal.timeout(180_000),
      event: async (title, detail) => {
        console.log(JSON.stringify({ title, detail }));
      },
    },
    async (execution) => {
      const baseline = await execution.open("baseline");
      const before = await baseline.check();
      if (!before.passed) throw new Error(before.output);
      await execution.close(baseline);
      const coding = await execution.open("implementation");
      await coding.write("value.txt", "2");
      if (!(await coding.check()).passed)
        throw new Error("Coding workspace check failed");
      await execution.close(coding);
      const verifier = await execution.open(
        "verification",
        new Map([["value.txt", "2"]]),
      );
      const after = await verifier.check();
      if (!after.passed) throw new Error(after.output);
      await execution.close(verifier);
      console.log(
        JSON.stringify({
          passed: true,
          source: "synthetic",
          baseline: before.output,
          after: after.output,
        }),
      );
    },
  );
} finally {
  await fs.rm(repo, { recursive: true, force: true });
}
