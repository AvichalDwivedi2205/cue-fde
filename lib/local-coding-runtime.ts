import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const contextInput = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/);
const imageInput = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.:/@-]{0,255}$/);
const imageIdInput = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const MAX_INPUT_BYTES = 88 * 1024 * 1024;
const cleanupDirectory = () => path.resolve(".cue", "local-coding-cleanup");
const cleanupMessage =
  "Local coding cleanup needs operator reconciliation before another run";

export async function recordLocalCleanup(input: {
  context: string;
  containers: string[];
  images: string[];
  reason: string;
  daemonOutcomeUnknown: boolean;
}) {
  const directory = cleanupDirectory();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, randomUUID() + ".json");
  await fs.writeFile(
    file,
    JSON.stringify({ ...input, createdAt: new Date().toISOString() }),
    { mode: 0o600, flag: "wx" },
  );
  return file;
}

async function assertCleanupReconciled() {
  const files = await fs
    .readdir(cleanupDirectory())
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
  if (files.length) throw new Error(cleanupMessage);
}

export function localCodingConfig() {
  return {
    context: contextInput.parse(
      process.env.CUE_DOCKER_CONTEXT || "colima-cue-code",
    ),
    image: imageInput.parse(
      process.env.CUE_CODING_IMAGE || "cue-coding-runtime:node24-bun1.3.2",
    ),
  };
}

export async function dockerCommand(
  context: string,
  args: string[],
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    input?: Buffer;
    maxOutputBytes?: number;
  } = {},
): Promise<{ code: number; stdout: Buffer; stderr: Buffer }> {
  contextInput.parse(context);
  options.signal?.throwIfAborted();
  if ((options.input?.length ?? 0) > MAX_INPUT_BYTES)
    throw new Error("Container input exceeds transfer budget");
  return await new Promise((resolve, reject) => {
    const child = spawn("docker", ["--context", context, ...args], {
      env: {
        NODE_ENV: "test",
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DOCKER_CONFIG: process.env.DOCKER_CONFIG,
        TMPDIR: process.env.TMPDIR,
      },
      stdio: [options.input ? "pipe" : "ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [],
      stderr: Buffer[] = [];
    let bytes = 0,
      failure: Error | undefined;
    const stop = (error: Error) => {
      failure ??= error;
      child.kill("SIGKILL");
    };
    const abort = () => stop(new Error("Container command cancelled"));
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = setTimeout(
      () => stop(new Error("Container command timed out")),
      options.timeoutMs ?? 30_000,
    );
    const collect = (target: Buffer[]) => (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > (options.maxOutputBytes ?? 200_000))
        stop(new Error("Container command exceeded output budget"));
      else target.push(chunk);
    };
    child.stdout?.on("data", collect(stdout));
    child.stderr?.on("data", collect(stderr));
    child.on("error", (error) => {
      failure ??= error;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (failure) reject(failure);
      else
        resolve({
          code: code ?? -1,
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
        });
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(options.input);
  });
}

export async function resolveLocalCodingRuntime(signal?: AbortSignal) {
  await assertCleanupReconciled();
  const config = localCodingConfig();
  const endpoint = await dockerCommand(
    config.context,
    [
      "context",
      "inspect",
      config.context,
      "--format",
      "{{json .Endpoints.docker.Host}}",
    ],
    { signal, timeoutMs: 5000 },
  );
  if (
    endpoint.code !== 0 ||
    !z
      .string()
      .regex(/^unix:\/\/\//)
      .safeParse(JSON.parse(endpoint.stdout.toString())).success
  )
    throw new Error("Dedicated local Docker context is unavailable");
  const daemon = await dockerCommand(
    config.context,
    ["info", "--format", "{{.OSType}}"],
    { signal, timeoutMs: 5000 },
  );
  if (daemon.code !== 0 || daemon.stdout.toString().trim() !== "linux")
    throw new Error("Local Linux Docker daemon is unavailable");
  const image = await dockerCommand(
    config.context,
    ["image", "inspect", config.image, "--format", "{{json .}}"],
    { signal, timeoutMs: 5000 },
  );
  if (image.code !== 0)
    throw new Error("Configured local coding image is unavailable");
  const parsed = z
    .object({
      Id: imageIdInput,
      Config: z.object({
        Volumes: z.record(z.string(), z.unknown()).nullable().optional(),
      }),
    })
    .parse(JSON.parse(image.stdout.toString()));
  if (Object.keys(parsed.Config.Volumes ?? {}).length)
    throw new Error("Coding image must not declare persistent volumes");
  return { context: config.context, imageId: parsed.Id };
}

export async function localCodingReadiness(): Promise<{
  ready: boolean;
  detail: string;
}> {
  try {
    await resolveLocalCodingRuntime();
    return {
      ready: true,
      detail: "Dedicated local Docker daemon and coding image are available",
    };
  } catch (error) {
    return {
      ready: false,
      detail:
        error instanceof Error && error.message === cleanupMessage
          ? cleanupMessage
          : "Dedicated local Docker context, daemon or coding image is unavailable",
    };
  }
}

export function localContainerArgs(input: {
  name: string;
  imageId: string;
  purpose: string;
  seconds: number;
  runId: string;
  network: boolean;
}) {
  imageIdInput.parse(input.imageId);
  return [
    "create",
    "--pull=never",
    "--name",
    input.name,
    "--label",
    "cue.coding=true",
    "--label",
    `cue.run=${input.runId}`,
    "--label",
    `cue.purpose=${input.purpose}`,
    "--network",
    input.network ? "bridge" : "none",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
    "--cpus=2",
    "--memory=4g",
    "--memory-swap=4g",
    "--pids-limit=256",
    "--tmpfs",
    "/tmp:rw,nosuid,nodev,size=536870912,mode=1777",
    ...(input.network
      ? []
      : ["--read-only", "--mount", "type=volume,target=/workspace"]),
    "--env",
    "CI=true",
    "--env",
    "NODE_ENV=test",
    "--env",
    "HOME=/tmp/cue-home",
    "--workdir",
    "/",
    "--entrypoint",
    "/bin/sleep",
    input.imageId,
    String(input.seconds),
  ];
}
