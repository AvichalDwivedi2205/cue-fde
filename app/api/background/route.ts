import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { api, db, secret } from "@/lib/server-store";
import { pollHostedX } from "@/lib/hosted-background";
import { classifySavedReport } from "@/lib/triage";
import type { Id } from "@/convex/_generated/dataModel";
export const runtime = "nodejs";
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("poll-x") }).strict(),
  z
    .object({
      action: z.literal("triage"),
      receiptId: z.string().min(1).max(100),
    })
    .strict(),
]);
export async function POST(request: Request) {
  const expected = Buffer.from("Bearer " + secret()),
    supplied = Buffer.from(request.headers.get("authorization") || "");
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const raw = await request.text();
    if (raw.length > 512)
      return Response.json({ error: "Invalid job" }, { status: 400 });
    const parsed = input.safeParse(JSON.parse(raw));
    if (!parsed.success)
      return Response.json({ error: "Invalid job" }, { status: 400 });
    if (parsed.data.action === "poll-x") await pollHostedX();
    else {
      const receiptId = parsed.data.receiptId as Id<"triageReceipts">;
      const receipt = await db().query(api.triageQueue.receipt, {
        secret: secret(),
        receiptId,
      });
      if (!receipt)
        return Response.json({ error: "Unknown job" }, { status: 400 });
      if (receipt.status === "queued") {
        if (!receipt.latest)
          await db().mutation(api.triageQueue.supersede, {
            secret: secret(),
            receiptId,
          });
        else await classifySavedReport(receipt.caseId, receiptId);
      }
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Processing unavailable; job remains saved" },
      { status: 503 },
    );
  }
}
