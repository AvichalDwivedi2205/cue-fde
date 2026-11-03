import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { expect, test, vi } from "vitest";

const escapeSource: string | undefined = (await readFile("design/cue.html", "utf8"))
  .split("\n")
  .find((line) => line.startsWith("const esc = "));
if (!escapeSource) throw new Error("Missing product escaping helper");
const escSource: string = escapeSource;

const analyzedBatch = {
  _id: "b" + "0".repeat(31),
  _creationTime: 1,
  appId: "cue_app_test",
  requestKey: "fixture-v1",
  creator: "Avi Dwivedi",
  provenance: {
    kind: "synthetic-fixture",
    fixture: "quiet-signals-evaluation",
    version: "v1",
  },
  posts: [
    { id: "p01", author: "Rhea M.", text: "We lost a board to an accidental clear-out. Any recovery path?" },
    { id: "p02", author: "Sam O.", text: "Same here — we need a way to restore cleared boards." },
    { id: "p03", author: "SpamBot", text: "Buy followers now at spam.example.com" },
  ],
  inputFingerprint: "a1b2c3d4e5f60718",
  state: "analyzed",
  attempts: [{ number: 1, status: "completed", startedAt: 1 }],
  analysis: {
    revision: 1,
    dispositions: [
      { postId: "p01", outcome: "evidence", clusterId: "c-recover", quote: "Any recovery path?", reason: "Direct recovery request." },
      { postId: "p02", outcome: "evidence", clusterId: "c-recover", quote: "we need a way to restore cleared boards", reason: "Same need from another author." },
      { postId: "p03", outcome: "spam", reason: "Promotional." },
    ],
    clusters: [
      {
        id: "c-recover",
        need: "Recover boards after accidental clears",
        rationale: "Two people lost work to destructive actions.",
        sentiment: "frustrated",
        sources: [
          { postId: "p01", author: "Rhea M.", quote: "Any recovery path?" },
          { postId: "p02", author: "Sam O.", quote: "we need a way to restore cleared boards" },
        ],
        distinctAuthors: 2,
        repeatedEvidence: true,
        proposal: {
          title: "Board recovery window",
          assumptions: ["A 30-day retention window is proposed for review"],
          specification: {
            need: "Restore cleared boards",
            specification: "A recovery window lists and restores cleared boards.",
            acceptanceCriteria: [
              "Cleared boards appear for their members",
              "Restore returns members and lists",
            ],
          },
        },
      },
    ],
    stats: { posts: 3, evidencePosts: 2, distinctEvidenceAuthors: 2, duplicatePosts: 0, spamPosts: 1, offTopicPosts: 0, insufficientPosts: 0, otherNeedPosts: 0 },
    receipt: {
      provider: "meta",
      model: "muse-spark-1.3",
      requestedModel: "muse-spark-1.3",
      inputTokens: 900,
      outputTokens: 420,
      durationMs: 3200,
    },
    completedAt: 2,
  },
  promoted: [],
  createdAt: 1,
  updatedAt: 2,
};

