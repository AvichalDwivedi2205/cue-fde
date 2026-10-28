import { z } from "zod";
import { api, db, secret } from "./server-store";
import { readIntegrations } from "./integration-config";
import {
  sharedWorkerStatus,
  xRuntimeStatus,
  notificationRuntimeStatus,
} from "./integration-checks";
import { geminiReady } from "./gemini";
import type { Role } from "./roles";
import type { Id } from "../convex/_generated/dataModel";

export const workspaceInput = z
  .object({
    agent: z.enum(["x", "reddit", "growth", "engineering"]),
    appId: z.string().min(1).max(100),
    text: z.string().trim().min(1).max(4000),
    key: z.string().min(8).max(200),
    taskId: z.string().max(100).optional(),
    issueId: z.string().max(100).optional(),
  })
  .strict();
export type WorkspaceActor = { id: string; name: string; role: Role };
export async function workspaceApp(appId?: string) {
  const config = await readIntegrations();
  if (appId === "bloom")
    return { app: { id: "bloom", name: "Legacy Bloom", origins: [] }, config };
  const app = appId
    ? config.apps.find((a) => a.id === appId)
    : config.apps.find((a) =>
        a.origins.includes(
          process.env.CUE_BLOOM_PUBLIC_URL ||
            "https://bloom-with-cue.vercel.app",
        ),
      );
  if (!app) throw new Error("Choose a registered app");
  return { app, config };
}
export async function postWorkspace(
  input: z.infer<typeof workspaceInput>,
  actor: WorkspaceActor,
  via = "Q",
  threadKey?: string,
) {
  const { config } = await workspaceApp(input.appId);
  const selected = input.taskId
    ? (
        await db().query(api.workspace.snapshot, {
          secret: secret(),
          appId: input.appId,
          participant: actor.id,
        })
      ).tasks.find((t) => t._id === input.taskId)
    : null;
  const words = input.text.toLowerCase();
  const action = /^(?:please\s+)?(?:investigate|start investigation)\b/.test(
    words,
  )
    ? "investigate"
    : /^(?:please\s+)?(?:delegate|implement)\b/.test(words)
      ? "delegate"
      : /^(?:please\s+)?(?:collect|run collection)\b/.test(words)
        ? "collect"
        : undefined;
  let issueId = input.issueId || selected?.issueId;
  if (!issueId) {
    const snapshot = await db().query(api.cue.snapshot, { secret: secret() });
    const eligible = snapshot.issues.filter(
      (i) => (i.appId || "bloom") === input.appId,
    );
    issueId = eligible.find(
      (i) =>
        words.includes(i._id) ||
        (words.includes("iss-14") && i.fingerprint === "bloom:upload:413"),
    )?._id;
  }
  return db().mutation(api.workspace.post, {
    secret: secret(),
    appId: input.appId,
    agent: input.agent,
    actor: { id: actor.id, name: actor.name, role: actor.role },
    key: input.key,
    text: input.text,
    via,
    ...(input.taskId ? { taskId: input.taskId as Id<"agentTasks"> } : {}),
    ...(issueId ? { issueId: issueId as Id<"issues"> } : {}),
    ...(action ? { action } : {}),
    ...(threadKey ? { threadKey } : {}),
    repository: config.coding?.find((c) => c.appId === input.appId)?.repository,
  });
}
export async function workspaceSnapshot(appId: string, actor: WorkspaceActor) {
  const { app } = await workspaceApp(appId);
  const [workspace, domain, jobs, x, notifications, companion] =
    await Promise.all([
      db().query(api.workspace.snapshot, {
        secret: secret(),
        appId,
        participant: actor.id,
      }),
      db().query(api.cue.snapshot, { secret: secret() }),
      db().query(api.jobs.status, { secret: secret() }),
      xRuntimeStatus(),
      notificationRuntimeStatus(),
      sharedWorkerStatus().catch(() => null),
    ]);
  const health = (ok: boolean, label: string, detail: string) => ({
    st: ok ? "ok" : "unknown",
    label,
    detail,
  });
  const agents = [
    {
      id: "x",
      name: "X",
      icon: "xlogo",
      purpose:
        "Collects authorized X mentions with original source provenance.",
      can: ["Read official mentions", "Run bounded collection"],
      cannot: ["Publish public replies"],
      limits: "Shared checkpoint and leased collection",
      health: health(
        x.connected,
        x.connected ? "Official read connected" : "Collection unavailable",
        x.detail,
      ),
      sugg: ["Show current work", "Run collection now"],
    },
    {
      id: "reddit",
      name: "Reddit",
      icon: "reddit",
      purpose:
        "Routes notification excerpts and supplied sources; source removal remains separate from intake health.",
      can: ["Notification intake", "Operator supplied-source capture"],
      cannot: ["General API search", "Publish replies"],
      limits: "Assisted capture; general API access unavailable",
      health: health(
        !!notifications.connected,
        notifications.connected
          ? "Notification inbox connected"
          : "Notification health unavailable",
        notifications.detail || "Provider notification coverage varies",
      ),
      sugg: ["Show current work"],
    },
    {
      id: "growth",
      name: "Growth",
      icon: "trend",
      purpose:
        "Matches explicit needs to verified capabilities and tracks reviewed recommendations.",
      can: ["Inspect verified capability evidence"],
      cannot: [
        "Approve own content",
        "Publish replies",
        "Promise unsupported features",
      ],
      limits: "Shares two reasoning slots",
      health: health(
        geminiReady(),
        geminiReady() ? "Gemini configured" : "Gemini unavailable",
        "Publication requires exact review and Owner action",
      ),
      sugg: ["What is blocked?"],
    },
    {
      id: "engineering",
      name: "Engineering",
      icon: "bot",
      purpose:
        "Delegates approved specifications through registered repository policy; follows tests, PRs and release evidence.",
      can: [
        "Delegate approved specs",
        "Inspect existing runs",
        "Scoped Bloom upload investigation",
      ],
      cannot: [
        "Arbitrary bug execution",
        "Claim deployed resolution without release evidence",
      ],
      limits: "One personal Codex run",
      health: health(
        !!companion?.codex.loggedIn && !!companion?.codex.workerOnline,
        companion?.codex.workerOnline
          ? "Companion online"
          : "Companion offline",
        companion?.busy
          ? "Coding slot busy"
          : "No active companion work reported",
      ),
      sugg: ["Show current work"],
    },
  ];
  const tasks = workspace.tasks.map((t) => {
    const run = t.runId && domain.runs.find((r) => r._id === t.runId);
    const issue = t.issueId && domain.issues.find((i) => i._id === t.issueId);
    const state = run
      ? run.status === "resolved" && run.verified && run.deployed
        ? "completed"
        : run.status === "awaiting_approval"
          ? "awaiting"
          : ["failed", "canceled"].includes(run.status)
            ? run.status
            : ["approved", "rejected"].includes(run.status)
              ? "blocked"
              : jobs.find((j) => j.runId === run._id)?.status === "queued"
                ? "queued"
                : "running"
      : t.state;
    const events = workspace.events
      .filter((e) => e.taskId === t._id)
      .map((e) => ({
        t: e.createdAt,
        who: e.actor,
        kind: e.kind,
        text: e.text,
      }));
    if (run)
      events.push(
        ...domain.events
          .filter((e) => e.runId === run._id)
          .map((e) => ({
            t: e.createdAt,
            who: run.provider,
            kind:
              e.kind === "failure"
                ? "failed"
                : e.kind === "approval"
                  ? "pending"
                  : "completed",
            text: e.title + " · " + e.detail,
          })),
      );
    return {
      id: t._id,
      agent: t.agent,
      app: app.name,
      title: t.title,
      type: t.action,
      state,
      stage: run?.phase || t.stage,
      blocker:
        run?.error ||
        t.blocker ||
        (run?.status === "approved"
          ? "Approved commit awaits deployment and acceptance."
          : undefined),
      note:
        state === "queued"
          ? "Durable instruction saved; worker has not started."
          : undefined,
      created: t.createdAt,
      owner: agents.find((a) => a.id === t.agent)!.name,
      events: events.sort((a, b) => a.t - b.t),
      sources: domain.cases
        .filter((c) => c.issueId === t.issueId)
        .map((c) => ({ l: c.title, h: "#/inbox/" + c._id, k: "case" })),
      evidence: [
        ...(issue?.spec
          ? [
              {
                l: "Exact specification",
                h: "#/features/" + issue._id,
                k: "spec",
              },
            ]
          : []),
        ...(run?.commit ? [{ l: run.commit, k: "commit" }] : []),
        ...(run?.prUrl
          ? [{ l: "Pull request", h: run.prUrl, ext: true, k: "PR" }]
          : []),
        ...(run?.after ? [{ l: run.after, k: "independent tests" }] : []),
        ...(run?.releaseEvidence
          ? [{ l: run.releaseEvidence, k: "release acceptance" }]
          : []),
      ],
    };
  });
  return {
    app: { id: app.id, name: app.name },
    apps: [
      { id: "bloom", name: "Legacy Bloom" },
      ...(await readIntegrations()).apps.map((a) => ({
        id: a.id,
        name: a.name,
      })),
    ],
    agents,
    tasks,
    conversations: workspace.conversations,
  };
}
