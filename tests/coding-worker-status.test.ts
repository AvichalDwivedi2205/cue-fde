import { spawn } from "node:child_process";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { expect, test } from "vitest";
import { z } from "zod";

const requestInput = z.object({
  path: z.enum(["serverState:read", "serverState:write", "jobs:claim"]),
  args: z.tuple([z.object({
    key: z.literal("coding-worker").optional(),
    value: z.string().optional(),
    executionMode: z.literal("pull_request").optional(),
    provider: z.literal("Meta").optional(),
  })]),
});
async function listen(server: ReturnType<typeof createServer>) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test port");
  return address.port;
}

test.each([true, false])("local coding worker only claims work after verified runtime readiness: %s", async (ready) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "cue-worker-status-"));
  const calls: z.infer<typeof requestInput>[] = [];
  const errors: string[] = [];
  let row: { value: string; version: number; updatedAt: number } | null = null;
  const backend = createServer(async (req, res) => {
    try {
      let body = "";
      for await (const chunk of req) body += String(chunk);
      const request = requestInput.parse(JSON.parse(body));
      calls.push(request);
      if (request.path === "serverState:write") {
        if (!request.args[0].value) throw new Error("Missing worker status");
        row = { value: request.args[0].value, version: (row?.version ?? 0) + 1, updatedAt: Date.now() };
      }
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: "success", value: request.path === "serverState:read" ? row : null }));
    } catch (error) {
      errors.push(String(error));
      res.writeHead(500);
      res.end("Invalid fixture request");
    }
  });
  const backendPort = await listen(backend);
  const reservation = createServer();
  const port = await listen(reservation);
  await new Promise<void>((resolve) => reservation.close(() => resolve()));
  const bin = path.join(directory, "bin");
  await fs.mkdir(bin);
  if (ready) await fs.writeFile(path.join(directory, "runtime-ready"), "ready");
  await fs.writeFile(path.join(bin, "docker"), `#!/bin/sh
printf '%s\\n' "$*" >> "$HOME/docker-log"
[ -f "$HOME/runtime-ready" ] || exit 1
case "$3 $4" in
  'context inspect') printf '"unix:///tmp/cue-worker-fixture.sock"' ;;
  'info --format') printf 'linux' ;;
  'image inspect') printf '{"Id":"sha256:${"a".repeat(64)}","Config":{"Volumes":null}}' ;;
  *) exit 1 ;;
esac
`, { mode: 0o700 });
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/coding-worker.ts"], {
    cwd: process.cwd(),
    env: {
      NODE_ENV: "test",
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      HOME: directory,
      PORT: String(port),
      CUE_CONVEX_URL: `http://127.0.0.1:${backendPort}`,
      CUE_DEMO_SECRET: "fixture-worker-secret",
      META_API_KEY: "fixture-meta-key",
      GH_TOKEN: "fixture-github-token",
      CUE_DOCKER_CONTEXT: "fixture-context",
      CUE_CODING_IMAGE: "fixture-runtime:verified",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  let exited = false;
  const completion = once(child, "exit").then(([code]) => { exited = true; return code; });
  try {
    const origin = `http://127.0.0.1:${port}`;
    let listening = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (exited) throw new Error("Worker exited before readiness: " + output);
      try { listening = (await fetch(origin + "/healthz")).ok; } catch {}
      if (listening && row && (!ready || calls.some((call) => call.path === "jobs:claim"))) break;
      await pause(30);
    }
    expect(listening).toBe(true);
    expect((await fetch(origin + "/status")).status).toBe(403);
    const response = await fetch(origin + "/status", {
      headers: { authorization: "Bearer fixture-worker-secret" },
    });
    expect(await response.json()).toMatchObject({
      coding: { provider: "meta", model: "muse-wonder-1.0", backend: "local", configured: ready, workerOnline: true },
      codex: { loggedIn: false, workerOnline: false },
      slack: { connected: false },
      notifications: { connected: false },
      x: { connected: false },
    });
    await pause(100);
    const claims = calls.filter((call) => call.path === "jobs:claim");
    expect(claims.length > 0).toBe(ready);
    for (const claim of claims)
      expect(claim.args[0]).toMatchObject({ executionMode: "pull_request", provider: "Meta" });
    expect(errors).toEqual([]);
    const dockerCalls = await fs.readFile(path.join(directory, "docker-log"), "utf8");
    expect(dockerCalls).toContain("--context fixture-context context inspect");
    expect(dockerCalls).not.toMatch(/\b(create|run|pull|build)\b/);
    child.kill("SIGTERM");
    expect(await completion).toBe(0);
    expect(output).not.toContain("fixture-meta-key");
    expect(output).not.toContain("fixture-github-token");
  } finally {
    if (!exited) { child.kill("SIGTERM"); await completion; }
    await new Promise<void>((resolve) => backend.close(() => resolve()));
    await fs.rm(directory, { recursive: true, force: true });
  }
}, 15000);
