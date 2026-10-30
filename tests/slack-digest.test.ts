import { describe, expect, test, vi } from "vitest";

// memberDigest is the /cue slash command. Its correctness gates are: the
// saved-member gate, per-app counting, honest pluralization, and
// disambiguation when several packs share a name (the digest must never
// silently pick one).

vi.mock("../lib/server-store", () => ({
  db: () => ({
    query: async (_fn: unknown, _args: unknown) => snapshotFixture,
  }),
  secret: () => "test-secret",
  api: { cue: { snapshot: "cue:snapshot" } },
}));
vi.mock("../lib/app-pack", () => ({
  listPacks: async () => packsFixture,
}));
vi.mock("../lib/slack-messages", () => ({ cueLink: () => null }));

const snapshotFixture = {
  cases: [
    { _id: "c1", appId: "a_notes", status: "open" },
    { _id: "c2", appId: "a_notes", status: "open" },
    { _id: "c3", appId: "a_notes", status: "resolved" },
    { _id: "c4", appId: undefined, status: "open" },
  ],
  issues: [
    { _id: "i1", appId: "a_notes", status: "spec_ready" },
    { _id: "i2", appId: "a_notes", status: "awaiting_approval" },
    { _id: "i3", appId: "a_bloom", status: "open" },
    { _id: "i4", appId: undefined, status: "open" },
  ],
  runs: [
    { _id: "r1", issueId: "i2", status: "awaiting_approval" },
    { _id: "r2", issueId: "i3", status: "awaiting_approval" },
    { _id: "r3", issueId: "i1", status: "resolved" },
  ],
};
const packsFixture = [
  { appId: "a_notes", name: "Notes", status: "active", origins: [] },
  { appId: "a_notes2", name: "Notes", status: "active", origins: [] },
  { appId: "a_bloom", name: "Bloom", status: "active", origins: [], aliases: ["bloom"] },
  { appId: "a_susp", name: "Suspended App", status: "suspended", origins: [] },
];
const config = {
  botToken: "xoxb-test",
  defaultChannel: "C1",
  signingSecret: "s",
  teamId: "T1",
  operatorIds: [],
  members: [
    { slackId: "UOWNER", role: "owner", name: "Owner" },
    { slackId: "UENG", role: "engineering", name: "Eng" },
  ],
} as never;

const { memberDigest } = await import("../lib/slack-digest");

describe("/cue digest", () => {
  test("unknown Slack member is refused with guidance", async () => {
    const r = await memberDigest(config, "USTRANGER");
    expect(r.text).toContain("not saved");
  });

  test("saved member sees per-app counts with honest pluralization", async () => {
    const r = await memberDigest(config, "UOWNER");
    const notes = r.text.split("*Notes*")[1];
    const bloom = r.text.split("*Bloom*")[1];
    expect(notes).toContain("2 open reports");
    expect(notes).toContain("1 run awaiting engineering");
    expect(notes).toContain("1 spec awaiting product");
    // Legacy intake (no appId) lands on the bloom-aliased pack.
    expect(bloom).toContain("1 open report");
    expect(bloom).toContain("0 in progress");
    expect(bloom).toContain("1 run awaiting engineering");
    expect(r.text).not.toContain("progresss");
    expect(r.text).not.toContain("engineerings ·");
    expect(r.text).not.toContain("products ·");
    // Legacy intake (no appId) lands on Bloom, suspended packs are hidden.
    expect(r.text).not.toContain("Suspended App");
  });

  test("a unique name filter narrows to that app", async () => {
    const r = await memberDigest(config, "UENG", "Bloom");
    expect(r.text).toContain("*Bloom*");
    expect(r.text).not.toContain("*Notes*");
  });

  test("a duplicate name filter disambiguates by app id", async () => {
    const r = await memberDigest(config, "UENG", "Notes");
    expect(r.text).toContain("Several applications match");
    expect(r.text).toContain("Notes — a_notes");
    expect(r.text).toContain("Notes — a_notes2");
  });

  test("an app id filter always resolves, even among duplicates", async () => {
    const r = await memberDigest(config, "UENG", "a_notes2");
    expect(r.text).toContain("*Notes*");
    expect(r.text).toContain("0 open reports");
  });

  test("an unknown filter is reported, not silently ignored", async () => {
    const r = await memberDigest(config, "UENG", "nope");
    expect(r.text).toContain("No Cue application matches");
  });
});
