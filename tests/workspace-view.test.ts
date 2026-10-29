import { expect, test } from "vitest";
import vm from "node:vm";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { design } from "../lib/design";

async function workspaceBrowser(selected: string) {
  const html = await (await design("cue")).text();
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((s) => s.includes("function growthPage()"))!;
  const storage = new Map([["cue-agent-app", selected]]);
  const changes: ((e: unknown) => void)[] = [];
  const reads: { url: string; resolve: (r: unknown) => void }[] = [];
  const context = vm.createContext({
    window: {},
    document: {
      querySelector: () => ({ innerHTML: "" }),
      addEventListener: (name: string, fn: (e: unknown) => void) => {
        if (name === "change") changes.push(fn);
      },
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    fetch: (url: string) =>
      new Promise((resolve) => reads.push({ url, resolve })),
    setInterval: () => 1,
    localStorage: { getItem: () => null },
    sessionStorage: {
      getItem: (k: string) => storage.get(k),
      setItem: (k: string, v: string) => storage.set(k, v),
    },
  });
  vm.runInContext(
    script.replace(
      /hydrateIcons\(\);\s*initLanding\(\);\s*(?:initStory\(\);\s*)?route\(\);\s*\}\)\(\);\s*$/,
      `agRefresh = () => {}; gRerender = () => {};
     window.controls = { state: S, workspace: loadWorkspace, growth: loadGrowth, action: growthAction,
       sidebar: () => { const el = {innerHTML: ''}; document.querySelector = () => el; renderSidebar(); return el.innerHTML; },
       top: () => { const el = {innerHTML: ''}; document.querySelector = () => el; renderTop(); return el.innerHTML; },
       issues: () => issuesList(), requests: () => {S.id = null; return featuresPage();},
       setSnapshot: (snapshot) => {liveSnapshot = snapshot;},
       loop: () => loopStrip(), actions: A
     }; })();`,
    ),
    context,
  );
  return {
    context,
    storage,
    reads,
    changes,
    controls: context.window.controls,
  };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
function elements(
  node: DefaultTreeAdapterTypes.Node,
): DefaultTreeAdapterTypes.Element[] {
  return [
    ...("tagName" in node ? [node] : []),
    ...("childNodes" in node ? node.childNodes.flatMap(elements) : []),
  ];
}
test("workspace keeps eight destinations and Growth separate from Cue buyer research", async () => {
  const { controls } = await workspaceBrowser("bloom");
  controls.state.sec = "growth";
  // The router stores the Growth subpage in tab and clears the issue ID.
  controls.state.id = null;
  controls.state.growth.tab = "opportunities";
  const links = elements(parse(controls.sidebar())).filter(
    (n) => n.tagName === "a",
  );
  const attribute = (node: DefaultTreeAdapterTypes.Element, name: string) =>
    node.attrs.find((a) => a.name === name)?.value;
  expect(links.map((n) => attribute(n, "href"))).toEqual(
    expect.arrayContaining([
      "/knowledge",
      "/settings",
      "#/agents",
      "#/features",
      "#/growth",
    ]),
  );
  expect(links.map((n) => attribute(n, "href"))).not.toContain("/customers");
  expect(links.map((n) => attribute(n, "href"))).not.toContain("/setup");
  expect(
    links
      .filter((n) => attribute(n, "aria-current") === "page")
      .map((n) => attribute(n, "href")),
  ).toEqual(["#/growth"]);
});
const snapshot = (id: string) => ({
  app: { id, name: id },
  apps: [{ id, name: id }],
  operator: { name: "Owner", role: "owner" },
  agents: [],
  tasks: [{ id: "task-" + id }],
  conversations: [],
});
const growth = (appId: string) => ({
  appId,
  capabilities: [],
  campaigns: [],
  opportunities: [],
  drafts: [],
  touches: [],
  browsers: [],
  reviewDeliveries: [],
});

