import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";
import { z } from "zod";
import { api, db, secret } from "../lib/server-store";
import { implementFeature, implementFix } from "../lib/feature-runner";
import { runExecutionMode } from "../lib/coding-policy";
import { getMetaConnection, META_MODELS, META_WONDER_MODEL } from "../lib/meta";
import { redactTelemetry, shutdownObservability } from "../lib/observability";

const configured = z
  .object({
    CUE_CONVEX_URL: z.url(),
    MODAL_TOKEN_ID: z.string().min(1),
    MODAL_TOKEN_SECRET: z.string().min(1),
    CUE_MODAL_IMAGE: z.string().min(1),
    GH_TOKEN: z.string().min(1),
  })
  .safeParse(process.env);
if (!configured.success)
  throw new Error("Coding worker configuration is incomplete");
getMetaConnection();
const model = z
  .enum(META_MODELS)
  .parse(process.env.CUE_CODING_MODEL || META_WONDER_MODEL);
const port = z.coerce
  .number()
  .int()
  .min(1)
  .max(65535)
  .parse(process.env.PORT || "8080");
const store = db();
const auth = secret();
const worker = randomUUID();
const shutdown = new AbortController();
let stopping = false;
let busy = false;
let currentAbort: AbortController | undefined;
let publishing = false;

function status() {
  return {
    ok: !stopping,
    worker,
    busy,
    coding: {
      provider: "meta",
      model,
      backend: "modal",
      configured: true,
      workerOnline: !stopping,
    },
    codex: { loggedIn: false, workerOnline: false, github: false },
    slack: {
      connected: false,
      detail: "Disabled on the coding worker",
      updatedAt: Date.now(),
    },
    notifications: {
      connected: false,
      lastPollAt: null,
      imported: 0,
      needsReview: 0,
      backlog: false,
      detail: "Disabled on the coding worker",
    },
    x: {
      connected: false,
      detail: "Disabled on the coding worker",
      imported: 0,
      lastPollAt: null,
      retryAt: null,
      backlog: false,
    },
  };
}

const control = createServer((req, res) => {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  if (req.method === "GET" && req.url === "/healthz") {
    res.writeHead(stopping ? 503 : 200);
    return res.end(JSON.stringify({ ok: !stopping }));
  }
  if (
    req.headers.authorization !== `Bearer ${auth}` &&
    req.headers["x-cue-worker-secret"] !== auth
  ) {
    res.writeHead(403);
    return res.end(JSON.stringify({ error: "Worker authentication required" }));
  }
  if (req.method === "GET" && req.url === "/status")
    return res.end(JSON.stringify(status()));
  res.writeHead(404);
  res.end(JSON.stringify({ error: "Not found" }));
});
await new Promise<void>((resolve, reject) => {
  control.once("error", reject);
  control.listen(port, "0.0.0.0", resolve);
});

async function publishStatus() {
  if (publishing) return;
  publishing = true;
  try {
    const row = await store.query(api.serverState.read, {
      secret: auth,
      key: "coding-worker",
    });
    await store.mutation(api.serverState.write, {
      secret: auth,
      key: "coding-worker",
      expectedVersion: row?.version ?? 0,
      value: JSON.stringify(status()),
    });
  } catch {
    console.error("Coding worker status could not be published");
  } finally {
    publishing = false;
  }
}
await publishStatus();
const statusTimer = setInterval(() => void publishStatus(), 8000);
let graceTimer: ReturnType<typeof setTimeout> | undefined;
const stop = () => {
  if (stopping) return;
  stopping = true;
  clearInterval(statusTimer);
  shutdown.abort();
  currentAbort?.abort();
  graceTimer = setTimeout(() => process.exit(1), 8000);
  graceTimer.unref();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
console.log("Cue coding worker ready");

while (!stopping) {
  try {
    const job = await store.mutation(api.jobs.claim, {
      secret: auth,
      worker,
      executionMode: "pull_request",
      provider: "Meta",
    });
    if (!job) {
      await pause(1500, undefined, { signal: shutdown.signal }).catch(() => {});
      continue;
    }
    busy = true;
    const abort = new AbortController();
    currentAbort = abort;
    const deadline = setTimeout(() => abort.abort(), 900000);
    const heartbeat = setInterval(() => {
      void store
        .mutation(api.jobs.heartbeat, { secret: auth, jobId: job._id, worker })
        .then((result) => {
          if (result.cancel) abort.abort();
        })
        .catch(() => abort.abort());
    }, 8000);
    try {
      const state = await store.query(api.cue.snapshot, { secret: auth });
      const run = state.runs.find((candidate) => candidate._id === job.runId);
      if (
        !run ||
        run.provider !== "Meta" ||
        runExecutionMode(run) !== "pull_request" ||
        !["investigate", "feature"].includes(job.kind)
      )
        throw new Error("Claimed job is unsupported by the Meta coding worker");
      if (stopping) abort.abort();
      await (run.kind === "feature" ? implementFeature : implementFix)(
        run._id,
        abort.signal,
        { notify: false },
      );
    } catch (error) {
      await store
        .mutation(api.cue.updateRun, {
          secret: auth,
          runId: job.runId,
          fields: {
            status: abort.signal.aborted ? "canceled" : "failed",
            phase: abort.signal.aborted ? "canceled" : "worker_error",
            error: String(
              redactTelemetry(
                error instanceof Error ? error.message : String(error),
              ),
            ),
          },
        })
        .catch(() => {});
    } finally {
      currentAbort = undefined;
      clearInterval(heartbeat);
      clearTimeout(deadline);
      await store.mutation(api.jobs.finish, {
        secret: auth,
        jobId: job._id,
        worker,
      });
      busy = false;
    }
  } catch {
    busy = false;
    console.error("Coding worker queue operation failed");
    await pause(2000, undefined, { signal: shutdown.signal }).catch(() => {});
  }
}

clearInterval(statusTimer);
await publishStatus();
await new Promise<void>((resolve) => control.close(() => resolve()));
await shutdownObservability();
if (graceTimer) clearTimeout(graceTimer);
