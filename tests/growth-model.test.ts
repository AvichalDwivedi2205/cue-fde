import { beforeEach, expect, test, vi } from "vitest";
const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("../lib/gemini", () => ({
  client: () => ({ models: { generateContent: generate } }),
}));
import { draftGrowth } from "../lib/growth-model";
const link = "https://cue.test/g/opaque";
const claims = ["Find saved memories using all words in a caption query"];
beforeEach(() => generate.mockReset());
test.each([
  "Cue finds saved caption words: ",
  "Bloom finds captions using any query word: ",
  "Bloom supports collaborative albums: ",
  "Bloom syncs captions across phones: ",
])("rejects unverified model wording: %s", async (wording) => {
  generate.mockResolvedValue({ text: wording + link });
  await expect(
    draftGrowth("Find saved captions", claims, link, "Bloom"),
  ).rejects.toThrow("supported-claim policy");
});
test.each([`${link} ${link}`, `${link} https://unrelated.test`])(
  "rejects duplicate or additional destinations",
  async (urls) => {
    generate.mockResolvedValue({ text: "Find saved captions: " + urls });
    await expect(
      draftGrowth("Find saved captions", claims, link, "Bloom"),
    ).rejects.toThrow("supported-claim policy");
  },
);
test("passes the actual product name and preserves all-word search", async () => {
  const text = "Bloom finds saved captions using all query words: " + link;
  generate.mockResolvedValue({ text });
  expect(await draftGrowth("Find saved captions", claims, link, "Bloom")).toBe(
    text,
  );
  expect(JSON.parse(generate.mock.calls[0][0].contents).productName).toBe(
    "Bloom",
  );
});
