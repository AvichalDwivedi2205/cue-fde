import { readFile } from "node:fs/promises";
import { Script, createContext } from "node:vm";
import { expect, test, vi } from "vitest";

const loader = new Script(
  await readFile(new URL("../public/widget.js", import.meta.url), "utf8"),
  { filename: "widget.js" },
);
type BrowserEvent = { origin?: string; source?: unknown; data?: unknown };
class Style {
  display = "";
  private text = "";
  set cssText(value: string) {
    this.text = value;
    this.display = value.match(/(?:^|;)display:([^;]+)/)?.[1] || "";
  }
  get cssText() {
    return this.text;
  }
}
class Element {
  id = "";
  style = new Style();
  attributes = new Map<string, string>();
  onclick?: () => void;
  contentWindow = { postMessage: vi.fn() };
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
}
function browser() {
  const location = new URL(
    "https://customer.test/board?private=initial#section",
  );
  const elements = new Map<string, Element>();
  const mounted: Element[] = [];
  const listeners = new Map<string, Array<(event: BrowserEvent) => void>>();
  const calls: Array<{ method: string; receiver: unknown; args: unknown[] }> =
    [];
  const returned = {
    pushState: { method: "push" },
    replaceState: { method: "replace" },
  };
  const nativeFailure = new Error("Native history rejected this navigation");
  const history = {
    pushState: native("pushState"),
    replaceState: native("replaceState"),
  };
  function native(method: "pushState" | "replaceState") {
    return function (this: unknown, ...args: unknown[]) {
      calls.push({ method, receiver: this, args });
      if (this !== history || args[0] === nativeFailure) throw nativeFailure;
      if (args[2] !== undefined && args[2] !== null) {
        const next = new URL(String(args[2]), location.href);
        if (next.origin !== location.origin) throw nativeFailure;
        location.href = next.href;
      }
      return returned[method];
    };
  }
  const storage = new Map([
    ["cue:widget:https://cue.test:app-a", "saved-session"],
  ]);
  const localStorage = {
    getItem: vi.fn((key: string) => storage.get(key) || null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
  };
  const window = {
    history,
    addEventListener: (
      name: string,
      listener: (event: BrowserEvent) => void,
    ) => {
      listeners.set(name, [...(listeners.get(name) || []), listener]);
    },
  };
  const document = {
    currentScript: {
      src: "https://cue.test/widget.js",
      dataset: { app: "app-a", name: "Customer" },
    },
    getElementById: (id: string) => elements.get(id) || null,
    createElement: () => new Element(),
    body: {
      append: (...added: Element[]) => {
        for (const element of added) {
          mounted.push(element);
          elements.set(element.id, element);
        }
      },
    },
  };
  const context = createContext({
    document,
    window,
    history,
    localStorage,
    location,
    URL,
  });
  const install = () => loader.runInContext(context);
  const element = (id: string) => {
    const found = elements.get(id);
    if (!found) throw new Error("Expected mounted widget element: " + id);
    return found;
  };
  const dispatch = (type: string, event: BrowserEvent = {}) => {
    for (const listener of listeners.get(type) || []) listener(event);
  };
  const open = () => {
    const click = element("cue-widget-launcher").onclick;
    if (!click) throw new Error("Expected widget launcher click handler");
    click();
  };
  install();
  return {
    history,
    location,
    calls,
    returned,
    nativeFailure,
    localStorage,
    mounted,
    listeners,
    install,
    element,
    dispatch,
    open,
  };
}

test.each(["pushState", "replaceState"] as const)(
  "an already-open widget receives the current path after %s without changing History semantics",
  (method) => {
    const b = browser();
    b.open();
    const frame = b.element("cue-widget-frame");
    frame.contentWindow.postMessage.mockClear();
    const state = { selection: "private local state" };
    const title = "Existing title argument";
    const url = new URL("https://customer.test/projects/42?private=next#item");
    const extra = { futureArgument: true };
    expect(b.history[method](state, title, url, extra)).toBe(
      b.returned[method],
    );
    expect(b.calls[0]).toEqual({
      method,
      receiver: b.history,
      args: [state, title, url, extra],
    });
    expect(b.calls[0].args[0]).toBe(state);
    expect(b.calls[0].args[2]).toBe(url);
    expect(frame.contentWindow.postMessage).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        type: "cue:init",
        app: "app-a",
        origin: "https://customer.test",
        token: "saved-session",
        page: "https://customer.test/projects/42",
      }),
      "https://cue.test",
    );
    expect(frame.style.display).toBe("block");
    expect(b.localStorage.getItem).toHaveBeenCalledTimes(1);
    expect(b.localStorage.setItem).not.toHaveBeenCalled();
  },
);