test("reload restores selected application and app switch rejects old workspace and Growth responses", async () => {
  const browser = await workspaceBrowser("legacy-app");
  expect(browser.controls.state.ag.appId).toBe("legacy-app");
  expect(browser.reads.map((r) => r.url)).toContain(
    "/api/agents?app=legacy-app",
  );
  expect(browser.reads.map((r) => r.url)).toContain(
    "/api/growth?app=legacy-app",
  );
  browser.changes.forEach((fn) =>
    fn({ target: { id: "ag-app", value: "current-app" } }),
  );
  expect(browser.storage.get("cue-agent-app")).toBe("current-app");
  expect(browser.controls.state.ag.connected).toBe(false);
  browser.reads
    .find((r) => r.url.startsWith("/api/agents"))!
    .resolve({ ok: true, json: async () => snapshot("legacy-app") });
  browser.reads
    .find((r) => r.url.startsWith("/api/growth"))!
    .resolve({ ok: true, json: async () => growth("legacy-app") });
  await flush();
  expect(browser.controls.state.ag.appId).toBe("current-app");
  expect(browser.controls.state.ag.tasks).toHaveLength(0);
  const refreshed = browser.controls.workspace();
  browser.reads
    .at(-1)!
    .resolve({ ok: true, json: async () => snapshot("current-app") });
  await refreshed;
  expect(browser.controls.state.ag.tasks).toEqual([{ id: "task-current-app" }]);
  const reloaded = await workspaceBrowser(
    browser.storage.get("cue-agent-app")!,
  );
  expect(reloaded.controls.state.ag.appId).toBe("current-app");
});

test("Activity app switch cannot submit a Growth action using previous app data", async () => {
  const browser = await workspaceBrowser("legacy-app");
  browser.reads
    .find((r) => r.url.startsWith("/api/agents"))!
    .resolve({ ok: true, json: async () => snapshot("legacy-app") });
  browser.reads
    .find((r) => r.url.startsWith("/api/growth"))!
    .resolve({ ok: true, json: async () => growth("legacy-app") });
  await flush();
  browser.changes.forEach((fn) =>
    fn({ target: { id: "ta-app", value: "current-app" } }),
  );
  const before = browser.reads.length;
  await expect(
    browser.controls.action("capture", { url: "https://x.test/source" }),
  ).rejects.toThrow("selected application");
  expect(browser.reads).toHaveLength(before);
  expect(browser.controls.state.ag.tasks).toHaveLength(0);
  expect(browser.controls.state.growth.opps).toHaveLength(0);
});

test("failed refresh for previous app cannot mark newly selected app unavailable", async () => {
  const browser = await workspaceBrowser("legacy-app");
  browser.changes.forEach((fn) =>
    fn({ target: { id: "ta-app", value: "current-app" } }),
  );
  browser.controls.state.ag.connected = true;
  browser.controls.state.growth.state = "populated";
  browser.reads
    .find((r) => r.url.startsWith("/api/agents"))!
    .resolve({ ok: false, json: async () => ({ error: "old scope failure" }) });
  browser.reads
    .find((r) => r.url.startsWith("/api/growth"))!
    .resolve({ ok: false, json: async () => ({ error: "old scope failure" }) });
  await flush();
  expect(browser.controls.state.ag.connected).toBe(true);
  expect(browser.controls.state.growth.state).toBe("populated");
});

