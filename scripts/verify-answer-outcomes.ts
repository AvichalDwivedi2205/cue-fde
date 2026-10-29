import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import type { Id } from "../convex/_generated/dataModel";
nextEnv.loadEnvConfig(process.cwd());
const { synthesizeReply } = await import("../lib/google-speech");
const { readIntegrations } = await import("../lib/integration-config");
const { api, db, secret } = await import("../lib/server-store");
const { shutdownObservability } = await import("../lib/observability");
const base = process.env.CUE_VERIFY_ORIGIN || "https://cue.latchgrid.in";
const app = (await readIntegrations()).apps.find(
  (a) =>
    a.name === "Bloom" &&
    a.origins.includes("https://bloom-with-cue.vercel.app"),
);
assert(app, "Registered Bloom app required");
const origin = "https://bloom-with-cue.vercel.app";
const checks: string[] = [];
async function post(path: string, body: object) {
  const r = await fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  return { status: r.status, data: await r.json() };
}
async function call(path: string, body: object) {
  const result = await post(path, body);
  assert.equal(
    result.status,
    200,
    JSON.stringify({ path, error: result.data.error }),
  );
  return result.data;
}
const token = (
  await call("/api/widget", { action: "session", app: app.id, origin })
).token;
const auth = {
  app: app.id,
  origin,
  token,
  name: "Synthetic answer-outcome verification",
};
let sessionId: string | undefined,
  caseId: Id<"cases"> | undefined,
  transcript: string | undefined;
try {
  sessionId = (
    await call("/api/voice", { ...auth, action: "start", consent: true })
  ).sessionId;
  const audio = await synthesizeReply(
    "Do my caption search words need to be in the same order?",
  );
  await writeFile(".cue/outcome-input.mp3", Buffer.from(audio.data, "base64"), {
    mode: 0o600,
  });
  execFileSync(process.env.CUE_FFMPEG_PATH || "ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    ".cue/outcome-input.mp3",
    "-ar",
    "16000",
    "-ac",
    "1",
    ".cue/outcome-input.wav",
  ]);
  const turn = await call("/api/voice", {
    ...auth,
    action: "turn",
    sessionId,
    key: randomUUID(),
    audio: (await readFile(".cue/outcome-input.wav")).toString("base64"),
    mimeType: "audio/wav",
  });
  caseId = turn.caseId;
  transcript = turn.transcript;
  assert(
    turn.reply &&
      turn.audio?.provider === "google-cloud" &&
      turn.audio.data.length,
  );
  checks.push(
    "Hosted voice transcribes, retrieves an answer and returns Google Cloud audio",
  );
  const question = "What is the photo upload limit?";
  const message = await call("/api/widget", {
    ...auth,
    action: "message",
    text: question,
  });
  assert.equal(message.id, caseId);
  const conversation = await call("/api/widget", { ...auth, action: "read" });
  const answer = conversation.messages
    .filter((m: { role: string }) => m.role === "cue")
    .at(-1);
  assert(answer?.citations.length && /5 MB/i.test(answer.body));
  checks.push(
    "Typed follow-up shares the voice conversation and cites the approved FAQ",
  );
  const feedback = {
    ...auth,
    action: "feedback",
    caseId,
    messageId: answer.id,
    outcome: "needs_help",
  };
  assert.equal((await call("/api/widget", feedback)).duplicate, false);
  assert.equal((await call("/api/widget", feedback)).duplicate, true);
  const restored = await call("/api/widget", { ...auth, action: "read" });
  assert.equal(
    restored.messages.find((m: { id: string }) => m.id === answer.id)?.outcome,
    "needs_help",
  );
  checks.push(
    "Negative feedback persists after a fresh read and retry is idempotent",
  );
  const otherToken = (
    await call("/api/widget", { action: "session", app: app.id, origin })
  ).token;
  assert.notEqual(
    (await post("/api/widget", { ...feedback, token: otherToken })).status,
    200,
  );
  assert.equal(
    (
      await post("/api/widget", {
        ...feedback,
        origin: "https://unregistered.invalid",
      })
    ).status,
    403,
  );
  checks.push(
    "Other visitors and unregistered app origins cannot submit this answer’s feedback",
  );
  const args = {
    secret: secret(),
    workspaceId: "cue-configured-workspace",
    appId: app.id,
  };
  const gaps = await db().query(api.feedbackGaps.snapshot, args);
  const linked = gaps.find((g) =>
    g.reports.some((r) => r.messageId === answer.id),
  );
  assert(
    linked?.reports.some(
      (r) => r.question === question && r.reason === "needs_help",
    ),
  );
  const saved = await db().query(api.cue.snapshot, { secret: secret() });
  const c = saved.cases.find((c) => c._id === caseId);
  assert(c?.tags.includes("Needs human reply") && c.status === "open");
  checks.push(
    "The actual question enters the gap queue and preserves a human handoff",
  );
  await db().mutation(api.voice.markVerificationCase, {
    secret: secret(),
    caseId: caseId!,
    expectedTranscript: transcript!,
  });
  const excluded = await db().query(api.feedbackGaps.snapshot, args);
  assert(!excluded.some((g) => g.reports.some((r) => r.messageId === answer.id)));
  checks.push(
    "Synthetic verification evidence is retained and excluded from customer gap counts",
  );
  await writeFile(
    ".cue/answer-outcomes-hosted-verification.json",
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        origin: base,
        synthetic: true,
        caseId,
        checks,
        sourceTitles: answer.citations.map((c: { title: string }) => c.title),
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ passed: true, checks, caseId }));
} finally {
  if (sessionId)
    await call("/api/voice", { ...auth, action: "end", sessionId }).catch(
      () => {},
    );
  if (caseId && transcript)
    await db()
      .mutation(api.voice.markVerificationCase, {
        secret: secret(),
        caseId,
        expectedTranscript: transcript,
      })
      .catch(() => {});
  await shutdownObservability();
}
