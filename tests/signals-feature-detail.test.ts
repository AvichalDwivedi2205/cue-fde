import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { expect, test } from "vitest";

const escapeSource = (await readFile("design/cue.html", "utf8"))
  .split("\n")
  .find((line) => line.startsWith("const esc = "));
if (!escapeSource) throw new Error("Missing product escaping helper");
const source = await readFile("lib/browser/cue.js", "utf8");
const file = ts.createSourceFile("cue.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const node = file.statements.find(
  (node) =>
    ts.isExpressionStatement(node) &&
    ts.isBinaryExpression(node.expression) &&
    ts.isIdentifier(node.expression.left) &&
    node.expression.left.text === "featureDetail" &&
    ts.isArrowFunction(node.expression.right) &&
    ts.isBlock(node.expression.right.body),
);
if (!node) throw new Error("Missing actual feature renderer");

function feature(options: {
  stub: string;
  jobs?: { runId: string; status: string; worker?: string }[];
  runs?: Record<string, unknown>[];
  features?: Record<string, unknown>;
} ) {
  const context = vm.createContext({
    S: { integrations: { engineeringApps: ["app-a"], codingApps: ["app-a"], permissions: { investigate: true }, slackSend: false } },
    liveSnapshot: { runs: options.runs || [], events: [], jobs: options.jobs || [] },
    loadedFeatureDetail: () => options.stub,
    liveIssue: () => ({ appId: "app-a", status: "spec_ready", specGeneration: undefined }),
    providerName: (p: string) => (p === "meta" ? "Meta" : p),
    approvalData: () => "",
    esc: undefined as unknown as (s: string) => string,
  });
  vm.runInContext(escapeSource + "\n" + node!.getText(file), context);
  const f = { id: "FR-9", _backend: "feature-1", requesters: [], ...(options.features || {}) };
  const html: unknown = vm.runInContext(
    "featureDetail(" + JSON.stringify(f) + ")",
    context,
  );
  if (typeof html !== "string") throw new Error("Expected feature markup");
  return html;
}

const baseStub =
  '<div class="fr-sec"><h4>Requesting customers · 0</h4></div>' +
  '<div class="fr-sec"><h4>Suggested specification</h4><div class="spec">spec text</div></div>';

test("a promoted signal feature shows batch evidence instead of an empty requester list", () => {
  const html = feature({
    stub: baseStub,
    features: {
      signals: {
        postCount: 4,
        authors: 3,
        repeatedEvidence: true,
        quotes: ["Is there any way to get an older version back?"],
        provenance: { kind: "synthetic-fixture", fixture: "quiet-signals-evaluation", version: "v1" },
      },
    },
  });
  expect(html).toContain("Quiet signals source");
  expect(html).toContain("Synthetic operator fixture quiet-signals-evaluation v1 · fictional authors");
  expect(html).toContain("4 posts · 3 synthetic authors");
  expect(html).toContain("not counted as customer traction");
  expect(html).toContain("Is there any way to get an older version back?");
  expect(html).not.toContain("Requesting customers · 0");
});

test("a single-author batch feature cannot claim a repeated pattern", () => {
  const html = feature({
    stub: baseStub,
    features: {
      signals: {
        postCount: 1,
        authors: 1,
        repeatedEvidence: false,
        quotes: ["one quote"],
        provenance: { kind: "operator-capture", note: "operator note" },
      },
    },
  });
  expect(html).toContain("Single report — not enough to establish a repeated pattern");
  expect(html).toContain("Operator-supplied capture · not platform-verified");
});

test("a queued feature job reads as queued, not as executing model work", () => {
  const html = feature({
    stub: baseStub,
    runs: [{ _id: "run-1", issueId: "feature-1", status: "running", phase: "preparing", provider: "Meta" }],
    jobs: [{ runId: "run-1", status: "queued" }],
  });
  expect(html).toContain("Queued for Muse Wonder · the worker has not claimed this job yet");
  expect(html).not.toContain("Executing with Muse Wonder");
});

test("a claimed job reads as executing with the claiming worker", () => {
  const html = feature({
    stub: baseStub,
    runs: [{ _id: "run-1", issueId: "feature-1", status: "running", phase: "preparing", provider: "Meta" }],
    jobs: [{ runId: "run-1", status: "running", worker: "wonder-worker-1" }],
  });
  expect(html).toContain("Executing with Muse Wonder · claimed by wonder-worker-1");
});

test("runs without job records keep the honest raw status line", () => {
  const html = feature({
    stub: baseStub,
    runs: [{ _id: "run-1", issueId: "feature-1", status: "running", phase: "preparing", provider: "Meta" }],
    jobs: [],
  });
  expect(html).toContain("running · preparing");
});