test("registered app scope filters issue/request reports and preserves exact app in Knowledge links", async () => {
  const { controls } = await workspaceBrowser("customer-app");
  controls.state.ag.apps = [
    { id: "customer-app", name: "Customer app" },
    { id: "another-app", name: "Another app" },
  ];
  controls.state.ag.appId = "customer-app";
  controls.state.scopeApp = "customer-app";
  controls.state.cases = [
    { id: "case-a", appId: "customer-app", channel: "chat", status: "open" },
    { id: "case-b", appId: "another-app", channel: "chat", status: "open" },
  ];
  controls.state.issues = {
    a: {
      id: "issue-a",
      _backend: "record-a",
      appId: "customer-app",
      title: "Customer issue",
      priority: "P1",
      status: "open",
      cases: ["case-a"],
    },
    b: {
      id: "issue-b",
      _backend: "record-b",
      appId: "another-app",
      title: "Private other issue",
      priority: "P1",
      status: "open",
      cases: ["case-b"],
    },
  };
  controls.state.features = [
    {
      id: "request-a",
      appId: "customer-app",
      title: "Customer request",
      need: "A new view",
      status: "collecting",
      created: 1,
      week: 1,
      requesters: [],
    },
    {
      id: "request-b",
      appId: "another-app",
      title: "Other request",
      need: "Another view",
      status: "collecting",
      created: 1,
      week: 1,
      requesters: [],
    },
  ];
  controls.setSnapshot({ runs: [] });
  expect(controls.issues()).toContain("Customer issue");
  expect(controls.issues()).not.toContain("Private other issue");
  expect(controls.requests()).toContain("Customer request");
  expect(controls.requests()).not.toContain("Other request");
  expect(controls.sidebar()).toContain("/knowledge?app=customer-app");
  controls.state.scopeApp = "all";
  expect(controls.issues()).toContain("Private other issue");
  expect(controls.requests()).toContain("Other request");
  controls.actions.productAppMenu();
  expect(controls.top()).toContain("Customer app");
  expect(controls.top()).toContain("Another app");
  expect(controls.top()).not.toContain("Bloom iOS");
});

test("Home counts independent deployed verification and verified replies separately from growth outcomes", async () => {
  const { controls } = await workspaceBrowser("customer-app");
  controls.state.scopeApp = "all";
  controls.state.cases = [];
  controls.state.issues = {
    verified: {
      id: "verified",
      _backend: "issue-verified",
      status: "resolved",
      cases: [],
    },
    approved: {
      id: "approved",
      _backend: "issue-approved",
      status: "resolved",
      cases: [],
    },
  };
  controls.state.growth.opps = [
    { id: "published", status: "published", pub: { state: "verified" } },
    { id: "claimed", status: "published", pub: { state: "reported" } },
    {
      id: "controlled",
      status: "published",
      controlled: true,
      pub: { state: "verified" },
    },
  ];
  controls.setSnapshot({
    runs: [
      {
        issueId: "issue-verified",
        status: "resolved",
        verified: true,
        deployed: true,
      },
      {
        issueId: "issue-approved",
        status: "awaiting_approval",
        verified: false,
        deployed: false,
      },
    ],
  });
  const loop = elements(parse(controls.loop())).filter(
    (n) => n.tagName === "a",
  );
  const text = (node: DefaultTreeAdapterTypes.Node): string =>
    "value" in node
      ? node.value
      : "childNodes" in node
        ? node.childNodes.map(text).join("")
        : "";
  expect(loop.map(text)).toContain("Fixed1deployed and verified");
  expect(loop.map(text)).toContain("Replies published1verified public replies");
  expect(loop.map(text).join(" ")).not.toContain("Grown");
});

test("persisted negative feedback reaches Your turn without counting closed, synthetic or other-app conversations", async () => {
  const { controls } = await workspaceBrowser("customer-app");
  controls.state.scopeApp = "customer-app";
  controls.state.cases = [
    {
      id: "needs-help",
      _backend: "needs-help",
      appId: "customer-app",
      customer: "Customer",
      status: "open",
      tags: ["Needs human reply"],
    },
    {
      id: "closed",
      _backend: "closed",
      appId: "customer-app",
      status: "resolved",
      tags: ["Needs human reply"],
    },
    {
      id: "synthetic",
      _backend: "synthetic",
      appId: "customer-app",
      status: "open",
      sample: true,
      tags: ["Needs human reply"],
    },
    {
      id: "other",
      _backend: "other",
      appId: "other-app",
      status: "open",
      tags: ["Needs human reply"],
    },
  ];
  expect(controls.top()).toContain('aria-label="1 things waiting on you"');
  controls.state.cases[0].status = "resolved";
  expect(controls.top()).toContain('aria-label="0 things waiting on you"');
});
