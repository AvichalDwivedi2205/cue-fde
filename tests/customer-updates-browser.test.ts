import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { expect, test, vi } from "vitest";

class Control {
  disabled = false;
  textContent = "";
  value = "";
  constructor(readonly tag: string, readonly attributes: Record<string, string>) {}
  get dataset() { return Object.fromEntries(Object.entries(this.attributes).filter(([key]) => key.startsWith("data-")).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()), value])); }
}
const delivery = (kind = "prepared", channel = "x", body = "Exact approved preview\nhttps://preview.example.test/") => ({
  _id: "delivery-a", body, createdAt: 20,
  supportIntent: { reviewHash: "a".repeat(64), state: { kind, ...(["accepted", "verified"].includes(kind) ? { providerId: "provider-a" } : {}) },
    review: { caseId: "case-a", runId: "run-a", target: channel === "x" ? { kind: "x", brandUsername: "Acme", postId: "123456" } : { kind: "widget_email", sender: "support@example.test", recipient: "Exact.Case@example.test" }, evidence: { deployment: { commit: "c".repeat(40) } } } },
});
async function browser(initial = delivery()) {
  const source = await readFile("lib/browser/cue.js", "utf8");
  const parsed = ts.createSourceFile("cue.js", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const api = parsed.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "cueAPI");
  if (!api) throw new Error("Actual cueAPI missing");
  const escape = (await readFile("design/cue.html", "utf8")).split("\n").find((line) => line.startsWith("const esc = "));
  if (!escape) throw new Error("Actual escape helper missing");
  let controls: Control[] = [], dialog: { title: string; body: string; footer: string } | undefined;
  function mount(markup: string) {
    controls = [];
    function visit(node: DefaultTreeAdapterMap["node"]) {
      if ("tagName" in node) controls.push(new Control(node.tagName, Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]))));
      if ("childNodes" in node) node.childNodes.forEach(visit);
    }
    visit(parseFragment(markup));
  }
  const state = { sec: "inbox", scopeApp: "app-a", id: "case-a" };
  const report = { _backend: "case-a" };
  const actions: Record<string, (control: Control) => unknown> = {};
  const fetch = vi.fn<(url: string, options: { body: string }) => Promise<Response>>().mockImplementation(async () => Response.json({ delivery: initial }));
  const context = vm.createContext({ S: state, A: actions, fetch, loadCue: vi.fn(), toast: vi.fn(),
    curCase: () => report, conversation: () => "Original conversation", liveSnapshot: { cases: [{ _id: "case-a", issueId: "issue-a", channel: "x" }], runs: [{ _id: "run-a", issueId: "issue-a", previewAcceptance: {}, createdAt: 10 }], deliveries: [] },
    $: (selector: string) => controls.find((control) => selector === "#" + control.attributes.id) || null,
    openDrawer: (title: string, body: string, footer: string) => { dialog = { title, body, footer }; mount(body + footer); },
  });
  vm.runInContext(escape + "\n" + api.getText(parsed) + "\n" + await readFile("lib/browser/customer-updates.js", "utf8"), context);
  const control = (name: string) => { const found = controls.find((item) => item.dataset.act === name); if (!found) throw new Error("Missing action " + name); return found; };
  return { state, report, fetch, dialog: () => dialog, controls: () => controls,
    actions: () => fetch.mock.calls.map(([, options]) => JSON.parse(options.body)),
    render: () => { mount(String(vm.runInContext("conversation({_backend:'case-a'})", context))); },
    show: () => { context.fixtureDelivery = initial; vm.runInContext("showCustomerUpdate(fixtureDelivery)", context); },
    click: (name: string) => { const button = control(name); return button.disabled ? undefined : actions[name](button); },
    close: () => { dialog = undefined; controls = []; },
    review: () => actions.reviewCustomerUpdate(new Control("button", { "data-id": "delivery-a" })),
    prepare: () => actions.prepareCustomerUpdate(new Control("button", {})),
  };
}

