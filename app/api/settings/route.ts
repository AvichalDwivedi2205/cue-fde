import { z } from "zod";
import { operator, sameOrigin } from "@/lib/access";
import { requirePermission } from "@/lib/roles";
import { readIntegrations, updateIntegrations } from "@/lib/integration-config";
import { SUPPORT_MODELS } from "@/lib/knowledge-answer";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "@/lib/knowledge-policy";
import { GROWTH_MODELS, configuredRoute, modelRoute, routeReadiness } from "@/lib/model-config";
import { geminiReady } from "@/lib/google-client";
import { getMetaConnection, META_WONDER_MODEL } from "@/lib/meta";
import { sharedWorkerStatus } from "@/lib/integration-checks";
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("workspace"),
      name: z.string().trim().min(1).max(60),
      timezone: z
        .string()
        .max(60)
        .refine((v) => {
          try {
            new Intl.DateTimeFormat("en", { timeZone: v });
            return true;
          } catch {
            return false;
          }
        }, "Use a valid IANA time zone"),
    })
    .strict(),
  z
    .object({
      action: z.literal("model"),
      supportModel: z.enum(SUPPORT_MODELS),
    })
    .strict(),
  z
    .object({
      action: z.literal("growth-model"),
      growthModel: z.enum(GROWTH_MODELS),
    })
    .strict(),
]);
export async function GET(request: Request) {
  try {
    const actor = await operator(request),
      config = await readIntegrations();
    const agentRoute = await configuredRoute({ purpose: "triage" });
    const coding = (await sharedWorkerStatus().catch(() => null))?.coding;
    let metaConfigured = false;
    try { getMetaConnection(); metaConfigured = true; } catch {}
    return Response.json(
      {
        actor,
        canManage: actor.role === "owner",
        workspace: config.workspace || {
          name: "Cue workspace",
          timezone: "Asia/Kolkata",
        },
        ownerEmail: process.env.CUE_OPERATOR_EMAIL,
        members: config.slack?.members || [],
        slackConfigured: !!config.slack,
        models: {
          support:
            config.workspace?.supportModel ||
            process.env.CUE_SUPPORT_MODEL ||
            "gemini-2.5-flash",
          agent: agentRoute.model,
          qualification: agentRoute.model,
          coding:
            coding?.model || process.env.CUE_CODING_MODEL || META_WONDER_MODEL,
          codingConfigured:
            coding?.provider === "meta" &&
            coding.backend === "local" &&
            coding.configured &&
            coding.workerOnline === true,
          codingBackend: coding?.backend === "local" ? "local" : null,
          codingWorkerOnline: coding?.backend === "local" && coding.workerOnline === true,
          codingDetail: coding?.detail || "No fresh local coding worker",
          legacyCoding: "Codex",
          growth:
            config.workspace?.growthModel ||
            process.env.CUE_GROWTH_MODEL ||
            "gemini-2.5-flash",
          embedding: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
          litellm: !!process.env.LITELLM_API_KEY,
          meta: metaConfigured,
          google: geminiReady(),
          litellmCreditsRemaining: null,
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Sign in to Cue to view settings" },
      { status: 401 },
    );
  }
}
export async function POST(request: Request) {
  let actor;
  try {
    sameOrigin(request);
    actor = await operator(request);
    requirePermission(actor, "manage");
  } catch {
    return Response.json({ error: "Owner access required" }, { status: 403 });
  }
  try {
    const body = input.parse(await request.json());
    if (body.action !== "workspace") {
      const route = modelRoute(body.action === "model" ? body.supportModel : body.growthModel);
      const readiness = routeReadiness(route);
      if (readiness.kind === "unavailable") throw new Error(readiness.reason);
    }
    await updateIntegrations((c) => ({
      ...c,
      workspace:
        body.action === "workspace"
          ? { ...c.workspace, name: body.name, timezone: body.timezone }
          : {
              ...(c.workspace || {
                name: "Cue workspace",
                timezone: "Asia/Kolkata",
              }),
              ...(body.action === "model"
                ? { supportModel: body.supportModel }
                : { growthModel: body.growthModel }),
            },
    }));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Settings could not be saved" },
      { status: 400 },
    );
  }
}
