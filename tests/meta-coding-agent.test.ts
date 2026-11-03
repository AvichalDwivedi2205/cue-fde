import { afterEach, expect, test, vi } from "vitest";
import { runMetaCodingAgent } from "../lib/meta-coding-agent";
import type {
  ResponseFunctionToolCall,
  ResponseInput,
} from "openai/resources/responses/responses";
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
function call(
  name: string,
  id: string,
  args: object,
): ResponseFunctionToolCall {
  return {
    type: "function_call",
    call_id: id,
    name,
    arguments: JSON.stringify(args),
  };
}
const edit = () =>
  call("replace_text", "edit", {
    path: "src/value.ts",
    oldText: "value = 1",
    newText: "value = 2",
  });
function outputs(input: ResponseInput) {
  return input.filter((item) => item.type === "function_call_output");
}
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

test("baseline evidence is actual, bounded and visible before the first model call", async () => {
  const input = setup();
  const baseline = {
    passed: false,
    output:
      "unretained-head\n" +
      "新".repeat(8000) +
      "\nexpected synthetic assertion",
  };
  transport.create
    .mockResolvedValueOnce(response([edit()]))
    .mockResolvedValueOnce(response([], "Changed synthetic value."));
  await runMetaCodingAgent({ ...input, baselineEvidence: baseline });
  const request: { input: ResponseInput } = transport.create.mock.calls[0][0];
  const note = request.input[1];
  expect("content" in note && typeof note.content === "string").toBe(true);
  if (!("content" in note) || typeof note.content !== "string")
    throw new Error("Missing baseline");
  expect(note.content).toContain("already ran");
  const result = JSON.parse(note.content.slice(note.content.indexOf("\n") + 1));
  expect(result).toMatchObject({
    passed: false,
    outputTruncated: true,
    outputBytes: Buffer.byteLength(baseline.output),
  });
  expect(Buffer.byteLength(result.output)).toBeLessThanOrEqual(8 * 1024);
  expect(result.output).toContain("expected synthetic assertion");
  expect(result.output).not.toContain("unretained-head");
  expect(result.output).not.toContain("\ufffd");
  expect(input.workspace.check).not.toHaveBeenCalled();
});

test("a dependency read gets an actionable tracked-source-only error", async () => {
  const input = setup();
  transport.create
    .mockResolvedValueOnce(
      response([
        call("read_file", "dependency", {
          path: "node_modules/synthetic/index.d.ts",
        }),
      ]),
    )
    .mockResolvedValueOnce(response([edit()]))
    .mockResolvedValueOnce(response([], "Changed synthetic value."));
  await runMetaCodingAgent(input);
  const request: { input: ResponseInput } = transport.create.mock.calls[1][0];
  expect(JSON.parse(String(outputs(request.input)[0].output)).error).toContain(
    "node_modules and arbitrary sandbox files are unavailable",
  );
});

test("cancellation after a response prevents its edit and further requests", async () => {
  const input = setup(),
    controller = new AbortController();
  transport.create.mockImplementationOnce(async () => {
    controller.abort();
    return response([edit()]);
  });
  await expect(
    runMetaCodingAgent({ ...input, signal: controller.signal }),
  ).rejects.toThrow();
  expect(input.workspace.write).not.toHaveBeenCalled();
  expect(transport.create).toHaveBeenCalledOnce();
});

test("coding requests override the client timeout and retain the job cancellation signal", async () => {
  const input = setup();
  transport.create
    .mockResolvedValueOnce(response([edit()]))
    .mockResolvedValueOnce(response([], "Changed synthetic value."));
  await runMetaCodingAgent(input);
  expect(transport.create).toHaveBeenCalledTimes(2);
  for (const [, options] of transport.create.mock.calls) {
    expect(options.timeout).toBe(120_000);
    expect(options.signal).toBe(input.signal);
  }
});

test("stateless Responses retain complete tool history and opaque reasoning without publishing it", async () => {
  const input = setup();
  const requests: ResponseInput[] = [];
  const reasoning = {
    type: "reasoning",
    id: "reasoning",
    summary: [],
    encrypted_content: "synthetic-opaque-reasoning",
  };
  const read = call("read_file", "read", { path: "src/value.ts" });
  const replies = [
    response([reasoning, read]),
    response([edit()]),
    response([], "Changed synthetic value."),
  ];
  transport.create.mockImplementation(
    async ({ input }: { input: ResponseInput }) => {
      requests.push(structuredClone(input));
      return replies.shift();
    },
  );
  await runMetaCodingAgent(input);
  for (const [request] of transport.create.mock.calls) {
    expect(request.store).toBe(false);
    expect(request.include).toEqual(["reasoning.encrypted_content"]);
  }
  expect(requests).toHaveLength(3);
  expect(requests[1]).toContainEqual(reasoning);
  expect(requests[2]).toContainEqual(reasoning);
  expect(requests[2]).toContainEqual(read);
  expect(requests[2][0]).toEqual({ role: "user", content: input.prompt });
  expect(
    outputs(requests[2]).find((item) => item.call_id === "read")?.output,
  ).toBe(
    JSON.stringify({
      path: "src/value.ts",
      totalLines: 1,
      text: "1: export const value = 1;",
    }),
  );
  expect(
    outputs(requests[2]).find((item) => item.call_id === "edit")?.output,
  ).toBe(JSON.stringify({ path: "src/value.ts", bytes: 23 }));
  for (const request of requests)
    for (const item of request.filter((item) => item.type === "function_call"))
      expect(
        outputs(request).filter((out) => out.call_id === item.call_id),
      ).toHaveLength(1);
  expect(JSON.stringify(input.event.mock.calls)).not.toContain(
    reasoning.encrypted_content,
  );
  expect(JSON.stringify(input.receipt.mock.calls)).not.toContain(
    reasoning.encrypted_content,
  );
});
