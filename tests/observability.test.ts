import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  observed,
  redactTelemetry,
  recordWorkflowFailure,
  shutdownObservability,
  initializeObservability,
  flushObservability,
  readLocalTelemetry,
  annotateTelemetry,
  currentTraceId,
  instrumentModel,
} from "../lib/observability";

describe("Cue local telemetry preserves workflow behavior and privacy", () => {
  const network = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubEnv("CUE_TEST_PRIVATE_KEY", "test-credential-never-exported");
    vi.stubEnv("CUE_TELEMETRY_LOCAL", "1");
    vi.stubGlobal("fetch", network);
    network.mockReset();
  });
  afterEach(async () => {
    expect(network).not.toHaveBeenCalled();
    await shutdownObservability();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("redacts credentials, JSON attributes, email, images, and recordings while preserving usage", () => {
    const envelope = redactTelemetry({
      attributes: {
        "input.value": JSON.stringify({
          email: "customer@example.com",
          secret: "hidden",
          inlineData: { data: "raw recording" },
          image_url: { url: "data:image/png;base64,aGVsbG8=" },
        }),
        "output.value": JSON.stringify({
          audioContent: "raw audio",
          answer: "Bearer private-token test-credential-never-exported",
        }),
        "gen_ai.usage.input_tokens": 42,
        "gen_ai.usage.output_tokens": 7,
      },
    });
    const serialized = JSON.stringify(envelope);
    for (const privateText of [
      "customer@example.com",
      "hidden",
      "raw recording",
      "raw audio",
      "private-token",
      "test-credential-never-exported",
      "aGVsbG8=",
    ])
      expect(serialized).not.toContain(privateText);
    expect(envelope).toMatchObject({
      attributes: {
        "gen_ai.usage.input_tokens": 42,
        "gen_ai.usage.output_tokens": 7,
      },
    });
  });

  it("runs concurrent requests once with separate local roots", async () => {
    const operation = vi.fn(async (id: number) => id * 2);
    const run = observed("Support", operation);
    expect(await Promise.all([run(1), run(2)])).toEqual([2, 4]);
    expect(operation).toHaveBeenCalledTimes(2);
    const records = readLocalTelemetry();
    expect(records.map((record) => record.kind)).toEqual([
      "WORKFLOW",
      "WORKFLOW",
    ]);
    expect(new Set(records.map((record) => record.traceId)).size).toBe(2);
    expect(
      records.every((record) => /^[a-f0-9]{32}$/.test(record.traceId)),
    ).toBe(true);
  });

  it("allows metadata-only local output while returning the complete result", async () => {
    const raw = {
      data: { unexpectedPersonalField: "private detail" },
      credits: 2,
    };
    const result = await observed("Company API", async () => raw, {
      output: (value) => ({ usedCredits: value.credits }),
    })();
    expect(result).toBe(raw);
    expect(readLocalTelemetry()[0].output).toEqual({ usedCredits: 2 });
    expect(JSON.stringify(readLocalTelemetry())).not.toContain(
      "private detail",
    );
  });

  it("keeps nested agent work under one local workflow ID", async () => {
    const child = observed("Classification", async () => currentTraceId());
    const root = observed("Triage", async () => child());
    const traceId = await root();
    const records = readLocalTelemetry();
    expect(records.map(({ name, kind }) => ({ name, kind }))).toEqual([
      { name: "Triage", kind: "WORKFLOW" },
      { name: "Classification", kind: "AGENT" },
    ]);
    expect(records[0].traceId).toBe(traceId);
    expect(records[1].traceId).toBe(traceId);
    expect(records[1].parentSpanId).toBe(records[0].spanId);
    expect(records[1].spanId).not.toBe(records[0].spanId);
  });

  it("returns original objects and rethrows original errors without retrying effects", async () => {
    const value = { saved: true };
    expect(await observed("Save", async () => value)()).toBe(value);
    const failure = new Error("original failure");
    const operation = vi.fn(async () => {
      throw failure;
    });
    await expect(observed("Failed save", operation)()).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(readLocalTelemetry()[1].status).toEqual({
      kind: "failed",
      message: "original failure",
    });
  });

  it("records supervisor failures even when the job API returns normally", async () => {
    await observed("Investigation", async () => {
      recordWorkflowFailure(new Error("independent tests failed"));
    })();
    expect(readLocalTelemetry()[0]).toMatchObject({
      status: { kind: "failed", message: "independent tests failed" },
      output: { status: "failed", error: "independent tests failed" },
    });
  });

  it("retains provider, model, tokens and request evidence without capturing payloads by default", async () => {
    vi.stubEnv("CUE_TELEMETRY_LOCAL", "");
    expect(await initializeObservability()).toBe(true);
    const result = await observed(
      "Model request",
      async (_privateInput: string) => {
        annotateTelemetry({
          provider: "meta",
          model: "muse-spark-1.3",
          inputTokens: 42,
          outputTokens: 7,
          requestId: "provider-request-1",
          apiKey: "test-credential-never-exported",
        });
        return "private model output";
      },
    )("private customer message");
    expect(result).toBe("private model output");
    const record = readLocalTelemetry()[0];
    expect(record.attributes).toMatchObject({
      provider: "meta",
      model: "muse-spark-1.3",
      inputTokens: 42,
      outputTokens: 7,
      requestId: "provider-request-1",
      apiKey: "[redacted]",
    });
    expect(record).not.toHaveProperty("input");
    expect(record).not.toHaveProperty("output");
    expect(JSON.stringify(record)).not.toContain("private customer message");
    expect(JSON.stringify(record)).not.toContain("private model output");
  });

  it("bounds local memory and returns isolated diagnostic snapshots", async () => {
    const run = observed("Bounded record", async (index: number) => {
      annotateTelemetry({ index });
      return index;
    });
    for (let index = 0; index < 150; index++) await run(index);
    const records = readLocalTelemetry();
    expect(records).toHaveLength(128);
    expect(records[0].attributes.index).toBe(22);
    expect(records[127].attributes.index).toBe(149);
    records[0].attributes.index = -1;
    expect(readLocalTelemetry()[0].attributes.index).toBe(22);
  });

  it("does not let a diagnostic projection failure change the operation", async () => {
    const operation = vi.fn(async () => 9);
    const run = observed("Projection", operation, {
      input: () => {
        throw new Error("projection failed");
      },
    });
    expect(await run()).toBe(9);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(readLocalTelemetry()[0].input).toEqual({ unavailable: true });
  });

  it("keeps legacy SDK instrumentation and flush exports local", async () => {
    const sdk = { provider: "google" };
    expect(instrumentModel(sdk, false)).toBe(sdk);
    expect(instrumentModel(sdk, true)).toBe(sdk);
    expect(await flushObservability()).toBe(true);
    await observed("Local record", async () => 1)();
    expect(readLocalTelemetry()).toHaveLength(1);
    await shutdownObservability();
    expect(readLocalTelemetry()).toEqual([]);
    expect(await observed("Next record", async () => 2)()).toBe(2);
  });
});
