import { Resend } from "resend";
import { createHash } from "node:crypto";
import { api, db, secret } from "./server-store";
import { providerToken } from "./pipes";
import { slackPost } from "./slack";
import type { Id } from "../convex/_generated/dataModel";
import { emailConfig, slackConfig } from "./integration-config";
import { approvalMessage, supportMessage, runMessage } from "./slack-messages";
const digest = (text: string) =>
  createHash("sha256").update(text).digest("hex");
export async function sendApproval(
  runId: Id<"runs">,
  actor: { id: string; name: string; organizationId?: string },
) {
  const config = await slackConfig();
  const channel =
    config?.engineeringChannel || process.env.SLACK_TEAM_CHANNEL_ID;
  if (!channel) throw new Error("Set the Slack engineering channel first");
  const store = db(),
    auth = secret(),
    s = await store.query(api.cue.snapshot, { secret: auth }),
    run = s.runs.find((r) => r._id === runId);
  if (!run || run.status !== "awaiting_approval" || !run.commit)
    throw new Error("No pending exact-commit approval");
  const token =
    config?.botToken ||
    process.env.SLACK_BOT_TOKEN ||
    (await providerToken(
      process.env.WORKOS_SLACK_PROVIDER || "slack",
      actor.id,
      actor.organizationId,
    ));
  const message = approvalMessage(
    run,
    s.issues.find((i) => i._id === run.issueId)?.title || "Bloom change",
  );
  const text = message.text;
  const id = await store.mutation(api.deliveries.reserve, {
    secret: auth,
    key: "approval:" + runId,
    channel: "slack",
    destination: channel,
    body: text,
    actor: actor.name,
  });
  try {
    const receipt = await slackPost(token, channel, text, message.blocks);
    await store.mutation(api.deliveries.finish, {
      secret: auth,
      id,
      status: "sent",
      receipt: `${receipt.channel}:${receipt.ts}`,
    });
    await store.mutation(api.cue.event, {
      secret: auth,
      runId,
      issueId: run.issueId,
      title: "Slack approval delivered",
      detail: `Provider acknowledged message ${receipt.ts} in the configured engineering channel.`,
      kind: "approval",
    });
  } catch (e) {
    await store.mutation(api.deliveries.finish, {
      secret: auth,
      id,
      status: "unknown",
      receipt: e instanceof Error ? e.message : "Provider error",
    });
    throw e;
  }
}
export async function sendEmail(
  caseId: Id<"cases">,
  body: string,
  actor: string,
) {
  const config = await emailConfig();
  if (!config) throw new Error("Configure a verified email sender first");
  const store = db(),
    auth = secret(),
    s = await store.query(api.cue.snapshot, { secret: auth }),
    c = s.cases.find((c) => c._id === caseId);
  if (!c || c.channel !== "email" || !c.sourceKey?.startsWith("email:"))
    throw new Error("Sending is supported only for a verified inbound email");
  const to = c.customer.match(/<?([^<>\s]+@[^<>\s]+)>?/)?.[1];
  if (!to) throw new Error("Recipient unavailable");
  if (
    config.from.toLowerCase() === "onboarding@resend.dev" &&
    to.toLowerCase() !== process.env.CUE_OPERATOR_EMAIL?.toLowerCase()
  )
    throw new Error(
      "The Resend test sender can reply only to the configured operator email. Verify a sender domain for other recipients.",
    );
  const resend = new Resend(config.apiKey);
  const original = await resend.emails.receiving.get(
    c.externalId || c.sourceKey.slice(6),
  );
  if (!original.data || original.error)
    throw new Error("Original received email unavailable; reply not sent");
  const key = `email:${caseId}:${digest(body)}`,
    id = await store.mutation(api.deliveries.reserve, {
      secret: auth,
      key,
      channel: "email",
      destination: to,
      body,
      actor,
    });
  try {
    const result = await resend.emails.send(
      {
        from: config.from,
        to,
        subject: "Re: " + c.title,
        text: body,
        replyTo: config.replyTo,
        headers: {
          "In-Reply-To": original.data.message_id,
          References: original.data.message_id,
        },
      },
      { idempotencyKey: key },
    );
    if (result.error || !result.data)
      throw new Error(result.error?.message || "Email send failed");
    await store.mutation(api.deliveries.finish, {
      secret: auth,
      id,
      status: "sent",
      receipt: result.data.id,
    });
    await store.mutation(api.cue.message, {
      secret: auth,
      caseId,
      body,
      author: actor,
      role: "staff",
    });
    await store.mutation(api.cue.event, {
      secret: auth,
      issueId: c.issueId,
      title: "Email accepted by provider",
      detail: `Resend message ${result.data.id}. Inbox delivery is not implied.`,
      kind: "intake",
    });
  } catch (e) {
    await store.mutation(api.deliveries.finish, {
      secret: auth,
      id,
      status: "unknown",
      receipt: e instanceof Error ? e.message : "Provider error",
    });
    throw e;
  }
}
export async function sendSlackReply(
  caseId: Id<"cases">,
  body: string,
  actor: string,
) {
  const config = await slackConfig();
  if (!config?.botToken) throw new Error("Connect Slack first");
  const store = db(),
    auth = secret(),
    snapshot = await store.query(api.cue.snapshot, { secret: auth }),
    c = snapshot.cases.find((c) => c._id === caseId);
  const source = c?.sourceKey?.match(
    /^slack:(T[A-Z0-9]+):([CG][A-Z0-9]+):(\d+\.\d+)$/,
  );
  if (
    !c ||
    c.channel !== "slack" ||
    !source ||
    source[1] !== config.teamId ||
    source[2] !== config.supportChannel
  )
    throw new Error("Slack case does not belong to this connection");
  const issue = snapshot.issues.find((i) => i._id === c.issueId);
  const run = snapshot.runs
    .filter((r) => r.issueId === c.issueId)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  const message = supportMessage(body, c, issue, run);
  const id = await store.mutation(api.deliveries.reserve, {
    secret: auth,
    key: `slack-reply:${caseId}:${digest(body)}`,
    channel: "slack",
    destination: `${source[2]}:${source[3]}`,
    body,
    actor,
  });
  try {
    const result = await slackPost(
      config.botToken,
      source[2],
      message.text,
      message.blocks,
      source[3],
    );
    await store.mutation(api.deliveries.finish, {
      secret: auth,
      id,
      status: "sent",
      receipt: `${result.channel}:${result.ts}`,
    });
    await store.mutation(api.cue.message, {
      secret: auth,
      caseId,
      body,
      author: actor,
      role: "staff",
    });
  } catch (e) {
    await store.mutation(api.deliveries.finish, {
      secret: auth,
      id,
      status: "unknown",
      receipt: e instanceof Error ? e.message : "Provider error",
    });
    throw e;
  }
}

