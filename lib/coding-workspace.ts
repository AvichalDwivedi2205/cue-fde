import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { ModalClient, NotFoundError, type Image, type Sandbox } from "modal";
import type { CodingConfig } from "./integration-config";
import { packageDirectoryInput } from "./app-pack-schema";
import { permittedChange, protectedSource } from "./coding-policy";

const exec = promisify(execFile);
const MAX_SOURCE_BYTES = 80 * 1024 * 1024;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 200_000;
const INVENTORY_SCRIPT = `
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const files = [];
async function visit(directory) {
  for (const name of await fs.readdir(directory)) {
    if (name === 'node_modules') continue;
    const file = path.join(directory, name), stat = await fs.lstat(file);
    if (stat.isDirectory()) await visit(file);
    else if (stat.isFile()) files.push(file.slice('/workspace/'.length));
    else throw new Error('Non-regular transferred source');
  }
}
await visit('/workspace');
console.log(crypto.createHash('sha256').update(JSON.stringify(files.sort())).digest('hex'));
`;
const INTEGRITY_SCRIPT = `
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root = '/workspace';
const hash = crypto.createHash('sha256');
let files = 0;
async function visit(directory) {
  for (const name of (await fs.readdir(directory)).sort()) {
    const file = path.join(directory, name);
    const stat = await fs.lstat(file);
    hash.update(JSON.stringify([file.slice(root.length), stat.mode, stat.uid, stat.gid, stat.size, stat.nlink]));
    if (stat.isSymbolicLink()) {
      const target = await fs.realpath(file);
      if (!target.startsWith(root + '/')) throw new Error('Symlink escapes verification source');
      hash.update(await fs.readlink(file));
    } else if (stat.isDirectory()) await visit(file);
    else if (stat.isFile()) { hash.update(await fs.readFile(file)); files++; }
    else throw new Error('Non-regular verification source');
  }
}
await visit(root);
console.log(JSON.stringify({ digest: hash.digest('hex'), files }));
`;
const UNPRIVILEGED = [
  "setpriv",
  "--reuid=65534",
  "--regid=65534",
  "--clear-groups",
  "--no-new-privs",
  "--bounding-set=-all",
];

// Modal requires whole-second timeouts; floor so execution never exceeds its budget.
export function modalTimeout(requestedMs: number, remainingMs: number) {
  const value = Math.floor(Math.min(requestedMs, remainingMs) / 1000) * 1000;
  if (value < 1000) throw new Error("Execution deadline exceeded");
  return value;
}

export type SourceFile = { bytes: Buffer; mode: number };
export type SourceSnapshot = Map<string, SourceFile>;
export type SourceEdits = Map<string, string | null>;
export type CheckResult = { passed: boolean; output: string };
export type CodingWorkspace = {
  id: string;
  write(path: string, content: string | null): Promise<void>;
  check(index?: number): Promise<CheckResult>;
};
export type ExecutionEvent = (
  title: string,
  detail: string,
  kind?: string,
) => Promise<void>;

export function sourcePath(value: string) {
  if (
    !value ||
    value.startsWith("-") ||
    /[\\\u0000-\u001f\u007f]/.test(value) ||
    value.startsWith("/") ||
    value
      .split("/")
      .some(
        (p) =>
          !p ||
          p === "." ||
          p === ".." ||
          p === ".git" ||
          p === "__MACOSX" ||
          p.startsWith("._") ||
          p.startsWith(".env"),
      ) ||
    /(^|\/)(node_modules|\.next|\.cue)(\/|$)/.test(value)
  )
    throw new Error("Invalid repository source path");
  return value;
}

export function assertEditable(
  file: string,
  source: SourceSnapshot,
  policy: CodingConfig,
) {
  sourcePath(file);
  if (
    !permittedChange(file, policy) ||
    (source.has(file) && protectedSource(file))
  )
    throw new Error(`Patch violates repository policy: ${file}`);
}

