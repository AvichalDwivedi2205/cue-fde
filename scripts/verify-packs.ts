import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
nextEnv.loadEnvConfig(process.cwd());
const { db, api, secret } = await import("../lib/server-store");
const { readIntegrations } = await import("../lib/integration-config");

// Pack invariants:
//  1. Parity: every vault app has a pack with identical name/origins/status.
//  2. Every vault coding binding matches a pack's engineering field — the
//     legacy "bloom" binding through the pack that carries the bloom alias.
//  3. The legacy bloom alias points at exactly one pack.
//  4. Grep gate: no file outside lib/integration-config.ts reads the vault
//     apps list — pack-only apps would otherwise be invisible to that
//     consumer, which parity cannot detect.

const problems: string[] = [];
const config = await readIntegrations();
const packs = await db().query(api.appPacks.list, { secret: secret() });

for (const app of config.apps) {
  const pack = packs.find((p) => p.appId === app.id);
  if (!pack) {
    problems.push(`vault app ${app.id} has no pack (run backfill-packs)`);
    continue;
  }
  if (pack.name !== app.name || pack.origins.join("|") !== app.origins.join("|"))
    problems.push(`pack ${app.id} identity drifts from the vault entry`);
}
for (const coding of config.coding ?? []) {
  const pack = packs.find(
    (p) =>
      p.appId === coding.appId ||
      (coding.appId === "bloom" && (p.aliases ?? []).includes("bloom")),
  );
  if (!pack) {
    problems.push(`vault coding binding ${coding.appId} has no pack`);
    continue;
  }
  if (
    !pack.engineering ||
    pack.engineering.repository !== coding.repository ||
    pack.engineering.baseBranch !== coding.baseBranch ||
    pack.engineering.allowedPaths.join("|") !==
      coding.allowedPaths.join("|")
  )
    problems.push(
      `pack ${pack.appId} engineering binding drifts from vault (${coding.appId})`,
    );
}
const bloomAliased = packs.filter((p) => (p.aliases ?? []).includes("bloom"));
if (
  (config.coding ?? []).some((c) => c.appId === "bloom") &&
  bloomAliased.length !== 1
)
  problems.push(
    `the legacy bloom binding needs exactly one aliased pack, found ${bloomAliased.length}`,
  );
for (const pack of packs) {
  if (!pack.origins.length)
    problems.push(`pack ${pack.appId} has no allowed origins`);
  if (!["draft", "active", "suspended"].includes(pack.status))
    problems.push(`pack ${pack.appId} has an unknown status`);
}

// Grep gate over lib/, app/, convex/ (excluding the vault module itself).
const roots = ["lib", "app", "convex", "scripts"];
const offenders: string[] = [];
async function walk(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (["node_modules", "_generated", "generated"].includes(e.name))
        continue;
      await walk(p);
    } else if (/\.(ts|tsx|js|mjs)$/.test(e.name) && !p.endsWith(".d.ts")) {
      const text = await readFile(p, "utf8");
      if (/readIntegrations\(\)\s*\.apps/.test(text))
        offenders.push(p);
    }
  }
}
for (const root of roots) await walk(root);
for (const f of offenders)
  problems.push(`${f} still reads vault app identity (use lib/app-pack.ts)`);

const result = {
  checkedAt: new Date().toISOString(),
  packs: packs.length,
  vaultApps: config.apps.length,
  problems,
  ok: problems.length === 0,
};
await mkdir(".cue", { recursive: true });
await writeFile(
  ".cue/pack-verify.json",
  JSON.stringify(result, null, 2),
  { mode: 0o600 },
);
console.log(JSON.stringify(result, null, 2));
assert.equal(result.ok, true, "pack verification failed");
