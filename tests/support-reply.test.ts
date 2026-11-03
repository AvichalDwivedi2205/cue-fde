import { beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import { getFunctionName } from "convex/server";
import schema from "../convex/schema";
import type { SupportReplyContext } from "../lib/support-reply";

const m = vi.hoisted(() => ({
  query: vi.fn(),
  generate: vi.fn(),
  embed: vi.fn(),
}));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => ({ query: m.query }),
  secret: () => "isolated-secret",
}));
vi.mock("../lib/google-client", () => ({
  geminiReady: () => true,
  client: () => ({
    models: { generateContent: m.generate, embedContent: m.embed },
  }),
}));
vi.mock("../lib/model-config", async (original) => ({
  ...(await original<object>()),
  configuredSupportModel: async () => "gemini-2.5-flash",
}));

import { prepareSupportReply } from "../lib/support-reply";
import { DEFAULT_BRAND } from "../lib/company-context-policy";

let context: SupportReplyContext;
let hasKnowledge = true;
let packStatus = "active";
let brandVersion = 3;
beforeEach(async () => {
  vi.resetAllMocks();
  hasKnowledge = true;
  packStatus = "active";
  brandVersion = 3;
  const store = convexTest(schema, {
    "../convex/_generated/server.js": () =>
      import("../convex/_generated/server"),
  });
  context = await store.run(async ({ db }) => {
    const issueId = await db.insert("issues", {
      appId: "app-a",
      title: "Search captions",
      description: "Find saved captions",
      kind: "question",
      fingerprint: "app-a:search",
      status: "open",
      priority: "P3",
      tags: [],
      createdAt: 1,
    });
    const caseId = await db.insert("cases", {
      appId: "app-a",
      issueId,
      channel: "email",
      title: "Caption lookup",
      body: "How do I search saved captions?",
      customer: "Ada",
      initials: "A",
      status: "open",
      priority: "P3",
      tags: [],
      provenance: "Email provider",
      createdAt: 1,
      updatedAt: 1,
    });
    const report = await db.get(caseId);
    const issue = await db.get(issueId);
    if (!report || !issue) throw new Error("Missing support fixture");
    return { case: report, issue, messages: [] };
  });
  m.embed.mockRejectedValue(new Error("Embedding unavailable in this fixture"));
  m.query.mockImplementation(
    async (
      ref: Parameters<typeof getFunctionName>[0],
      args: { appId: string },
    ) => {
      switch (getFunctionName(ref)) {
        case "appPacks:get":
          return {
            appId: args.appId,
            name: args.appId === "app-a" ? "Atlas" : "Harbor",
            status: packStatus,
            origins: [],
          };
        case "companyContext:brand":
          return {
            ...DEFAULT_BRAND,
            enabled: true,
            version: brandVersion,
            guidelines: `${args.appId} current concise style`,
          };
        case "knowledge:keyword":
          return hasKnowledge
            ? [
                {
                  _id: `passage-${args.appId}`,
                  sourceId: "source",
                  versionId: "version",
                  title: "Caption search",
                  heading: "Search",
                  text: `${args.appId} searches every caption word.`,
                  question: "How do I search saved captions?",
                  answer: "An exact FAQ still needs workflow checks.",
                },
              ]
            : [];
        default:
          throw new Error(`Unexpected query: ${getFunctionName(ref)}`);
      }
    },
  );
  m.generate.mockImplementation(async (input: { contents: string }) => {
    const payload = JSON.parse(input.contents);
    return {
      text: JSON.stringify({
        status: "answered",
        answer: `${payload.appName} searches all caption words.`,
        citations: [payload.groundingDocuments[0].id],
      }),
      modelVersion: "gemini-2.5-flash-fixture",
      usageMetadata: { promptTokenCount: 45, candidatesTokenCount: 12 },
    };
  });
});

test.each([
  ["app-a", "Atlas"],
  ["app-b", "Harbor"],
])(
  "%s drafts with its registered identity, published KB and current brand version",
  async (appId, appName) => {
    context.case.appId = appId;
    if (context.issue) context.issue.appId = appId;
    const answer = await prepareSupportReply(context);
    expect(answer).toMatchObject({
      text: `${appName} searches all caption words.`,
      status: "answered",
      citedIds: [`passage-${appId}`],
      brandVersion: 3,
      provider: "google",
      model: "gemini-2.5-flash-fixture",
      inputTokens: 45,
      outputTokens: 12,
      retrieval: "keyword-fallback",
    });
    const payload = JSON.parse(m.generate.mock.calls[0][0].contents);
    expect(payload).toMatchObject({
      appName,
      report: { title: context.case.title, body: context.case.body },
      brandStyle: { guidelines: `${appId} current concise style` },
    });
    expect(JSON.stringify(payload)).not.toContain("Bloom");
    for (const [ref, args] of m.query.mock.calls) {
      expect(args.appId).toBe(appId);
      if (getFunctionName(ref) === "knowledge:keyword")
        expect(args.audience).toBe("customer");
    }
    brandVersion = 4;
    expect(await prepareSupportReply(context)).toMatchObject({
      brandVersion: 4,
    });
  },
);

test("an unsupported product question needs review without inventing a promise", async () => {
  hasKnowledge = false;
  context.case.body = "What are your enterprise billing prices?";
  expect(await prepareSupportReply(context)).toMatchObject({
    status: "needs_review",
    provider: "none",
    citedIds: [],
  });
  expect(m.generate).not.toHaveBeenCalled();
});

