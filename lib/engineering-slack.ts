import { createHash } from "node:crypto";
import { z } from "zod";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { api, db, secret } from "./server-store";
import { slackConfig, type SlackConfig } from "./integration-config";
import { slackPost, slackUpdate } from "./slack";
import { can, slackMember } from "./roles";
import { runMessage, type SlackMessage } from "./slack-messages";

type Handoff = NonNullable<Doc<"issues">["engineeringHandoff"]>;
export function engineeringDestination(
  config: SlackConfig,
  issue: Doc<"issues">,
  override?: string,
) {
  const h = issue.engineeringHandoff;
  if (h && config.teamId !== h.team) throw new Error("Wrong Slack workspace");
  return {
    channel: h?.channel || override || config.engineeringChannel,
    threadTs: h && h.kind !== "posting" ? h.rootTs : undefined,
  };
}
const contextValue = (issueId: Id<"issues">, h: Handoff) => ({
  issueId,
  revision: h.revision,
  reproductionDigest: h.reproductionDigest,
});
export async function openEngineeringHandoff(
  issueId: Id<"issues">,
  reproduction: string,
  actor: string,
) {
  const config = await slackConfig();
  if (!config) throw new Error("Connect Slack first");
  const store = db(),
    auth = secret();
  const state = await store.query(api.cue.snapshot, { secret: auth });
  const issue = state.issues.find((i) => i._id === issueId);
  if (!issue?.appId) throw new Error("Registered issue required");
  const pack = await store.query(api.appPacks.get, {
    secret: auth,
    appId: issue.appId,
  });
  const assigned = pack?.routing?.engineeringMemberId;
  const member = assigned ? slackMember(config, assigned) : undefined;
  if (
    !assigned ||
    !member ||
    !can(member.role, "investigate") ||
    !can(member.role, "deploy")
  )
    throw new Error("Connect the assigned Engineering Slack member first");
  const reports = state.cases
    .filter((c) => c.issueId === issueId)
    .slice(0, 5)
    .map((c) => `${c.customer} (${c.channel}): ${c.body.slice(0, 3000)}`)
    .join("\n\n");
  const body = `${issue.title}\n${issue.description.slice(0, 6000)}\n\nReports\n${reports || "See the linked issue in Cue."}\n\nReproduction\n${reproduction.trim()}`;
  const text = `Engineering handoff · ${pack?.name || issue.appId}\n${body}\nAssigned engineer: ${assigned}. Only this member can start or decide this fix. Owner override is disabled.`;
  const result = await store.mutation(api.engineeringSlack.prepare, {
    secret: auth,
    issueId,
    reproduction: reproduction.trim(),
    expectedIssueContext: JSON.stringify([
      issue.appId,
      issue.title,
      issue.description,
    ]),
    reproductionDigest: createHash("sha256")
      .update(reproduction.trim())
      .digest("hex"),
    team: config.teamId,
    channel: pack?.routing?.engineeringChannel || config.engineeringChannel,
    member: assigned,
    actor,
    body: text,
  });
  if (!result.created) return result.handoff;
  const h = result.handoff;
  const message: SlackMessage = {
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Assigned engineer* <@${h.assignedMember}>`,
          verbatim: true,
        },
      },
      ...Array.from({ length: Math.ceil(body.length / 3000) }, (_, n) => ({
        type: "section",
        text: {
          type: "plain_text",
          text: body.slice(n * 3000, (n + 1) * 3000),
        },
      })),
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Start fix with Muse Wonder" },
            action_id: "cue_engineering_start",
            value: JSON.stringify(contextValue(issueId, h)),
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "plain_text",
            text: `App ${h.appId} · Revision ${h.revision} · Owner override disabled. Start prepares a PR; no production deployment.`,
          },
        ],
      },
    ],
  };
  try {
    const receipt = await slackPost(
      config.botToken,
      h.channel,
      text,
      message.blocks,
    );
    await store.mutation(api.engineeringSlack.posted, {
      secret: auth,
      issueId,
      revision: h.revision,
      channel: receipt.channel,
      ts: receipt.ts,
    });
    return { ...h, kind: "ready" as const, rootTs: receipt.ts };
  } catch (error) {
    await store.mutation(api.deliveries.finish, {
      secret: auth,
      id: h.deliveryId,
      status: "unknown",
      receipt: "Slack handoff outcome uncertain; reconcile before retrying",
    });
    throw error;
  }
}
const interaction = z.object({
  team: z.object({ id: z.string() }),
  user: z.object({ id: z.string() }),
  channel: z.object({ id: z.string() }),
  message: z.object({ ts: z.string(), thread_ts: z.string().optional() }),
  actions: z
    .array(
      z.object({
        action_id: z.enum([
          "cue_engineering_start",
          "cue_approve",
          "cue_reject",
        ]),
        value: z.string(),
      }),
    )
    .length(1),
});
const valueSchema = z.object({
  issueId: z.string(),
  revision: z.number().int().positive(),
  reproductionDigest: z.string().regex(/^[a-f0-9]{64}$/),
  runId: z.string().optional(),
  commit: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .optional(),
});
export async function receiveEngineeringInteraction(
  input: unknown,
  config: SlackConfig,
) {
  const p = interaction.parse(input),
    action = p.actions[0],
    value = valueSchema.parse(JSON.parse(action.value));
  const member = slackMember(config, p.user.id);
  if (
    p.team.id !== config.teamId ||
    !member ||
    !can(member.role, "investigate") ||
    !can(member.role, "deploy")
  )
    throw new Error("Operator not authorized");
  const store = db(),
    auth = secret(),
    state = await store.query(api.cue.snapshot, { secret: auth });
  const issue = state.issues.find((i) => i._id === value.issueId),
    h = issue?.engineeringHandoff;
  if (
    !issue ||
    !h ||
    h.kind === "posting" ||
    h.team !== p.team.id ||
    h.channel !== p.channel.id ||
    h.assignedMember !== p.user.id ||
    h.rootTs !== (p.message.thread_ts || p.message.ts)
  )
    throw new Error("Engineering handoff changed or operator not assigned");
  const slack = {
    revision: value.revision,
    reproductionDigest: value.reproductionDigest,
    team: p.team.id,
    channel: p.channel.id,
    rootTs: p.message.thread_ts || p.message.ts,
    cardTs: p.message.ts,
    member: p.user.id,
  };
  const actor = `${member.name} · Slack ${p.user.id}`;
  if (action.action_id === "cue_engineering_start") {
    const runId = await store.mutation(api.cue.startRun, {
      secret: auth,
      issueId: issue._id,
      reproduction: h.reproduction,
      slack,
    });
    await publishEngineeringRun(runId).catch(() => {});
    return null;
  }
  const run = state.runs.find(
    (r) => r._id === value.runId && r.issueId === issue._id,
  );
  if (!run || !value.commit)
    throw new Error("Approval must match the pending commit");
  await store.mutation(api.jobs.decide, {
    secret: auth,
    runId: run._id,
    commit: value.commit,
    actor,
    approve: action.action_id === "cue_approve",
    reason: action.action_id === "cue_reject" ? "Rejected in Slack" : undefined,
    slack,
  });
  return { runId: run._id, commit: value.commit, actor };
}
// Called after durable writes. Each exact event has one send reservation.
export async function publishEngineeringRun(
  runId: Id<"runs">,
  eventId?: Id<"events">,
): Promise<boolean> {
  const store = db(),
    auth = secret(),
    state = await store.query(api.cue.snapshot, { secret: auth });
  const run = state.runs.find((r) => r._id === runId),
    issue = state.issues.find((i) => i._id === run?.issueId),
    h = issue?.engineeringHandoff;
  if (!h || !issue || !run) return false;
  if (h.kind !== "started" || h.runId !== runId)
    throw new Error("Engineering run context changed");
  const config = await slackConfig();
  if (!config) throw new Error("Slack disconnected");
  const destination = engineeringDestination(config, issue);
  const event = eventId
    ? state.events.find((e) => e._id === eventId && e.runId === runId)
    : undefined;
  if (eventId && !event) throw new Error("Durable run event missing");
  const message = event
    ? {
        text: `${event.title}\n${event.detail}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "plain_text",
              text: `${event.title}\n${event.detail}`.slice(0, 3000),
            },
          },
        ],
      }
    : runMessage(
        run,
        issue,
        [h.assignedMember],
        undefined,
        contextValue(issue._id, h),
      );
  const key = event
    ? `engineering-event:${runId}:${event._id}`
    : run.status === "awaiting_approval"
      ? `approval:${runId}:${run.commit}`
      : `run-update:${runId}:${run.status}:${run.phase}`;
  if (!event && run.status !== "awaiting_approval") {
    const approval = state.deliveries.find(
      (d) => d.key === `approval:${runId}:${run.commit}` && d.status === "sent",
    );
    const ts = approval?.receipt?.split(":")[1];
    if (ts)
      await slackUpdate(
        config.botToken,
        destination.channel,
        ts,
        message.text,
        message.blocks,
      ).catch(() => {});
  }
  if (state.deliveries.some((d) => d.key === key)) return true;
  const id = await store.mutation(api.deliveries.reserve, {
    secret: auth,
    key,
    channel: "slack",
    destination: destination.channel,
    body: message.text,
    actor: "Cue",
  });
  try {
    const receipt = await slackPost(
      config.botToken,
      destination.channel,
      message.text,
      message.blocks,
      destination.threadTs,
    );
    if (receipt.channel !== destination.channel)
      throw new Error("Slack receipt destination mismatch");
    await store.mutation(api.deliveries.finish, {
      secret: auth,
      id,
      status: "sent",
      receipt: `${receipt.channel}:${receipt.ts}`,
    });
  } catch (error) {
    await store.mutation(api.deliveries.finish, {
      secret: auth,
      id,
      status: "unknown",
      receipt: "Slack delivery outcome uncertain; reconcile before retrying",
    });
    throw error;
  }
  return true;
}