async function browser(options: { batches?: unknown[]; batch?: unknown; features?: unknown[]; role?: string; permissions?: Record<string, boolean> } = {}) {
  const source = await readFile("lib/browser/signals.js", "utf8");
  const state = {
    sec: "signals",
    scopeApp: "cue_app_test",
    ag: { appId: "", appName: "LatchGrid" },
    integrations: {
      role: options.role ?? "owner",
      permissions: options.permissions ?? { read: true, support: true, investigate: true, deploy: true, spec: true, manage: true },
    },
    features: options.features ?? [],
    sig: null,
  };
  let currentBatch: unknown = options.batch ?? null;
  const batches = options.batches ?? [];
  const postResponses: unknown[] = [];
  const fetch = vi.fn(async (url: string, init: { method?: string; body: string } = { body: "" }) => {
    if (init?.method === "POST") {
      const next = postResponses.shift();
      if (next === undefined) throw new Error("Unexpected POST " + url);
      return Response.json(next as Record<string, unknown>);
    }
    if (url.includes("batchId=")) return Response.json({ batch: currentBatch });
    return Response.json({ batches });
  });
  const toast = vi.fn();
  const navigations: string[] = [];
  let rendered = "";
  const store = new Map<string, string>();
  const main = { set innerHTML(value: string) { rendered = value; }, get innerHTML() { return rendered; } };
  const context = vm.createContext({
    S: state,
    A: {},
    OP: { name: "Avi Dwivedi" },
    esc: undefined as unknown as (s: string) => string,
    fetch,
    toast,
    go: (h: string) => { navigations.push(h); },
    loadCue: vi.fn(async () => {}),
    renderMain: () => {},
    route: () => {},
    applyRoleControls: () => {},
    productRequests: () => "<div class=\"fr-bar\">",
    setInterval: () => 0,
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    document: { querySelectorAll: () => [] },
    $: (sel: string) => (sel === "#main" ? main : null),
  });
  vm.runInContext(escSource, context);
  vm.runInContext(source, context);
  return {
    state,
    fetch,
    toast,
    navigations,
    html: () => rendered,
    setBatch: (batch: unknown) => {
      currentBatch = batch;
      vm.runInContext(`signalsBatch = ${JSON.stringify(batch ?? null)};`, context);
    },
    queuePost: (response: unknown) => postResponses.push(response),
    run: <T>(code: string) => vm.runInContext(code, context) as T,
  };
}

test("the import surface shows the provenance label before any analysis", async () => {
  const b = await browser();
  const html = b.run<string>("signalsPage()");
  expect(html).toContain("Import a bounded batch");
  expect(html).toContain("Provenance: synthetic operator fixture · fictional authors");
  expect(html).toContain("quiet-signals-evaluation v1");
  expect(html).not.toContain("Create build handoff");
});

test("an analyzed batch shows dispositions, exact quotes, and the served-model receipt", async () => {
  const b = await browser();
  b.setBatch(analyzedBatch);
  b.run("renderSignals()");
  const html = b.html();
  expect(html).toContain("synthetic operator fixture");
  expect(html).toContain("synthetic author");
  expect(html).toContain("Any recovery path?");
  expect(html).toContain("we need a way to restore cleared boards");
  expect(html).toContain("Spam or manipulation");
  expect(html).toContain("Repeated need · 2 posts · 2 distinct authors");
  expect(html).toContain("model interpretation: frustrated");
  expect(html).toContain("Proposed assumptions for Product review");
  expect(html).toContain("served muse-spark-1.3 via Meta");
  expect(html).toContain("Create build handoff");
});

test("promotion calls the API and opens the ordinary feature detail", async () => {
  const b = await browser({ features: [{ _backend: "issue-1", id: "FR-12" }] });
  b.setBatch(analyzedBatch);
  b.queuePost({ issueId: "issue-1" });
  await b.run<Promise<void>>(
    `A.signalsPromote({ dataset: { id: "c-recover" }, disabled: false })`,
  );
  const body = JSON.parse(b.fetch.mock.calls[0]![1]!.body);
  expect(body).toEqual({
    action: "promote",
    batchId: analyzedBatch._id,
    expectedAnalysisRevision: 1,
    clusterId: "c-recover",
  });
  expect(b.navigations).toEqual(["#/features/FR-12"]);
  expect(b.toast).toHaveBeenCalledWith(
    "Handoff ready · Product approval required before implementation",
  );
});

test("an analyzed all-noise batch offers nothing to promote", async () => {
  const b = await browser();
  b.setBatch({
    ...analyzedBatch,
    analysis: { ...analyzedBatch.analysis, clusters: [] },
  });
  b.run("renderSignals()");
  const html = b.html();
  expect(html).toContain("No supported need found");
  expect(html).toContain("No feature was proposed and nothing was queued");
  expect(html).not.toContain("Create build handoff");
});

