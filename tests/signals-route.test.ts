import { beforeEach, describe, expect, test, vi } from "vitest";

const state = vi.hoisted(() => {
  return {
    store: {
      query: vi.fn(),
      mutation: vi.fn(),
    },
    operator: vi.fn(),
    analyze: vi.fn(),
  };
});
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => state.store,
  secret: () => "trusted-test-secret",
}));
vi.mock("../lib/access", () => ({
  operator: state.operator,
  sameOrigin: () => {},
}));
vi.mock("../lib/app-pack", () => ({
  listPacks: async () => [{ appId: "cue_app_test", name: "LatchGrid", status: "active" }],
}));
vi.mock("../lib/signals", () => ({
  analyzeSignalPosts: state.analyze,
  SignalsGenerationError: class SignalsGenerationError extends Error {
    constructor(
      readonly receipt: unknown,
      readonly stage: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

import { GET, POST } from "../app/api/signals/route";
import { SignalsGenerationError } from "../lib/signals";

const batchId = "b" + "0".repeat(31);
const fingerprint = "a1b2c3d4e5f60718";
const batch = {
  _id: batchId,
  appId: "cue_app_test",
  requestKey: "fixture-v1",
  creator: "Avi",
  provenance: { kind: "synthetic-fixture", fixture: "f", version: "v1" },
  posts: [{ id: "p01", author: "A", text: "Something broke twice." }],
  inputFingerprint: fingerprint,
  state: "ready",
  attempts: [],
  promoted: [],
};
const operator = { id: "u1", role: "owner", name: "Avi", email: "a@b.c" };
const request = (body: unknown) =>
  new Request("http://localhost/api/signals", {
    method: "POST",
    headers: { origin: "http://localhost", "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
const receipt = {
  provider: "meta" as const,
  model: "muse-spark-1.3",
  requestedModel: "muse-spark-1.3",
  inputTokens: 10,
  outputTokens: 5,
  durationMs: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  state.operator.mockResolvedValue(operator);
});

describe("signals HTTP boundary", () => {
  test("anonymous reads are refused", async () => {
    state.operator.mockRejectedValue(new Error("Sign in to Cue first"));
    const response = await GET(
      new Request("http://localhost/api/signals?appId=cue_app_test") as never,
    );
    expect(response.status).toBe(401);
  });

  test("a support role cannot import, analyze, or promote", async () => {
    state.operator.mockResolvedValue({ ...operator, role: "support" });
    const response = await POST(
      request({ action: "import", appId: "cue_app_test", requestKey: "k", provenance: { kind: "operator-capture", note: "note" }, posts: batch.posts }),
    );
    const body = await response.json();
    expect(body.error).toContain("Support role cannot perform spec actions");
    expect(state.store.mutation).not.toHaveBeenCalled();
  });

  test("analyze claims, calls the model once outside the database, and completes with the receipt", async () => {
    state.store.query.mockResolvedValue(batch);
    state.store.mutation
      .mockResolvedValueOnce({ token: "tok" + "0".repeat(29), attemptNumber: 1 })
      .mockResolvedValueOnce({ outcome: "completed" });
    state.analyze.mockResolvedValueOnce({
      analysis: {
        dispositions: [],
        clusters: [],
        stats: {},
      },
      receipt,
      promptVersion: "signals-v1",
    });
    const response = await POST(
      request({ action: "analyze", batchId, expectedFingerprint: fingerprint }),
    );
    const body = await response.json();
    expect(body).toEqual({ state: "analyzed", attemptNumber: 1 });
    const complete = state.store.mutation.mock.calls[1][1];
    expect(complete).toMatchObject({ token: "tok" + "0".repeat(29), receipt });
    expect(complete.output).toEqual({ dispositions: [], clusters: [] });
  });

  test("a committed persistence rejection reports failed without failing the cleared claim again", async () => {
    state.store.query.mockResolvedValue(batch);
    state.store.mutation
      .mockResolvedValueOnce({ token: "tok" + "0".repeat(29), attemptNumber: 1 })
      .mockResolvedValueOnce({ outcome: "rejected", error: "Model output rejected" });
    state.analyze.mockResolvedValueOnce({
      analysis: { dispositions: [], clusters: [], stats: {} },
      receipt,
      promptVersion: "signals-v1",
    });
    const response = await POST(request({ action: "analyze", batchId, expectedFingerprint: fingerprint }));
    expect(await response.json()).toEqual({
      state: "failed", attemptNumber: 1, error: "Model output rejected",
    });
    expect(state.store.mutation).toHaveBeenCalledTimes(2);
  });

  test("an unexpected completion error keeps the paid receipt when recording failure", async () => {
    state.store.query.mockResolvedValue(batch);
    state.store.mutation
      .mockResolvedValueOnce({ token: "tok" + "0".repeat(29), attemptNumber: 1 })
      .mockRejectedValueOnce(new Error("Completion unavailable"))
      .mockResolvedValueOnce(null);
    state.analyze.mockResolvedValueOnce({
      analysis: { dispositions: [], clusters: [], stats: {} }, receipt, promptVersion: "signals-v1",
    });
    const response = await POST(request({ action: "analyze", batchId, expectedFingerprint: fingerprint }));
    expect(await response.json()).toMatchObject({ state: "failed", error: "Completion unavailable" });
    expect(state.store.mutation.mock.calls[2][1]).toMatchObject({ receipt, error: "Completion unavailable" });
  });

  test("a failed analysis is recorded with its paid receipt and reported honestly", async () => {
    state.store.query.mockResolvedValue(batch);
    state.store.mutation
      .mockResolvedValueOnce({ token: "tok" + "0".repeat(29), attemptNumber: 1 })
      .mockResolvedValueOnce({ outcome: "completed" });
    state.analyze.mockRejectedValueOnce(
      new SignalsGenerationError(receipt, "json", "Model output was not valid JSON"),
    );
    const response = await POST(
      request({ action: "analyze", batchId, expectedFingerprint: fingerprint }),
    );
    const body = await response.json();
    expect(body.state).toBe("failed");
    expect(body.error).toContain("not valid JSON");
    const fail = state.store.mutation.mock.calls[1][1];
    expect(fail).toMatchObject({
      token: "tok" + "0".repeat(29),
      error: "Model output was not valid JSON",
      receipt,
    });
  });

  test("a fingerprint mismatch never reaches the model call", async () => {
    state.store.query.mockResolvedValue(batch);
    // The claim mutation itself verifies the saved fingerprint; the route
    // must propagate that refusal instead of calling the model.
    state.store.mutation.mockRejectedValueOnce(
      new Error("Saved input changed since this page was loaded"),
    );
    const response = await POST(
      request({ action: "analyze", batchId, expectedFingerprint: "0000000000000000" }),
    );
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.error).toContain("Saved input changed");
    expect(state.analyze).not.toHaveBeenCalled();
  });

  test("promote passes the exact revision and cluster through", async () => {
    state.store.mutation.mockResolvedValueOnce("issue-1");
    const response = await POST(
      request({ action: "promote", batchId, expectedAnalysisRevision: 1, clusterId: "c-1" }),
    );
    const body = await response.json();
    expect(body).toEqual({ issueId: "issue-1" });
    expect(state.store.mutation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        batchId,
        expectedAnalysisRevision: 1,
        clusterId: "c-1",
        actor: "Avi",
      }),
    );
  });
});

test("native import forwards selected IDs and current app only, and never analyzes during import", async () => {
  state.store.mutation.mockResolvedValueOnce({ batchId, created: true });
  const caseIds = ["c".repeat(32)];
  const response = await POST(request({ action: "import-native", appId: "cue_app_test", requestKey: "native", caseIds }));
  expect(response.status).toBe(200);
  expect(state.store.mutation).toHaveBeenCalledWith(expect.anything(), {
    secret: "trusted-test-secret", appId: "cue_app_test", requestKey: "native", caseIds, actor: "Avi",
  });
  expect(state.analyze).not.toHaveBeenCalled();
});

test("native import rejects forged bodies, author identities and provenance claims", async () => {
  for (const forged of [{ posts: batch.posts }, { providerAuthorId: "123" }, { provenance: { kind: "native-x" } }]) {
    const response = await POST(request({ action: "import-native", appId: "cue_app_test", requestKey: "native", caseIds: ["c".repeat(32)], ...forged }));
    expect(response.status).toBe(400);
  }
  expect(state.store.mutation).not.toHaveBeenCalled();
  expect(state.analyze).not.toHaveBeenCalled();
});

test("manual import preserves sourceRef and rejects native provenance or provider author IDs", async () => {
  const sourceRef = "https://x.com/user/status/123?exact=1";
  state.store.mutation.mockResolvedValueOnce({ batchId, created: true });
  const payload = { action: "import", appId: "cue_app_test", requestKey: "capture", provenance: { kind: "operator-capture", note: "Manually captured" }, posts: [{ ...batch.posts[0], sourceRef }] };
  expect((await POST(request(payload))).status).toBe(200);
  expect(state.store.mutation.mock.calls[0][1].posts[0].sourceRef).toBe(sourceRef);
  state.store.mutation.mockClear();
  expect((await POST(request({ ...payload, provenance: { kind: "native-x" } }))).status).toBe(400);
  expect((await POST(request({ ...payload, posts: [{ ...payload.posts[0], providerAuthorId: "123" }] }))).status).toBe(400);
  expect(state.store.mutation).not.toHaveBeenCalled();
});

test("public export review forwards the exact immutable fingerprint and analysis revision", async () => {
  state.store.mutation.mockResolvedValueOnce(null);
  expect((await POST(request({ action: "review-export", batchId, expectedFingerprint: fingerprint, expectedAnalysisRevision: 2 }))).status).toBe(200);
  expect(state.store.mutation).toHaveBeenCalledWith(expect.anything(), {
    secret: "trusted-test-secret", batchId, expectedFingerprint: fingerprint, expectedAnalysisRevision: 2, actor: "Avi",
  });
  expect(state.analyze).not.toHaveBeenCalled();
});
