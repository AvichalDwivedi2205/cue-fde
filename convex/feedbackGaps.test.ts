/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
const modules = import.meta.glob(["./**/*.{ts,js}", "!./**/*.test.ts"]);
const scope = { secret: "secret", workspaceId: "workspace-a", appId: "app-a" };
beforeEach(() => vi.stubEnv("CUE_DEMO_SECRET", "secret"));
afterEach(() => vi.unstubAllEnvs());
async function setup(
  question = "Can I export my memories?",
  status = "answered",
) {
  const t = convexTest(schema, modules),
    owner = "widget:app-a:visitor-a";
  const { caseId } = await t.mutation(api.intake.widgetMessage, {
    secret: scope.secret,
    owner,
    appId: scope.appId,
    customer: "Actual visitor",
    title: "Actual question",
    body: question,
    initialBody: question,
    sourceUrl: "https://app-a.test",
    ack: "This answer needs feedback.",
    knowledge: {
      workspaceId: scope.workspaceId,
      usedChunkIds: [],
      citedChunkIds: [],
      status,
      provider: "none",
      model: "none",
      inputTokens: 0,
      outputTokens: 0,
    },
  });
  const conversation = await t.query(api.bloom.conversation, {
    secret: scope.secret,
    owner,
  });
  const messageId = conversation!.messages.find((m) => m.role === "cue")!._id;
  const feedback = {
    ...scope,
    owner,
    caseId,
    messageId,
    outcome: "needs_help" as const,
  };
  return { t, owner, caseId, messageId, feedback };
}
test("feedback is owned by the signed session, application, case and answer; replay is idempotent", async () => {
  const { t, feedback, caseId } = await setup();
  await expect(
    t.mutation(api.feedbackGaps.submitOutcome, {
      ...feedback,
      owner: "widget:app-a:someone-else",
    }),
  ).rejects.toThrow("Answer not found");
  await expect(
    t.mutation(api.feedbackGaps.submitOutcome, { ...feedback, appId: "app-b" }),
  ).rejects.toThrow("Answer not found");
  expect(await t.mutation(api.feedbackGaps.submitOutcome, feedback)).toEqual({
    duplicate: false,
    outcome: "needs_help",
  });
  expect(await t.mutation(api.feedbackGaps.submitOutcome, feedback)).toEqual({
    duplicate: true,
    outcome: "needs_help",
  });
  await expect(
    t.mutation(api.feedbackGaps.submitOutcome, {
      ...feedback,
      outcome: "solved",
    }),
  ).rejects.toThrow("already been saved");
  const rows = await t.query(api.feedbackGaps.snapshot, scope);
  expect(rows).toHaveLength(1);
  expect(rows[0].gap.reportCount).toBe(1);
  expect(rows[0].reports).toHaveLength(1);
  expect(rows[0].reports[0]).toMatchObject({
    customer: "Actual visitor",
    question: "Can I export my memories?",
    caseId,
  });
  const c = await t.run((ctx) => ctx.db.get("cases", caseId));
  expect(c?.tags).toContain("Needs human reply");
  expect(c?.status).toBe("open");
  expect(
    await t.query(api.feedbackGaps.outcomes, {
      ...scope,
      owner: feedback.owner,
      caseId,
    }),
  ).toEqual([{ messageId: feedback.messageId, outcome: "needs_help" }]);
  await expect(
    t.query(api.feedbackGaps.outcomes, {
      ...scope,
      owner: "widget:app-a:someone-else",
      caseId,
    }),
  ).rejects.toThrow("Conversation not found");
});
test("solved confirms a particular answer without inventing a verified bug release", async () => {
  const { t, feedback, caseId } = await setup();
  await t.mutation(api.feedbackGaps.submitOutcome, {
    ...feedback,
    outcome: "solved",
  });
  expect(await t.query(api.feedbackGaps.snapshot, scope)).toEqual([]);
  expect((await t.run((ctx) => ctx.db.get("cases", caseId)))?.status).not.toBe(
    "resolved",
  );
});
test("a missing answer creates one gap atomically; negative feedback upgrades its report without double counting", async () => {
  const { t, feedback } = await setup(
    "When is export launching?",
    "needs_review",
  );
  let rows = await t.query(api.feedbackGaps.snapshot, scope);
  expect(rows[0].reports[0].reason).toBe("unanswered");
  await t.mutation(api.feedbackGaps.submitOutcome, feedback);
  rows = await t.query(api.feedbackGaps.snapshot, scope);
  expect(rows[0].gap.reportCount).toBe(1);
  expect(rows[0].reports[0].reason).toBe("needs_help");
  expect(
    await t.query(api.feedbackGaps.snapshot, { ...scope, appId: "app-b" }),
  ).toEqual([]);
  expect(
    await t.query(api.feedbackGaps.snapshot, {
      ...scope,
      workspaceId: "workspace-b",
    }),
  ).toEqual([]);
});
test("reviewed answers remain drafts until the exact revision is published; new reports prevent false closure", async () => {
  const { t, feedback, owner, caseId } = await setup(
    "Can I export my memories?",
    "needs_review",
  );
  const gap = (await t.query(api.feedbackGaps.snapshot, scope))[0].gap;
  await expect(
    t.mutation(api.feedbackGaps.teach, {
      ...scope,
      gapId: gap._id,
      actor: "support",
      expectedReportCount: 2,
      question: gap.question,
      answer: "Export is not available.",
      hash: "review",
    }),
  ).rejects.toThrow("New reports arrived");
  await expect(
    t.mutation(api.feedbackGaps.teach, {
      ...scope,
      appId: "app-b",
      gapId: gap._id,
      actor: "support",
      expectedReportCount: 1,
      question: gap.question,
      answer: "Export is not available.",
      hash: "review",
    }),
  ).rejects.toThrow("Knowledge gap not found");
  const draft = await t.mutation(api.feedbackGaps.teach, {
    ...scope,
    gapId: gap._id,
    actor: "support",
    expectedReportCount: 1,
    question: gap.question,
    answer: "Export is not available.",
    hash: "review",
  });
  let rows = await t.query(api.feedbackGaps.snapshot, scope);
  expect(rows[0].publication).toBe("draft");
  expect(rows[0].gap.reviewedBy).toBe("support");
  const source = await t.run((ctx) =>
    ctx.db.get("knowledgeSources", draft.sourceId),
  );
  await t.run((ctx) =>
    ctx.db.patch("knowledgeSources", draft.sourceId, {
      status: "published",
      activeVersionId: source!.latestVersionId,
      activeRevision: draft.revision,
      indexStatus: "idle",
    }),
  );
  expect((await t.query(api.feedbackGaps.snapshot, scope))[0].publication).toBe(
    "published",
  );
  await t.mutation(api.intake.widgetMessage, {
    secret: scope.secret,
    owner,
    appId: scope.appId,
    customer: "Actual visitor",
    title: "Followup",
    body: gap.question,
    initialBody: gap.question,
    sourceUrl: "https://app-a.test",
    ack: "Export is not available.",
  });
  const conversation = await t.query(api.bloom.conversation, {
    secret: scope.secret,
    owner,
  });
  const newAnswer = conversation!.messages
    .filter((m) => m.role === "cue")
    .at(-1)!;
  await t.mutation(api.feedbackGaps.submitOutcome, {
    ...feedback,
    messageId: newAnswer._id,
  });
  rows = await t.query(api.feedbackGaps.snapshot, scope);
  expect(rows[0].gap.reportCount).toBe(2);
  expect(rows[0].gap.reviewedThrough).toBe(1);
  expect(rows[0].reports.every((r) => r.caseId === caseId)).toBe(true);
  await t.run((ctx) =>
    ctx.db.patch("knowledgeSources", draft.sourceId, {
      revision: 2,
      activeRevision: 2,
    }),
  );
  expect((await t.query(api.feedbackGaps.snapshot, scope))[0].publication).toBe(
    "changed",
  );
});
test("feedback refers to the original question even after a later customer message", async () => {
  const { t, feedback, owner } = await setup("First question");
  await t.mutation(api.intake.widgetMessage, {
    secret: scope.secret,
    owner,
    appId: scope.appId,
    customer: "Actual visitor",
    title: "Later question",
    body: "Different question",
    initialBody: "Different question",
    sourceUrl: "https://app-a.test",
    ack: "Different answer",
  });
  await t.mutation(api.feedbackGaps.submitOutcome, feedback);
  expect(
    (await t.query(api.feedbackGaps.snapshot, scope))[0].gap.question,
  ).toBe("First question");
});
test("ignoring preserves evidence and a new identical question reopens the gap", async () => {
  const { t, feedback, owner } = await setup("Can I export?", "needs_review");
  const gap = (await t.query(api.feedbackGaps.snapshot, scope))[0].gap;
  await t.mutation(api.feedbackGaps.review, {
    ...scope,
    gapId: gap._id,
    action: "ignore",
    actor: "support",
  });
  expect((await t.query(api.feedbackGaps.snapshot, scope))[0].gap.state).toBe(
    "ignored",
  );
  await t.mutation(api.intake.widgetMessage, {
    secret: scope.secret,
    owner,
    appId: scope.appId,
    customer: "Actual visitor",
    title: "Followup",
    body: "Can I export?",
    initialBody: "Can I export?",
    sourceUrl: "https://app-a.test",
    ack: "Need review",
  });
  const conversation = await t.query(api.bloom.conversation, {
    secret: scope.secret,
    owner,
  });
  const answer = conversation!.messages.filter((m) => m.role === "cue").at(-1)!;
  await t.mutation(api.feedbackGaps.submitOutcome, {
    ...feedback,
    messageId: answer._id,
  });
  const row = (await t.query(api.feedbackGaps.snapshot, scope))[0];
  expect(row.gap.state).toBe("open");
  expect(row.gap.reportCount).toBe(2);
});
test("unanswered voice questions join the queue; marked synthetic verification retains evidence but not customer counts", async () => {
  const t = convexTest(schema, modules),
    owner = "widget:app-a:voice-visitor",
    transcript = "Can I export memories?",
    key = "a0000000-0000-4000-8000-000000000012";
  const sessionId = await t.mutation(api.voice.start, {
    secret: scope.secret,
    owner,
    appId: scope.appId,
    customer: "Voice visitor",
  });
  await t.mutation(api.voice.claim, {
    secret: scope.secret,
    owner,
    sessionId,
    key,
  });
  const caseId = await t.mutation(api.voice.finish, {
    secret: scope.secret,
    owner,
    sessionId,
    key,
    transcript,
    reply: "This question needs review.",
    knowledge: {
      workspaceId: scope.workspaceId,
      usedChunkIds: [],
      citedChunkIds: [],
      status: "needs_review",
      provider: "none",
      model: "none",
      inputTokens: 0,
      outputTokens: 0,
    },
  });
  expect(
    (await t.query(api.feedbackGaps.snapshot, scope))[0].gap.question,
  ).toBe(transcript);
  await t.mutation(api.voice.markVerificationCase, {
    secret: scope.secret,
    caseId,
    expectedTranscript: transcript,
  });
  await t.mutation(api.voice.markVerificationCase, {
    secret: scope.secret,
    caseId,
    expectedTranscript: transcript,
  });
  expect(await t.query(api.feedbackGaps.snapshot, scope)).toEqual([]);
  const reports = await t.run((ctx) =>
    ctx.db.query("knowledgeGapReports").take(10),
  );
  expect(reports).toHaveLength(1);
  expect(reports[0].excludedVerification).toBe(true);
});