test("failed attempts stay explicit; the retry budget shows when exhausted", async () => {
  const failedOnce = {
    ...analyzedBatch,
    state: "failed",
    analysis: undefined,
    attempts: [{ number: 1, status: "failed", startedAt: 1, error: "Meta returned invalid JSON" }],
  };
  const b = await browser();
  b.setBatch(failedOnce);
  b.run("renderSignals()");
  expect(b.html()).toContain("Retry analysis");
  expect(b.html()).toContain("Meta returned invalid JSON");
  b.setBatch({
    ...failedOnce,
    attempts: [
      { number: 1, status: "failed", startedAt: 1, error: "first" },
      { number: 2, status: "failed", startedAt: 2, error: "second" },
    ],
  });
  b.run("renderSignals()");
  expect(b.html()).toContain("Retry budget used");
  expect(b.html()).not.toContain('data-act="signalsRetry"');
});

test("the single-author cluster is honestly labelled, not inflated", async () => {
  const b = await browser();
  b.setBatch({
    ...analyzedBatch,
    analysis: {
      ...analyzedBatch.analysis,
      clusters: [
        {
          ...analyzedBatch.analysis.clusters[0],
          sources: [analyzedBatch.analysis.clusters[0].sources[0]],
          distinctAuthors: 1,
          repeatedEvidence: false,
        },
      ],
    },
  });
  b.run("renderSignals()");
  expect(b.html()).toContain(
    "Single report · not enough to establish a repeated pattern",
  );
});

test("buttons match saved roles: a support role cannot import, analyze, or promote", async () => {
  const b = await browser({
    role: "support",
    permissions: { read: true, support: true, investigate: false, deploy: false, spec: false, manage: false },
  });
  expect(b.run<string>("signalsPage()")).toContain(
    '<button class="btn primary" data-act="signalsImport" disabled',
  );
  b.setBatch(analyzedBatch);
  b.run("renderSignals()");
  expect(b.html()).toContain(
    'data-act="signalsPromote" data-id="c-recover" disabled',
  );
});


test("switching apps immediately clears the previous app's batch and controls", async () => {
  const b = await browser();
  b.setBatch(analyzedBatch);
  b.state.scopeApp = "app-b";
  b.run("renderSignals()");
  expect(b.html()).not.toContain("Any recovery path?");
  expect(b.html()).not.toContain("Create build handoff");
  await b.run<Promise<void>>("loadSignals()");
  expect(b.run("signalsBatch")).toBeNull();
});

test("a new app load does not wait for or accept the previous app's in-flight list", async () => {
  const b = await browser();
  const oldResponse = Promise.withResolvers<Response>();
  b.fetch.mockImplementationOnce(() => oldResponse.promise);
  const oldLoad = b.run<Promise<void>>("loadSignals()");
  b.state.scopeApp = "app-b";
  b.fetch.mockImplementationOnce(async () => Response.json({ batches: [] }));
  await b.run<Promise<void>>("loadSignals()");
  oldResponse.resolve(Response.json({ batches: [{ batchId: analyzedBatch._id, requestKey: "old-app", state: "analyzed" }] }));
  await oldLoad;
  expect(b.fetch.mock.calls.some(([url]) => url.includes("appId=app-b"))).toBe(true);
  expect(b.html()).not.toContain("old-app");
  expect(b.run("signalsSnapshot.batches.length")).toBe(0);
});

test("batch selections are saved per application", async () => {
  const b = await browser({ batch: analyzedBatch });
  await b.run<Promise<void>>(`loadSignalsBatch(${JSON.stringify(analyzedBatch._id)})`);
  expect(b.run('sessionStorage.getItem("cue-signals-batch:cue_app_test")')).toBe(analyzedBatch._id);
  expect(b.run('sessionStorage.getItem("cue-signals-batch")')).toBeNull();
});

