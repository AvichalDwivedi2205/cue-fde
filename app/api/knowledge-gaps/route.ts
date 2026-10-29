import { createHash } from "node:crypto";
import { z } from "zod";
import { operator, sameOrigin } from "@/lib/access";
import { readIntegrations } from "@/lib/integration-config";
import { api, db, secret } from "@/lib/server-store";
import { KNOWLEDGE_WORKSPACE } from "@/lib/knowledge-policy";
import type { Id } from "@/convex/_generated/dataModel";

const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.enum(["ignore", "reopen"]),
      appId: z.string().max(100),
      gapId: z.string().max(100),
    })
    .strict(),
  z
    .object({
      action: z.literal("teach"),
      appId: z.string().max(100),
      gapId: z.string().max(100),
      question: z.string().trim().min(1).max(500),
      answer: z.string().trim().min(1).max(5000),
      expectedReportCount: z.number().int().min(1),
    })
    .strict(),
]);
async function scope(appId: string) {
  if (!(await readIntegrations()).apps.some((a) => a.id === appId))
    throw new Error("Select a registered application");
  return { secret: secret(), workspaceId: KNOWLEDGE_WORKSPACE, appId };
}
export async function GET(request: Request) {
  try {
    const user = await operator(request),
      appId = new URL(request.url).searchParams.get("app") || "";
    return Response.json(
      {
        gaps: await db().query(api.feedbackGaps.snapshot, await scope(appId)),
        canEdit: ["owner", "product", "support"].includes(user.role),
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Sign in and select an authorised application" },
      { status: 401 },
    );
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await operator(request);
    if (!["owner", "product", "support"].includes(user.role))
      return Response.json(
        { error: "Owner, Product or Support role required" },
        { status: 403 },
      );
    if (Number(request.headers.get("content-length") || 0) > 10000)
      throw new Error("FAQ is too large");
    const a = input.parse(await request.json()),
      args = await scope(a.appId);
    if (a.action === "teach") {
      const text = `${a.question}\n\n${a.answer}`;
      return Response.json(
        await db().mutation(api.feedbackGaps.teach, {
          ...args,
          gapId: a.gapId as Id<"knowledgeGaps">,
          actor: user.email,
          question: a.question,
          answer: a.answer,
          expectedReportCount: a.expectedReportCount,
          hash: createHash("sha256").update(text).digest("hex"),
        }),
      );
    }
    await db().mutation(api.feedbackGaps.review, {
      ...args,
      gapId: a.gapId as Id<"knowledgeGaps">,
      action: a.action,
      actor: user.email,
    });
    return Response.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "";
    const known = [
      "Knowledge gap not found",
      "New reports arrived; reload before reviewing",
      "This gap already has an FAQ draft; open it to review or publish",
      "Select a registered application",
      "FAQ is too large",
      "FAQ needs a question and a reviewed answer",
    ].find((t) => message.includes(t));
    return Response.json(
      {
        error:
          known ||
          "Could not save this knowledge review. Check the fields and retry.",
      },
      { status: 400 },
    );
  }
}
