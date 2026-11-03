import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  dockerCommand,
  localContainerArgs,
  recordLocalCleanup,
  resolveLocalCodingRuntime,
} from "./local-coding-runtime";
import type { CodingConfig } from "./integration-config";
import { packageDirectoryInput } from "./app-pack-schema";
import { permittedChange, protectedSource } from "./coding-policy";

const exec = promisify(execFile);
const MAX_SOURCE_BYTES = 80 * 1024 * 1024;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
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

const WRITE_SOURCE = `
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const file = process.argv[1], remove = process.argv[2] === 'remove';
  let directory = '/workspace';
  for (const part of path.relative('/workspace', path.dirname(file)).split('/').filter(Boolean)) {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.uid !== 0) throw new Error('Invalid source parent');
    await fs.chmod(directory, stat.mode | 0o700);
    directory = path.join(directory, part);
    await fs.mkdir(directory, { recursive: true });
  }
  const parent = await fs.lstat(directory);
  if (!parent.isDirectory() || parent.uid !== 0) throw new Error('Invalid source parent');
  await fs.chmod(directory, parent.mode | 0o700);
  const stat = await fs.lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (stat && (!stat.isFile() || stat.nlink !== 1 || stat.uid !== 0)) throw new Error('Invalid source target');
  if (remove) await fs.unlink(file);
  else {
    if (stat) await fs.chmod(file, stat.mode | 0o600);
    const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
    await fs.writeFile(file, Buffer.concat(chunks), { mode: 0o644 });
  }
})().catch(error => { console.error(error.message); process.exit(1); });
`;