export function validateEdits(
  edits: SourceEdits,
  source: SourceSnapshot,
  policy: CodingConfig,
) {
  if (!edits.size || edits.size > 40)
    throw new Error("Implementation must change between 1 and 40 files");
  let bytes = 0;
  for (const [file, content] of edits) {
    assertEditable(file, source, policy);
    bytes +=
      Buffer.byteLength(content ?? "") + (source.get(file)?.bytes.length ?? 0);
    if (bytes > 600_000)
      throw new Error("Implementation exceeds patch byte budget");
    if (content === null && !source.has(file))
      throw new Error("Cannot delete a missing source file");
  }
}

export function installCommand(
  policy: CodingConfig,
  source: SourceSnapshot,
): string[] | null {
  const directory = packageDirectoryInput.parse(policy.packageDirectory ?? ".");
  const prefix = directory === "." ? "" : directory + "/";
  const manager =
    policy.packageManager ??
    (source.has(prefix + "package-lock.json") ? "npm" : "none");
  if (manager === "none") return null;
  if (!source.has(prefix + "package.json"))
    throw new Error("Package directory has no package.json");
  const lock = manager === "bun" ? "bun.lock" : "package-lock.json";
  if (!source.has(prefix + lock))
    throw new Error(`Frozen dependency install requires ${prefix + lock}`);
  return manager === "bun"
    ? ["bun", "install", "--frozen-lockfile", "--ignore-scripts"]
    : ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"];
}

export async function readSourceSnapshot(
  repo: string,
  signal: AbortSignal,
): Promise<SourceSnapshot> {
  const listed = await exec("git", ["ls-files", "-z"], {
    cwd: repo,
    signal,
    maxBuffer: 4 * 1024 * 1024,
  });
  const source: SourceSnapshot = new Map();
  let bytes = 0;
  for (const file of listed.stdout.split("\0").filter(Boolean)) {
    if (
      file
        .split("/")
        .some((p) => p.startsWith(".env") || p === ".git" || p === ".cue") ||
      /(^|\/)([^/]*\.(pem|key|p12)|credentials[^/]*|\.npmrc)$/.test(file)
    )
      continue;
    sourcePath(file);
    const stat = await fs.lstat(path.join(repo, file));
    if (!stat.isFile() || stat.nlink !== 1)
      throw new Error(`Source contains a non-regular file: ${file}`);
    bytes += stat.size;
    if (
      stat.size > MAX_FILE_BYTES ||
      bytes > MAX_SOURCE_BYTES ||
      source.size >= 5000
    )
      throw new Error("Repository exceeds source transfer budget");
    source.set(file, {
      bytes: await fs.readFile(path.join(repo, file)),
      mode: stat.mode & 0o777,
    });
  }
  return source;
}

// The archive is created only from supervisor-validated tracked regular files.
// No local credentials, untracked files or Git metadata enter the Sandbox.
async function sourceArchive(
  repo: string,
  source: SourceSnapshot,
  signal: AbortSignal,
): Promise<Buffer> {
  return await new Promise((resolve, reject) => {
    const child = spawn("tar", ["-cf", "-", "--null", "-T", "-"], {
      cwd: repo,
      signal,
      env: { ...process.env, COPYFILE_DISABLE: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let size = 0,
      stderr = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
    child.stdout.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_SOURCE_BYTES + 8 * 1024 * 1024) child.kill("SIGKILL");
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = (stderr + String(chunk)).slice(-4000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || signal.aborted)
        reject(new Error("Source archive failed: " + stderr));
      else resolve(Buffer.concat(chunks));
    });
    child.stdin.on("error", () => {});
    child.stdin.end([...source.keys()].join("\0") + "\0");
  });
}

async function readBounded(
  stream: AsyncIterable<string>,
  overflow: () => void,
) {
  let text = "";
  for await (const chunk of stream) {
    if (Buffer.byteLength(text) + Buffer.byteLength(chunk) > MAX_OUTPUT_BYTES) {
      overflow();
      throw new Error("Repository command exceeded output budget");
    }
    text += chunk;
  }
  return text;
}

