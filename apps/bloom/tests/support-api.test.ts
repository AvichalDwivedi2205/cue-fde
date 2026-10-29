// @vitest-environment node
import { beforeEach, expect, test, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  guest: vi.fn(),
  sameOrigin: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  cue: vi.fn(),
  supportToken: vi.fn(),
}));
vi.mock("../lib/server", () => ({
  guest: mocks.guest,
  sameOrigin: mocks.sameOrigin,
  db: () => ({ query: mocks.query, mutation: mocks.mutation }),
  secret: () => "private-bloom-secret",
  supportToken: mocks.supportToken,
  cue: mocks.cue,
  ticket: vi.fn(),
  MAX_PHOTO_BYTES: 5 * 1024 * 1024,
  boundedJSON: (request: Request) => request.json(),
}));
vi.mock("../lib/growth", () => ({ attachCampaign: vi.fn() }));
import { GET, POST } from "../app/api/bloom/route";
const request = (body: unknown) =>
  new Request("https://bloom.test/api/bloom", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const feedback = {
  action: "feedback",
  caseId: "actual-case",
  messageId: "actual-answer",
  outcome: "needs_help",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.guest.mockResolvedValue("signed-bloom-visitor");
  mocks.supportToken.mockResolvedValue("canonical-cue-visitor-token");
  mocks.query.mockResolvedValue([]);
  mocks.cue.mockResolvedValue({ duplicate: false, outcome: "needs_help" });
});
test("installed Bloom feedback uses its existing signed visitor token and preserves the actual receipt", async () => {
  const response = await POST(request(feedback));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    duplicate: false,
    outcome: "needs_help",
  });
  expect(mocks.supportToken).toHaveBeenCalledWith("signed-bloom-visitor");
  expect(mocks.cue).toHaveBeenCalledWith("/api/widget", {
    ...feedback,
    token: "canonical-cue-visitor-token",
  });
  expect(JSON.stringify(mocks.cue.mock.calls)).not.toContain(
    "private-bloom-secret",
  );
  expect(response.headers.get("cache-control")).toBe("no-store");
  mocks.cue.mockResolvedValue({ duplicate: true, outcome: "needs_help" });
  expect(await (await POST(request(feedback))).json()).toEqual({
    duplicate: true,
    outcome: "needs_help",
  });
});
test("callers cannot inject another app or visitor token; bad origin is rejected before reading identity", async () => {
  expect(
    (
      await POST(
        request({ ...feedback, app: "different-app", token: "forged" }),
      )
    ).status,
  ).toBe(400);
  expect(
    (await POST(request({ ...feedback, owner: "another-customer" }))).status,
  ).toBe(400);
  expect(
    (await POST(request({ ...feedback, outcome: "resolved" }))).status,
  ).toBe(400);
  expect(mocks.cue).not.toHaveBeenCalled();
  expect(mocks.guest).not.toHaveBeenCalled();
  mocks.sameOrigin.mockImplementation(() => {
    throw new Error("Origin not allowed");
  });
  expect((await POST(request(feedback))).status).toBe(403);
  expect(mocks.guest).not.toHaveBeenCalled();
});
test("a failed or contradictory Cue response cannot be shown as saved feedback", async () => {
  mocks.cue.mockRejectedValue(
    new Error("Answer not found in your conversation"),
  );
  expect((await POST(request(feedback))).status).toBe(400);
  mocks.cue.mockResolvedValue({ duplicate: false, outcome: "solved" });
  expect((await POST(request(feedback))).status).toBe(400);
  mocks.cue.mockResolvedValue({ id: "case-without-feedback-receipt" });
  expect((await POST(request(feedback))).status).toBe(400);
});
test("installed polling carries source citations, outcomes, attachments and live resolution progress", async () => {
  const messages = [
    {
      id: "answer-one",
      role: "cue",
      author: "Cue",
      body: "Photos up to 5 MB",
      outcome: "solved",
      citations: [
        { title: "Approved upload FAQ", excerpt: "5 MB", heading: "Uploads" },
      ],
    },
  ];
  const attachments = [
    { name: "actual screenshot", url: "https://storage.test/attachment" },
  ];
  const progress = {
    label: "Fix verified",
    detail: "The deployed release passed our checks.",
    steps: [{ title: "Verified release", state: "current" }],
  };
  mocks.cue.mockResolvedValue({
    case: { id: "actual-case", title: "Upload failed", status: "resolved" },
    messages,
    attachments,
    progress,
  });
  const response = await GET(),
    data = await response.json();
  expect(response.status).toBe(200);
  expect(data.conversation).toEqual({
    case: {
      id: "actual-case",
      _id: "actual-case",
      title: "Upload failed",
      status: "resolved",
    },
    messages,
    attachments,
    progress,
  });
  expect(mocks.cue).toHaveBeenCalledWith("/api/widget", {
    action: "read",
    token: "canonical-cue-visitor-token",
  });
  expect(JSON.stringify(data)).not.toContain("canonical-cue-visitor-token");
});
