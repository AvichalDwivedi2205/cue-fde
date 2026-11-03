import { afterEach, expect, test, vi } from "vitest";
import { runMetaCodingAgent } from "../lib/meta-coding-agent";
const transport = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("../lib/meta", async (importActual) => ({
  ...(await importActual<typeof import("../lib/meta")>()),
  metaClient: () => ({ responses: { create: transport.create } }),
}));
afterEach(() => {
  vi.unstubAllEnvs();
  transport.create.mockReset();
});
const policy = {
  appId: "synthetic",
  repository: "owner/example",
  baseBranch: "main",
  allowedPaths: ["src/"],
  testCommands: [{ program: "node" as const, args: ["check.mjs"] }],
};
const setup = () => ({
  prompt: "Change the synthetic value",
  policy,
  source: new Map([
    [
      "src/value.ts",
      { bytes: Buffer.from("export const value = 1;"), mode: 0o644 },
    ],
  ]),
  workspace: {
    id: "synthetic",
    write: vi.fn(async () => {}),
    check: vi.fn(async () => ({ passed: true, output: "pass" })),
  },
  signal: new AbortController().signal,
  event: vi.fn(async () => {}),
  receipt: vi.fn(async () => {}),
});
const response = (output: unknown[], text = "") => ({
  model: "muse-wonder-1.0",
  status: "completed",
  usage: { input_tokens: 10, output_tokens: 5 },
  output,
  output_text: text,
});
test("Meta implements through validated tools and records exact aggregate model usage", async () => {
  vi.stubEnv("CUE_CODING_MODEL", "muse-wonder-1.0");
  const input = setup();
  transport.create
    .mockResolvedValueOnce(
      response([
        {
          type: "function_call",
          id: "tool_1",
          call_id: "call_1",
          name: "replace_text",
          arguments: JSON.stringify({
            path: "src/value.ts",
            oldText: "value = 1",
            newText: "value = 2",
          }),
        },
      ]),
    )
    .mockResolvedValueOnce(response([], "Changed the synthetic value."));
  const result = await runMetaCodingAgent(input);
  expect(result.edits.get("src/value.ts")).toBe("export const value = 2;");
  expect(result.receipt).toEqual({
    requestedModel: "muse-wonder-1.0",
    model: "muse-wonder-1.0",
    inputTokens: 20,
    outputTokens: 10,
    modelCalls: 2,
  });
  expect(input.workspace.write).toHaveBeenCalledWith(
    "src/value.ts",
    "export const value = 2;",
  );
  const secondRequest = transport.create.mock.calls[1][0];
  expect(secondRequest.input).toContainEqual({
    type: "function_call_output",
    call_id: "call_1",
    output: JSON.stringify({ path: "src/value.ts", bytes: 23 }),
  });
});
test("a wrong actual model cannot count as selected Meta success", async () => {
  const input = setup();
  transport.create.mockResolvedValueOnce({
    ...response([], "done"),
    model: "muse-spark-1.3",
  });
  await expect(runMetaCodingAgent(input)).rejects.toThrow("different model");
  expect(input.receipt).toHaveBeenCalledWith({
    requestedModel: "muse-wonder-1.0",
    model: "muse-spark-1.3",
    inputTokens: 10,
    outputTokens: 5,
    modelCalls: 1,
  });
});
test("missing reported usage cannot become invented zero usage", async () => {
  transport.create.mockResolvedValueOnce({
    model: "muse-wonder-1.0",
    status: "completed",
    output: [],
    output_text: "done",
  });
  await expect(runMetaCodingAgent(setup())).rejects.toThrow();
});
test("a model summary without source changes cannot establish implementation", async () => {
  transport.create.mockResolvedValueOnce(
    response([], "Everything is fixed and deployed."),
  );
  await expect(runMetaCodingAgent(setup())).rejects.toThrow("must change");
});
test("cancellation reaches the Responses request and prevents another tool call", async () => {
  const input = setup(),
    controller = new AbortController();
  controller.abort();
  await expect(
    runMetaCodingAgent({ ...input, signal: controller.signal }),
  ).rejects.toThrow();
  expect(transport.create).not.toHaveBeenCalled();
});
