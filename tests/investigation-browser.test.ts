import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { expect, test, vi } from "vitest";
import type { Doc } from "../convex/_generated/dataModel";

type BrowserRun = { issueId: string; status: string } & Partial<Omit<Doc<"runs">, "issueId" | "status">>;

class Control {
  value = "";
  textContent = "";
  disabled = false;
  focus = vi.fn();
  constructor(readonly tag: string, readonly attributes: Record<string, string>) {}
  get dataset() { return Object.fromEntries(Object.entries(this.attributes).filter(([key]) => key.startsWith("data-")).map(([key, value]) => [key.slice(5), value])); }
}
async function browser(options: { apps?: string[]; allowed?: boolean; fingerprint?: string; title?: string; runs?: BrowserRun[] } = {}) {
  const source = await readFile("lib/browser/cue.js", "utf8");
  const shell = await readFile("lib/browser/product-shell.js", "utf8");
  const issue = { _id: "issue-generic", appId: "app-a", kind: "bug", title: options.title || "Keyboard deletion returns", fingerprint: options.fingerprint || "app-a:report:keyboard-note" };
  const escapeSource = (await readFile("design/cue.html", "utf8")).split("\n").find((line) => line.startsWith("const esc = "));
  if (!escapeSource) throw new Error("Missing actual product escaping helper");
  const integration = { engineeringApps: options.apps ?? ["app-a"], permissions: { investigate: options.allowed ?? true } };
  const state = { sec: "issues", id: "ISS-56", activeIssueId: "ISS-56", issues: { "ISS-56": { id: "ISS-56", _backend: issue._id, title: issue.title, priority: "P2", cases: [] } }, features: [], integrations: integration };
  let controls: Control[] = [];
  let dialog: { title: string; body: string; footer: string } | undefined;
  const select = (selector: string) => controls.find((control) => selector === "#" + control.attributes.id || selector === '[data-act="' + control.dataset.act + '"]') || null;
  function mount(markup: string) {
    controls = [];
    function visit(node: DefaultTreeAdapterMap["node"]) {
      if ("tagName" in node) controls.push(new Control(node.tagName, Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]))));
      if ("childNodes" in node) node.childNodes.forEach(visit);
    }
    visit(parseFragment(markup));
  }
  const actions: Record<string, (control: Control) => unknown> = {};
  const fetch = vi.fn<(url: string, options: { method: string; body: string }) => Promise<Response>>(async () => Response.json({ runId: "run-created" }));
  const toast = vi.fn();
  const context = vm.createContext({
    S: state, A: actions, snapshot: { issues: [issue], runs: options.runs || [], integration, events: [] },
    fetch, toast, STAGES: Array.from({ length: 11 }, () => ({})), freshRun: () => ({}), loadCue: vi.fn(), setTab: vi.fn(),
    caseById: () => undefined, prio: () => "", issueStatusChip: () => "", ic: () => "", clock: () => "",
    $: select,
    openDrawer: (title: string, body: string, footer: string) => { dialog = { title, body, footer }; mount(body + footer); },
    closeOverlays: () => { dialog = undefined; controls = []; },
    curCase: () => undefined,
  });
  vm.runInContext(escapeSource, context);
  const names = new Set(["cueAPI", "liveIssue", "legacyCodingIssue", "codingIssueEligible", "syncLiveRun", "selectCodingIssue", "liveAction", "openInvestigation", "existingCodingRun"]);
  const file = ts.createSourceFile("cue.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const selected = file.statements.filter((node) => {
    if (ts.isFunctionDeclaration(node)) return !!node.name && names.has(node.name.text);
    if (ts.isVariableStatement(node)) return node.declarationList.declarations.some((declaration) => ts.isIdentifier(declaration.name) && declaration.name.text === "liveSnapshot");
    if (!ts.isExpressionStatement(node) || !ts.isBinaryExpression(node.expression)) return false;
    const left = node.expression.left;
    return ts.isIdentifier(left) ? ["startRun", "issueDetail", "changes", "timeline"].includes(left.text) : ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.expression) && left.expression.text === "A" && ["start", "submitInvestigation", "cancelInvestigation"].includes(left.name.text);
  }).map((node) => node.getText(file)).join("\n");
  vm.runInContext(selected + "\nliveSnapshot = snapshot;", context);
  const shellFile = ts.createSourceFile("product-shell.js", shell, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const assignments = shellFile.statements.filter((node) => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(shellFile) === "Object.assign" && node.expression.arguments[0]?.getText(shellFile) === "A");
  vm.runInContext(assignments.map((node) => node.getText(shellFile)).join("\n"), context);
  return {
    context, state, fetch, toast,
    dialog: () => dialog,
    controls: () => controls,
    render: () => {
      const html: unknown = vm.runInContext('issueDetail("ISS-56")', context);
      if (typeof html !== "string") throw new Error("Expected issue markup");
      mount(html);
      return html;
    },
    field: () => { const field = select("#investigation-reproduction"); if (!field) throw new Error("Missing reproduction field"); return field; },
    open: () => actions.productInvestigateIssue(new Control("button", { "data-id": "ISS-56" })),
    click: (name: string) => { const control = controls.find((item) => item.dataset.act === name); if (!control) throw new Error("Missing control " + name); return control.disabled ? undefined : actions[name](control); },
  };
}
test("the actual issue action opens a labelled reproduction dialog and sends exact operator evidence", async () => {
  const b = await browser();
  await b.open();
  expect(b.fetch).not.toHaveBeenCalled();
  expect(b.dialog()?.title).toBe("Start investigation");
  expect(b.controls().find((item) => item.tag === "label")?.attributes.for).toBe("investigation-reproduction");
  expect(b.field().attributes).toMatchObject({ minlength: "20", maxlength: "4000" });
  b.field().value = "  Select the saved Note and press Backspace; reload brings it back.  ";
  b.state.id = "ISS-stale-route";
  await b.click("submitInvestigation");
  expect(b.fetch).toHaveBeenCalledExactlyOnceWith("/api/demo", expect.objectContaining({ method: "POST" }));
  expect(JSON.parse(b.fetch.mock.calls[0][1].body)).toEqual({ action: "investigate", issueId: "issue-generic", reproduction: "Select the saved Note and press Backspace; reload brings it back." });
});
test.each([{ label: "empty", text: "" }, { label: "short", text: "short" }, { label: "too long", text: "x".repeat(4001) }])("invalid reproduction cannot start work: $label", async ({ text }) => {
  const b = await browser(); await b.open(); b.field().value = text;
  await b.click("submitInvestigation");
  expect(b.fetch).not.toHaveBeenCalled(); expect(b.dialog()).toBeDefined();
});
test("cancel does not start work and an in-flight start cannot be duplicated", async () => {
  const b = await browser(); await b.open(); await b.click("cancelInvestigation");
  expect(b.dialog()).toBeUndefined(); expect(b.fetch).not.toHaveBeenCalled();
  await b.open(); b.field().value = "Reproduced by saving, deleting with Backspace, and reloading.";
  let complete: ((response: Response) => void) | undefined;
  b.fetch.mockImplementation(() => new Promise<Response>((resolve) => { complete = resolve; }));
  const pending = b.click("submitInvestigation"); await b.click("submitInvestigation"); await b.click("cancelInvestigation");
  expect(b.fetch).toHaveBeenCalledTimes(1); expect(b.dialog()).toBeDefined();
  if (!complete) throw new Error("No pending request"); complete(Response.json({ runId: "created" })); await pending;
  expect(b.dialog()).toBeUndefined();
});
test.each([{ apps: [] }, { apps: ["other-app"] }, { allowed: false }])("unbound, wrong-app, or unauthorized issues cannot start: %j", async (options) => {
  const b = await browser(options); await b.open();
  expect(b.dialog()).toBeUndefined(); expect(b.fetch).not.toHaveBeenCalled();
});
test("binding removal and existing runs are rechecked before committing operator input", async () => {
  const b = await browser(); await b.open(); b.field().value = "Reproduced by deleting a saved Note and reloading the canvas.";
  b.state.integrations.engineeringApps.length = 0;
  await b.click("submitInvestigation"); expect(b.fetch).not.toHaveBeenCalled();
  const active = await browser({ runs: [{ issueId: "issue-generic", status: "running" }] }); await active.open();
  expect(active.dialog()).toBeUndefined(); expect(active.fetch).not.toHaveBeenCalled();
});
test("an already approved run never opens a new reproduction or start path", async () => {
  const b = await browser({ runs: [{ issueId: "issue-generic", status: "approved" }] }); await b.open();
  expect(b.dialog()).toBeUndefined(); expect(b.fetch).not.toHaveBeenCalled();
});
test("the reproduction drawer displays the frozen issue title as escaped text", async () => {
  const b = await browser({ title: "Note <img src=x onerror=alert(1)>" }); await b.open();
  expect(b.dialog()?.body).toContain("<strong>Note &lt;img src=x onerror=alert(1)&gt;</strong>");
  expect(b.controls().some((control) => control.tag === "img")).toBe(false);
});
test.each(["bloom:upload:413", "cue_app_abc:rehearsal:sample-app:upload:413"])("legacy fixture and rehearsal starts keep their direct path: %s", async (fingerprint) => {
  const b = await browser({ fingerprint, apps: [] }); await b.open();
  expect(b.dialog()).toBeUndefined(); expect(b.fetch).toHaveBeenCalledTimes(1);
});
test("an issue action retains the clicked issue even if the route state is stale", async () => {
  const b = await browser(); b.state.id = "ISS-stale-route"; await b.open();
  expect(b.dialog()?.title).toBe("Start investigation"); expect(b.fetch).not.toHaveBeenCalled();
});
test.each([20, 4000])("reproduction length %s is accepted without silent truncation", async (length) => {
  const b = await browser(); await b.open(); b.field().value = "x".repeat(length);
  await b.click("submitInvestigation");
  expect(JSON.parse(b.fetch.mock.calls[0][1].body).reproduction).toHaveLength(length);
});
test("a server refusal preserves the operator draft and does not automatically retry", async () => {
  const b = await browser(); await b.open();
  const evidence = "Saved Note returns after deleting it with Backspace and reloading.";
  b.field().value = evidence;
  b.fetch.mockResolvedValueOnce(Response.json({ error: "Repository binding changed" }, { status: 400 }));
  await b.click("submitInvestigation");
  expect(b.field().value).toBe(evidence); expect(b.dialog()).toBeDefined();
  expect(b.controls().find((control) => control.attributes.id === "investigation-error")?.textContent).toBe("Repository binding changed");
  expect(b.fetch).toHaveBeenCalledTimes(1);
});
test("a generic binding cannot authorize an unregistered rehearsal fingerprint", async () => {
  const b = await browser({ fingerprint: "app-a:rehearsal:unregistered:other" }); await b.open();
  expect(b.dialog()).toBeUndefined(); expect(b.fetch).not.toHaveBeenCalled();
});

