import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Resend } from "resend";
import { api, db, secret } from "./server-store";
import type { EmailConfig, SlackConfig } from "./integration-config";
import { slackConfig } from "./integration-config";
import { slackWebhookStatus } from "./slack-webhook-health";
import type { XStatus } from "./x-poller";
import { readHostedBackground } from "./hosted-background";
import { z } from "zod";
import { META_MODELS } from "./meta";
const exec = promisify(execFile);
const codingStatusInput = z.object({
  provider: z.literal("meta"),
  model: z.enum(META_MODELS),
  backend: z.literal("modal"),
  configured: z.boolean(),
  workerOnline: z.boolean().optional(),
});
const xStatusInput = z.object({
  connected: z.boolean(),
  detail: z.string(),
  imported: z.number().int().nonnegative(),
  lastPollAt: z.number().finite().nullable(),
  retryAt: z.number().finite().nullable(),
  backlog: z.boolean(),
});
const workerStatusInput = z.object({
  slack: z.object({
    connected: z.boolean(),
    detail: z.string().optional(),
    updatedAt: z.number().finite(),
  }),
  notifications: z.object({
    connected: z.boolean(),
    lastPollAt: z.number().finite().nullable(),
    imported: z.number().int().nonnegative(),
    needsReview: z.number().int().nonnegative(),
    backlog: z.boolean(),
    detail: z.string().optional(),
  }),
  codex: z.object({
    loggedIn: z.boolean(),
    workerOnline: z.boolean(),
    github: z.boolean(),
  }),
  coding: codingStatusInput.optional(),
  busy: z.boolean(),
  x: xStatusInput.optional(),
});
const codingWorkerStatusInput = z.object({
  coding: codingStatusInput,
  busy: z.boolean(),
});

export async function sharedWorkerStatus(): Promise<
  z.infer<typeof workerStatusInput>
