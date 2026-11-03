import nextEnv from "@next/env";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ModalClient, NotFoundError } from "modal";
import { withModalCoding, type SourceSnapshot } from "../lib/coding-workspace";
nextEnv.loadEnvConfig(process.cwd());
const repo = await fs.mkdtemp(path.join(os.tmpdir(), "cue-modal-cancel-"));
const waitScript = Buffer.from(
  "setTimeout(() => console.log('finished'), 60000);",
);
const source: SourceSnapshot = new Map([
  [
    "wait.mjs",
    {
      bytes: waitScript,
      mode: 0o644,
    },
  ],
]);
const controller = new AbortController();
let sandboxId: string | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  await fs.writeFile(path.join(repo, "wait.mjs"), waitScript);
  try {
    await withModalCoding(
      {
        repo,
        source,
        policy: {
          appId: "synthetic",
          repository: "synthetic/synthetic",
          baseBranch: "main",
          packageManager: "none",
          allowedPaths: ["wait.mjs"],
          testCommands: [{ program: "node", args: ["wait.mjs"] }],
        },
        runId: "synthetic-cancellation-smoke",
        signal: controller.signal,
        event: async (title, detail) => {
          console.log(JSON.stringify({ title, detail }));
        },
      },
      async (execution) => {
        const workspace = await execution.open("baseline");
        sandboxId = workspace.id;
        timer = setTimeout(() => controller.abort(), 3000);
        await workspace.check();
        throw new Error(
          "Long-running execution unexpectedly finished before cancellation",
        );
      },
    );
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    clearTimeout(timer);
  }
  if (!sandboxId)
    throw new Error("No active Sandbox was observed before cancellation");
  const client = new ModalClient({
    tokenId: process.env.MODAL_TOKEN_ID,
    tokenSecret: process.env.MODAL_TOKEN_SECRET,
  });
  try {
    let stopped = false;
    try {
      stopped =
        (await (await client.sandboxes.fromId(sandboxId)).poll()) !== null;
    } catch (error) {
      if (error instanceof NotFoundError) stopped = true;
      else throw error;
    }
    if (!stopped) throw new Error("Cancellation left a Sandbox running");
    console.log(
      JSON.stringify({
        passed: true,
        cancellation: "remote Sandbox stopped",
        sandboxId,
      }),
    );
  } finally {
    client.close();
  }
} finally {
  await fs.rm(repo, { recursive: true, force: true });
}