test("a late detail response cannot reopen a batch after switching applications", async () => {
  const b = await browser();
  const oldResponse = Promise.withResolvers<Response>();
  b.fetch.mockImplementationOnce(() => oldResponse.promise);
  const oldLoad = b.run<Promise<void>>(`loadSignalsBatch(${JSON.stringify(analyzedBatch._id)})`);
  b.state.scopeApp = "app-b";
  b.run("renderSignals()");
  oldResponse.resolve(Response.json({ batch: analyzedBatch }));
  await oldLoad;
  b.run("renderSignals()");
  expect(b.run("signalsBatch")).toBeNull();
  expect(b.html()).not.toContain("Any recovery path?");
});

test("Back during a pending detail load keeps the batch list open and clears the saved selection", async () => {
  const b = await browser();
  const response = Promise.withResolvers<Response>();
  b.fetch.mockImplementationOnce(() => response.promise);
  const pending = b.run<Promise<void>>(`A.signalsSelect({ dataset: { id: ${JSON.stringify(analyzedBatch._id)} } })`);
  b.run("A.signalsBack()");
  response.resolve(Response.json({ batch: analyzedBatch }));
  await pending;
  expect(b.run("signalsBatch")).toBeNull();
  expect(b.run('sessionStorage.getItem("cue-signals-batch:cue_app_test")')).toBeNull();
  expect(b.html()).toContain("Import a bounded batch");
  expect(b.html()).not.toContain("Any recovery path?");
});

test("two batch selections keep the newer choice when responses arrive in reverse order", async () => {
  const b = await browser();
  const older = Promise.withResolvers<Response>();
  const newer = Promise.withResolvers<Response>();
  const newerBatch = { ...analyzedBatch, _id: "b" + "1".repeat(31) };
  b.fetch.mockImplementationOnce(() => older.promise).mockImplementationOnce(() => newer.promise);
  const oldLoad = b.run<Promise<void>>(`A.signalsSelect({ dataset: { id: ${JSON.stringify(analyzedBatch._id)} } })`);
  const newLoad = b.run<Promise<void>>(`A.signalsSelect({ dataset: { id: ${JSON.stringify(newerBatch._id)} } })`);
  newer.resolve(Response.json({ batch: newerBatch }));
  await newLoad;
  older.resolve(Response.json({ batch: analyzedBatch }));
  await oldLoad;
  expect(b.run("signalsBatch._id")).toBe(newerBatch._id);
  expect(b.run('sessionStorage.getItem("cue-signals-batch:cue_app_test")')).toBe(newerBatch._id);
});

test.each(["list", "detail"])("a pending poll %s cannot restore the old batch after a newer selection", async (phase) => {
  const b = await browser({ batch: analyzedBatch });
  await b.run<Promise<void>>(`loadSignalsBatch(${JSON.stringify(analyzedBatch._id)})`);
  const response = Promise.withResolvers<Response>();
  const newerBatch = { ...analyzedBatch, _id: "b" + "1".repeat(31) };
  const list = { batches: [{ batchId: analyzedBatch._id, requestKey: "fixture-v1", state: "analyzed" }] };
  if (phase === "detail") b.fetch.mockImplementationOnce(async () => Response.json(list));
  b.fetch.mockImplementationOnce(() => response.promise);
  const poll = b.run<Promise<void>>("loadSignals()");
  if (phase === "detail") await vi.waitFor(() => expect(b.fetch).toHaveBeenCalledTimes(3));
  b.fetch.mockImplementationOnce(async () => Response.json({ batch: newerBatch }));
  await b.run<Promise<void>>(`A.signalsSelect({ dataset: { id: ${JSON.stringify(newerBatch._id)} } })`);
  response.resolve(Response.json(phase === "list" ? list : { batch: analyzedBatch }));
  await poll;
  expect(b.run("signalsBatch._id")).toBe(newerBatch._id);
  expect(b.run('sessionStorage.getItem("cue-signals-batch:cue_app_test")')).toBe(newerBatch._id);
});

