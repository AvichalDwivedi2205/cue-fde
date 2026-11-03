import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { z } from "zod";

let input;
try {
  input = JSON.parse(
    readFileSync(
      process.env.CUE_WORKER_ENV_FILE || "/run/secrets/cue-env.json",
      "utf8",
    ),
  );
} catch {
  throw new Error("Coding worker configuration could not be read");
}
const strings = z.record(z.string(), z.string()).safeParse(input);
const required = z.object({
  CUE_DEMO_SECRET: z.string().min(1),
  CUE_CONVEX_URL: z.url(),
  META_API_KEY: z.string().min(1),
  MODAL_TOKEN_ID: z.string().min(1),
  MODAL_TOKEN_SECRET: z.string().min(1),
  CUE_MODAL_IMAGE: z.string().min(1),
  GH_TOKEN: z.string().min(1),
});
if (!strings.success || !required.safeParse(strings.data).success)
  throw new Error(
    "Coding worker requires server, Meta, Modal and GitHub configuration",
  );

const env = {
  ...process.env,
  ...strings.data,
  NODE_ENV: "production",
  CUE_SHARED_CONFIG: "true",
  CUE_LOCAL_DEMO: "false",
  GIT_TERMINAL_PROMPT: "0",
  GH_PROMPT_DISABLED: "1",
};
let child;
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
  });

await new Promise((resolve, reject) => {
  child = spawn("gh", ["auth", "setup-git"], { stdio: "inherit", env });
  child.once("error", () =>
    reject(new Error("GitHub authentication setup failed")),
  );
  child.once("exit", (code) =>
    code === 0
      ? resolve()
      : reject(new Error("GitHub authentication setup failed")),
  );
});
if (stopping) process.exit(0);
child = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/coding-worker.ts"],
  { stdio: "inherit", env },
);
child.once("error", () => process.exit(1));
child.once("exit", (code) => process.exit(code ?? 1));
