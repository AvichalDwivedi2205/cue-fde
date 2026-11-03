import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { expect, test, vi } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";

type Run = { status: string; _id?: string; issueId?: string } & Partial<Omit<Doc<"runs">, "status" | "_id" | "issueId">>;
const runId = "j" + "a".repeat(31), issueId = "j" + "b".repeat(31);
type Button = { dataset: Record<string, string>; disabled: boolean };
function capturedButton(html: string, action = "approve"): Button {
  let button: Button | undefined;
  function visit(node: DefaultTreeAdapterMap["node"]) {
    if ("tagName" in node && node.tagName === "button" && node.attrs.some(({ name, value }) => name === "data-act" && value === action)) {
      const dataset = Object.fromEntries(node.attrs.filter(({ name }) => name.startsWith("data-")).map(({ name, value }) => [name.slice(5).replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()), value]));
      button = { dataset, disabled: node.attrs.some(({ name }) => name === "disabled") };
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(parseFragment(html));
  if (!button) throw new Error("Missing rendered " + action + " button");
  return button;
}
const source = await readFile("lib/browser/cue.js", "utf8");
const file = ts.createSourceFile("cue.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const escapeSource = (await readFile("design/cue.html", "utf8")).split("\n").find((line) => line.startsWith("const esc = "));
if (!escapeSource) throw new Error("Missing product escaping helper");
const assignments = file.statements.filter((node) => {
  if (ts.isFunctionDeclaration(node)) return !!node.name && ["approvalData", "approveDisplayedRun", "liveIssue", "legacyCodingIssue", "codingIssueEligible"].includes(node.name.text);
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && ["approvalInFlight", "completedApprovals", "featureRun"].includes(declaration.name.text));
  if (!ts.isExpressionStatement(node) || !ts.isBinaryExpression(node.expression)) return false;
  const left = node.expression.left;
  return ts.isIdentifier(left) ? ["changes", "approve", "timeline"].includes(left.text) : ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.expression) && left.expression.text === "A" && ["approve", "featureApprove"].includes(left.name.text);
}).map((node) => node.getText(file)).join("\n");
function generic(fields: Partial<Run> = {}): Run {
  return { _id: runId, issueId, targetId: "app-a", createdAt: 1, status: "awaiting_approval", phase: "awaiting_approval", kind: "bug", provider: "Meta", deploymentMode: "pull_request", commit: "a".repeat(40), before: "Baseline keyboard deletion fails after reload", after: "Seven repository checks pass", ...fields };
}
function browser(run?: Run, events: Array<{ title: string; detail: string; kind?: string; runId?: string; createdAt?: number }> = []) {
  const toast = vi.fn(), action = vi.fn(async () => ({ ok: true }));
  const current = run && { _id: runId, issueId, targetId: "app-a", createdAt: 1, ...run };
  const issue = { _id: issueId, appId: "app-a", kind: current?.kind || "bug", fingerprint: current?.deploymentMode === "pull_request" ? "app-a:report:keyboard" : "bloom:upload:413", spec: "approved spec", specApprovedAt: 1 };
  const integration = { role: "owner", engineeringApps: ["app-a"], codingApps: ["bloom"], permissions: { investigate: true, deploy: true } };
  const state = { liveRun: current, integrations: integration, scopeApp: "app-a", issues: {}, features: [{ id: "FR-1", _backend: issueId }] };
  const snapshot = { issues: [issue], runs: current ? [current] : [], integration, events: events.map((event) => ({ runId, createdAt: 1, ...event })) };
  const context = vm.createContext({ S: state, A: {}, liveSnapshot: snapshot, toast, liveAction: action, ic: () => "", clock: () => "", loadedFeatureDetail: () => "<div>Reviewed specification</div>" });
  vm.runInContext(escapeSource + "\n" + assignments, context);
  return {
    toast, action, state, snapshot, issue,
    render: () => {
      const html: unknown = vm.runInContext("changes()", context);
      if (typeof html !== "string") throw new Error("Expected rendered changes");
      return html;
    },
    approve: (button?: Button, feature = false) => { context.clicked = button; return vm.runInContext(feature ? "A.featureApprove(clicked)" : "A.approve(clicked)", context); },
    renderFeature: () => {
      const node = file.statements.find((node) => ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression) && ts.isIdentifier(node.expression.left) && node.expression.left.text === "featureDetail" && ts.isArrowFunction(node.expression.right) && ts.isBlock(node.expression.right.body));
      if (!node) throw new Error("Missing feature renderer");
      vm.runInContext(node.getText(file), context);
      const html: unknown = vm.runInContext('featureDetail({id:"FR-1",_backend:"' + issueId + '",requesters:[]})', context);
      if (typeof html !== "string") throw new Error("Expected feature markup");
      return html;
    },
    timeline: () => String(vm.runInContext("timeline()", context)),
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
  const awaiting = browser(generic()); await awaiting.approve(capturedButton(awaiting.render()));
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
test("a captured approval submits its displayed run and commit once", async () => {
  const b = browser(generic()); const button = capturedButton(b.render());
  expect(button.dataset).toMatchObject({ runId, issueId, commit: "a".repeat(40), appId: "app-a" });
  await b.approve(button); await b.approve(button);
  expect(b.action).toHaveBeenCalledExactlyOnceWith("approve", { runId, commit: "a".repeat(40) });
});
test("a re-rendered stale button cannot submit an already successful approval pair", async () => {
  const b = browser(generic());
  await b.approve(capturedButton(b.render()));
  await b.approve(capturedButton(b.render()));
  expect(b.action).toHaveBeenCalledTimes(1);
});
test.each(["run", "commit", "role", "app", "scope", "capability", "permission", "status"])("captured approval refuses changed %s with zero requests", async (change) => {
  const b = browser(generic()); const button = capturedButton(b.render());
  if (!b.state.liveRun) throw new Error("Missing current run");
  if (change === "run") b.state.liveRun = { ...b.state.liveRun, _id: "j" + "c".repeat(31) };
  if (change === "commit") b.state.liveRun.commit = "c".repeat(40);
  if (change === "role") b.state.integrations.role = "engineering";
  if (change === "app") b.issue.appId = "app-b";
  if (change === "scope") b.state.scopeApp = "app-b";
  if (change === "capability") b.state.integrations.engineeringApps.length = 0;
  if (change === "permission") b.state.integrations.permissions.deploy = false;
  if (change === "status") b.state.liveRun.status = "approved";
  await b.approve(button);
  expect(b.action).not.toHaveBeenCalled(); expect(b.toast).toHaveBeenCalledWith(expect.stringContaining("Reload"), "warn");
});
test.each(["runId", "issueId", "commit", "appId", "scopeApp", "operatorRole"])("missing frozen %s refuses approval without fallback", async (field) => {
  const b = browser(generic()); const button = capturedButton(b.render()); delete button.dataset[field];
  await b.approve(button); expect(b.action).not.toHaveBeenCalled();
});
test("malformed identity and missing button fail closed", async () => {
  const b = browser(generic()); const button = capturedButton(b.render()); button.dataset.commit = "not-a-sha";
  await b.approve(button); await b.approve(); expect(b.action).not.toHaveBeenCalled();
});
test.each([{ field: "runId", value: "invalid" }, { field: "issueId", value: "invalid" }, { field: "appId", value: "https://foreign.test" }, { field: "scopeApp", value: "invalid scope" }, { field: "operatorRole", value: "unknown" }])("malformed frozen $field refuses approval", async ({ field, value }) => {
  const b = browser(generic()); const button = capturedButton(b.render()); button.dataset[field] = value;
  await b.approve(button); expect(b.action).not.toHaveBeenCalled();
});
test.each(["stable", "run", "commit", "role", "app", "spec"])("feature implementation approval pins the displayed pair: %s", async (change) => {
  const b = browser(generic({ kind: "feature", approvedSpec: "approved spec" }));
  const button = capturedButton(b.renderFeature(), "featureApprove");
  if (change === "run") b.snapshot.runs[0] = { ...b.snapshot.runs[0], _id: "j" + "c".repeat(31) };
  if (change === "commit") b.snapshot.runs[0].commit = "c".repeat(40);
  if (change === "role") b.state.integrations.role = "engineering";
  if (change === "app") b.issue.appId = "app-b";
  if (change === "spec") b.issue.spec = "new spec";
  await b.approve(button, true);
  if (change === "stable") expect(b.action).toHaveBeenCalledExactlyOnceWith("approve", { runId, commit: "a".repeat(40) });
  else expect(b.action).not.toHaveBeenCalled();
});
test.each([undefined, "rehearsal"])("complete legacy approval metadata keeps its exact pair: %s", async (deploymentMode) => {
  const b = browser(generic({ deploymentMode })); const button = capturedButton(b.render()); await b.approve(button);
  expect(b.action).toHaveBeenCalledExactlyOnceWith("approve", { runId, commit: "a".repeat(40) });
});
test("timeline icons distinguish success from failures, reproduction, and neutral events", () => {
  const b = browser(generic(), [
    { title: "Passed", detail: "ok", kind: "success" }, { title: "Failed", detail: "bad", kind: "failure" },
    { title: "Baseline failed", detail: "repro", kind: "reproduction" }, { title: "Working", detail: "status", kind: "agent" },
  ]);
  const html = b.timeline();
  expect((html.match(/s-node">✓/g) || [])).toHaveLength(1);
  expect((html.match(/s-node">!/g) || [])).toHaveLength(2);
  expect((html.match(/s-node">·/g) || [])).toHaveLength(1);
});
test("reported model call counts are visible only for valid present values", () => {
  expect(browser(generic({ modelCalls: 17 })).render()).toContain("Model calls: 17");
  for (const modelCalls of [undefined, NaN, -1, 1.5]) expect(browser(generic({ modelCalls })).render()).not.toContain("Model calls:");
  expect(browser(generic({ modelCalls: 0 })).render()).toContain("Model calls: 0");
});
