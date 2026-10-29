import nextEnv from "@next/env";
import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import path from "node:path";
import { photo } from "../demo/bloom/fixture.mjs";
nextEnv.loadEnvConfig(process.cwd());
const { api, db, secret } = await import("../lib/server-store");
const { updateIntegrations, readIntegrations } = await import(
  "../lib/integration-config"
);
const { validateRehearsal } = await import("../lib/rehearsal-policy");
const { rehearsalDirectory, readRehearsalConfig } = await import(
  "../lib/rehearsal-runtime"
);
const exec = promisify(execFile),
  store = db(),
  auth = secret();
const [action, key] = process.argv.slice(2);
if (!key || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(key))
  throw new Error(
    "Usage: npx tsx scripts/rehearsal.ts prepare|start|status <fresh-scenario-key>",
  );
const indexFile = path.join(process.cwd(), ".cue", "rehearsals", key + ".json");
if (action === "prepare") {
  // Exclusive marker prevents accidentally resetting or recycling an old scenario.
  await fs.mkdir(path.dirname(indexFile), { recursive: true });
  const appId = "cue_app_" + randomBytes(12).toString("hex");
  const registration = validateRehearsal({
    appId,
    key,
    frontendOrigin:
      process.env.CUE_REHEARSAL_FRONTEND_ORIGIN || "http://127.0.0.1:4402",
    backendOrigin:
      process.env.CUE_REHEARSAL_BACKEND_ORIGIN || "http://127.0.0.1:4320",
    cueOrigin:
      process.env.CUE_REHEARSAL_CUE_ORIGIN || "https://cue.latchgrid.in",
    ...(process.env.CUE_GITHUB_REPO
      ? { repository: process.env.CUE_GITHUB_REPO }
      : {}),
  });
  // Check both ports before any registration or filesystem reservation.
  for (const origin of [
    registration.frontendOrigin,
    registration.backendOrigin,
  ]) {
    const { createServer } = await import("node:net");
    const probe = createServer();
    await new Promise<void>((resolve, reject) => {
      probe.once("error", reject);
      probe.listen(Number(new URL(origin).port), "127.0.0.1", resolve);
    });
    await new Promise<void>((resolve) => probe.close(() => resolve()));
  }
  await fs.writeFile(
    indexFile,
    JSON.stringify({ appId, key, state: "preparing" }),
    { flag: "wx", mode: 0o600 },
  );
  const dir = rehearsalDirectory(appId),
    baseline = path.join(dir, "baseline");
  await fs.mkdir(dir, { recursive: true });
  if (registration.repository) {
    await exec(
      "gh",
      [
        "repo",
        "clone",
        registration.repository,
        baseline,
        "--",
        "--branch",
        "main",
        "--single-branch",
      ],
      { timeout: 60000 },
    );
  } else {
    await fs.cp("demo/bloom", baseline, { recursive: true });
    for (const args of [
      ["init", "-b", "main"],
      ["config", "user.name", "Cue Rehearsal"],
      ["config", "user.email", "cue-rehearsal@localhost"],
      ["add", "."],
      ["commit", "-m", "Seed owned controlled upload regression"],
    ])
      await exec("git", args, { cwd: baseline });
  }
  const baseCommit = (
    await exec("git", ["rev-parse", "HEAD"], { cwd: baseline })
  ).stdout.trim();
  const baselineCheck = await exec(process.execPath, ["test.mjs"], {
    cwd: baseline,
    timeout: 30000,
  }).then(
    (result) => ({ ok: true, output: result.stdout + result.stderr }),
    (error: { stdout?: string; stderr?: string }) => ({
      ok: false,
      output: (error.stdout || "") + (error.stderr || ""),
    }),
  );
  if (
    baselineCheck.ok ||
    !baselineCheck.output.includes("3 MB photo: HTTP 413 (expected 201)")
  )
    throw new Error(
      "Remote fixture does not reproduce the intended controlled regression; no registration performed",
    );
  await fs.writeFile(
    path.join(dir, "baseline-check.txt"),
    baselineCheck.output,
    { mode: 0o600 },
  );
  const files = (await exec("git", ["ls-files"], { cwd: baseline })).stdout
    .trim()
    .split("\n");
  for (const file of files) {
    if (file.startsWith("/") || file.split("/").includes(".."))
      throw new Error("Invalid fixture path");
    const target = path.join(dir, "live", file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(baseline, file), target);
  }
  await fs.writeFile(
    path.join(dir, "config.json"),
    JSON.stringify({ ...registration, baseCommit }),
    { flag: "wx", mode: 0o600 },
  );
  const fixtures = path.join(dir, "fixtures");
  await fs.mkdir(fixtures, { recursive: true });
  for (const megabytes of [1, 3, 5, 6])
    await fs.writeFile(
      path.join(fixtures, `synthetic-photo-${megabytes}mb.png`),
      photo(megabytes * 1024 * 1024),
    );
  // Additive registration: never modify any existing app, origins, provider connection or evidence.
  await updateIntegrations((old) => ({
    ...old,
    apps: [
      ...old.apps,
      {
        id: appId,
        name: "Bloom",
        origins: [registration.frontendOrigin],
        createdAt: Date.now(),
        widget: { answers: true, voice: true, screenshots: true },
      },
    ],
  }));
  const issueId = await store.mutation(api.rehearsals.register, {
    secret: auth,
    registration,
  });
  const proof = {
    ...registration,
    baseCommit,
    issueId,
    fixtures,
    state: "prepared",
    note: "Owned controlled fixture; no live coding job or approval has run.",
  };
  await fs.writeFile(indexFile, JSON.stringify(proof, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify(proof, null, 2));
} else {
  const metadata = JSON.parse(await fs.readFile(indexFile, "utf8"));
  const config = await readRehearsalConfig(metadata.appId);
  if (action === "start") {
    const r = await fetch("http://127.0.0.1:4319/rehearsal/prepare", {
      method: "POST",
      headers: {
        authorization: `Bearer ${auth}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ appId: config.appId }),
    });
    if (!r.ok) throw new Error(await r.text());
    console.log(await r.text());
  } else if (action === "status") {
    const registered = await store.query(api.rehearsals.get, {
      secret: auth,
      appId: config.appId,
    });
    const snapshot = await store.query(api.cue.snapshot, { secret: auth });
    const runs = snapshot.runs.filter((run) => run.targetId === config.appId);
    const connected = (await readIntegrations()).apps.find(
      (app) => app.id === config.appId,
    );
    const health = await fetch(config.frontendOrigin + "/health").then(
      (r) => r.json(),
      () => null,
    );
    console.log(
      JSON.stringify(
        {
          metadata,
          registered,
          connected: connected && {
            id: connected.id,
            origins: connected.origins,
          },
          health,
          runs,
        },
        null,
        2,
      ),
    );
  } else
    throw new Error(
      "Supported actions: prepare, start, status. Investigation and exact-commit approval happen in the normal Cue UI.",
    );
}
