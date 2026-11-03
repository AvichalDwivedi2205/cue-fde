import { z } from "zod";

const counts = z
  .object({
    passed: z.number().int().nonnegative(),
    total: z.number().int().positive(),
  })
  .refine((value) => value.passed <= value.total);
export const checkObservationsSchema = z
  .object({
    baseline: counts.nullable(),
    acceptance: counts.nullable(),
    typescript: z.boolean().nullable(),
    defaultTests: counts.nullable(),
  })
  .strict();
export type CheckObservations = z.infer<typeof checkObservationsSchema>;
type Policy = { testCommands: { program: string; args: string[] }[] };
type Block = {
  program: string;
  directory: string;
  exit: number;
  output: string;
};

const TYPESCRIPT = [
  "node_modules/typescript/bin/tsc",
  "--noEmit",
  "--incremental",
  "false",
];
const VITEST = ["node_modules/vitest/vitest.mjs", "run", "--cache=false"];
const ACCEPTANCE = [...VITEST, "--config", "vitest.acceptance.config.ts"];
const same = (left: string[], right: string[]) =>
  JSON.stringify(left) === JSON.stringify(right);
const unknown = (): CheckObservations => ({
  baseline: null,
  acceptance: null,
  typescript: null,
  defaultTests: null,
});

function blocks(
  policy: Policy,
  raw: string | null | undefined,
): Block[] | null {
  if (!raw || !policy.testCommands.length) return null;
  const text = raw.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  const headers = [
    ...text.matchAll(/^(\w+) \(cwd ([^\r\n;]+); exit (-?\d+)\)\r?$/gm),
  ];
  if (
    headers.length !== policy.testCommands.length ||
    text.slice(0, headers[0]?.index).trim()
  )
    return null;
  const result = headers.map((header, index) => ({
    program: header[1],
    directory: header[2],
    exit: Number(header[3]),
    output: text
      .slice(header.index + header[0].length, headers[index + 1]?.index)
      .trim(),
  }));
  if (
    result.some(
      (block, index) =>
        block.program !== policy.testCommands[index].program ||
        block.directory !== result[0].directory ||
        !Number.isSafeInteger(block.exit),
    )
  )
    return null;
  return result;
}

function testCounts(block: Block): CheckObservations["acceptance"] {
  const summaries = [...block.output.matchAll(/^\s*Tests\s+(.+)$/gm)];
  if (
    summaries.length !== 1 ||
    !/^\s*Test Files\s+.+$/m.test(block.output) ||
    !/^\s*Start at\s+.+\n\s*Duration\s+\d[^\n]*$/m.test(block.output)
  )
    return null;
  const summary = summaries[0][1].trim().match(/^(.+)\s+\((\d+)\)$/);
  if (!summary) return null;
  let passed = 0,
    failed = 0,
    sum = 0;
  const statuses = new Set<string>();
  for (const token of summary[1].split(/\s*\|\s*/)) {
    const part = token.match(/^(\d+) (passed|failed|skipped|todo)$/);
    if (!part || statuses.has(part[2])) return null;
    statuses.add(part[2]);
    const count = Number(part[1]);
    if (!Number.isSafeInteger(count)) return null;
    sum += count;
    if (part[2] === "passed") passed = count;
    if (part[2] === "failed") failed = count;
  }
  const total = Number(summary[2]);
  if (
    !Number.isSafeInteger(total) ||
    total <= 0 ||
    sum !== total ||
    (block.exit === 0) !== (failed === 0)
  )
    return null;
  return { passed, total };
}

function observe(policy: Policy, raw: string | null | undefined) {
  const observed = unknown();
  const recorded = blocks(policy, raw);
  if (!recorded) return observed;
  for (const [index, command] of policy.testCommands.entries()) {
    if (command.program !== "node") continue;
    const block = recorded[index];
    const occurrences = policy.testCommands.filter(
      (other) =>
        other.program === command.program && same(other.args, command.args),
    ).length;
    if (occurrences !== 1) continue;
    if (same(command.args, TYPESCRIPT))
      observed.typescript =
        block.exit === 0 ? (block.output === "" ? true : null) : false;
    if (same(command.args, VITEST)) observed.defaultTests = testCounts(block);
    if (same(command.args, ACCEPTANCE)) observed.acceptance = testCounts(block);
  }
  return observed;
}

export function observeRunChecks(
  policy: Policy | undefined,
  before: string | null | undefined,
  after: string | null | undefined,
): CheckObservations {
  if (!policy) return unknown();
  return {
    ...observe(policy, after),
    baseline: observe(policy, before).acceptance,
  };
}

export function summarizeObservedChecks(observations: CheckObservations): {
  beforeSummary: string | null;
  afterSummary: string | null;
} {
  const beforeSummary =
    observations.baseline === null
      ? null
      : `Baseline acceptance tests ${observations.baseline.passed}/${observations.baseline.total} passed.`;
  const parts: string[] = [];
  if (observations.typescript !== null)
    parts.push(`TypeScript ${observations.typescript ? "passed" : "failed"}.`);
  if (observations.defaultTests !== null)
    parts.push(
      `Default tests ${observations.defaultTests.passed}/${observations.defaultTests.total} passed.`,
    );
  if (observations.acceptance !== null)
    parts.push(
      `Acceptance tests ${observations.acceptance.passed}/${observations.acceptance.total} passed.`,
    );
  return { beforeSummary, afterSummary: parts.length ? parts.join(" ") : null };
}
