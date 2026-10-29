// @vitest-environment node
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { expect, test, vi } from "vitest";

class Element {
  tagName: string;
  className = "";
  textContent = "";
  disabled = false;
  hidden = false;
  dataset: Record<string, string> = {};
  children: Element[] = [];
  onclick?: () => Promise<void>;
  onload?: () => void;
  value = "";
  title = "";
  private html = "";
  constructor(tagName = "div") {
    this.tagName = tagName;
  }
  append(...elements: Element[]) {
    this.children.push(...elements);
    for (const el of elements)
      if (el.tagName === "script") queueMicrotask(() => el.onload?.());
  }
  set innerHTML(value: string) {
    this.html = value;
    this.children = [];
  }
  get innerHTML() {
    return this.html;
  }
  querySelectorAll(tag: string): Element[] {
    return this.children.flatMap((el) => [
      ...(el.tagName === tag ? [el] : []),
      ...el.querySelectorAll(tag),
    ]);
  }
}
const script = readFileSync(
  new URL("../../../lib/browser/bloom.js", import.meta.url),
  "utf8",
);
const progress = {
  label: "Received",
  detail: "Saved for review",
  steps: [{ title: "Received", state: "current" }],
};
const data = () => ({
  memories: [],
  supportAvailable: true,
  conversation: {
    case: { _id: "actual-case", status: "open", title: "Upload question" },
    progress,
    attachments: [
      { url: "https://storage.test/shot", name: "Uploaded screenshot" },
    ],
    messages: [
      {
        id: "question-one",
        role: "customer",
        body: "What is the upload limit?",
      },
      {
        id: "answer-one",
        role: "cue",
        body: "Up to 5 MB",
        citations: [
          {
            title: "Actual approved FAQ",
            heading: "Uploads",
            excerpt: "Photos can be 5 MB",
          },
        ],
        outcome: null as null | string,
      },
    ],
  },
});
async function harness() {
  const nodes = new Map<string, Element>();
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, new Element());
    return nodes.get(id)!;
  };
  let snapshot = data();
  const polls: (() => Promise<void>)[] = [],
    toast = vi.fn();
  const fetcher = vi.fn(async (_url: string, options?: { body?: string }) => {
    if (options?.body) {
      const body = JSON.parse(options.body);
      if (body.action === "feedback") {
        snapshot.conversation.messages[1].outcome = body.outcome;
        return {
          ok: true,
          json: async () => ({ duplicate: false, outcome: body.outcome }),
        };
      }
    }
    return { ok: true, json: async () => snapshot };
  });
  const S = {
    query: "",
    journalState: "loading",
    memories: [],
    chat: [] as Record<string, unknown>[],
    chatOpen: true,
    flow: "idle",
  };
  const context = createContext({
    S,
    fetch: fetcher,
    document: {
      head: new Element("head"),
      hidden: false,
      createElement: (tag: string) => new Element(tag),
      querySelector: (q: string) => (q === ".topbar .avatar" ? null : node(q)),
    },
    window: { CueVoice: { open: vi.fn() } },
    queueMicrotask,
    Promise,
    JSON,
    URL,
    console: { error: vi.fn() },
    setInterval: (callback: () => Promise<void>) => {
      polls.push(callback);
    },
    $: node,
    msgEl: (m: Record<string, unknown>) => {
      const el = new Element();
      el.textContent = String(m.text || "");
      return el;
    },
    renderJournal: vi.fn(),
    renderGreet: vi.fn(),
    renderSugs: vi.fn(),
    greeting: () => "Hello",
    esc: (s: string) => s,
    drawCheck: () => "✓",
    setOnline: vi.fn(),
    toast,
    OK_TYPES: ["image/png"],
    MB: 1024 * 1024,
    addMsg: (m: Record<string, unknown>) => {
      S.chat.push(m);
      node("#chatLog").append(context.msgEl(m));
    },
  });
  runInContext(script, context);
  await new Promise((resolve) => setImmediate(resolve));
  return {
    context,
    S,
    nodes,
    node,
    fetcher,
    toast,
    polls,
    snapshot,
    replace: (next: ReturnType<typeof data>) => {
      snapshot = next;
    },
  };
}
test("the installed widget renders actual citations and sends answer feedback with actual IDs", async () => {
  const h = await harness(),
    log = h.node("#chatLog");
  const answer = log.children.find(
    (el) => el.dataset.messageId === "answer-one",
  )!;
  expect(answer.querySelectorAll("summary")[0].textContent).toBe(
    "Actual approved FAQ · Uploads",
  );
  expect(answer.querySelectorAll("p")[0].textContent).toBe(
    "Photos can be 5 MB",
  );
  expect(
    h.S.chat.some(
      (m) =>
        (m.attach as { label?: string } | undefined)?.label ===
        "Uploaded screenshot",
    ),
  ).toBe(true);
  const needHelp = answer
    .querySelectorAll("button")
    .find((el) => el.textContent === "Still need help")!;
  await needHelp.onclick!();
  const post = h.fetcher.mock.calls.find(([, options]) => options?.body);
  expect(JSON.parse(post![1]!.body!)).toEqual({
    action: "feedback",
    caseId: "actual-case",
    messageId: "answer-one",
    outcome: "needs_help",
  });
  const reloaded = log.children.find(
    (el) => el.dataset.messageId === "answer-one",
  )!;
  expect(
    reloaded.children.find((el) => el.className === "bloom-answer-feedback")!
      .textContent,
  ).toBe("The team has your request for help");
  expect(reloaded.querySelectorAll("button")).toHaveLength(0);
});
test("polling updates a verified release and restores solved feedback without recreating buttons", async () => {
  const h = await harness(),
    next = data();
  next.conversation.case.status = "resolved";
  next.conversation.progress = {
    label: "Fix verified",
    detail: "Independent deployed checks passed",
    steps: [{ title: "Verified release", state: "current" }],
  };
  next.conversation.messages[1].body =
    "Good news — the deployed upload fix passed checks.";
  next.conversation.messages[1].outcome = "solved";
  h.replace(next);
  await h.polls[0]();
  await new Promise((resolve) => setImmediate(resolve));
  expect(h.node("#casePin").innerHTML).toContain("Fix verified");
  expect(h.S.chat.find((m) => m.serverId === "answer-one")!.kind).toBe("fix");
  const answer = h
    .node("#chatLog")
    .children.find((el) => el.dataset.messageId === "answer-one")!;
  expect(
    answer.children.find((el) => el.className === "bloom-answer-feedback")!
      .textContent,
  ).toBe("You marked this answer solved");
  expect(answer.querySelectorAll("button")).toHaveLength(0);
});
test("failed feedback stays actionable and cannot show a saved outcome", async () => {
  const h = await harness(),
    answer = h
      .node("#chatLog")
      .children.find((el) => el.dataset.messageId === "answer-one")!,
    buttons = answer.querySelectorAll("button");
  h.fetcher.mockRejectedValueOnce(new Error("Feedback could not be saved"));
  await buttons.find((el) => el.textContent === "Solved")!.onclick!();
  expect(buttons.every((button) => !button.disabled)).toBe(true);
  expect(h.snapshot.conversation.messages[1].outcome).toBeNull();
  expect(h.toast).toHaveBeenCalledWith("Feedback could not be saved", {
    icon: "alert",
  });
  expect(h.toast).not.toHaveBeenCalledWith("Thanks. Your feedback is saved.");
});
test("background polling preserves a message and screenshot still being sent", async () => {
  const h = await harness(),
    next = data(),
    pending = {
      who: "me",
      status: "sending",
      text: "My pending report",
      attach: { label: "Pending screenshot" },
    };
  h.S.chat.push(pending);
  next.conversation.messages[1].body = "New reply arrived while sending";
  h.replace(next);
  await h.polls[0]();
  await new Promise((resolve) => setImmediate(resolve));
  expect(h.S.chat).toContain(pending);
  pending.status = "delivered";
  await h.polls[0]();
  await new Promise((resolve) => setImmediate(resolve));
  expect(
    h.S.chat.some((m) => m.text === next.conversation.messages[1].body),
  ).toBe(true);
});
