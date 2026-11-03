import { afterEach, expect, test, vi } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  withIsolatedCoding,
  type SourceSnapshot,
} from "../lib/coding-workspace";
import type { dockerCommand } from "../lib/local-coding-runtime";

const transport = vi.hoisted(() => ({ command: vi.fn(), remember: vi.fn() }));
vi.mock("../lib/local-coding-runtime", async (importActual) => ({
  ...(await importActual<typeof import("../lib/local-coding-runtime")>()),
  resolveLocalCodingRuntime: async () => ({
    context: "synthetic",
    imageId: "sha256:" + "a".repeat(64),
  }),
  dockerCommand: transport.command,
  recordLocalCleanup: transport.remember,
}));
const temporary: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(
    temporary
      .splice(0)
      .map((file) => fs.rm(file, { recursive: true, force: true })),
  );
});
const deferred = () => {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const result = (stdout = "", code = 0, stderr = "") => ({
  code,
  stdout: Buffer.from(stdout),
  stderr: Buffer.from(stderr),
});

async function setup(stage: "create" | "commit", ambiguous = false) {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "cue-cleanup-race-"));
  temporary.push(repo);
  const source: SourceSnapshot = new Map([
    [
      "package.json",
      { bytes: Buffer.from('{"name":"synthetic"}'), mode: 0o644 },
    ],
    [
      "package-lock.json",
      { bytes: Buffer.from('{"lockfileVersion":3}'), mode: 0o644 },
    ],
  ]);
  for (const [file, value] of source)
    await fs.writeFile(path.join(repo, file), value.bytes);
  const controller = new AbortController(),
    started = deferred(),
    finishDaemon = deferred();
  const containers = new Set<string>(),
    volumes = new Set<string>(),
    images = new Set<string>();
  const removals: string[] = [];
  let sequence = 0;
  transport.command.mockImplementation(
    async (
      _context: string,
      args: string[],
      options?: Parameters<typeof dockerCommand>[2],
    ) => {
      if (args[0] === "create" || args[0] === "commit") {
        const create = args[0] === "create",
          name = create ? args[args.indexOf("--name") + 1] : args.at(-1)!;
        const id = (++sequence).toString(16).padStart(64, "0");
        const complete = () => {
          if (create) {
            containers.add(name);
            volumes.add(name + "-volume");
          } else images.add(name);
          return result(create ? id : "sha256:" + id);
        };
        if (args[0] === stage) {
          started.resolve();
          // The daemon progresses independently of the CLI abort signal.
          const daemon = finishDaemon.promise.then(complete);
          if (ambiguous) {
            void daemon;
            throw new Error("Container command timed out");
          }
          const disconnected = new Promise<never>((_resolve, reject) => {
            options?.signal?.addEventListener(
              "abort",
              () => reject(new Error("CLI disconnected")),
              { once: true },
            );
          });
          return await Promise.race([daemon, disconnected]);
        }
        return complete();
      }
      if (args[0] === "rm") {
        const name = args.at(-1)!;
        removals.push(name);
        const exists = containers.delete(name);
        volumes.delete(name + "-volume");
        return exists ? result() : result("", 1, "No such container");
      }
      if (args[0] === "image" && args[1] === "rm") {
        const tag = args.at(-1)!;
        return images.delete(tag) ? result() : result("", 1, "No such image");
      }
      if (args[0] === "exec" && args.includes("cat"))
        return result(
          source.get(path.basename(args.at(-1)!))!.bytes.toString(),
        );
      return result();
    },
  );
  const run = withIsolatedCoding(
    {
      repo,
      source,
      runId: "synthetic",
      signal: controller.signal,
      event: vi.fn(),
      policy: {
        appId: "synthetic",
        repository: "owner/example",
        baseBranch: "main",
        allowedPaths: ["src/"],
        packageManager: "npm",
        testCommands: [{ program: "node", args: ["test.mjs"] }],
      },
    },
    async () => {
      throw new Error("No workspace should start after cancelled creation");
    },
  );
  const settled = run.then(
    () => undefined,
    (error) => error,
  );
  await started.promise;
  return {
    controller,
    finishDaemon,
    containers,
    volumes,
    images,
    removals,
    settled,
  };
}

test.each(["create", "commit"] as const)(
  "cancellation waits for late daemon %s before removing reserved resources",
  async (stage) => {
    const run = await setup(stage);
    run.controller.abort();
    // Cross one event-loop boundary, allowing an eager abort cleanup to become visible.
    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      expect(run.removals).toEqual([]);
    } finally {
      run.finishDaemon.resolve();
    }
    expect(await run.settled).toBeInstanceOf(Error);
    expect(run.containers.size).toBe(0);
    expect(run.volumes.size).toBe(0);
    expect(run.images.size).toBe(0);
    expect(transport.remember).not.toHaveBeenCalled();
  },
);

test.each(["create", "commit"] as const)(
  "ambiguous %s failure retains exact durable reconciliation reservations",
  async (stage) => {
    const run = await setup(stage, true);
    expect(await run.settled).toBeInstanceOf(Error);
    expect(transport.remember).toHaveBeenCalledWith(
      expect.objectContaining({
        context: "synthetic",
        daemonOutcomeUnknown: true,
        containers: expect.arrayContaining([
          expect.stringMatching(/^cue-code-/),
        ]),
        images:
          stage === "commit"
            ? expect.arrayContaining([
                expect.stringMatching(/^cue-code-prepared:/),
              ])
            : [],
      }),
    );
    // A late side effect is deliberately not misreported as proven clean.
    run.finishDaemon.resolve();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(stage === "create" ? run.containers.size : run.images.size).toBe(1);
  },
);