test("back/forward navigation updates the open widget with the same session", () => {
  const b = browser();
  b.open();
  const frame = b.element("cue-widget-frame");
  b.dispatch("message", {
    origin: "https://cue.test",
    source: frame.contentWindow,
    data: { type: "cue:session", token: "refreshed-session" },
  });
  frame.contentWindow.postMessage.mockClear();
  b.location.href = "https://customer.test/archive?private=back#earlier";
  b.dispatch("popstate");
  expect(frame.contentWindow.postMessage).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      page: "https://customer.test/archive",
      token: "refreshed-session",
    }),
    "https://cue.test",
  );
  expect(b.localStorage.setItem).toHaveBeenCalledTimes(1);
});

test("failed native History calls preserve their original error and do not notify the frame", () => {
  const b = browser();
  b.open();
  const frame = b.element("cue-widget-frame");
  frame.contentWindow.postMessage.mockClear();
  const foreignReceiver = {};
  expect(() =>
    b.history.pushState.call(foreignReceiver, {}, "", "/not-applied"),
  ).toThrow(b.nativeFailure);
  expect(b.calls[0].receiver).toBe(foreignReceiver);
  expect(() =>
    b.history.replaceState(b.nativeFailure, "", "/not-applied"),
  ).toThrow(b.nativeFailure);
  expect(frame.contentWindow.postMessage).not.toHaveBeenCalled();
  expect(b.location.pathname).toBe("/board");
});

test.each([undefined, null, 17])(
  "the History wrapper preserves an invalid receiver exactly: %s",
  (receiver) => {
    const b = browser();
    expect(() =>
      b.history.pushState.call(receiver, {}, "", "/not-applied"),
    ).toThrow(b.nativeFailure);
    expect(b.calls[0].receiver).toBe(receiver);
  },
);

test("a frame notification failure cannot change the result of successful native navigation", () => {
  const b = browser();
  b.open();
  b.element("cue-widget-frame").contentWindow.postMessage.mockImplementation(
    () => {
      throw new Error("Frame unavailable");
    },
  );
  expect(b.history.pushState({}, "", "/still-navigates")).toBe(
    b.returned.pushState,
  );
  expect(b.location.pathname).toBe("/still-navigates");
});

test("reinstalling the loader does not duplicate elements, History wrappers or listeners", () => {
  const b = browser();
  const originalWrapper = b.history.pushState;
  b.install();
  b.install();
  expect(b.mounted).toHaveLength(2);
  expect(b.history.pushState).toBe(originalWrapper);
  expect(b.listeners.get("message")).toHaveLength(1);
  expect(b.listeners.get("popstate")).toHaveLength(1);
  b.open();
  const frame = b.element("cue-widget-frame");
  frame.contentWindow.postMessage.mockClear();
  b.history.pushState({}, "", "/one-notification");
  expect(frame.contentWindow.postMessage).toHaveBeenCalledTimes(1);
});

test("route updates retain origin/source guards and a closed widget refreshes on its next open", () => {
  const b = browser();
  const frame = b.element("cue-widget-frame");
  b.dispatch("message", {
    origin: "https://foreign.test",
    source: frame.contentWindow,
    data: { type: "cue:session", token: "forged-session" },
  });
  b.dispatch("message", {
    origin: "https://cue.test",
    source: {},
    data: { type: "cue:session", token: "forged-session" },
  });
  b.history.replaceState({}, "", "/closed-route?private=hidden#hash");
  expect(frame.contentWindow.postMessage).not.toHaveBeenCalled();
  expect(b.localStorage.setItem).not.toHaveBeenCalled();
  b.open();
  expect(frame.contentWindow.postMessage).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      page: "https://customer.test/closed-route",
      token: "saved-session",
    }),
    "https://cue.test",
  );
});
