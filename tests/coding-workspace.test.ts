import { afterEach, describe, expect, test } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { engineeringInput } from "../lib/app-pack-schema";
import {
  applySourceEdits,
  assertEditable,
  installCommand,
  sourcePath,
  validateEdits,
  type SourceSnapshot,
} from "../lib/coding-workspace";
import { createCodingTools } from "../lib/meta-coding-agent";

const policy = {
  appId: "synthetic",
  repository: "owner/example",
  baseBranch: "main",
  packageDirectory: "packages/web",
  packageManager: "bun" as const,
  allowedPaths: ["packages/web/src/", "packages/web/tests/"],
  testCommands: [{ program: "node" as const, args: ["check.mjs"] }],
};
const source = (): SourceSnapshot =>
  new Map([
    ["packages/web/package.json", { bytes: Buffer.from("{}"), mode: 0o644 }],
    ["packages/web/bun.lock", { bytes: Buffer.from("locked"), mode: 0o644 }],
    [
      "packages/web/src/value.ts",
      { bytes: Buffer.from("export const value = 1;\n"), mode: 0o644 },
    ],
    [
      "packages/web/tests/existing.test.ts",
      { bytes: Buffer.from("protected"), mode: 0o644 },
    ],
  ]);
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map((p) => fs.rm(p, { force: true, recursive: true })),
  );
});

describe("frozen nested repository execution", () => {
  test("selects only fixed frozen install recipes and requires matching tracked lockfiles", () => {
    expect(installCommand(policy, source())).toEqual([
      "bun",
      "install",
      "--frozen-lockfile",
      "--ignore-scripts",
    ]);
    expect(() =>
      installCommand({ ...policy, packageManager: "npm" }, source()),
    ).toThrow("package-lock.json");
    expect(
      installCommand({ ...policy, packageManager: "none" }, source()),
    ).toBeNull();
    expect(
      installCommand({ ...policy, packageManager: undefined }, source()),
    ).toBeNull();
    const npm = source();
    npm.set("packages/web/package-lock.json", {
      bytes: Buffer.from("{}"),
      mode: 0o644,
    });
    expect(
      installCommand({ ...policy, packageManager: undefined }, npm)?.slice(
        0,
        2,
      ),
    ).toEqual(["npm", "ci"]);
  });
  test.each([
    "../outside",
    "/tmp/outside",
    "packages/../web",
    "a\\b",
    "a//b",
    "a/./b",
    "a/.git",
    "a\nb",
  ])("rejects invalid package directory %s", (packageDirectory) => {
    expect(() =>
      engineeringInput.parse({ ...policy, packageDirectory }),
    ).toThrow();
  });
  test("default root directory is valid and command-like package managers are rejected", () => {
    expect(
      engineeringInput.parse({ ...policy, packageDirectory: "." })
        .packageDirectory,
    ).toBe(".");
    expect(() =>
      engineeringInput.parse({
        ...policy,
        packageManager: "bun install && curl attacker",
      }),
    ).toThrow();
  });
  test.each([
    "../outside",
    "/tmp/outside",
    ".git/config",
    "src/.env.local",
    "src/a\nb",
    "node_modules/bin",
    "-argument",
  ])("rejects unsafe source path %s", (file) => {
    expect(() => sourcePath(file)).toThrow();
  });
  test("preserves existing tests and permits meaningful new test files", () => {
    expect(() =>
      assertEditable("packages/web/tests/existing.test.ts", source(), policy),
    ).toThrow("policy");
    expect(() =>
      assertEditable("packages/web/tests/new.test.ts", source(), policy),
    ).not.toThrow();
    expect(() => validateEdits(new Map(), source(), policy)).toThrow();
    expect(() =>
      validateEdits(
        new Map([["packages/web/src/value.ts", "x".repeat(600001)]]),
        source(),
        policy,
      ),
    ).toThrow("budget");
  });
  test("scoped edits use exact existing content and fixed check indexes", async () => {
    const written: [string, string | null][] = [];
    const checked: (number | undefined)[] = [];
    const tools = createCodingTools({
      source: source(),
      policy,
      signal: new AbortController().signal,
      event: async () => {},
      workspace: {
        id: "synthetic",
        write: async (p, c) => {
          written.push([p, c]);
        },
        check: async (index) => {
          checked.push(index);
          return { passed: true, output: "checked" };
        },
      },
    });
    await tools.call(
      "replace_text",
      JSON.stringify({
        path: "packages/web/src/value.ts",
        oldText: "value = 1",
        newText: "value = 2",
      }),
    );
    expect(written).toEqual([
      ["packages/web/src/value.ts", "export const value = 2;\n"],
    ]);
    await expect(
      tools.call(
        "replace_text",
        JSON.stringify({
          path: "packages/web/src/value.ts",
          oldText: "missing",
          newText: "anything",
        }),
      ),
    ).rejects.toThrow("exactly one");
    await expect(
      tools.call(
        "write_file",
        JSON.stringify({
          path: "packages/web/tests/existing.test.ts",
          content: "weakened",
        }),
      ),
    ).rejects.toThrow("policy");
    await expect(tools.call("run_check", '{"index":9}')).rejects.toThrow();
    await tools.call("run_check", '{"index":0}');
    expect(checked).toEqual([0]);
    await expect(tools.call("shell", '{"command":"echo x"}')).rejects.toThrow(
      "Unknown",
    );
  });
  test("canceled agents cannot execute tools", async () => {
    const controller = new AbortController();
    controller.abort();
    const tools = createCodingTools({
      source: source(),
      policy,
      signal: controller.signal,
      event: async () => {},
      workspace: {
        id: "synthetic",
        write: async () => {},
        check: async () => ({ passed: true, output: "" }),
      },
    });
    await expect(tools.call("list_files", "{}")).rejects.toThrow();
  });
  test("imports validated bytes as regular files and rejects symlink parents before writing", async () => {
    const repo = await fs.mkdtemp(path.join(os.tmpdir(), "cue-patch-test-"));
    temporary.push(repo);
    await fs.mkdir(path.join(repo, "packages/web/src"), { recursive: true });
    await applySourceEdits(
      repo,
      new Map([["packages/web/src/value.ts", "changed"]]),
      source(),
      policy,
    );
    expect(
      await fs.readFile(path.join(repo, "packages/web/src/value.ts"), "utf8"),
    ).toBe("changed");
    const outside = await fs.mkdtemp(
      path.join(os.tmpdir(), "cue-outside-test-"),
    );
    temporary.push(outside);
    await fs.symlink(outside, path.join(repo, "packages/web/src/link"));
    await expect(
      applySourceEdits(
        repo,
        new Map([["packages/web/src/link/escaped.ts", "bad"]]),
        source(),
        policy,
      ),
    ).rejects.toThrow("directory");
    expect(await fs.readdir(outside)).toEqual([]);
  });
});
