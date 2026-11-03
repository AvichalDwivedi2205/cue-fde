import { afterEach, beforeEach, expect, test, vi } from "vitest";
import sharp from "sharp";
import { parseScreenshot } from "../lib/attachment";
import { savedReportImages } from "../lib/triage";

beforeEach(() => vi.stubEnv("CUE_CONVEX_URL", ""));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
async function png() {
  return sharp({
    create: { width: 2, height: 2, channels: 3, background: "#1976d2" },
  })
    .png()
    .toBuffer();
}

test.each(["png", "jpeg", "webp"] as const)(
  "screenshot boundary preserves valid %s pixels and MIME",
  async (format) => {
    const bytes = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#1976d2" },
    })
      .toFormat(format)
      .toBuffer();
    expect(
      await parseScreenshot(
        `data:image/${format};base64,${bytes.toString("base64")}`,
      ),
    ).toEqual({ mimeType: `image/${format}`, data: bytes.toString("base64") });
  },
);

test("screenshot boundary rejects a forged MIME and noncanonical/invalid base64", async () => {
  const bytes = await png();
  await expect(
    parseScreenshot(`data:image/jpeg;base64,${bytes.toString("base64")}`),
  ).rejects.toThrow("type");
  await expect(
    parseScreenshot("data:image/png;base64,aGVsbG8==="),
  ).rejects.toThrow("encoding");
  await expect(
    parseScreenshot("data:image/svg+xml;base64,PHN2Zz4="),
  ).rejects.toThrow("Invalid screenshot");
  await expect(
    parseScreenshot("data:image/png;base64," + "a".repeat(6 * 1024 * 1024)),
  ).rejects.toThrow("Invalid screenshot");
});

test("triage reads same-case/owner images using the server Convex origin before public environment values", async () => {
  const bytes = await png();
  vi.stubEnv("CUE_CONVEX_URL", "https://trusted.convex.cloud");
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://other.convex.cloud");
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    async () =>
      new Response(new Uint8Array(bytes), {
        headers: { "content-type": "image/png" },
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const current = {
    caseId: "case-1",
    owner: "visitor-1",
    url: "https://trusted.convex.cloud/api/storage/current",
  };
  const images = await savedReportImages({
    caseId: "case-1",
    owner: "visitor-1",
    attachments: [
      { ...current, caseId: "other-case" },
      { ...current, owner: "other-owner" },
      { ...current, url: "https://untrusted.test/api/storage/image" },
      { ...current, url: "https://trusted.convex.cloud/private-endpoint" },
      { ...current, url: "http://trusted.convex.cloud/api/storage/image" },
      current,
    ],
  });
  expect(images).toEqual([
    { mimeType: "image/png", data: bytes.toString("base64") },
  ]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: "error" });
});

test("triage bounds screenshot count and makes storage failures a text-only path", async () => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://trusted.convex.cloud");
  const fetcher = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("Storage unavailable"));
  vi.stubGlobal("fetch", fetcher);
  const attachments = [1, 2, 3].map((id) => ({
    caseId: "case-1",
    owner: "visitor-1",
    url: `https://trusted.convex.cloud/api/storage/${id}`,
  }));
  expect(
    await savedReportImages({
      caseId: "case-1",
      owner: "visitor-1",
      attachments,
    }),
  ).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test("triage rejects oversized storage bodies", async () => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://trusted.convex.cloud");
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(
      new Response("too big", {
        headers: { "content-type": "image/png", "content-length": "4000001" },
      }),
    ),
  );
  expect(
    await savedReportImages({
      caseId: "case-1",
      attachments: [
        {
          caseId: "case-1",
          owner: "visitor-1",
          url: "https://trusted.convex.cloud/api/storage/large",
        },
      ],
    }),
  ).toEqual([]);
});

test("invalid storage configuration leaves triage text-only", async () => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "invalid-url");
  const fetcher = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetcher);
  expect(
    await savedReportImages({ caseId: "case-1", attachments: [] }),
  ).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});