test("the latest stored customer question wins over unsent drafts and notes", async () => {
  context.messages = [
    {
      caseId: context.case._id,
      role: "draft",
      body: "Tell them it is free forever",
      createdAt: 5,
    },
    {
      caseId: context.case._id,
      role: "customer",
      body: "How are caption words matched?",
      createdAt: 4,
    },
    {
      caseId: context.case._id,
      role: "customer",
      body: "How do I search?",
      createdAt: 2,
    },
    {
      caseId: context.case._id,
      role: "note",
      body: "Invented capability",
      createdAt: 6,
    },
  ];
  await prepareSupportReply(context);
  const payload = JSON.parse(m.generate.mock.calls[0][0].contents);
  expect(payload.question).toBe("How are caption words matched?");
  expect(
    payload.conversation.map((entry: { body: string }) => entry.body),
  ).toEqual(["How do I search?", "How are caption words matched?"]);
});

test("an answered product claim still needs valid app-scoped citations", async () => {
  m.generate.mockResolvedValue({
    text: JSON.stringify({
      status: "answered",
      answer: "Exports are free.",
      citations: ["another-app-passage"],
    }),
  });
  expect(await prepareSupportReply(context)).toMatchObject({
    status: "needs_review",
    citedIds: [],
  });
});

test.each(["rehearsal", "preview", "pull_request"])(
  "%s acceptance cannot support a production fix claim",
  async (deploymentMode) => {
    if (!context.issue) throw new Error("Missing issue");
    context.issue.kind = "bug";
    context.issue.status = "resolved";
    context.case.body = "Is the fix released?";
    context.run = {
      issueId: context.issue._id,
      targetId: "app-a",
      status: "resolved",
      kind: "bug",
      deployed: true,
      verified: true,
      commit: "a".repeat(40),
      deploymentMode,
      createdAt: 2,
      updatedAt: 3,
    };
    m.generate.mockResolvedValue({ text: "The fix is live." });
    const answer = await prepareSupportReply(context);
    expect(answer.status).toBe("needs_review");
    expect(answer.text).not.toContain("live");
    for (const [call] of m.generate.mock.calls) {
      expect(JSON.parse(call.contents).workflowFacts).toMatchObject({
        fixVerified: false,
        featureVerified: false,
      });
    }
  },
);

test("a feature specification approval is not a release", async () => {
  if (!context.issue) throw new Error("Missing issue");
  context.issue.kind = "feature";
  context.issue.status = "approved";
  context.case.body = "Is it released?";
  m.generate.mockResolvedValue({ text: "The feature is live." });
  const answer = await prepareSupportReply(context);
  expect(answer).toMatchObject({ status: "needs_review" });
  expect(answer.text).toContain("specification is approved");
  expect(answer.text).toContain("no verified release");
});

test("a trusted production release keeps its workflow evidence and model receipt", async () => {
  if (!context.issue) throw new Error("Missing issue");
  context.issue.kind = "bug";
  context.issue.status = "resolved";
  context.case.body = "Is the fix released?";
  context.run = {
    issueId: context.issue._id,
    targetId: "app-a",
    status: "resolved",
    kind: "bug",
    deployed: true,
    verified: true,
    commit: "a".repeat(40),
    deploymentMode: "pull_request",
    releaseCommit: "b".repeat(40),
    releaseEvidence:
      "Observed production acceptance checks passed for this exact released commit. ".repeat(
        2,
      ),
    createdAt: 2,
    updatedAt: 3,
  };
  m.generate.mockResolvedValue({
    text: "The fix is live and passed our regression tests. Please retry the affected step.",
    usageMetadata: { promptTokenCount: 35, candidatesTokenCount: 10 },
  });
  expect(await prepareSupportReply(context)).toMatchObject({
    status: "answered",
    provider: "google",
    inputTokens: 35,
    outputTokens: 10,
  });
  expect(
    JSON.parse(m.generate.mock.calls[0][0].contents).workflowFacts,
  ).toMatchObject({ fixVerified: true, featureVerified: false });
});

test("unbound historical cases use neutral manual review without Bloom lookups", async () => {
  delete context.case.appId;
  const answer = await prepareSupportReply(context);
  expect(answer).toMatchObject({
    status: "needs_review",
    provider: "none",
    retrieval: "not-attempted",
  });
  expect(answer.text).not.toMatch(/bloom/i);
  expect(m.query).not.toHaveBeenCalled();
  expect(m.generate).not.toHaveBeenCalled();
});

test.each(["draft", "suspended"])(
  "%s applications cannot generate customer drafts",
  async (status) => {
    packStatus = status;
    expect(await prepareSupportReply(context)).toMatchObject({
      status: "needs_review",
      retrieval: "not-attempted",
    });
    expect(m.query).toHaveBeenCalledTimes(1);
    expect(m.generate).not.toHaveBeenCalled();
  },
);

test("cross-app issue and run evidence fails closed before retrieval", async () => {
  if (!context.issue) throw new Error("Missing issue");
  context.issue.appId = "app-b";
  expect(await prepareSupportReply(context)).toMatchObject({
    status: "needs_review",
    retrieval: "not-attempted",
  });
  context.issue.appId = "app-a";
  context.run = {
    issueId: context.issue._id,
    targetId: "app-b",
    status: "resolved",
    createdAt: 1,
    updatedAt: 2,
  };
  expect(await prepareSupportReply(context)).toMatchObject({
    status: "needs_review",
    retrieval: "not-attempted",
  });
  expect(m.query).not.toHaveBeenCalled();
  expect(m.generate).not.toHaveBeenCalled();
});