export async function withModalCoding<T>(
  input: {
    repo: string;
    source: SourceSnapshot;
    policy: CodingConfig;
    runId: string;
    signal: AbortSignal;
    event: ExecutionEvent;
    sandboxCreated?: (id: string) => Promise<void>;
  },
  operation: (execution: {
    open(
      purpose: "baseline" | "implementation" | "verification",
      edits?: SourceEdits,
    ): Promise<CodingWorkspace>;
    close(workspace: CodingWorkspace): Promise<void>;
  }) => Promise<T>,
): Promise<T> {
  const tokenId = process.env.MODAL_TOKEN_ID,
    tokenSecret = process.env.MODAL_TOKEN_SECRET;
  const imageName = process.env.CUE_MODAL_IMAGE;
  if (!tokenId || !tokenSecret || !imageName)
    throw new Error("Modal execution is not configured");
  const client = new ModalClient({
    tokenId,
    tokenSecret,
    timeoutMs: 30_000,
    maxRetries: 1,
  });
  const active = new Map<string, Sandbox>();
  const deadline = Date.now() + 14 * 60_000;
  const cwd =
    "/workspace" +
    (input.policy.packageDirectory && input.policy.packageDirectory !== "."
      ? "/" + packageDirectoryInput.parse(input.policy.packageDirectory)
      : "");
  const abort = () => {
    for (const sb of active.values()) void sb.terminate().catch(() => {});
  };
  input.signal.throwIfAborted();
  input.signal.addEventListener("abort", abort, { once: true });
  try {
    const app = await client.apps.fromName(
      process.env.CUE_MODAL_APP || "cue-execution",
    );
    const runtime = await client.images.fromName(imageName);
    const archive = await sourceArchive(input.repo, input.source, input.signal);
    const create = async (
      image: Image,
      purpose: string,
      blockNetwork: boolean,
    ) => {
      input.signal.throwIfAborted();
      const remaining = modalTimeout(14 * 60_000, deadline - Date.now());
      if (remaining < 1000) throw new Error("Execution deadline exceeded");
      const sb = await client.sandboxes.create(app, image, {
        command: ["sleep", "infinity"],
        workdir: "/",
        timeoutMs: remaining,
        idleTimeoutMs: Math.min(remaining, 180_000),
        blockNetwork,
        cpu: 1,
        cpuLimit: 2,
        memoryMiB: 4096,
        memoryLimitMiB: 8192,
        includeOidcIdentityToken: false,
        env: { CI: "true", NODE_ENV: "test", HOME: "/tmp/cue-home" },
        tags: { runId: input.runId, purpose },
      });
      active.set(sb.sandboxId, sb);
      if (input.signal.aborted) {
        await sb.terminate();
        input.signal.throwIfAborted();
      }
      await input.sandboxCreated?.(sb.sandboxId);
      await input.event(
        "Isolated execution started",
        JSON.stringify({
          sandboxId: sb.sandboxId,
          imageId: image.imageId,
          purpose,
          network: blockNetwork ? "blocked" : "dependency preparation",
        }),
        "system",
      );
      return sb;
    };
    const stop = async (sb: Sandbox) => {
      // Keep failed termination handles for the outer finally; remote TTL is an independent cap.
      try {
        await sb.terminate({ wait: true });
      } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
      }
      active.delete(sb.sandboxId);
      sb.detach();
    };
    const execute = async (
      sb: Sandbox,
      argv: string[],
      directory: string,
      timeoutMs = 120_000,
    ) => {
      input.signal.throwIfAborted();
      const process = await sb.exec(argv, {
        workdir: directory,
        timeoutMs: modalTimeout(timeoutMs, deadline - Date.now()),
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, code] = await Promise.all([
        readBounded(process.stdout, () => {
          void sb.terminate().catch(() => {});
        }),
        readBounded(process.stderr, () => {
          void sb.terminate().catch(() => {});
        }),
        process.wait(),
      ]);
      input.signal.throwIfAborted();
      return {
        passed: code === 0,
        output:
          `${argv.join(" ")} (cwd ${directory}; exit ${code})\n${stdout}${stderr}`.slice(
            -40_000,
          ),
      };
    };
    let prepared = runtime;
    const install = installCommand(input.policy, input.source);
    if (install) {
      const sb = await create(runtime, "dependencies", false);
      await sb.filesystem.makeDirectory(cwd);
      const prefix =
        input.policy.packageDirectory && input.policy.packageDirectory !== "."
          ? input.policy.packageDirectory + "/"
          : "";
      // Only immutable package manifests and lockfile are present while network is enabled.
      for (const name of [
        "package.json",
        install[0] === "bun" ? "bun.lock" : "package-lock.json",
      ]) {
        const file = input.source.get(prefix + name);
        if (!file) throw new Error("Dependency manifest missing");
        await sb.filesystem.writeBytes(file.bytes, cwd + "/" + name);
      }
      const result = await execute(sb, install, cwd, 180_000);
      if (!result.passed)
        throw new Error(
          "Frozen dependency preparation failed\n" + result.output,
        );
      for (const name of [
        "package.json",
        install[0] === "bun" ? "bun.lock" : "package-lock.json",
      ]) {
        const expected = input.source.get(prefix + name);
        if (
          !expected ||
          !Buffer.from(await sb.filesystem.readBytes(cwd + "/" + name)).equals(
            expected.bytes,
          )
        )
          throw new Error("Frozen dependency installation changed a manifest");
      }
      prepared = await sb.snapshotFilesystem({
        timeoutMs: 55_000,
        ttlMs: 3_600_000,
      });
      await stop(sb);
      const lockedManifest = input.source.get(
        prefix + (install[0] === "bun" ? "bun.lock" : "package-lock.json"),
      );
      if (!lockedManifest)
        throw new Error("Dependency lockfile provenance missing");
      await input.event(
        "Locked dependencies prepared",
        JSON.stringify({
          manager: install[0],
          packageDirectory: input.policy.packageDirectory ?? ".",
          imageId: prepared.imageId,
          lockfileSha256: createHash("sha256")
            .update(lockedManifest.bytes)
            .digest("hex"),
          repositorySourcePresent: false,
          lifecycleScripts: false,
        }),
        "success",
      );
    }
    return await operation({
      open: async (purpose, edits = new Map()) => {
        const sb = await create(prepared, purpose, true);
        await sb.filesystem.makeDirectory("/workspace");
        const extraction = await sb.exec(
          ["tar", "-xf", "-", "--no-same-owner", "-C", "/workspace"],
          { timeoutMs: 60_000, mode: "binary" },
        );
        await extraction.stdin.writeBytes(archive);
        await extraction.stdin.close();
        const extractionCode = await extraction.wait();
        if (extractionCode !== 0) throw new Error("Source transfer failed");
        await sb.filesystem.makeDirectory("/opt/cue");
        await sb.filesystem.writeText(
          INTEGRITY_SCRIPT,
          "/opt/cue/integrity.mjs",
        );
        await sb.filesystem.writeText(
          INVENTORY_SCRIPT,
          "/opt/cue/source-inventory.mjs",
        );
        const inventory = await execute(
          sb,
          ["node", "/opt/cue/source-inventory.mjs"],
          "/",
        );
        const expectedInventory = createHash("sha256")
          .update(JSON.stringify([...input.source.keys()].sort()))
          .digest("hex");
        if (
          !inventory.passed ||
          !inventory.output.trim().endsWith(expectedInventory)
        )
          throw new Error(
            "Transferred source contains missing files or unexpected archive metadata",
          );
        const home = await execute(
          sb,
          ["install", "-d", "-o", "65534", "-g", "65534", "/tmp/cue-home"],
          "/",
        );
        if (!home.passed)
          throw new Error("Isolated temporary directory setup failed");
        const integrity = async () => {
          const result = await execute(
            sb,
            ["node", "/opt/cue/integrity.mjs"],
            "/",
          );
          if (!result.passed)
            throw new Error(
              "Repository integrity scan failed\n" + result.output,
            );
          return result.output;
        };
        const workspace: CodingWorkspace = {
          id: sb.sandboxId,
          write: async (file, content) => {
            assertEditable(file, input.source, input.policy);
            input.signal.throwIfAborted();
            if (content === null)
              await sb.filesystem.remove("/workspace/" + file);
            else await sb.filesystem.writeText(content, "/workspace/" + file);
          },
          check: async (index) => {
            const commands =
              index === undefined
                ? input.policy.testCommands
                : [input.policy.testCommands[index]];
            if (commands.some((c) => !c))
              throw new Error("Unknown fixed check");
            const ownership = await execute(
              sb,
              ["chown", "-R", "root:root", "/workspace"],
              "/",
            );
            const readonly = await execute(
              sb,
              ["chmod", "-R", "a-w", "/workspace"],
              "/",
            );
            if (!ownership.passed || !readonly.passed)
              throw new Error("Read-only verification setup failed");
            const expected = await integrity();
            const results: CheckResult[] = [];
            for (const command of commands) {
              if ((await integrity()) !== expected)
                throw new Error(
                  "Verification source changed before a fixed check",
                );
              results.push(
                await execute(
                  sb,
                  [...UNPRIVILEGED, command.program, ...command.args],
                  cwd,
                ),
              );
              if ((await integrity()) !== expected)
                throw new Error(
                  "Protected verification source or dependencies changed during a fixed check",
                );
            }
            return {
              passed: results.every((r) => r.passed),
              output: results
                .map((r) => r.output)
                .join("\n\n")
                .slice(-40_000),
            };
          },
        };
        for (const [file, content] of edits)
          await workspace.write(file, content);
        return workspace;
      },
      close: async (workspace) => {
        const sb = active.get(workspace.id);
        if (sb) await stop(sb);
      },
    });
  } finally {
    input.signal.removeEventListener("abort", abort);
    const results = await Promise.allSettled(
      [...active.values()].map(async (sb) => {
        await sb.terminate({ wait: true });
        sb.detach();
      }),
    );
    client.close();
    if (results.some((r) => r.status === "rejected"))
      await input.event(
        "Execution cleanup needs review",
        "A Sandbox termination request failed; its configured lifetime still bounds execution.",
        "failure",
      );
  }
}

export async function applySourceEdits(
  repo: string,
  edits: SourceEdits,
  source: SourceSnapshot,
  policy: CodingConfig,
) {
  validateEdits(edits, source, policy);
  const checkout = await fs.realpath(repo);
  for (const [file, content] of edits) {
    const target = path.join(checkout, sourcePath(file));
    let directory = checkout;
    for (const component of file.split("/").slice(0, -1)) {
      directory = path.join(directory, component);
      const stat = await fs.lstat(directory).catch(() => null);
      if (stat && !stat.isDirectory())
        throw new Error("Patch parent is not a regular directory");
      if (!stat) await fs.mkdir(directory);
    }
    const parent = await fs.realpath(path.dirname(target));
    if (parent !== checkout && !parent.startsWith(checkout + path.sep))
      throw new Error("Patch parent escapes checkout");
    const existing = await fs.lstat(target).catch(() => null);
    if (existing && (!existing.isFile() || existing.nlink !== 1))
      throw new Error("Patch target is not a regular file");
    if (content === null) await fs.unlink(target);
    else
      await fs.writeFile(target, content, {
        mode: source.get(file)?.mode ?? 0o644,
      });
  }
}
