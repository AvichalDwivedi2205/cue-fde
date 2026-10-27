import { z } from "zod";
import { api, db, secret } from "./server-store";
import type { SlackConfig } from "./integration-config";
import type { Id } from "../convex/_generated/dataModel";
import { triage } from "./triage";
const event = z.object({
  team_id: z.string(),
  event: z.object({
    type: z.string(),
    channel: z.string().optional(),
    user: z.string().optional(),
    text: z.string().optional(),
    ts: z.string().optional(),
    thread_ts: z.string().optional(),
    bot_id: z.string().optional(),
    subtype: z.string().optional(),
  }),
});
export async function receiveSlack(input: unknown, config: SlackConfig) {
  const b = event.parse(input),
    e = b.event;
  if (b.team_id !== config.teamId) throw new Error("Wrong Slack workspace");
  if (
    !["message", "app_mention"].includes(e.type) ||
    e.bot_id ||
    e.subtype ||
    e.channel !== config.supportChannel ||
    !e.text?.trim() ||
    !e.user ||
    !e.ts
  )
    return null;
  const text = e.text.replace(/<@[A-Z0-9]+>/g, "").trim();
  if (!text) return null;
  const result = await db().mutation(api.intake.receive, {
    secret: secret(),
    channel: "slack",
    customer: `Slack ${e.user}`,
    title: text.slice(0, 100),
    body: text.slice(0, 12000),
    eventKey: `slack:${b.team_id}:${e.channel}:${e.ts}`,
    sourceKey: `slack:${b.team_id}:${e.channel}:${e.thread_ts || e.ts}`,
    sourceUrl: `https://app.slack.com/client/${b.team_id}/${e.channel}/thread/${e.channel}-${e.thread_ts || e.ts}`,
  });
  if (!result.duplicate) void triage(result.caseId).catch(() => {});
  return result;
}
const interaction = z.object({
  team: z.object({ id: z.string() }),
  user: z.object({ id: z.string() }),
  channel: z.object({ id: z.string() }),
  actions: z
    .array(
      z.object({
        action_id: z.enum(["cue_approve", "cue_reject"]),
        value: z.string(),
      }),
    )
    .length(1),
});
export async function decideSlack(input: unknown, config: SlackConfig) {
  const p = interaction.parse(input);
  if (
    p.team.id !== config.teamId ||
    p.channel.id !== config.engineeringChannel ||
    !config.operatorIds.includes(p.user.id)
  )
    throw new Error("Operator not authorized");
  const action = p.actions[0],
    value = z
      .object({ runId: z.string(), commit: z.string().regex(/^[a-f0-9]{40}$/) })
      .parse(JSON.parse(action.value));
  await db().mutation(api.jobs.decide, {
    secret: secret(),
    runId: value.runId as Id<"runs">,
    commit: value.commit,
    actor: `Slack operator ${p.user.id}`,
    approve: action.action_id === "cue_approve",
    reason: action.action_id === "cue_reject" ? "Rejected in Slack" : undefined,
  });
}