const failedRun = (status: string): BrowserRun => ({
  issueId: "issue-generic", status, phase: "worker_error", kind: "bug", deploymentMode: "pull_request", createdAt: 20,
  before: "Prior baseline evidence", after: "Prior check output", diff: "Prior proposed diff", error: "Prior worker failure",
});
test.each(["failed", "rejected", "canceled"])("rendered %s investigations offer an explicit frozen-issue retry while preserving evidence", async (status) => {
  const b = await browser({ runs: [failedRun(status)] });
  const html = b.render();
  expect(html).toContain("Retry investigation");
  expect(html).toContain("Prior baseline evidence");
  expect(html).toContain("Prior proposed diff");
  expect(html).toContain("Prior worker failure");
  expect(b.fetch).not.toHaveBeenCalled();
  await b.click("productInvestigateIssue");
  expect(b.dialog()?.body).toContain("<strong>Keyboard deletion returns</strong>");
  expect(b.fetch).not.toHaveBeenCalled();
  b.state.id = "ISS-stale-route";
  b.field().value = "Reproduced again: keyboard deletion returns after reloading the saved canvas.";
  await b.click("submitInvestigation");
  expect(b.fetch).toHaveBeenCalledTimes(1);
  expect(JSON.parse(b.fetch.mock.calls[0][1].body)).toEqual({ action: "investigate", issueId: "issue-generic", reproduction: "Reproduced again: keyboard deletion returns after reloading the saved canvas." });
});
test.each(["running", "awaiting_approval", "approved", "resolved", "archived", "cancelled"])("rendered %s runs never offer a retry", async (status) => {
  const b = await browser({ runs: [failedRun(status)] });
  expect(b.render()).not.toContain("Retry investigation");
  expect(b.fetch).not.toHaveBeenCalled();
});
test.each(["before click", "before submission"])("capability withdrawal %s refuses the rendered retry without an automatic request", async (when) => {
  const b = await browser({ runs: [failedRun("failed")] }); b.render();
  if (when === "before submission") await b.click("productInvestigateIssue");
  b.state.integrations.engineeringApps.length = 0;
  if (when === "before click") {
    await b.click("productInvestigateIssue"); expect(b.dialog()).toBeUndefined();
  } else {
    b.field().value = "Reproduced again: the saved Note returns after keyboard deletion and reload.";
    await b.click("submitInvestigation");
  }
  expect(b.fetch).not.toHaveBeenCalled();
});
test("another blocking run suppresses retry even when the newest run failed", async () => {
  const b = await browser({ runs: [{ ...failedRun("approved"), createdAt: 10 }, failedRun("failed")] });
  expect(b.render()).not.toContain("Retry investigation"); expect(b.fetch).not.toHaveBeenCalled();
});
