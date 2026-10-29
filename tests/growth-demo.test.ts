import { expect, test } from "vitest";
import vm from "node:vm";
import { design } from "../lib/design";

async function harness(storage = new Map<string, string>()) {
  const html = await (await design("cue")).text();
  const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1])
    .find((s) => s.includes("function growthPage()"))!;
  const elements = new Map<string, { value?: string; open?: boolean }>();
  let writes = 0;
  const context = vm.createContext({
    window: {},
    document: {
      addEventListener: () => {},
      removeEventListener: () => {},
      getElementById: () => null,
      querySelector: (s: string) => elements.get(s),
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    setInterval: () => 1,
    fetch: (_url: string, options?: { method?: string }) => {
      if (options?.method === "POST") writes++;
      return new Promise(() => {});
    },
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    },
  });
  const executable = script.replace(
    /hydrateIcons\(\);\s*initLanding\(\);\s*(?:initStory\(\);\s*)?route\(\);\s*\}\)\(\);\s*$/,
    `
    S.ag.appId = 'bloom'; S.growth.opps = [];
    growthData = {opportunities: [], drafts: [], touches: [], browsers: []};
    gRerender = () => {}; toast = () => {};
    window.product = {render: () => gResults(), actions: A,
      setRecords: (records) => {growthData = records;},
      live: () => growthData};
  })();`,
  );
  vm.runInContext(executable, context);
  return {
    product: context.window.product as {
      render(): string;
      actions: Record<string, unknown>;
      setRecords(records: unknown): void;
      live(): unknown;
    },
    writes: () => writes,
    html,
  };
}

test("product results cannot restore browser-only scenarios or mutate records through demo controls", async () => {
  const h = await harness(
    new Map([["cue:growth-demo:bloom", '{"activated":900}']]),
  );
  const before = JSON.stringify(h.product.live());
  expect(h.product.render()).not.toContain("Demo scenario");
  expect(h.product.render()).not.toContain("Sample numbers");
  expect(h.product.render()).not.toContain("900");
  for (const action of [
    "gResultView",
    "gDemoSave",
    "gDemoReset",
    "reset",
    "demoToggle",
    "sampleX",
    "failToggle",
  ])
    expect(h.product.actions[action]).toBeUndefined();
  expect(h.html).not.toContain('aria-label="Demo controls"');
  expect(JSON.stringify(h.product.live())).toBe(before);
  expect(h.writes()).toBe(0);
});

test("controlled, returning, internal and unbound visits cannot inflate organic acquisition", async () => {
  const h = await harness();
  h.product.setRecords({
    opportunities: [
      { _id: "organic", eligible: true },
      { _id: "controlled", controlled: true },
    ],
    drafts: [],
    touches: [
      { _id: "touch", opportunityId: "organic", status: "verified" },
      {
        _id: "controlled-touch",
        opportunityId: "controlled",
        status: "verified",
      },
      {
        _id: "unknown-touch",
        opportunityId: "outside-snapshot",
        status: "verified",
      },
    ],
    browsers: [
      { touchId: "touch", confirmedAt: 1, savedAt: 2, activatedAt: 3 },
      {
        touchId: "controlled-touch",
        confirmedAt: 1,
        savedAt: 2,
        activatedAt: 3,
      },
      {
        touchId: "touch",
        internal: true,
        confirmedAt: 1,
        savedAt: 2,
        activatedAt: 3,
      },
      {
        touchId: "touch",
        returning: true,
        confirmedAt: 1,
        savedAt: 2,
        activatedAt: 3,
      },
      { touchId: "unknown-touch", confirmedAt: 1, savedAt: 2, activatedAt: 3 },
      { touchId: "touch", confirmedAt: 3, savedAt: 2, activatedAt: 1 },
    ],
  });
  const html = h.product.render();
  expect(html).toContain("<b>1</b><span>Published</span>");
  expect(html).toContain("<b>2</b><span>Visits</span>");
  expect(html).toContain("<b>1</b><span>Activated</span>");
  expect(html).toContain("Controlled/internal traffic excluded");
  expect(h.writes()).toBe(0);
});
