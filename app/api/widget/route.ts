import { z } from "zod";
import { sameOrigin } from "@/lib/access";
import { readIntegrations } from "@/lib/integration-config";
import {
  issueWidgetSession,
  verifyWidgetSession,
  widgetRateLimit,
} from "@/lib/widget-session";
import { api, db, secret } from "@/lib/server-store";
import { saveAttachment } from "@/lib/attachment";
import { triage } from "@/lib/triage";
import { supportProgress } from "@/lib/support-progress";
import { geminiReady } from "@/lib/gemini";
import { answerKnowledge, type KnowledgeAnswer } from "@/lib/knowledge-answer";
import { KNOWLEDGE_WORKSPACE } from "@/lib/knowledge-policy";
import { fallbackReply } from "@/lib/reply-policy";
import { widgetOriginAllowed } from "@/lib/widget-preview";
import type { Id } from "@/convex/_generated/dataModel";
const input = z.object({
  action: z.enum(["session", "read", "message", "feedback"]),
  app: z.string().max(100),
  origin: z.string().url(),
  token: z.string().max(2000).optional(),
  text: z.string().trim().min(1).max(12000).optional(),
  name: z.string().trim().max(80).optional(),
  page: z.string().max(2000).optional(),
  attachment: z.string().max(6000000).optional(),
  preview: z.boolean().optional(),
  handoff: z.boolean().optional(),
  caseId: z.string().max(100).optional(),
  messageId: z.string().max(100).optional(),
  outcome: z.enum(["solved", "needs_help"]).optional(),
});
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    if (Number(request.headers.get("content-length") || 0) > 6500000)
      throw new Error("Request too large");
    const b = input.parse(await request.json());
    const app = (await readIntegrations()).apps.find((a) => a.id === b.app);
    if (
      !app ||
      !(await widgetOriginAllowed(request, app.origins, b.origin, b.preview))
    )
      return Response.json(
        { error: "App origin is not allowed" },
        { status: 403 },
      );
    if (b.action === "session") {
      widgetRateLimit("session:" + app.id, 120);
      return Response.json(
        {
          token: issueWidgetSession(
            b.preview ? { ...app, origins: [...app.origins, b.origin] } : app,
            b.origin,
          ),
          name: app.name,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    const owner = verifyWidgetSession(
      b.token || "",
      b.preview ? { ...app, origins: [...app.origins, b.origin] } : app,
      b.origin,
    );
    widgetRateLimit(owner + ":" + b.action, b.action === "message" ? 12 : 60);
    const store = db(),
      auth = secret();
    if (b.action === "feedback") {
      if (!b.caseId || !b.messageId || !b.outcome)
        throw new Error("Choose an answer outcome");
      return Response.json(
        await store.mutation(api.feedbackGaps.submitOutcome, {
          secret: auth,
          workspaceId: KNOWLEDGE_WORKSPACE,
          appId: app.id,
          owner,
          caseId: b.caseId as Id<"cases">,
          messageId: b.messageId as Id<"messages">,
          outcome: b.outcome,
        }),
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (b.action === "read") {
      const previous = await store.query(api.bloom.conversation, {
        secret: auth,
        owner,
      });
      const evidence = previous?.case
        ? await store.query(api.knowledge.widgetEvidence, {
            secret: auth,
            workspaceId: KNOWLEDGE_WORKSPACE,
            appId: app.id,
            owner,
            caseId: previous.case._id,
          })
        : [];
      const outcomes = previous?.case
        ? await store.query(api.feedbackGaps.outcomes, {
            secret: auth,
            workspaceId: KNOWLEDGE_WORKSPACE,
            appId: app.id,
            owner,
            caseId: previous.case._id,
          })
        : [];
      return Response.json(
        {
          name: app.name,
          settings: app.widget,
          progress: previous ? supportProgress(previous) : null,
          attachments: previous?.attachments || [],
          case: previous?.case
            ? {
                id: previous.case._id,
                status: previous.case.status,
                title: previous.case.title,
              }
            : null,
          messages:
            previous?.messages
              .filter((m) => ["customer", "cue", "staff"].includes(m.role))
              .map((m) => ({
                id: m._id,
                body: m.body,
                author: m.author,
                role: m.role,
                outcome:
                  outcomes.find((o) => o.messageId === m._id)?.outcome || null,
                citations:
                  evidence.find((e) => e.messageId === m._id)?.citations || [],
              })) || [],
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (!b.text) throw new Error("Write a message");
    if (b.attachment && app.widget?.screenshots === false)
      throw new Error("Screenshots are disabled for this app");
    const customer = b.name || "Guest";
    const context =
      b.page && new URL(b.page).origin === b.origin
        ? new URL(b.page).origin + new URL(b.page).pathname
        : b.origin;
    const replyContext = {
      customer,
      appName: app.name,
      channel: "chat",
      message: b.text,
      conversation: await store.query(api.bloom.conversation, {
        secret: auth,
        owner,
      }),
    };
    let ack = fallbackReply({ ...replyContext.conversation, ...replyContext });
    let knowledge: KnowledgeAnswer | undefined;
    if (
      !b.handoff &&
      app.widget?.answers !== false &&
      (geminiReady() || process.env.LITELLM_API_KEY)
    )
      try {
        knowledge = await answerKnowledge(
          app.id,
          { ...replyContext.conversation, ...replyContext },
          {},
        );
        ack = knowledge.text;
      } catch {}
    if (b.handoff)
      ack =
        "Your request for a person has been saved with this conversation. The team can reply here.";
    const { caseId: id, created } = await store.mutation(
      api.intake.widgetMessage,
      {
        secret: auth,
        owner,
        customer,
        appId: app.id,
        title: `${app.name}: ${b.text.slice(0, 100)}`,
        body: b.text,
        initialBody: b.text,
        sourceUrl: context,
        ack,
        ...(knowledge
          ? {
              knowledge: {
                workspaceId: KNOWLEDGE_WORKSPACE,
                usedChunkIds: knowledge.hits.map((h) => h._id),
                citedChunkIds: knowledge.citedIds,
                status: knowledge.status,
                provider: knowledge.provider,
                model: knowledge.model,
                inputTokens: knowledge.inputTokens,
                outputTokens: knowledge.outputTokens,
                retrieval: knowledge.retrieval,
                brandVersion: knowledge.brandVersion,
              },
            }
          : {}),
      },
    );
    if (b.attachment) await saveAttachment(b.attachment, owner, id);
    if (created) await triage(id);
    return Response.json({ id });
  } catch (e) {
    const error = e instanceof Error ? e.message : "Widget request failed";
    return Response.json(
      { error },
      {
        status: /session|belongs/.test(error)
          ? 401
          : /Too many/.test(error)
            ? 429
            : 400,
      },
    );
  }
}
