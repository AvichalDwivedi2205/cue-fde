import { z } from "zod";
import { ConvexError } from "convex/values";
import { operator, sameOrigin } from "@/lib/access";
import { readIntegrations } from "@/lib/integration-config";
import { api, db, secret } from "@/lib/server-store";
import { KNOWLEDGE_WORKSPACE } from "@/lib/knowledge-policy";
import { requirementCoverage } from "@/lib/company-context-policy";
import type { Id } from "@/convex/_generated/dataModel";
export const runtime = "nodejs";
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("brand"),
      appId: z.string().min(1).max(100),
      expectedVersion: z.number().int().min(0),
      enabled: z.boolean(),
      label: z.string().trim().max(80),
      tone: z.enum(["warm", "direct", "professional", "playful"]),
      guidelines: z.string().trim().max(1000),
      examples: z.array(z.string().trim().min(1).max(1200)).max(3),
    })
    .strict(),
  z
    .object({
      action: z.literal("coverage"),
      appId: z.string().min(1).max(100),
      expectedRevision: z.number().int().min(0),
      requirements: z
        .array(
          z
            .object({
              id: z.string().min(1).max(80),
              label: z.string().trim().min(1).max(100),
              audience: z.enum(["customer", "staff"]),
              sourceIds: z.array(z.string().min(1).max(100)).max(10),
              maxAgeDays: z.number().int().min(1).max(3650).optional(),
            })
            .strict(),
        )
        .max(20),
    })
    .strict(),
]);
async function scope(appId: string) {
  if (!(await readIntegrations()).apps.some((a) => a.id === appId))
    throw new Error("Register the application in Setup first");
  return { secret: secret(), workspaceId: KNOWLEDGE_WORKSPACE, appId };
}
export async function GET(request: Request) {
  try {
    const user = await operator(request),
      apps = (await readIntegrations()).apps;
    const appId = new URL(request.url).searchParams.get("app") || apps[0]?.id;
    if (!appId)
      return Response.json({
        apps: [],
        canManage: ["owner", "product"].includes(user.role),
      });
    const saved = await db().query(
      api.companyContext.snapshot,
      await scope(appId),
    );
    const now = Date.now(),
      requirements = saved.manifest?.requirements || [];
    return Response.json(
      {
        apps: apps.map((a) => ({ id: a.id, name: a.name })),
        appId,
        canManage: ["owner", "product"].includes(user.role),
        brand: saved.brand,
        revision: saved.manifest?.revision || 0,
        sources: saved.sources,
        requirements: requirements.map((r) => ({
          ...r,
          ...requirementCoverage(r, saved.sources, now),
        })),
        checkedAt: now,
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
    if (!["owner", "product"].includes(user.role))
      return Response.json(
        { error: "Owner or Product role required" },
        { status: 403 },
      );
    const raw = await request.text();
    if (raw.length > 30000) throw new Error("Request too large");
    const a = input.parse(JSON.parse(raw)),
      args = {
        ...(await scope(a.appId)),
        actor: { id: user.email, name: user.name, role: user.role },
      };
    if (a.action === "brand") {
      await db().mutation(api.companyContext.saveBrand, {
        ...args,
        expectedVersion: a.expectedVersion,
        enabled: a.enabled,
        label: a.label,
        tone: a.tone,
        guidelines: a.guidelines,
        examples: a.examples,
      });
    } else
      await db().mutation(api.companyContext.saveManifest, {
        ...args,
        expectedRevision: a.expectedRevision,
        requirements: a.requirements.map((r) => ({
          ...r,
          sourceIds: r.sourceIds as Id<"knowledgeSources">[],
        })),
      });
    return Response.json({ ok: true });
  } catch (e) {
    const error =
      e instanceof ConvexError && typeof e.data === "string"
        ? e.data
        : e instanceof z.ZodError
          ? "Invalid context settings"
          : "Could not save context settings. Reload and check your permissions.";
    return Response.json({ error }, { status: 400 });
  }
}