test("analysis completion cannot reopen or report success after Back during its detail refresh", async () => {
  const b = await browser();
  b.setBatch({ ...analyzedBatch, state: "ready", analysis: undefined, attempts: [] });
  const response = Promise.withResolvers<Response>();
  b.fetch.mockImplementationOnce(async () => Response.json({ state: "analyzed", attemptNumber: 1 }));
  b.fetch.mockImplementationOnce(() => response.promise);
  const pending = b.run<Promise<void>>("A.signalsAnalyze({ disabled: false })");
  await vi.waitFor(() => expect(b.fetch).toHaveBeenCalledTimes(2));
  b.run("A.signalsBack()");
  response.resolve(Response.json({ batch: analyzedBatch }));
  await pending;
  expect(b.run("signalsBatch")).toBeNull();
  expect(b.run('sessionStorage.getItem("cue-signals-batch:cue_app_test")')).toBeNull();
  expect(b.toast).not.toHaveBeenCalled();
});

test("an older failed selection cannot show an error after a newer selection succeeds", async () => {
  const b = await browser();
  const response = Promise.withResolvers<Response>();
  b.fetch.mockImplementationOnce(() => response.promise);
  const pending = b.run<Promise<void>>("A.signalsSelect({ dataset: { id: 'missing-batch' } })");
  b.fetch.mockImplementationOnce(async () => Response.json({ batch: analyzedBatch }));
  await b.run<Promise<void>>(`A.signalsSelect({ dataset: { id: ${JSON.stringify(analyzedBatch._id)} } })`);
  response.resolve(Response.json({ error: "Old selection unavailable" }, { status: 404 }));
  await pending;
  expect(b.run("signalsBatch._id")).toBe(analyzedBatch._id);
  expect(b.toast).not.toHaveBeenCalled();
});

test("a promotion detail refresh cannot navigate after Back", async () => {
  const b = await browser({ features: [{ _backend: "issue-1", id: "FR-12" }] });
  b.setBatch(analyzedBatch);
  const response = Promise.withResolvers<Response>();
  b.fetch.mockImplementationOnce(async () => Response.json({ issueId: "issue-1" }));
  b.fetch.mockImplementationOnce(() => response.promise);
  const pending = b.run<Promise<void>>("A.signalsPromote({ dataset: { id: 'c-recover' }, disabled: false })");
  await vi.waitFor(() => expect(b.fetch).toHaveBeenCalledTimes(2));
  b.run("A.signalsBack()");
  response.resolve(Response.json({ batch: analyzedBatch }));
  await pending;
  expect(b.run("signalsBatch")).toBeNull();
  expect(b.navigations).toEqual([]);
  expect(b.toast).not.toHaveBeenCalled();
});

test("an expired attempt offers explicit recovery and an active attempt cannot retry", async () => {
  const b = await browser();
  b.setBatch({ ...analyzedBatch, state: "analyzing", analysis: undefined, attempt: { number: 1, token: "test", expiresAt: Date.now() - 1000 }, attempts: [{ number: 1, status: "running", startedAt: 1 }] });
  b.run("renderSignals()");
  expect(b.html()).toContain("Recovery available");
  expect(b.html()).toContain('data-act="signalsRecover"');
  b.setBatch({ ...analyzedBatch, state: "analyzing", analysis: undefined, attempt: { number: 1, token: "test", expiresAt: Date.now() + 60000 }, attempts: [{ number: 1, status: "running", startedAt: 1 }] });
  b.run("renderSignals()");
  expect(b.html()).toContain("Analysis running");
  expect(b.html()).not.toContain('data-act="signalsRecover"');
  await b.run<Promise<void>>("A.signalsRetry({ disabled: false })");
  expect(b.fetch).not.toHaveBeenCalled();
});

