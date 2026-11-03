import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { expect, test, vi } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";

type Run = Pick<Doc<"runs">, "status"> & Partial<Omit<Doc<"runs">, "status">>;
const source = await readFile("lib/browser/cue.js", "utf8");
const file = ts.createSourceFile("cue.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const escapeSource = (await readFile("design/cue.html", "utf8")).split("\n").find((line) => line.startsWith("const esc = "));
if (!escapeSource) throw new Error("Missing product escaping helper");
const assignments = file.statements.filter((node) => {
  if (!ts.isExpressionStatement(node) || !ts.isBinaryExpression(node.expression) || !ts.isIdentifier(node.expression.left)) return false;
  return ["changes", "approve"].includes(node.expression.left.text);
}).map((node) => node.getText(file)).join("\n");
function generic(fields: Partial<Run> = {}): Run {
  return { status: "awaiting_approval", phase: "awaiting_approval", kind: "bug", provider: "Meta", deploymentMode: "pull_request", commit: "a".repeat(40), before: "Baseline keyboard deletion fails after reload", after: "Seven repository checks pass", ...fields };
}
function browser(run?: Run, events: Array<Pick<Doc<"events">, "title" | "detail">> = []) {
  const toast = vi.fn(), action = vi.fn(async () => ({ ok: true }));
  const context = vm.createContext({ S: { liveRun: run, integrations: {} }, liveSnapshot: { events }, toast, liveAction: action });
  vm.runInContext(escapeSource + "\n" + assignments, context);
  return {
    toast, action,
    render: () => {
      const html: unknown = vm.runInContext("changes()", context);
      if (typeof html !== "string") throw new Error("Expected rendered changes");
      return html;
    },
    approve: () => vm.runInContext("approve()", context),
  };
}
test("generic review describes repository checks, exact approval, and reported model receipts", () => {
  const html = browser(generic({ requestedModel: "muse-wonder-1.0", model: "muse-spark-1.3", inputTokens: 123, outputTokens: 45, executionBackend: "local" })).render();
  expect(html).toContain("Independent repository checks");
  expect(html).toContain("Approve exact commit");
  expect(html).toContain("Approval does not merge, deploy, or resolve this issue.");
  expect(html).toContain("Requested model: muse-wonder-1.0");
  expect(html).toContain("Reported model: muse-spark-1.3");
  expect(html).toContain("Input tokens: 123");
  expect(html).toContain("Output tokens: 45");
  expect(html).toContain("Execution backend: local");
  expect(html).not.toContain("Independent HTTP");
  expect(html).not.toContain("Approve &amp; deploy");
  expect(html).not.toContain("3 MB photo");
});
test("approved generic commits still await the repository release process", async () => {
  const b = browser(generic({ status: "approved", approval: "Engineering approved exact commit" }));
  const html = b.render();
  expect(html).toContain("Exact commit approved");
  expect(html).toContain("Repository merge, deployment, and release verification are still required.");
  expect(html).not.toContain('data-act="approve"');
  const awaiting = browser(generic()); await awaiting.approve();
  expect(awaiting.toast).toHaveBeenCalledWith("Approved exact commit · repository release pending", "run");
});
const evidence = "Deployed preview acceptance: deleting the selected saved Note stayed deleted after reload, while an unselected group member and its links remained. Recorded exact source and acceptance checks.";
const released = () => generic({ status: "resolved", approval: "Engineering approved exact commit", verified: true, deployed: true, releaseCommit: "b".repeat(40), releaseEvidence: evidence });
test("resolved generic runs display actual recorded release evidence and commit", () => {
  const html = browser(released()).render();
  expect(html).toContain("Release verification recorded");
  expect(html).toContain(evidence);
  expect(html).toContain("b".repeat(40));
  expect(html).not.toContain("Valid 3 MB photo accepted");
});
test("preview deployment and browser acceptance audit events never imply production release", () => {
  const html = browser(generic({ status: "approved", approval: "Engineering approved exact commit" }), [
    { title: "Preview deployment ready", detail: "Approved source deployed to a private preview" },
    { title: "Preview browser acceptance passed", detail: "Original customer action succeeded after reload" },
  ]).render();
  expect(html).toContain("Release verification pending");
  expect(html).toContain("Preview deployment and acceptance events do not establish a production release.");
  expect(html).not.toContain("Release verification recorded");
});
test.each([
  { releaseEvidence: undefined }, { releaseCommit: undefined }, { approval: undefined },
  { releaseEvidence: "No acceptance" }, { releaseCommit: "invalid" }, { commit: "invalid" },
])("flags and repository checks cannot invent missing release verification: %j", (missing) => {
  const html = browser({ ...released(), ...missing }).render();
  expect(html).not.toContain("Release verification recorded");
  expect(html).toContain("Release verification pending");
  expect(html).not.toContain("3 MB photo");
});
test("missing or invalid receipts do not invent identity or zero usage", () => {
  const html = browser(generic({ requestedModel: "muse-wonder-1.0", model: "", inputTokens: NaN, outputTokens: -1 })).render();
  expect(html).toContain("Requested model: muse-wonder-1.0");
  expect(html).not.toContain("Reported model:");
  expect(html).not.toContain("Input tokens:");
  expect(html).not.toContain("Output tokens:");
  expect(html).not.toContain("Execution backend:");
  const zero = browser(generic({ inputTokens: 0, outputTokens: 0 })).render();
  expect(zero).toContain("Input tokens: 0"); expect(zero).toContain("Output tokens: 0");
});
test.each([undefined, "rehearsal"])("legacy upload wording remains unchanged: %s", (deploymentMode) => {
  const html = browser({ status: "resolved", deploymentMode, deployed: true, verified: true }).render();
  expect(html).toContain("Independent HTTP regression tests");
  expect(html).toContain("Valid 3 MB photo accepted · 6 MB control rejected.");
  expect(browser({ status: "awaiting_approval", deploymentMode }).render()).toContain("Approve &amp; deploy");
});
test("no-run instructions use the configured coding worker", () => {
  const html = browser().render();
  expect(html).toContain("configured coding worker"); expect(html).not.toContain("Codex account");
});

function feature(apps: string[], allowed = true, appId = "app-a") {
  const node = file.statements.find((node) => ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression) && ts.isIdentifier(node.expression.left) && node.expression.left.text === "featureDetail" && ts.isArrowFunction(node.expression.right) && ts.isBlock(node.expression.right.body));
  if (!node) throw new Error("Missing actual feature renderer");
  const context = vm.createContext({
    S: { integrations: { engineeringApps: apps, codingApps: [appId], permissions: { investigate: allowed } } },
    liveSnapshot: { runs: [], events: [] }, loadedFeatureDetail: () => "<div>Reviewed specification</div>",
    liveIssue: () => ({ appId, status: "approved" }),
  });
  vm.runInContext(escapeSource + "\n" + node.getText(file), context);
  const html: unknown = vm.runInContext('featureDetail({id:"FR-1",_backend:"feature-1",requesters:[]})', context);
  if (typeof html !== "string") throw new Error("Expected feature markup");
  return html;
}
test("generic feature implementation uses active bound capabilities and neutral worker identity", () => {
  expect(feature(["app-a"])).toContain("Implement with coding worker");
  expect(feature(["other-app"])).not.toContain('data-act="implementFeature"');
  expect(feature(["app-a"], false)).not.toContain('data-act="implementFeature"');
  expect(feature([], true, "bloom")).toContain("Implement with Codex");
});
