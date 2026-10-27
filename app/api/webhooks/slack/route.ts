import { validSlack } from "@/lib/slack";
import { slackConfig } from "@/lib/integration-config";
import { receiveSlack, decideSlack } from "@/lib/slack-events";
export async function POST(request: Request) {
  const raw = await request.text();
  const config = await slackConfig();
  if (
    !validSlack(
      raw,
      request.headers.get("x-slack-request-timestamp"),
      request.headers.get("x-slack-signature"),
      config?.signingSecret,
    )
  )
    return Response.json({ error: "Invalid Slack signature" }, { status: 401 });
  try {
    if (
      request.headers
        .get("content-type")
        ?.includes("application/x-www-form-urlencoded")
    ) {
      const p = JSON.parse(new URLSearchParams(raw).get("payload") || "{}");
      if (!config) throw new Error("Slack not configured");
      await decideSlack(p, config);
      return Response.json({ text: "Decision recorded for the exact commit." });
    }
    const body = JSON.parse(raw);
    if (body.type === "url_verification")
      return Response.json({ challenge: body.challenge });
    if (!config) throw new Error("Slack not configured");
    await receiveSlack(body, config);
    return Response.json({ ok: true });
  } catch {
    return Response.json(
      { error: "Slack event could not be recorded" },
      { status: 400 },
    );
  }
}
