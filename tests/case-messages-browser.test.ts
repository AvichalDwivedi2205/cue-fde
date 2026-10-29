import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { expect, test, vi } from "vitest";

async function threadBrowser() {
  const source = await readFile("lib/browser/cue.js", "utf8");
  const selected = {
    _backend: "case-old",
    appId: "bloom",
    channel: "email",
    msgs: [],
    excerpt: "Summary must not become a message",
  };
  const state = { sec: "inbox", ag: { appId: "bloom" }, cases: [selected] };
  const fetch = vi.fn();
  const render = vi.fn();
  let now = 1000;
  const context = vm.createContext({
    S: state,
    CUE: { name: "Cue" },
    OP: { name: "Operator" },
    URLSearchParams,
    Date: { now: () => now },
    fetch,
    renderTabBody: render,
    curCase: () => state.cases[0],
    console: { error: vi.fn() },
  });
  vm.runInContext(
    source.slice(0, source.indexOf("async function cueAPI")),
    context,
  );
  return {
    context,
    state,
    selected,
    fetch,
    render,
    advance: () => {
      now += 2500;
    },
  };
}
test("selecting an older thread loads stored messages using the selected app and case", async () => {
  const b = await threadBrowser();
  b.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      messages: [
        {
          caseId: "case-old",
          role: "customer",
          author: "Native sender",
          body: "Stored native message",
          createdAt: 1,
        },
      ],
    }),
  });
  await vm.runInContext("loadCaseMessages(S.cases[0])", b.context);
  expect(b.fetch).toHaveBeenCalledWith(
    "/api/demo?caseId=case-old&appId=bloom",
    { cache: "no-store" },
  );
  expect(b.selected.msgs).toMatchObject([
    { text: "Stored native message", meta: "Native sender" },
  ]);
  expect(b.render).toHaveBeenCalledOnce();
});
test("a case response arriving after an app switch does not render the old thread", async () => {
  const b = await threadBrowser();
  let finish!: (value: unknown) => void;
  b.fetch.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const pending = vm.runInContext("loadCaseMessages(S.cases[0])", b.context);
  b.state.ag.appId = "cue_app_other";
  b.state.cases = [
    { ...b.selected, _backend: "case-other", appId: "cue_app_other", msgs: [] },
  ];
  finish({
    ok: true,
    json: async () => ({
      messages: [
        {
          caseId: "case-old",
          role: "customer",
          author: "Sender",
          body: "Private old thread",
          createdAt: 1,
        },
      ],
    }),
  });
  await pending;
  expect(b.state.cases[0].msgs).toEqual([]);
  expect(b.render).not.toHaveBeenCalled();
});

test("unchanged stored messages do not redraw the composer during polling", async () => {
  const b = await threadBrowser();
  b.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      messages: [
        {
          caseId: "case-old",
          role: "customer",
          author: "Sender",
          body: "Stored message",
          createdAt: 1,
        },
      ],
    }),
  });
  await vm.runInContext("loadCaseMessages(S.cases[0])", b.context);
  b.advance();
  await vm.runInContext("loadCaseMessages(S.cases[0])", b.context);
  expect(b.fetch).toHaveBeenCalledTimes(2);
  expect(b.render).toHaveBeenCalledOnce();
});
