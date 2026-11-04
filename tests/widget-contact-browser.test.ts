import { readFile } from "node:fs/promises";
import { Script, createContext } from "node:vm";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { expect, test, vi } from "vitest";
vi.mock("../lib/app-pack", () => ({ requireSessionPack: async () => ({ appId: "app-a", name: "App A", origins: ["https://customer.test"] }), asWidgetApp: (pack: { appId: string; name: string; origins: string[] }) => ({ id: pack.appId, name: pack.name, origins: pack.origins }) }));
vi.mock("../lib/widget-preview", () => ({ widgetOriginAllowed: async () => true }));
import { GET } from "../app/widget/route";

class Element {
  textContent = ""; value = ""; checked = false; required = false; disabled = false; hidden = false;
  scrollHeight = 100; scrollTop = 0; clientHeight = 100; files = [];
  children: Element[] = [];
  onclick?: () => Promise<void>;
  oninput?: () => void;
  onsubmit?: (event: { preventDefault(): void }) => Promise<void>;
  constructor(readonly tag: string, readonly attributes: Record<string, string> = {}) {
    this.checked = "checked" in attributes; this.required = "required" in attributes; this.disabled = "disabled" in attributes; this.hidden = "hidden" in attributes;
  }
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  closest() { return this; }
  querySelectorAll() { return this.children; }
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
async function widget() {
  const html = await (await GET(new Request("https://cue.test/widget?app=app-a&origin=https%3A%2F%2Fcustomer.test"))).text();
  const elements = new Map<string, Element>();
  function visit(node: DefaultTreeAdapterMap["node"]) {
    if ("tagName" in node) {
      const attributes = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
      if (attributes.id) elements.set(attributes.id, new Element(node.tagName, attributes));
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(parse(html));
  const element = (id: string) => { const value = elements.get(id); if (!value) throw new Error("Missing actual widget control " + id); return value; };
  const parent = { postMessage: vi.fn() };
  type Init = { source: unknown; origin: string; data: { type: string; app: string; origin: string; token: string } };
  let listener: ((event: Init) => void) | undefined, interval: (() => void) | undefined;
  let savedPreference: null | { kind: "opted_in"; address: string } = null;
  const fetch = vi.fn<(url: string, options: { body: string }) => Promise<Response>>().mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body);
    if (body.action === "read") return Response.json({ name: "App A", messages: [], notificationsAvailable: true, notificationEmail: savedPreference, case: { id: "case-a", status: "open" } });
    if (body.action === "contact") return Response.json({ contact: { kind: "opted_in", address: body.contact.address } });
    throw new Error("Unexpected action " + body.action);
  });
  new Script(await readFile("public/widget-frame.js", "utf8"), { filename: "widget-frame.js" }).runInContext(createContext({
    URLSearchParams, location: { search: "?app=app-a&origin=https%3A%2F%2Fcustomer.test" }, parent, fetch,
    document: { hidden: false, getElementById: element, createElement: (tag: string) => new Element(tag) },
    window: { addEventListener: (_name: string, handler: (event: Init) => void) => { listener = handler; } },
    setInterval: (callback: () => void) => { interval = callback; },
  }));
  return { element, fetch,
    calls: () => fetch.mock.calls.map(([, options]) => JSON.parse(options.body)),
    init: async (valid = true) => { listener?.({ source: valid ? parent : {}, origin: "https://customer.test", data: { type: "cue:init", app: "app-a", origin: "https://customer.test", token: "signed-fixture-session" } }); await settle(); },
    poll: async () => { interval?.(); await settle(); },
    saved: (address: string) => { savedPreference = { kind: "opted_in", address }; },
    edit: (address: string, enabled = true) => { element("notification-enabled").checked = enabled; element("notification-email").value = address; element("notification-form").oninput?.(); },
    submit: () => element("notification-form").onsubmit?.({ preventDefault() {} }),
  };
}

test("actual served widget starts unchecked; initialization and polling never opt in or send preferences", async () => {
  const b = await widget();
  expect(b.element("notification-enabled").checked).toBe(false);
  expect(b.element("notification-email").required).toBe(false);
  await b.init(); await b.poll();
  expect(b.element("notification-preferences").hidden).toBe(false);
  expect(b.calls().map((call) => call.action)).toEqual(["read", "read"]);
  expect(b.element("notification-enabled").checked).toBe(false);
});

test("editing alone sends nothing, survives polling, explicit save preserves exact case then explicit revoke", async () => {
  const b = await widget(); await b.init();
  b.edit("  Exact.Case@Example.test  "); await b.poll();
  expect(b.element("notification-email").value).toBe("  Exact.Case@Example.test  ");
  expect(b.element("notification-enabled").checked).toBe(true); expect(b.element("notification-email").required).toBe(true);
  expect(b.calls().every((call) => call.action === "read")).toBe(true);
  await b.submit();
  expect(b.calls().at(-1)).toEqual({ action: "contact", app: "app-a", origin: "https://customer.test", token: "signed-fixture-session", preview: false, caseId: "case-a", contact: { kind: "opt_in", address: "Exact.Case@Example.test" } });
  b.saved("Exact.Case@Example.test"); await b.poll();
  expect(b.element("notification-email").value).toBe("Exact.Case@Example.test");
  b.edit("Exact.Case@Example.test", false); await b.poll();
  expect(b.element("notification-enabled").checked).toBe(false);
  expect(b.element("notification-email").required).toBe(false);
  await b.submit(); expect(b.calls().at(-1).contact).toEqual({ kind: "revoke" });
  expect(b.calls().filter((call) => call.action === "contact")).toHaveLength(2);
});

test("saved opt-in renders on reload; typing another address is protected from readback", async () => {
  const b = await widget(); b.saved("Saved.Case@example.test"); await b.init();
  expect(b.element("notification-enabled").checked).toBe(true);
  expect(b.element("notification-email").value).toBe("Saved.Case@example.test");
  b.edit("New.Case@example.test"); await b.poll();
  expect(b.element("notification-email").value).toBe("New.Case@example.test");
  expect(b.calls().some((call) => call.action === "contact")).toBe(false);
});

test("duplicate saves, polling and message/handoff submissions are guarded while contact save is pending; errors preserve draft", async () => {
  const b = await widget(); await b.init(); b.edit("Pending.Case@example.test");
  let complete: ((response: Response) => void) | undefined;
  b.fetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve; }));
  const pending = b.submit(); await b.submit(); await b.poll();
  b.element("message").value = "Do not send while contact save is pending";
  await b.element("composer").onsubmit?.({ preventDefault() {} }); await b.element("handoff").onclick?.();
  expect(b.calls().map((call) => call.action)).toEqual(["read", "contact"]);
  expect(b.element("notification-save").disabled).toBe(true);
  if (!complete) throw new Error("Missing pending contact request"); complete(Response.json({ error: "Consent could not be saved" }, { status: 400 })); await pending;
  expect(b.element("notification-status").textContent).toBe("Consent could not be saved");
  expect(b.element("notification-save").disabled).toBe(false);
  await b.poll(); expect(b.element("notification-email").value).toBe("Pending.Case@example.test");
  expect(b.calls().filter((call) => call.action === "contact")).toHaveLength(1);
});

test("uninitialized foreign widget cannot save contact", async () => {
  const b = await widget(); await b.init(false); b.edit("Somebody@example.test"); await b.submit(); await b.poll();
  expect(b.fetch).not.toHaveBeenCalled();
});