test("an expired final attempt exposes reconciliation without promising another model call", async () => {
  const b = await browser();
  b.setBatch({ ...analyzedBatch, state: "analyzing", analysis: undefined, attempt: { number: 2, token: "test", expiresAt: Date.now() - 1000 }, attempts: [{ number: 1, status: "failed", startedAt: 1 }, { number: 2, status: "running", startedAt: 2 }] });
  b.run("renderSignals()");
  expect(b.html()).toContain("Reconcile expired attempt");
  expect(b.html()).toContain("No new model call");
});

test("an analysis response from a previous app cannot reload its batch or report success", async () => {
  const b = await browser();
  b.setBatch({ ...analyzedBatch, state: "ready", analysis: undefined, attempts: [] });
  const response = Promise.withResolvers<Response>();
  b.fetch.mockImplementationOnce(() => response.promise);
  const pending = b.run<Promise<void>>("A.signalsAnalyze({ disabled: false })");
  b.state.scopeApp = "app-b";
  b.run("renderSignals()");
  response.resolve(Response.json({ state: "analyzed", attemptNumber: 1 }));
  await pending;
  expect(b.fetch).toHaveBeenCalledTimes(1);
  expect(b.run("signalsBatch")).toBeNull();
  expect(b.toast).not.toHaveBeenCalled();
});

test("switching apps while a fixture loads cannot import it into the new app", async () => {
  const b = await browser();
  const response = Promise.withResolvers<Response>();
  b.fetch.mockImplementationOnce(() => response.promise);
  const pending = b.run<Promise<void>>("A.signalsImport({ disabled: false })");
  b.state.scopeApp = "app-b";
  b.run("renderSignals()");
  response.resolve(Response.json({ fixture: "scope", version: "v1", posts: analyzedBatch.posts }));
  await pending;
  expect(b.fetch).toHaveBeenCalledTimes(1);
  expect(b.run("signalsBatch")).toBeNull();
  expect(b.toast).not.toHaveBeenCalled();
});

test("a promotion response from a previous app cannot navigate to its feature", async () => {
  const b = await browser({ features: [{ _backend: "issue-1", id: "FR-12" }] });
  b.setBatch(analyzedBatch);
  const response = Promise.withResolvers<Response>();
  b.fetch.mockImplementationOnce(() => response.promise);
  const pending = b.run<Promise<void>>("A.signalsPromote({ dataset: { id: 'c-recover' }, disabled: false })");
  b.state.scopeApp = "app-b";
  b.run("renderSignals()");
  response.resolve(Response.json({ issueId: "issue-1" }));
  await pending;
  expect(b.fetch).toHaveBeenCalledTimes(1);
  expect(b.navigations).toEqual([]);
  expect(b.run("signalsBatch")).toBeNull();
});

test("recovery of an expired final claim records failure without showing a new successful analysis", async () => {
  const b = await browser();
  const attempts = [{ number: 1, status: "failed", startedAt: 1 }, { number: 2, status: "running", startedAt: 2 }];
  const expired = { ...analyzedBatch, state: "analyzing", analysis: undefined, attempt: { number: 2, token: "test", expiresAt: Date.now() - 1000 }, attempts };
  b.setBatch(expired);
  b.fetch.mockImplementationOnce(async () => Response.json({ state: "failed", error: "Analysis retry budget exhausted" }));
  b.fetch.mockImplementationOnce(async () => Response.json({ batch: { ...expired, state: "failed", attempt: undefined, attempts: attempts.map((a) => ({ ...a, status: "failed" })) } }));
  await b.run<Promise<void>>("A.signalsRecover({ disabled: false })");
  expect(JSON.parse(b.fetch.mock.calls[0]![1]!.body)).toEqual({ action: "analyze", batchId: analyzedBatch._id, expectedFingerprint: analyzedBatch.inputFingerprint });
  expect(b.html()).toContain("Retry budget used");
  expect(b.html()).not.toContain("Analysis running");
  expect(b.toast).toHaveBeenCalledWith("Analysis retry budget exhausted", "fail");
});