export async function sendSlackRunUpdate(runId: Id<"runs">) {
  const config = await slackConfig();
  if (!config?.botToken || !config.engineeringChannel) return;
  const store = db(),
    auth = secret(),
    snapshot = await store.query(api.cue.snapshot, { secret: auth });
  const run = snapshot.runs.find((r) => r._id === runId);
  const issue = snapshot.issues.find((i) => i._id === run?.issueId);
  if (!run || !issue) return;
  const message = runMessage(run, issue);
  const key =
    run.status === "awaiting_approval"
      ? `approval:${runId}`
      : `run-update:${runId}:${run.status}:${run.phase}`;
  // A persisted reservation prevents duplicate status messages across restarts.
  if (snapshot.deliveries.some((d) => d.key === key)) return;
  const id = await store.mutation(api.deliveries.reserve, {
    secret: auth,
    key,
    channel: "slack",
    destination: config.engineeringChannel,
    body: message.text,
    actor: "Cue",
  });
  try {
    const receipt = await slackPost(
      config.botToken,
      config.engineeringChannel,
      message.text,
      message.blocks,
    );
    await store.mutation(api.deliveries.finish, {
      secret: auth,
      id,
      status: "sent",
      receipt: `${receipt.channel}:${receipt.ts}`,
    });
  } catch (e) {
    await store.mutation(api.deliveries.finish, {
      secret: auth,
      id,
      status: "unknown",
      receipt: e instanceof Error ? e.message : "Provider error",
    });
    throw e;
  }
}
