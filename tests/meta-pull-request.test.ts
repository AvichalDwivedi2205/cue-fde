import { afterEach, expect, test, vi } from "vitest";
import { implementMetaPullRequest } from "../lib/meta-pull-request";
import type { withIsolatedCoding } from "../lib/coding-workspace";
import type { ResponseInput } from "openai/resources/responses/responses";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  read: vi.fn(),
  modal: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("../lib/meta", async (importActual) => ({
  ...(await importActual<typeof import("../lib/meta")>()),
  getMetaConnection: () => ({
    apiKey: "synthetic",
    baseURL: "https://example.invalid",
  }),
  metaClient: () => ({ responses: { create: mocks.create } }),
}));
vi.mock("../lib/coding-workspace", async (importActual) => ({
  ...(await importActual<typeof import("../lib/coding-workspace")>()),
  readSourceSnapshot: mocks.read,
  withIsolatedCoding: mocks.modal,
  applySourceEdits: mocks.apply,
}));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
function setup(verificationPassed = true) {
  vi.stubEnv("CUE_CODING_MODEL", "muse-wonder-1.0");
  const source = new Map([
    [
      "src/value.ts",
      { bytes: Buffer.from("export const value = 1;"), mode: 0o644 },
    ],
  ]);
  const baseline = {
    passed: false,
    output: "Synthetic baseline: expected 2, received 1",
  };
  const before = {
    id: "baseline",
    write: vi.fn(),
    check: vi.fn(async () => baseline),
  };
  const coding = { id: "implementation", write: vi.fn(), check: vi.fn() };
  const verifier = {
    id: "verification",
    write: vi.fn(),
    check: vi.fn(async () => ({
      passed: verificationPassed,
      output: verificationPassed
        ? "Independent check passed"
        : "Independent check failed",
    })),
  };
  const open = vi.fn(
    async (purpose: "baseline" | "implementation" | "verification") => {
      if (purpose === "baseline") return before;
      if (purpose === "implementation") return coding;
      return verifier;
    },
  );
  const close = vi.fn();
  mocks.read.mockResolvedValue(source);
  mocks.modal.mockImplementation(
    async (
      _input: unknown,
      operation: Parameters<typeof withIsolatedCoding>[1],
    ) => operation({ open, close }),
  );
  const response = (output: unknown[], output_text = "") => ({
    model: "muse-wonder-1.0",
    status: "completed",
    usage: { input_tokens: 10, output_tokens: 5 },
    output,
    output_text,
  });
  mocks.create
    .mockResolvedValueOnce(
      response([
        {
          type: "function_call",
          call_id: "edit",
          name: "replace_text",
          arguments: JSON.stringify({
            path: "src/value.ts",
            oldText: "value = 1",
            newText: "value = 2",
          }),
        },
      ]),
    )
    .mockResolvedValueOnce(response([], "Changed synthetic value."));
  const input: Parameters<typeof implementMetaPullRequest>[0] = {
    repo: "/synthetic",
    runId: "synthetic",
    prompt: "Fix synthetic value",
    baseline: "record_only",
    signal: new AbortController().signal,
    policy: {
      appId: "synthetic",
      repository: "owner/synthetic",
      baseBranch: "main",
      allowedPaths: ["src/"],
      testCommands: [{ program: "node", args: ["check.mjs"] }],
    },
    event: vi.fn(),
    receipt: vi.fn(),
    baselineRecorded: vi.fn(),
    selected: vi.fn(),
    sandboxCreated: vi.fn(),
  };
  return { input, source, baseline, before, coding, verifier, open, close };
}

test("actual baseline reaches the first agent request and fresh verification alone permits import", async () => {
  const { input, source, baseline, before, coding, verifier, open, close } =
    setup();
  const result = await implementMetaPullRequest(input);
  const request: { input: ResponseInput } = mocks.create.mock.calls[0][0];
  expect(request.input[0]).toEqual({ role: "user", content: input.prompt });
  expect(JSON.stringify(request.input[1])).toContain(baseline.output);
  expect(before.check).toHaveBeenCalledOnce();
  expect(coding.check).not.toHaveBeenCalled();
  expect(verifier.check).toHaveBeenCalledOnce();
  expect(open.mock.calls.map(([purpose]) => purpose)).toEqual([
    "baseline",
    "implementation",
    "verification",
  ]);
  const edits = new Map([["src/value.ts", "export const value = 2;"]]);
  expect(open).toHaveBeenLastCalledWith("verification", edits);
  expect(close).toHaveBeenCalledWith(before);
  expect(close).toHaveBeenCalledWith(coding);
  expect(close).toHaveBeenCalledWith(verifier);
  expect(mocks.apply).toHaveBeenCalledWith(
    input.repo,
    edits,
    source,
    input.policy,
  );
  expect(input.baselineRecorded).toHaveBeenCalledWith(baseline.output);
  expect(result.before).toBe(baseline.output);
  expect(result.after).toBe("Independent check passed");
});

test("a model edit still cannot import source after failed independent verification", async () => {
  const { input, verifier } = setup(false);
  await expect(implementMetaPullRequest(input)).rejects.toThrow(
    "Independent repository checks failed",
  );
  expect(verifier.check).toHaveBeenCalledOnce();
  expect(mocks.apply).not.toHaveBeenCalled();
});
