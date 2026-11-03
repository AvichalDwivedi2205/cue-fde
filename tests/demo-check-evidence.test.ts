import { describe, expect, test } from "vitest";
import { observeRunChecks } from "../lib/demo-check-evidence";

const commands = [
  {
    program: "node",
    args: [
      "node_modules/typescript/bin/tsc",
      "--noEmit",
      "--incremental",
      "false",
    ],
  },
  {
    program: "node",
    args: ["node_modules/vitest/vitest.mjs", "run", "--cache=false"],
  },
  {
    program: "node",
    args: [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--cache=false",
      "--config",
      "vitest.acceptance.config.ts",
    ],
  },
];
const suite = (counts: string, exit = 0) =>
  `node (cwd /private/checkout; exit ${exit})\n\u001b[32mRUN v4.0\u001b[0m\n Test Files 1 passed (1)\n Tests ${counts}\n Start at 12:00:00\n Duration 2.1s\n`;
const output = (acceptance = "8 passed (8)", exit = 0) =>
  `node (cwd /private/checkout; exit 0)\n\n${suite("238 passed (238)")}\n${suite(acceptance, exit)}`;

describe("recorded fixed-command checks", () => {
  test("reads observed failures and successes without hardcoded counts", () => {
    expect(
      observeRunChecks(
        { testCommands: commands },
        output("6 failed | 2 passed (8)", 1),
        output(),
      ),
    ).toEqual({
      baseline: { passed: 2, total: 8 },
      acceptance: { passed: 8, total: 8 },
      typescript: true,
      defaultTests: { passed: 238, total: 238 },
    });
    expect(
      observeRunChecks(
        { testCommands: commands },
        null,
        output("1 failed | 3 passed (4)", 1),
      ).acceptance,
    ).toEqual({ passed: 3, total: 4 });
  });
  test("missing policy, prose, truncated, spoofed, or inconsistent output stays unknown", () => {
    const unknown = {
      baseline: null,
      acceptance: null,
      typescript: null,
      defaultTests: null,
    };
    expect(observeRunChecks(undefined, output(), output())).toEqual(unknown);
    expect(
      observeRunChecks({ testCommands: commands }, "all pass", "all pass"),
    ).toEqual(unknown);
    expect(
      observeRunChecks({ testCommands: commands }, null, output().slice(20)),
    ).toEqual(unknown);
    expect(
      observeRunChecks(
        { testCommands: commands },
        null,
        output().replace(/ Duration 2.1s\n$/, ""),
      ).acceptance,
    ).toBeNull();
    expect(
      observeRunChecks(
        { testCommands: commands },
        null,
        output().replace("8 passed (8)", "8 passed (9)"),
      ).acceptance,
    ).toBeNull();
    expect(
      observeRunChecks(
        { testCommands: commands },
        null,
        output().replace("8 passed (8)", "8 passed (8)\n Tests 20 passed (20)"),
      ).acceptance,
    ).toBeNull();
    expect(
      observeRunChecks(
        { testCommands: commands },
        null,
        output("8 passed (8)", 1),
      ).acceptance,
    ).toBeNull();
    expect(
      observeRunChecks(
        { testCommands: commands.map((c) => ({ ...c, args: ["fake.mjs"] })) },
        output(),
        output(),
      ),
    ).toEqual(unknown);
  });
});
