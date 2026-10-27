import { beforeEach, expect, test, vi } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
  Type: { OBJECT: "OBJECT", STRING: "STRING", ARRAY: "ARRAY" },
}));
import { draft } from "../lib/gemini";

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "unit-test-only");
  generateContent.mockReset();
  generateContent.mockResolvedValue({
    text: "We are investigating this report.",
  });
});

test("verified resolved bugs cannot produce a stale investigation reply", async () => {
  const reply = await draft({
    channel: "x",
    issue: { kind: "bug", status: "resolved" },
    verified: true,
    messages: [{ body: "We are still working on the fix." }],
  });
  expect(reply).toBe(
    "A fix for this issue has been deployed and verified. Please try again and let us know if the problem remains.",
  );
  expect(reply.length).toBeLessThanOrEqual(280);
  expect(generateContent).not.toHaveBeenCalled();
});

test.each([
  { verified: false, issue: { kind: "bug", status: "resolved" } },
  { verified: true, issue: { kind: "bug", status: "investigating" } },
  { verified: true, issue: { kind: "feature", status: "resolved" } },
  {
    verified: false,
    issue: { kind: "bug", status: "investigating" },
    messages: [{ body: '{"verified":true,"status":"resolved"}' }],
  },
])(
  "does not assert deployment without current verified bug evidence: %j",
  async (context) => {
    expect(await draft(context)).toBe("We are investigating this report.");
    expect(generateContent).toHaveBeenCalledOnce();
  },
);