> {
  const store = db();
  const auth = secret();
  const read = async (key: "worker" | "coding-worker"): Promise<unknown> => {
    try {
      const row = await store.query(api.serverState.read, {
        secret: auth,
        key,
      });
      if (
        !row ||
        !Number.isFinite(row.updatedAt) ||
        Date.now() - row.updatedAt > 30000
      )
        return undefined;
      const value: unknown = JSON.parse(row.value);
      return value;
    } catch {
      return undefined;
    }
  };
  const [legacyValue, codingValue] = await Promise.all([
    read("worker"),
    read("coding-worker"),
  ]);
  const legacy = workerStatusInput.safeParse(legacyValue);
  const coding = codingWorkerStatusInput.safeParse(codingValue);
  if (!legacy.success && !coding.success) throw new Error("Worker offline");
  const base = legacy.success
    ? legacy.data
    : {
        busy: false,
        slack: {
          connected: false,
          detail: "No fresh channel worker",
          updatedAt: Date.now(),
        },
        notifications: {
          connected: false,
          lastPollAt: null,
          imported: 0,
          needsReview: 0,
          backlog: false,
          detail: "No fresh channel worker",
        },
        codex: { loggedIn: false, workerOnline: false, github: false },
        x: {
          connected: false,
          detail: "No fresh channel worker",
          imported: 0,
          lastPollAt: null,
          retryAt: null,
          backlog: false,
        },
      };
  return {
    ...base,
    busy: base.busy || (coding.success && coding.data.busy),
    ...(coding.success ? { coding: coding.data.coding } : {}),
  };
}
export async function xRuntimeStatus(): Promise<XStatus> {
  try {
    let value: XStatus | undefined;
    if (process.env.CUE_SHARED_CONFIG === "true") {
      const hosted = await readHostedBackground();
      value = hosted.value.enabled
        ? hosted.value.x
        : (await sharedWorkerStatus()).x;
    } else {
      const response = await fetch("http://127.0.0.1:4319/status", {
        headers: { authorization: "Bearer " + secret() },
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Worker unavailable");
      value = (await response.json()).x;
    }
    if (!value) throw new Error("X listener unavailable");
    return {
      ...value,
      connected:
        value.connected &&
        typeof value.lastPollAt === "number" &&
        Date.now() - value.lastPollAt < 90000,
    };
  } catch {
    return {
      connected: false,
      detail: "X API worker not connected",
      imported: 0,
      lastPollAt: null,
      retryAt: null,
      backlog: false,
    };
  }
}
export async function checkSlack(config: SlackConfig) {
  const r = await fetch("https://slack.com/api/auth.test", {
    method: "POST",
    headers: { authorization: "Bearer " + config.botToken },
    signal: AbortSignal.timeout(10000),
  });
  const data = await r.json();
  if (!r.ok || !data.ok)
    throw new Error(
      "Slack token verification failed: " + (data.error || "request failed"),
    );
  if (data.team_id !== config.teamId)
    throw new Error("This token belongs to a different Slack workspace");
  for (const channel of new Set([
    config.supportChannel,
    config.engineeringChannel,
  ])) {
    const info = await fetch(
      "https://slack.com/api/conversations.info?channel=" + channel,
      {
        headers: { authorization: "Bearer " + config.botToken },
        signal: AbortSignal.timeout(10000),
      },
    );
    const result = await info.json();
    if (!result.ok || !result.channel?.is_member)
      throw new Error("Invite Cue to both configured channels first");
  }
  return {
    ok: true,
    workspace: String(data.team),
    teamId: String(data.team_id),
    botId: String(data.user_id),
  };
}
export async function checkEmail(config: EmailConfig) {
  const result = await new Resend(config.apiKey).domains.list();
  if (result.error || !result.data)
    throw new Error(
      "Resend key could not list domains. Use a full-access key for setup.",
    );
  if (config.pollReceiving) {
    const receiving = await new Resend(config.apiKey).emails.receiving.list(
      { limit: 1 },
      { signal: AbortSignal.timeout(10000) },
    );
    if (receiving.error || !receiving.data)
      throw new Error(
        "Resend key cannot read receiving emails. Enable receiving and use a full-access key.",
      );
  }
  const domainName = config.from.split("@")[1].toLowerCase();
  if (config.from.toLowerCase() === "onboarding@resend.dev")
    return {
      ok: true,
      domain: domainName,
      status: "provider_test_sender",
      message:
        "Receiving API verified. Provider test sender is limited to the Resend account owner's email; send a test to confirm delivery.",
    };
  const domain = result.data.data.find(
    (d) => d.name.toLowerCase() === domainName,
  );
  return {
    ok: !!domain && domain.status === "verified",
    domain: domainName,
    status: domain?.status || "not_added",
    message:
      domain?.status === "verified"
        ? "Sender domain verified. Send a test to confirm provider acceptance."
        : config.pollReceiving
          ? "Receiving API verified. Local polling starts after saving. Verify the sender domain separately before sending replies."
          : "Add and verify this domain in Resend before sending.",
  };
}
export async function notificationRuntimeStatus() {
  try {
    let value;
    if (process.env.CUE_SHARED_CONFIG === "true")
      value = (await sharedWorkerStatus()).notifications;
    else {
      const response = await fetch("http://127.0.0.1:4319/status", {
        headers: { authorization: "Bearer " + secret() },
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Worker unavailable");
      value = (await response.json()).notifications;
    }
    if (!value) throw new Error("Listener unavailable");
    return {
      ...value,
      connected:
        value.connected === true &&
        typeof value.lastPollAt === "number" &&
        Date.now() - value.lastPollAt < 60000,
    };
  } catch {
    return {
      connected: false,
      detail: "Notification worker not running",
      lastPollAt: null,
      imported: 0,
      needsReview: 0,
      backlog: false,
    };
  }
}
export async function checkCodex(forceLocal = false) {
  if (!forceLocal && process.env.CUE_SHARED_CONFIG === "true") {
    let current;
    try {
      current = (await sharedWorkerStatus()).codex;
    } catch {}
    return {
      ok: !!current?.loggedIn && !!current?.workerOnline,
      loggedIn: !!current?.loggedIn,
      workerOnline: !!current?.workerOnline,
      github: !!current?.github,
      repo: process.env.CUE_GITHUB_REPO || null,
      scope: "Connected local Codex worker",
    };
  }
  let loggedIn = false,
    workerOnline = false,
    github = false;
  try {
    const r = await exec(
      process.env.CUE_CODEX_PATH || "codex",
      ["login", "status"],
      { timeout: 10000, maxBuffer: 10000 },
    );
    loggedIn = /logged in/i.test(r.stdout + r.stderr);
  } catch {}
  try {
    const r = await fetch("http://127.0.0.1:4319/status", {
      headers: { authorization: "Bearer " + secret() },
      signal: AbortSignal.timeout(2000),
    });
    workerOnline = r.ok;
  } catch {}
  try {
    await exec("gh", ["auth", "status"], { timeout: 10000, maxBuffer: 10000 });
    github = true;
  } catch {}
  return {
    ok: loggedIn && workerOnline,
    loggedIn,
    workerOnline,
    github,
    repo: process.env.CUE_GITHUB_REPO || null,
    scope: "Bloom upload limit · limits.mjs only",
  };
}
export async function slackRuntimeStatus() {
  try {
    const config = await slackConfig();
    if (config?.deliveryMode === "webhook") return slackWebhookStatus(config);
    let value;
    if (process.env.CUE_SHARED_CONFIG === "true")
      value = (await sharedWorkerStatus()).slack;
    else {
      const response = await fetch("http://127.0.0.1:4319/status", {
        headers: { authorization: "Bearer " + secret() },
        signal: AbortSignal.timeout(1500),
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Worker unavailable");
      value = (await response.json()).slack;
    }
    return {
      connected:
        value.connected === true && Date.now() - value.updatedAt < 20000,
      detail: value.detail || "",
      updatedAt: value.updatedAt,
    };
  } catch {
    return {
      connected: false,
      detail: "Socket listener not running",
      updatedAt: null,
    };
  }
}
