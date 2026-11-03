import { afterEach, beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  mutation: vi.fn(),
  classify: vi.fn(),
}));
vi.mock("../lib/server-store", () => ({
  api: { cue: { snapshot: "snapshot", triage: "triage" } },
  db: () => ({ query: mocks.query, mutation: mocks.mutation }),
  secret: () => "test-only",
}));
vi.mock("../lib/gemini", () => ({
  geminiReady: () => true,
  classifyReportWithGeneration: mocks.classify,
}));
vi.mock("../lib/google-client", () => ({ geminiReady: () => true }));
import { classifySavedReport } from "../lib/triage";
import type { Id } from "../convex/_generated/dataModel";

const generation = {
  provider: "meta",
  model: "muse-spark-1.3",
  requestedModel: "muse-spark-1.3",
  inputTokens: 80,
  outputTokens: 24,
  durationMs: 52,
  requestId: "synthetic-request",
  traceId: "synthetic-trace",
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CUE_AGENT_MODEL", "muse-spark-1.3");
  vi.stubEnv("META_API_KEY", "synthetic-test-key");
});
afterEach(() => vi.unstubAllEnvs());
function setup(appId?: string, confidence = 0.99) {
  const prefix = appId ? appId + ":" : "";
  const current = {
    _id: "new-issue",
    appId,
    fingerprint: prefix + "report:123",
    kind: "feature",
  };
  const matched = {
    _id: "same-need",
    appId,
    fingerprint: prefix + "report:456",
    kind: "feature",
  };
  const foreign = {
    _id: "foreign",
    appId: "other-app",
    fingerprint: "other-app:report:789",
    kind: "feature",
  };
  mocks.query.mockResolvedValue({
    cases: [
      {
        _id: "case-1",
        appId,
        issueId: current._id,
        title: "Larger journal text",
        body: "Please add text size settings",
      },
    ],
    issues: [current, matched, foreign],
    messages: [],
  });
  mocks.classify.mockResolvedValue({
    generation,
    result: {
      matchedIssueId: matched._id,
      kind: "feature",
      priority: "P3",
      tags: ["readability"],
      reason: "Same text-size need",
      confidence,
    },
  });
}
test.each([undefined, "connected-app"])(
  "equivalent requests can merge inside app %s without including themselves",
  async (appId) => {
    setup(appId);
    await classifySavedReport("case-1" as Id<"cases">);
    const context = mocks.classify.mock.calls[0][0];
    expect(context.candidates.map((c: { id: string }) => c.id)).toEqual([
      "same-need",
    ]);
    expect(mocks.mutation.mock.calls[0][1].issueId).toBe("same-need");
  },
);
test("uncertain equivalence remains unmerged", async () => {
  setup("connected-app", 0.9);
  await classifySavedReport("case-1" as Id<"cases">);
  expect(mocks.mutation.mock.calls[0][1].issueId).toBeUndefined();
});
test("a model-supplied foreign ID never routes the report across apps", async () => {
  setup("connected-app");
  mocks.classify.mockResolvedValue({
    generation,
    result: {
      matchedIssueId: "foreign",
      kind: "feature",
      priority: "P3",
      tags: [],
      reason: "Untrusted match",
      confidence: 1,
    },
  });
  await classifySavedReport("case-1" as Id<"cases">);
  expect(mocks.mutation.mock.calls[0][1].issueId).toBeUndefined();
});

test("saved report triage passes the serving receipt without inferring a provider", async () => {
  setup("connected-app");
  await classifySavedReport(
    "case-1" as Id<"cases">,
    "receipt-1" as Id<"triageReceipts">,
  );
  expect(mocks.mutation).toHaveBeenCalledWith(
    "triage",
    expect.objectContaining({ receiptId: "receipt-1", generation }),
  );
  expect(mocks.classify.mock.calls[0][1].route).toEqual({
    kind: "meta",
    model: "muse-spark-1.3",
  });
});

test("a rejected generation never commits a successful triage receipt", async () => {
  setup("connected-app");
  mocks.classify.mockRejectedValueOnce(
    Object.assign(new Error("completion rejected"), { generation }),
  );
  await expect(
    classifySavedReport(
      "case-1" as Id<"cases">,
      "receipt-1" as Id<"triageReceipts">,
    ),
  ).rejects.toThrow("completion rejected");
  expect(mocks.mutation).not.toHaveBeenCalled();
});
