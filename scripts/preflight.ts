import nextEnv from "@next/env";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
nextEnv.loadEnvConfig(process.cwd());
const exec = promisify(execFile);
const rows: Array<{ service: string; status: string }> = [];
for (const [service, url] of [
  ["Web", "http://127.0.0.1:3000/api/demo"],
  ["Bloom upload service", "http://127.0.0.1:4318/health"],
  ["Convex", process.env.NEXT_PUBLIC_CONVEX_URL || ""],
]) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(3000) });
    rows.push({
      service,
      status: r.ok
        ? "Reachable"
        : service === "Web" && r.status === 401
          ? "Reachable · WorkOS sign-in required"
          : `HTTP ${r.status}`,
    });
  } catch {
    rows.push({ service, status: "Not running" });
  }
}
try {
  const r = await exec(process.env.CUE_CODEX_PATH || "codex", [
    "login",
    "status",
  ]);
  rows.push({
    service: "Codex account",
    status: /logged in/i.test(r.stdout + r.stderr)
      ? "Logged in"
      : "Check login",
  });
} catch {
  rows.push({ service: "Codex account", status: "Login needed" });
}
try {
  await exec("gh", ["auth", "status"]);
  rows.push({ service: "GitHub account", status: "Logged in" });
} catch {
  rows.push({ service: "GitHub account", status: "Login needed" });
}
rows.push({
  service: "Gemini",
  status:
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GEMINI_API_KEY
      ? "Configured (verify makes a live call)"
      : "Project or key needed",
});
rows.push({
  service: "WorkOS",
  status:
    process.env.WORKOS_API_KEY &&
    process.env.WORKOS_CLIENT_ID &&
    process.env.CUE_OPERATOR_EMAIL
      ? "Configured; sign in to verify"
      : "Credentials needed",
});
rows.push({
  service: "Slack",
  status:
    process.env.SLACK_SIGNING_SECRET && process.env.SLACK_TEAM_ID
      ? "Configured; workspace consent needed"
      : "Credentials needed",
});
rows.push({
  service: "Email",
  status:
    process.env.RESEND_API_KEY && process.env.RESEND_WEBHOOK_SECRET
      ? "Configured; domain verification needed"
      : "Credentials needed",
});
console.table(rows);
