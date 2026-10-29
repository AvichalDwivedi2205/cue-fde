import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
const { api, db, secret } = await import("../lib/server-store");
const { readIntegrations } = await import("../lib/integration-config");
const { generateGrowthDraft } = await import("../lib/growth-model");
const { growthContext } = await import("../lib/company-context");
const { answerKnowledge } = await import("../lib/knowledge-answer");
const { shutdownObservability } = await import("../lib/observability");

assert(
  process.env.LITELLM_API_KEY,
  "LiteLLM must be configured to verify its route",
);
const app = (await readIntegrations()).apps.find((a) =>
  process.env.CUE_VERIFY_CONTEXT_APP
    ? a.id === process.env.CUE_VERIFY_CONTEXT_APP
    : a.name === "Bloom" &&
      a.origins.includes("https://bloom-with-cue.vercel.app"),
);
assert(app, "Select a registered app with published context");
const saved = await db().query(api.growth.snapshot, {
  secret: secret(),
  appId: app.id,
});
const capability = saved.capabilities.find((c) => c.valid);
assert(capability, "Current verified capability required");
const destination = app.origins.find(
  (o) => o === "https://bloom-with-cue.vercel.app",
);
assert(destination);
const deployed = await (await fetch(destination + "/api/health")).json();
assert.equal(deployed.appId, app.id);
assert.equal(deployed.release, capability.release);

const link =
  "https://cue.latchgrid.in/g/model-routing-verification-not-published";
const sources = [
  "Anyone recommend a photo journal app where I can find saved memories using caption words out of order?",
  "I want to find an old memory by words I wrote in its caption, not by recognizing objects in the photo. Any app recommendations?",
  "Looking for a memory journal with caption search that requires every word I type. Anyone have a recommendation?",
];
const growth: Record<string, unknown>[] = [];
const support: Record<string, unknown>[] = [];
try {
  for (const source of sources) {
    // One frozen retrieval and published voice version per matched comparison.
    const context = await growthContext(
      app.id,
      source + "\n" + capability.need,
    );
    assert(context.hits.length, "Published customer-visible context required");
    for (const model of ["gemini-2.5-flash", "claude-sonnet-4.6"] as const) {
      const result = await generateGrowthDraft(
        source,
        capability.claims,
        link,
        app.name,
        context,
        { model },
      );
      assert.equal(result.generation.model, model);
      assert.equal(
        result.generation.provider,
        model.startsWith("gemini") ? "google" : "litellm",
      );
      assert(
        !result.generation.fallbackFrom,
        "Verification requires the selected provider to answer",
      );
      assert(
        result.generation.inputTokens > 0 && result.generation.outputTokens > 0,
      );
      growth.push({
        source,
        ...result,
        grounding: context.grounding,
        sourceTitles: context.hits.map((h) => h.title),
      });
    }
  }
  for (const question of [
    "Do caption search words have to appear in exactly the same order? Explain how I should search.",
    "I wrote a word in a memory's title but not its caption. Why does caption search not find it?",
  ]) {
    for (const model of ["gemini-2.5-flash", "claude-sonnet-4.6"] as const) {
      const started = Date.now();
      const answer = await answerKnowledge(
        app.id,
        { appName: app.name, message: question },
        { mode: "keyword", model },
      );
      assert.equal(answer.status, "answered");
      assert.equal(answer.model, model);
      assert(
        answer.citedIds.length &&
          answer.inputTokens > 0 &&
          answer.outputTokens > 0,
      );
      support.push({
        question,
        text: answer.text,
        provider: answer.provider,
        model: answer.model,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
        durationMs: Date.now() - started,
        citations: answer.citedIds,
        brandVersion: answer.brandVersion,
      });
    }
  }
  const report = {
    checkedAt: new Date().toISOString(),
    appId: app.id,
    release: capability.release,
    comparison:
      "Identical source, verified claims, retrieved passages, published brand version and 280-character destination budget for each Growth pair. Support uses the same keyword retrieval and published voice per question.",
    growth,
    support,
    factualGuard:
      "Passed all selected-provider generations; exact destination, bounded length, supported feature wording and support citation IDs validated.",
    humanPreference:
      "Unmeasured; this smoke check does not establish superior brand voice or quality.",
    creditsRemaining: null,
    externalPublication:
      "None. Synthetic inquiries and an unpublished verification link; no opportunity, post or activation created.",
  };
  await mkdir(".cue", { recursive: true });
  await writeFile(
    ".cue/model-route-verification-2026-10-12.json",
    JSON.stringify(report, null, 2),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        growth: growth.length,
        support: support.length,
        growthResults: growth.map((r) => ({
          text: r.text,
          generation: r.generation,
        })),
        supportResults: support.map((r) => ({
          text: r.text,
          model: r.model,
          durationMs: r.durationMs,
        })),
        report: ".cue/model-route-verification-2026-10-12.json",
        humanPreference: "Unmeasured",
        creditsRemaining: null,
      },
      null,
      2,
    ),
  );
} finally {
  await shutdownObservability();
}