export async function withIsolatedCoding<T>(
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
  input.signal.throwIfAborted();
  const runtime = await resolveLocalCodingRuntime(input.signal);
  const active = new Map<string, { name: string; id: string }>();
  const images = new Set<string>();
  let cleanupRecorded = false;
  const deadline = Date.now() + 14 * 60_000;
  const cwd =
    "/workspace" +
    (input.policy.packageDirectory && input.policy.packageDirectory !== "."
      ? "/" + packageDirectoryInput.parse(input.policy.packageDirectory)
      : "");
  const command = async (
    args: string[],
    options: {
      timeoutMs?: number;
      input?: Buffer;
      maxOutputBytes?: number;
    } = {},
  ) => {
    input.signal.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Execution deadline exceeded");
    return await dockerCommand(runtime.context, args, {
      ...options,
      signal: input.signal,
      timeoutMs: Math.min(options.timeoutMs ?? 30_000, remaining),
    });
  };
  const rememberCleanup = async (
    reason: string,
    daemonOutcomeUnknown: boolean,
  ) => {
    if (cleanupRecorded) return;
    await recordLocalCleanup({
      context: runtime.context,
      containers: [...active.keys()],
      images: [...images],
      reason,
      daemonOutcomeUnknown,
    });
    cleanupRecorded = true;
    await input.event(
      "Execution cleanup needs review",
      "A private cleanup record blocks new local runs until daemon outcome and resources are reconciled.",
      "failure",
    );
  };
  const creatingCommand = async (args: string[], timeoutMs: number) => {
    input.signal.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Execution deadline exceeded");
    let result: Awaited<ReturnType<typeof dockerCommand>>;
    try {
      // Disconnecting a create/commit request does not cancel the daemon operation.
      // Await its bounded outcome before reacting to job cancellation or cleanup.
      result = await dockerCommand(runtime.context, args, {
        timeoutMs: Math.min(timeoutMs, remaining),
      });
    } catch (error) {
      await rememberCleanup(
        args[0] + " outcome is unknown after transport failure",
        true,
      );
      throw error;
    }
    if (result.code !== 0) {
      await rememberCleanup(
        args[0] + " did not establish successful daemon completion",
        true,
      );
      throw new Error("Local resource creation failed");
    }
    input.signal.throwIfAborted();
    return result;
  };
  const stop = async (name: string) => {
    const result = await dockerCommand(
      runtime.context,
      ["rm", "--force", "--volumes", name],
      { timeoutMs: 10_000 },
    );
    if (
      result.code !== 0 &&
      !/No such (container|object)/i.test(result.stderr.toString())
    )
      throw new Error("Local container cleanup failed");
    active.delete(name);
  };
  const execute = async (
    box: { name: string },
    argv: string[],
    directory = "/",
    timeoutMs = 120_000,
    user = "0:0",
    stdin?: Buffer,
  ) => {
    try {
      const result = await command(
        [
          "exec",
          ...(stdin ? ["--interactive"] : []),
          "--user",
          user,
          "--workdir",
          directory,
          box.name,
          ...argv,
        ],
        { timeoutMs, input: stdin },
      );
      return {
        passed: result.code === 0,
        output:
          `${argv[0]} (cwd ${directory}; exit ${result.code})\n${result.stdout}${result.stderr}`.slice(
            -40_000,
          ),
      };
    } catch (error) {
      await stop(box.name);
      input.signal.throwIfAborted();
      throw error;
    }
  };
  const checked = async (
    box: { name: string },
    argv: string[],
    stdin?: Buffer,
  ) => {
    const result = await execute(box, argv, "/", 60_000, "0:0", stdin);
    if (!result.passed)
      throw new Error("Local sandbox setup failed\n" + result.output);
    return result;
  };
  const create = async (imageId: string, purpose: string, network: boolean) => {
    const name = "cue-code-" + randomUUID();
    const box = { name, id: name };
    active.set(name, box);
    const created = await creatingCommand(
      localContainerArgs({
        name,
        imageId,
        purpose,
        network,
        runId: input.runId,
        seconds: Math.max(1, Math.floor((deadline - Date.now()) / 1000)),
      }),
      30_000,
    );
    if (
      created.code !== 0 ||
      !/^[a-f0-9]{64}$/.test(created.stdout.toString().trim())
    )
      throw new Error("Local container creation failed");
    box.id = created.stdout.toString().trim();
    const started = await command(["start", name]);
    if (started.code !== 0) throw new Error("Local container startup failed");
    await input.sandboxCreated?.(box.id);
    await input.event(
      "Isolated execution started",
      JSON.stringify({
        sandboxId: box.id,
        backend: "local",
        context: runtime.context,
        imageId,
        purpose,
        network: network ? "dependency preparation" : "blocked",
      }),
      "system",
    );
    await checked(box, ["mkdir", "-p", "/tmp/cue-home", cwd]);
    await checked(box, ["chmod", "777", "/tmp/cue-home"]);
    return box;
  };
  try {
    const archive = await sourceArchive(input.repo, input.source, input.signal);
    let prepared = runtime.imageId;
    const install = installCommand(input.policy, input.source);
    if (install) {
      const box = await create(runtime.imageId, "dependencies", true);
      const prefix = cwd.slice("/workspace".length).replace(/^\//, "");
      const manifests = [
        "package.json",
        install[0] === "bun" ? "bun.lock" : "package-lock.json",
      ];
      for (const name of manifests) {
        const file = input.source.get((prefix ? prefix + "/" : "") + name);
        if (!file) throw new Error("Dependency manifest missing");
        await checked(
          box,
          ["node", "-e", WRITE_SOURCE, cwd + "/" + name],
          file.bytes,
        );
      }
      const result = await execute(
        box,
        install[0] === "bun"
          ? ["env", "BUN_INSTALL_CACHE_DIR=/opt/cue-bun-cache", ...install]
          : install,
        cwd,
        180_000,
      );
      if (!result.passed)
        throw new Error(
          "Frozen dependency preparation failed\n" + result.output,
        );
      for (const name of manifests) {
        const expected = input.source.get((prefix ? prefix + "/" : "") + name);
        const actual = await command(
          ["exec", "--user", "0:0", box.name, "cat", cwd + "/" + name],
          { maxOutputBytes: MAX_FILE_BYTES },
        );
        if (
          !expected ||
          actual.code !== 0 ||
          !actual.stdout.equals(expected.bytes)
        )
          throw new Error("Frozen dependency installation changed a manifest");
      }
      if (install[0] === "bun") {
        await input.event(
          "Bun dependencies installed",
          JSON.stringify({ sandboxId: box.id }),
          "system",
        );
        await checked(box, ["rm", "-rf", "--", "/opt/cue-bun-cache"]);
      }
      const image = "cue-code-prepared:" + randomUUID();
      images.add(image);
      const committed = await creatingCommand(
        ["commit", box.name, image],
        60_000,
      );
      if (committed.code !== 0)
        throw new Error(
          "Fresh dependency image creation failed: " +
            committed.stderr.toString().slice(-2000),
        );
      const inspected = await command([
        "image",
        "inspect",
        image,
        "--format",
        "{{.Id}}",
      ]);
      if (
        inspected.code !== 0 ||
        !/^sha256:[a-f0-9]{64}$/.test(inspected.stdout.toString().trim())
      )
        throw new Error("Fresh dependency image identity is unavailable");
      prepared = inspected.stdout.toString().trim();
      await stop(box.name);
      const lock = input.source.get(
        (prefix ? prefix + "/" : "") + manifests[1],
      );
      if (!lock) throw new Error("Dependency lockfile provenance missing");
      await input.event(
        "Locked dependencies prepared",
        JSON.stringify({
          manager: install[0],
          packageDirectory: input.policy.packageDirectory ?? ".",
          imageId: prepared,
          lockfileSha256: createHash("sha256").update(lock.bytes).digest("hex"),
          repositorySourcePresent: false,
          lifecycleScripts: false,
        }),
        "success",
      );
    }
    return await operation({
      open: async (purpose, edits = new Map()) => {
        const box = await create(prepared, purpose, false);
        await checked(
          box,
          [
            "tar",
            "-xf",
            "-",
            "--no-same-owner",
            "--no-same-permissions",
            "-C",
            "/workspace",
          ],
          archive,
        );
        const inventory = await checked(box, [
          "node",
          "--input-type=module",
          "-e",
          INVENTORY_SCRIPT,
        ]);
        const expectedInventory = createHash("sha256")
          .update(JSON.stringify([...input.source.keys()].sort()))
          .digest("hex");
        if (!inventory.output.trim().endsWith(expectedInventory))
          throw new Error(
            "Transferred source contains missing files or unexpected archive metadata",
          );
        const integrity = async () =>
          (
            await checked(box, [
              "node",
              "--input-type=module",
              "-e",
              INTEGRITY_SCRIPT,
            ])
          ).output;
        const workspace: CodingWorkspace = {
          id: box.id,
          write: async (file, content) => {
            assertEditable(file, input.source, input.policy);
            await checked(
              box,
              [
                "node",
                "-e",
                WRITE_SOURCE,
                "/workspace/" + file,
                content === null ? "remove" : "write",
              ],
              content === null ? undefined : Buffer.from(content),
            );
          },
          check: async (index) => {
            const commands =
              index === undefined
                ? input.policy.testCommands
                : [input.policy.testCommands[index]];
            if (commands.some((command) => !command))
              throw new Error("Unknown fixed check");
            await checked(box, ["chmod", "-R", "a-w", "/workspace"]);
            const expected = await integrity();
            const results: CheckResult[] = [];
            for (const fixed of commands) {
              if ((await integrity()) !== expected)
                throw new Error(
                  "Verification source changed before a fixed check",
                );
              results.push(
                await execute(
                  box,
                  [fixed.program, ...fixed.args],
                  cwd,
                  120_000,
                  "65534:65534",
                ),
              );
              if ((await integrity()) !== expected)
                throw new Error(
                  "Protected verification source or dependencies changed during a fixed check",
                );
            }
            return {
              passed: results.every((result) => result.passed),
              output: results
                .map((result) => result.output)
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
        const box = [...active.values()].find((box) => box.id === workspace.id);
        if (box) await stop(box.name);
      },
    });
  } finally {
    const containers = await Promise.allSettled([...active.keys()].map(stop));
    const removed = await Promise.allSettled(
      [...images].map(async (image) => {
        const result = await dockerCommand(
          runtime.context,
          ["image", "rm", "--force", image],
          { timeoutMs: 10_000 },
        );
        if (
          result.code !== 0 &&
          !/No such image/i.test(result.stderr.toString())
        )
          throw new Error("Transient image cleanup failed");
      }),
    );
    if (
      [...containers, ...removed].some((result) => result.status === "rejected")
    ) {
      await rememberCleanup("Local resource removal did not complete", false);
      await input.event(
        "Execution cleanup needs review",
        "Local container, volume or transient image cleanup failed.",
        "failure",
      );
      throw new Error("Local execution cleanup failed");
    }
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
