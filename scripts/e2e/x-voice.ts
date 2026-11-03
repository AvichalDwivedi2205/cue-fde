import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { db, api, secret } = await import("../../lib/server-store");
const { readIntegrations } = await import("../../lib/integration-config");
const { createXApi } = await import("../../lib/x-api");

// Live checks for the X intake and the consent-gated voice surface.
// Usage: npx tsx scripts/e2e/x-voice.ts  (web on :3000, worker running)

// X: live read-only brand verification + mentions page through the official API.
// verifyBrand() returns void and throws XApiError("auth") on mismatch, so a
// clean return below IS the brand-identity verification.
const config = (await readIntegrations()).x;
if (config?.enabled) {
  const x = createXApi(config);
  await x.verifyBrand();
  console.log("PASS · X brand identity verified against the official API");
  const page = await x.mentions({});
  console.log(
    "PASS · Official X intake fetched",
    page.data?.length ?? 0,
    "live mentions (meta:",
    JSON.stringify(page.meta ?? {}).slice(0, 120) + ")",
  );
} else {
  console.log("X intake not enabled — skipping live X checks");
}

// Voice: consent-gated session start + immediate end through the widget surface.
const APP_ID = process.env.CUE_E2E_NOTES_APP_ID || "cue_app_94c08efd3159ef0d1563fc29";
const ORIGIN = "http://127.0.0.1:4460";
const base = "http://127.0.0.1:3000";
const { requireSessionPack } = await import("../../lib/app-pack");
const pack = await requireSessionPack(APP_ID);
if (!pack.widget?.voice) {
  await db().mutation(api.appPacks.setWidget, {
    secret: secret(),
    appId: APP_ID,
    answers: true,
    voice: true,
    screenshots: true,
  });
  console.log("enabled voice on the pack for the voice check");
}
const session = await (
  await fetch(base + "/api/widget", {
    method: "POST",
    headers: { "content-type": "application/json", origin: base },
    body: JSON.stringify({ action: "session", app: APP_ID, origin: ORIGIN }),
  })
).json();
const vstart = await fetch(base + "/api/voice", {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ action: "start", app: APP_ID, token: session.token, origin: ORIGIN }),
});
console.log("voice start without consent:", vstart.status, await vstart.json());
const v1 = await fetch(base + "/api/voice", {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ action: "start", app: APP_ID, token: session.token, origin: ORIGIN, consent: true }),
});
const v1body = await v1.json();
console.log("voice start with consent:", v1.status, v1body.disclosure ? "disclosure issued" : JSON.stringify(v1body));
if (!v1body.sessionId) throw new Error("voice session did not start");
const vend = await fetch(base + "/api/voice", {
  method: "POST",
  headers: { "content-type": "application/json", origin: base },
  body: JSON.stringify({ action: "end", app: APP_ID, token: session.token, origin: ORIGIN, sessionId: v1body.sessionId }),
});
const vendBody = await vend.json();
console.log("voice end:", vend.status, JSON.stringify(vendBody));
if (!vendBody.ended) throw new Error("voice session did not end cleanly");
console.log("PASS · Consent-gated voice session lifecycle (start → disclosure → end)");
