import { readFile } from "node:fs/promises";
import { Script, createContext } from "node:vm";
import { expect, test, vi } from "vitest";
import { z } from "zod";

const frameScript = new Script(
  await readFile(new URL("../public/widget-frame.js", import.meta.url), "utf8"),
  { filename: "widget-frame.js" },
);
const screenshotError = "Screenshot type does not match its contents";
const requestInput = z.object({
  action: z.enum(["session", "read", "message", "feedback"]),
  attachment: z.string().optional(),
  token: z.string().optional(),
  handoff: z.boolean().optional(),
});
type FixtureFile = { size: number; data: string };
type InitEvent = { source: unknown; origin: string; data: { type: string; app: string; origin: string; token: string } };
class Element {
  textContent = "";
  value = "";
  disabled = false;
  hidden = false;
  files: FixtureFile[] = [];
  scrollHeight = 100;
  scrollTop = 0;
  clientHeight = 100;
  children: Element[] = [];
  onclick?: () => Promise<void>;
  onsubmit?: (event: { preventDefault(): void }) => Promise<void>;
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren() { this.children = []; }
  closest() { return this; }
  querySelectorAll() { return this.children; }
}
class FileReader {
  result = "";
  onload?: () => void;
  onerror?: () => void;
  readAsDataURL(file: FixtureFile) { this.result = file.data; this.onload?.(); }
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function widget() {
  const elements = new Map<string, Element>();
  const element = (id: string) => {
    let found = elements.get(id);
    if (!found) { found = new Element(); elements.set(id, found); }
    return found;
  };
  element("status").textContent = "Connecting…";
  const parent = { postMessage: vi.fn() };
  let listener: ((event: InitEvent) => void) | undefined;
  let interval: (() => void) | undefined;
  let saved = false;
  let readFailure = false;
  let resolveMessage: ((response: Response) => void) | undefined;
  const calls: z.infer<typeof requestInput>[] = [];
  const fetch = vi.fn(async (_url: string, options: { body: string }) => {
    const body = requestInput.parse(JSON.parse(options.body));
    calls.push(body);
    if (body.action === "read")
      return Response.json(readFailure ? { error: "Polling failed" } : {
        name: "Example app", messages: [], case: saved ? { id: "case-1", status: "open" } : null,
      }, { status: readFailure ? 500 : 200 });
    if (body.action === "message") {
      if (!saved) return Response.json({ error: screenshotError }, { status: 400 });
      return await new Promise<Response>((resolve) => { resolveMessage = resolve; });
    }
    throw new Error("Unexpected fixture action: " + body.action);
  });
  frameScript.runInContext(createContext({
    location: { search: "?app=app-a&origin=https%3A%2F%2Fcustomer.test" },
    URLSearchParams,
    FileReader,
    parent,
    fetch,
    document: { hidden: false, getElementById: element, createElement: () => new Element() },
    window: { addEventListener: (_name: string, handler: (event: InitEvent) => void) => { listener = handler; } },
    setInterval: (callback: () => void, delay: number) => { expect(delay).toBe(5000); interval = callback; },
  }));
  const initEvent = { source: parent, origin: "https://customer.test", data: {
    type: "cue:init", app: "app-a", origin: "https://customer.test", token: "visitor-session",
  } };
  return {
    element,
    calls,
    fetch,
    initEvent,
    dispatch: async (event: InitEvent = initEvent) => { listener?.(event); await settle(); },
    poll: async () => { interval?.(); await settle(); },
    submit: () => element("composer").onsubmit?.({ preventDefault() {} }),
    failPolling: () => { readFailure = true; },
    allowRetry: () => { saved = true; },
    completeRetry: () => {
      if (!resolveMessage) throw new Error("No pending send");
      resolveMessage(Response.json({ caseId: "case-1" }));
    },
  };
}
async function rejectedScreenshot() {
  const frame = widget();
  await frame.dispatch();
  frame.element("message").value = "Please inspect this screenshot";
  frame.element("attachment").files = [{ size: 100, data: "data:image/png;base64,/9j/fixture" }];
  frame.element("attachment").value = "mistaken.png";
  await frame.submit();
  expect(frame.element("status").textContent).toBe(screenshotError);
  return frame;
}

test("a rejected screenshot keeps its error and draft through successful and failed polling", async () => {
  const frame = await rejectedScreenshot();
  expect(frame.calls.at(-1)).toMatchObject({ action: "message", attachment: "data:image/png;base64,/9j/fixture" });
  await frame.poll();
  expect(frame.calls.at(-1)?.action).toBe("read");
  expect(frame.element("status").textContent).toBe(screenshotError);
  frame.failPolling();
  await frame.poll();
  expect(frame.element("status").textContent).toBe(screenshotError);
  expect(frame.element("message").value).toBe("Please inspect this screenshot");
  expect(frame.element("attachment").value).toBe("mistaken.png");
  expect(frame.element("send").disabled).toBe(false);
});

test.each(["send", "handoff"])("a %s retry clears the old error at start and stays clear after success", async (retry) => {
  const frame = await rejectedScreenshot();
  frame.allowRetry();
  const completion = retry === "send" ? frame.submit() : frame.element("handoff").onclick?.();
  await settle();
  expect(frame.element("status").textContent).toBe("Saving…");
  const count = frame.fetch.mock.calls.length;
  await frame.poll();
  expect(frame.fetch).toHaveBeenCalledTimes(count);
  frame.completeRetry();
  await completion;
  expect(frame.element("status").textContent).toBe("Your conversation is saved");
  await frame.poll();
  expect(frame.element("status").textContent).toBe("Your conversation is saved");
  expect(frame.element("send").disabled).toBe(false);
  if (retry === "send") expect(frame.element("message").value).toBe("");
});

test.each(["origin", "source"])("a wrong %s cannot initialize a visitor session or send", async (guard) => {
  const frame = widget();
  await frame.dispatch({ ...frame.initEvent, ...(guard === "origin" ? { origin: "https://foreign.test" } : { source: {} }) });
  frame.element("message").value = "Draft";
  await frame.submit();
  await frame.poll();
  expect(frame.fetch).not.toHaveBeenCalled();
  expect(frame.element("status").textContent).toBe("Connecting…");
});
