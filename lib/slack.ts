import { createHmac, timingSafeEqual } from "node:crypto";
export function validSlack(
  body: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret = process.env.SLACK_SIGNING_SECRET,
) {
  if (
    !signingSecret ||
    !timestamp ||
    !signature ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(Date.now() / 1000 - Number(timestamp)) > 300
  )
    return false;
  const expected =
    "v0=" +
    createHmac("sha256", signingSecret)
      .update(`v0:${timestamp}:${body}`)
      .digest("hex");
  return (
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}
export async function slackPost(
  token: string,
  channel: string,
  text: string,
  blocks?: unknown[],
  threadTs?: string,
) {
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      channel,
      text,
      blocks,
      thread_ts: threadTs,
      unfurl_links: false,
      unfurl_media: false,
      mrkdwn: false,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await r.json();
  if (!r.ok || !result.ok)
    throw new Error(
      "Slack: " +
        (result.error || "request failed") +
        (result.response_metadata?.messages?.length
          ? " · " + result.response_metadata.messages.join("; ")
          : ""),
    );
  return result;
}