test.each(["x", "widget_email"])("prepare and review %s display frozen exact content/evidence; only approval sends", async (channel) => {
  const b = await browser(delivery("prepared", channel)); b.render();
  await b.click("prepareCustomerUpdate");
  expect(b.actions()).toEqual([{ action: "customerUpdatePrepare", caseId: "case-a", runId: "run-a" }]);
  expect(b.dialog()?.body).toContain("Exact approved preview\nhttps://preview.example.test/");
  expect(b.dialog()?.body).toContain("c".repeat(40));
  expect(b.dialog()?.body).toContain(channel === "x" ? "Reply as @Acme to original X post 123456" : "Email from support@example.test to Exact.Case@example.test");
  expect(b.controls().filter((c) => ["input", "textarea"].includes(c.tag))).toEqual([]);
  b.close(); await b.review();
  expect(b.actions().map((a) => a.action)).toEqual(["customerUpdatePrepare", "customerUpdateReview"]);
  await b.click("sendCustomerUpdate");
  expect(b.actions().at(-1)).toEqual({ action: "customerUpdateSend", id: "delivery-a", reviewHash: "a".repeat(64) });
});

test.each(["unknown", "accepted", "sending"])("%s state offers readback and no send action", async (kind) => {
  const b = await browser(delivery(kind)); b.show();
  expect(b.controls().some((c) => c.dataset.act === "sendCustomerUpdate")).toBe(false);
  const field = b.controls().find((c) => c.attributes.id === "customer-update-provider-id");
  if (!field) throw new Error("Missing receipt field"); field.value = "  exact-provider-id  ";
  await b.click("reconcileCustomerUpdate");
  expect(b.actions()).toEqual([{ action: "customerUpdateReconcile", id: "delivery-a", reviewHash: "a".repeat(64), providerId: "exact-provider-id" }]);
});

test("verified state has no send or reconciliation action", async () => {
  const b = await browser(delivery("verified")); b.show();
  expect(b.controls().filter((c) => c.dataset.act && c.dataset.act !== "close")).toEqual([]);
  expect(b.fetch).not.toHaveBeenCalled();
});

test.each(["prepare", "review"])("late %s response cannot reopen closed drawer or follow changed selection/scope", async (action) => {
  for (const change of ["close", "selection", "scope"]) {
    const b = await browser();
    let complete: ((response: Response) => void) | undefined;
    b.fetch.mockImplementation(() => new Promise<Response>((resolve) => { complete = resolve; }));
    const pending = action === "prepare" ? b.prepare() : b.review();
    if (change === "close") b.close();
    if (change === "selection") b.report._backend = "case-other";
    if (change === "scope") b.state.scopeApp = "app-other";
    if (!complete) throw new Error("No pending request"); complete(Response.json({ delivery: delivery() })); await pending;
    expect(b.dialog()?.title).not.toBe("Review customer preview update");
    expect(b.fetch).toHaveBeenCalledTimes(1);
  }
});

test("double approval clicks issue one send; uncertain error re-reads without resending", async () => {
  const b = await browser(); b.show();
  let complete: ((response: Response) => void) | undefined;
  b.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
  const pending = b.click("sendCustomerUpdate"); await b.click("sendCustomerUpdate");
  expect(b.fetch).toHaveBeenCalledTimes(1);
  b.fetch.mockResolvedValueOnce(Response.json({ delivery: delivery("unknown") }));
  if (!complete) throw new Error("No pending request"); complete(Response.json({ error: "Provider outcome uncertain" }, { status: 400 })); await pending;
  expect(b.actions().map((a) => a.action)).toEqual(["customerUpdateSend", "customerUpdateReview"]);
  expect(b.controls().some((c) => c.dataset.act === "sendCustomerUpdate")).toBe(false);
  expect(b.dialog()?.body).toContain("Provider outcome uncertain");
});

test("malicious saved message is rendered as text without executable DOM", async () => {
  const b = await browser(delivery("prepared", "x", '<img src=x onerror="alert(1)"><script>alert(1)</script>')); b.show();
  expect(b.controls().some((c) => ["img", "script"].includes(c.tag))).toBe(false);
  expect(b.dialog()?.body).toContain("&lt;img");
});
