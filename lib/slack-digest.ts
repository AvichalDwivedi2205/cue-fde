import { api } from "@/convex/_generated/api";
import { db, secret } from "./server-store";
import { slackMember } from "./roles";
import type { SlackConfig } from "./integration-config";
import { cueLink } from "./slack-messages";
import { listPacks } from "./app-pack";

// Read-only ephemeral status for any saved team member: type /cue (optionally
// /cue <app-name-or-id>) anywhere in Slack. No decisions happen here and no
// delivery-ledger entries are written — cards remain the only decision
// surface, with their server-side permission re-checks.

function count(n: number, one: string, many = one + "s") {
  return `${n} ${n === 1 ? one : many}`;
}

export async function memberDigest(config: SlackConfig, userId: string, filter?: string) {
  const member = slackMember(config, userId);
  if (!member)
    return {
      text: "Cue is connected, but your Slack member ID is not saved. Ask the owner to add you in Setup → Team.",
    };
  const snapshot = await db().query(api.cue.snapshot, { secret: secret() });
  const packs = (await listPacks()).filter((p) => p.status !== "suspended");
  const selectable = packs.length ? packs : [];
  // Legacy intake predates appIds: those records carry undefined or the
  // literal "bloom", and resolve to the pack that carries the bloom alias —
  // the same pack resolveAppPack() and the Convex-side alias lookup use.
  const legacyBloomPack = packs.find((p) => (p.aliases ?? []).includes("bloom"));
  const appOf = (appId: string | undefined) =>
    appId && appId !== "bloom" ? appId : legacyBloomPack?.appId;
  const matches = (app: { appId: string; name: string }, f?: string) =>
    !f ||
    app.appId === f ||
    app.name.toLowerCase() === f.toLowerCase();
  const found = filter ? selectable.filter((p) => matches(p, filter)) : [];
  if (filter && found.length > 1)
    return {
      response_type: "ephemeral" as const,
      text: `Several applications match “${filter}”. Run /cue with the app id:\n${found
        .map((p) => `• ${p.name} — ${p.appId}`)
        .join("\n")}`,
    };
  if (filter && !found.length)
    return { text: `No Cue application matches “${filter}”.` };
  const apps = found.length ? found : selectable;
  const sections: string[] = [];
  for (const app of apps) {
    const issues = snapshot.issues.filter((i) => appOf(i.appId) === app.appId);
    const openCases = snapshot.cases.filter(
      (c) => c.status !== "resolved" && appOf(c.appId) === app.appId,
    ).length;
    const specs = issues.filter((i) => i.status === "spec_ready").length;
    const approvals = snapshot.runs.filter(
      (r) =>
        r.status === "awaiting_approval" &&
        issues.some((i) => i._id === r.issueId),
    ).length;
    const progress = issues.filter((i) =>
      ["investigating", "implementing", "awaiting_approval"].includes(i.status),
    ).length;
    sections.push(
      [
        `*${app.name}*`,
        `${count(openCases, "open report")} · ${count(progress, "in progress", "in progress")} · ${count(specs, "spec awaiting product", "specs awaiting product")} · ${count(approvals, "run awaiting engineering", "runs awaiting engineering")}`,
      ].join("\n"),
    );
  }
  const cue = cueLink("home");
  return {
    response_type: "ephemeral" as const,
    text: `Cue status (${member.role})\n${sections.join("\n\n")}${cue ? `\n\nOpen in Cue: ${cue}` : ""}`,
  };
}
