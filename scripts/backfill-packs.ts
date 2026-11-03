import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { db, api, secret } = await import("../lib/server-store");
const { readIntegrations } = await import("../lib/integration-config");

// One-time additive projection: vault app identity + coding bindings become
// appPacks rows. Idempotent — safe to run repeatedly. Never removes packs.
// ensure() is a full-replace upsert, so every run restates the full intended
// pack from the vault; bindings made outside the vault are reset.
//
// The legacy "bloom" identifier (the pre-packs gateway and the vault coding
// binding use it) resolves through an alias on the pack that serves the Bloom
// public origin — the same pack resolveAppPack() picks at runtime, so the two
// resolution paths always agree.

const BLOOM_ORIGIN =
  process.env.CUE_BLOOM_PUBLIC_URL || "https://bloom-with-cue.vercel.app";

const config = await readIntegrations();
const codings = config.coding ?? [];
let created = 0,
  updated = 0;
for (const app of config.apps) {
  const isBloomOrigin = app.origins.includes(BLOOM_ORIGIN);
  const coding =
    codings.find((c) => c.appId === app.id) ??
    (isBloomOrigin ? codings.find((c) => c.appId === "bloom") : undefined);
  const existing = await db().query(api.appPacks.get, {
    secret: secret(),
    appId: app.id,
  });
  await db().mutation(api.appPacks.ensure, {
    secret: secret(),
    appId: app.id,
    name: app.name,
    origins: app.origins,
    status: "active",
    widget: app.widget,
    aliases: isBloomOrigin ? ["bloom"] : undefined,
    engineering: coding
      ? {
          repository: coding.repository,
          baseBranch: coding.baseBranch,
          allowedPaths: coding.allowedPaths,
          testCommands: coding.testCommands,
        }
      : undefined,
  });
  if (existing) updated += 1;
  else created += 1;
  console.log(
    `pack ${app.id} (${app.name}) ${existing ? "updated" : "created"}${
      coding ? " with engineering binding" : ""
    }${isBloomOrigin ? " with the legacy bloom alias" : ""}`,
  );
}
console.log(`backfill complete: ${created} created, ${updated} updated`);
