import { NextRequest, NextResponse } from "next/server";
import { api, db, secret } from "@/lib/server-store";
import { operator, sameOrigin, workosReady } from "@/lib/access";
import { geminiReady, draft, generateSpec } from "@/lib/gemini";
import { z } from "zod";
import { saveAttachment } from "@/lib/attachment";
import { triage } from "@/lib/triage";
import { sendApproval, sendEmail, sendSlackReply } from "@/lib/delivery";
import { emailConfig, slackConfig } from "@/lib/integration-config";
import {
  slackRuntimeStatus,
  notificationRuntimeStatus,
} from "@/lib/integration-checks";
import { socialSource } from "@/lib/social-source";
export const runtime = "nodejs";
const report = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(12000),
  customer: z.string().min(1).max(100),
  channel: z.enum(["x", "chat", "email", "reddit"]),
  sourceUrl: z.string().url().optional(),
  feature: z.boolean().optional(),
});
export async function GET(request: NextRequest) {
  try {
    const actor = await operator(request);
    const snapshot = await db().query(api.cue.snapshot, { secret: secret() });
    const slack = await slackConfig(),
      email = await emailConfig(),
      socket = await slackRuntimeStatus();
    return NextResponse.json({
      ...snapshot,
      integration: {
        convex: true,
        gemini: geminiReady(),
        github: process.env.CUE_GITHUB_REPO || null,
        codex: true,
        slack: socket.connected ? "on" : slack ? "configured" : "off",
        slackApproval: !!slack?.engineeringChannel,
        slackSend: !!slack?.botToken,
        email: !!email,
        emailSend: !!email,
        emailTestSender: email?.from.toLowerCase() === "onboarding@resend.dev",
        notificationPolling: !!email?.pollReceiving,
        notifications: email?.pollReceiving
          ? await notificationRuntimeStatus()
          : null,
        workos: workosReady(),
        actor: actor.name,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unauthorized" },
      { status: 401 },
    );
  }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const actor = await operator(request);
    const body = await request.json();
    const store = db(),
      auth = secret();
    switch (body.action) {
      case "seed":
        await store.mutation(api.cue.seed, { secret: auth });
        break;
      case "reset": {
        const jobs = await store.query(api.jobs.status, { secret: auth });
        if (jobs.some((j) => ["queued", "running"].includes(j.status)))
          throw new Error("Cancel or finish active jobs before reset");
        const r = await fetch("http://127.0.0.1:4319/reset", {
          method: "POST",
          headers: { authorization: `Bearer ${auth}` },
        });
        if (!r.ok) throw new Error("Worker reset failed");
        await store.mutation(api.cue.seed, { secret: auth, reset: true });
        break;
      }
      case "report": {
        const a = report.parse(body);
        let sourceKey: string | undefined;
        if (a.channel === "x" || a.channel === "reddit") {
          const source = socialSource(a.channel, a.sourceUrl || "");
          sourceKey = source.key;
          a.sourceUrl = source.url;
        }
        if (sourceKey) {
          const existing = (
            await store.query(api.cue.snapshot, { secret: auth })
          ).cases.find((c) => c.sourceKey === sourceKey);
          if (existing) return NextResponse.json({ id: existing._id });
        }
        const id = await store.mutation(api.cue.createCase, {
          secret: auth,
          ...a,
          sourceKey,
          sample: ["x:9990000000000000001", "reddit:post:cue00001"].includes(
            sourceKey || "",
          ),
        });
        if (body.attachment)
          await saveAttachment(z.string().parse(body.attachment), actor.id, id);
        await triage(id);
        return NextResponse.json({ id });
      }
      case "message": {
        const c = (
          await store.query(api.cue.snapshot, { secret: auth })
        ).cases.find((c) => c._id === body.caseId);
        if (!c) throw new Error("Case not found");
        await store.mutation(api.cue.message, {
          secret: auth,
          caseId: c._id,
          body: z
            .string()
            .min(1)
            .max(c.channel === "x" && !body.note ? 280 : 12000)
            .parse(body.body),
          author: actor.name,
          role: body.note ? "note" : c.channel !== "chat" ? "draft" : "staff",
        });
        break;
      }
      case "investigate":
        return NextResponse.json({
          runId: await store.mutation(api.cue.startRun, {
            secret: auth,
            issueId: body.issueId,
          }),
        });
      case "approve":
        await store.mutation(api.jobs.decide, {
          secret: auth,
          runId: body.runId,
          commit: body.commit,
          actor: actor.name,
          approve: true,
        });
        break;
      case "reject":
        await store.mutation(api.jobs.decide, {
          secret: auth,
          runId: body.runId,
          commit: body.commit,
          actor: actor.name,
          approve: false,
          reason: z.string().min(3).max(1000).parse(body.reason),
        });
        break;
      case "cancel":
        await store.mutation(api.jobs.cancel, {
          secret: auth,
          runId: body.runId,
        });
        break;
      case "draft": {
        const s = await store.query(api.cue.snapshot, { secret: auth });
        const c = s.cases.find((c) => c._id === body.caseId);
        if (!c) throw new Error("Case not found");
        return NextResponse.json({
          text: await draft({
            case: c,
            messages: s.messages.filter((m) => m.caseId === c._id),
            issue: s.issues.find((i) => i._id === c.issueId),
            verified: s.runs.some((r) => r.issueId === c.issueId && r.verified),
          }),
        });
      }
      case "generateSpec": {
        const s = await store.query(api.cue.snapshot, { secret: auth });
        const issue = s.issues.find((i) => i._id === body.issueId);
        if (!issue || issue.kind !== "feature")
          throw new Error("Feature not found");
        const spec = await generateSpec({
          issue,
          requests: s.cases.filter((c) => c.issueId === issue._id),
        });
        await store.mutation(api.cue.spec, {
          secret: auth,
          issueId: issue._id,
          spec: JSON.stringify(spec),
        });
        return NextResponse.json({ spec });
      }
      case "tags":
        await store.mutation(api.cue.tags, {
          secret: auth,
          caseId: body.caseId,
          tags: z.array(z.string().min(1).max(30)).max(12).parse(body.tags),
        });
        break;
      case "triage":
        await triage(body.caseId);
        break;
      case "slackApproval":
        await sendApproval(body.runId, actor);
        break;
      case "emailSend":
        await sendEmail(
          body.caseId,
          z.string().min(1).max(12000).parse(body.body),
          actor.name,
        );
        break;
      case "slackSend":
        await sendSlackReply(
          body.caseId,
          z.string().min(1).max(12000).parse(body.body),
          actor.name,
        );
        break;
      case "link":
        await store.mutation(api.cue.link, {
          secret: auth,
          caseId: body.caseId,
          issueId: body.issueId,
        });
        break;
      case "spec":
        await store.mutation(api.cue.spec, {
          secret: auth,
          issueId: body.issueId,
          spec: z.string().max(18000).parse(body.spec),
          approved: !!body.approved,
        });
        break;
      default:
        throw new Error("Unknown action");
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
