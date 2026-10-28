import { expect, test } from "vitest";
import { promises as fs } from "node:fs";
import vm from "node:vm";

test("actual Growth bridge renders unqualified sources and unsupported needs without fixture facts", async () => {
  const supplied = await fs.readFile("design/cue.html", "utf8");
  const detail = supplied.slice(
    supplied.indexOf("function gDetail("),
    supplied.indexOf("function gOpportunities("),
  );
  const adapter = await fs.readFile("lib/browser/growth.js", "utf8");
  const capabilityLookup = supplied.match(/const gCap = id =>[^\n]+/)![0];
  const writes: Record<string, unknown>[] = [];
  const data = {
    appId: "registered-app",
    capabilities: [
      {
        _id: "verified-cap",
        claims: [
          "Save a photo with a caption",
          "Find saved memories using all words",
        ],
        valid: true,
      },
    ],
    campaigns: [],
    drafts: [],
    touches: [
      {
        _id: "prepared-touch",
        opportunityId: "qualified-source",
        link: "https://cue.test/g/opaque",
        status: "unpublished",
      },
    ],
    browsers: [],
    reviewDeliveries: [],
    opportunities: [
      {
        _id: "discovered-source",
        author: "@tester",
        text: "Photo caption search request",
        sourceUrl: "https://x.test/source",
        status: "discovered",
        provenance: "Official read",
      },
      {
        _id: "unsupported-source",
        author: "@tester",
        text: "PDF request",
        sourceUrl: "https://x.test/unsupported",
        status: "needs-feature",
        need: "PDF export",
        reasons: ["No verified export"],
        provenance: "Official read",
      },
      {
        _id: "qualified-source",
        author: "@tester",
        text: "Find photo memories by caption",
        sourceUrl: "https://x.test/qualified",
        status: "qualified",
        capabilityId: "verified-cap",
        reasons: ["Caption search matches"],
        provenance: "Official read",
      },
    ],
  };
  const empty = () => "";
  const context = vm.createContext({
    S: {
      sec: "growth",
      ag: { appId: data.appId },
      growth: { opps: [], campaigns: [], capabilities: [] },
    },
    A: {},
    GA: {},
    G_TODO: ["qualified", "drafted", "awaiting", "approved"],
    fetch: async (_url: string, options?: RequestInit) => {
      if (options?.body) writes.push(JSON.parse(String(options.body)));
      return {
        ok: true,
        json: async () => (options?.body ? { ok: true } : data),
      };
    },
    toast: empty,
    gCur: () => null,
    setInterval: () => 1,
    loadWorkspace: async () => {},
    workspaceSignature: "",
    document: {
      activeElement: null,
      querySelectorAll: () => [],
      getElementById: () => null,
    },
    gDraftHtml: empty,
    gFootHtml: empty,
    gCampaigns: empty,
    growthPage: empty,
    gRerender: empty,
    applyRoleControls: empty,
    gCapHtml: empty,
    gSteps: empty,
    gStepsHtml: empty,
    gPubHtml: empty,
    gStatusChip: empty,
    gFit: empty,
    gJourney: empty,
    esc: (v: unknown) => String(v || ""),
    ic: empty,
    av: empty,
    chIc: empty,
    rel: empty,
    hm: empty,
  });
  vm.runInContext(capabilityLookup + "\n" + detail + "\n" + adapter, context);
  await vm.runInContext("loadGrowth()", context);
  // The eager initial load may own the in-flight guard; wait its promise chain.
  await new Promise((resolve) => setImmediate(resolve));
  expect(vm.runInContext("G_TODO.includes('discovered')", context)).toBe(true);
  const discovered = vm.runInContext("gDetail(S.growth.opps[0])", context);
  expect(discovered).toContain("qualification pending");
  expect(discovered).toContain("matching awaits source qualification");
  expect(discovered).toContain("Qualify source");
  expect(discovered).not.toContain("Not a product need");
  const unsupported = vm.runInContext("gDetail(S.growth.opps[1])", context);
  expect(unsupported).toContain("No verified capability answers this request");
  expect(unsupported).toContain("No feature or release is promised");
  expect(unsupported).toContain("Propose feature candidate");
  expect(vm.runInContext("gDraftHtml(S.growth.opps[2])", context)).toContain(
    "Use verified reply",
  );
  vm.runInContext("gCur = () => S.growth.opps[2]", context);
  await vm.runInContext("GA.gFixed()", context);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toMatchObject({
    action: "edit",
    appId: data.appId,
    opportunityId: "qualified-source",
  });
  expect(writes[0].text).toContain("all query words");
  expect(writes[0].text).toContain("https://cue.test/g/opaque");
  vm.runInContext("S.growth.capabilities[0].status = 'stale'", context);
  await vm.runInContext("GA.gFixed()", context);
  expect(writes).toHaveLength(1);
});
