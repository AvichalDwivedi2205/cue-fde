import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import {
  withIsolatedCoding,
  type SourceSnapshot,
} from "../lib/coding-workspace";
import {
  dockerCommand,
  localCodingConfig,
  localCodingReadiness,
} from "../lib/local-coding-runtime";
import type { CodingConfig } from "../lib/integration-config";

const context = localCodingConfig().context;
const bun = process.argv.includes("--bun");
const lockName = bun ? "bun.lock" : "package-lock.json";
const readiness = await localCodingReadiness();
assert.equal(readiness.ready, true, readiness.detail);
const repo = await fs.mkdtemp(path.join(os.tmpdir(), "cue-local-proof-"));
const ids: string[] = [],
  volumes = new Set<string>(),
  images = new Set<string>();
const observed: {
  purpose: string;
  id: string;
  network: string;
  rootfsReadOnly: boolean;
  mounts: string[];
}[] = [];
const policy: CodingConfig = {
  appId: "synthetic-local-boundary",
  repository: "synthetic/example",
  baseBranch: "main",
  allowedPaths: ["src/"],
  packageManager: bun ? "bun" : "npm",
  testCommands: [{ program: "node", args: ["check.mjs"] }],
};
const npmLock = {
  name: "synthetic",
  version: "1.0.0",
  lockfileVersion: 3,
  packages: {
    "": {
      name: "synthetic",
      version: "1.0.0",
      dependencies: { "is-number": "7.0.0" },
    },
    "node_modules/is-number": {
      version: "7.0.0",
      resolved: "https://registry.npmjs.org/is-number/-/is-number-7.0.0.tgz",
      integrity:
        "sha512-41Cifkg6e8TylSpdtTpeLVMqvSBEVzTttHvERD741+pnZ8ANv0004MRL43QKPDlK9cGvNp6NZWZUBlbGXYxxng==",
    },
  },
};
const lock = JSON.stringify(
  bun
    ? {
        lockfileVersion: 1,
        configVersion: 1,
        workspaces: {
          "": { name: "synthetic", dependencies: { "is-number": "7.0.0" } },
        },
        packages: {
          "is-number": [
            "is-number@7.0.0",
            "",
            {},
            npmLock.packages["node_modules/is-number"].integrity,
          ],
        },
      }
    : npmLock,
);
const check = `
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { value } from './src/value.mjs';
import isNumber from 'is-number';
assert.equal(isNumber(42),true);
assert.equal(process.getuid(),65534);
assert.equal(fs.existsSync('/var/run/docker.sock'),false);
assert.equal(Object.keys(os.networkInterfaces()).filter(name=>name!=='lo').length,0);
for(const file of ['/workspace/check.mjs','/workspace/${lockName}','/workspace/src/value.mjs','/workspace/node_modules/is-number/index.js']) {
  assert.throws(()=>fs.writeFileSync(file,'tampered'));
  assert.throws(()=>fs.chmodSync(file,0o777));
}
assert.throws(()=>fs.writeFileSync('/workspace/injected.mjs','tampered'));
assert.throws(()=>fs.writeFileSync('/etc/cue-injected','tampered'));
const status=fs.readFileSync('/proc/self/status','utf8');
assert.match(status,/NoNewPrivs:\\s+1/);
assert.match(status,/CapEff:\\s+0000000000000000/);
assert.equal(fs.existsSync('/opt/cue-bun-cache'),false,'preparation cache must not enter check images');
assert.equal(process.env.BUN_INSTALL_CACHE_DIR,undefined,'preparation cache override must not enter check process');
const lockHash=crypto.createHash('sha256').update(fs.readFileSync('/workspace/${lockName}')).digest('hex');
assert.equal(lockHash,${JSON.stringify(createHash("sha256").update(lock).digest("hex"))});
const dependencyHash=crypto.createHash('sha256').update(fs.readFileSync('/workspace/node_modules/is-number/index.js')).digest('hex');
assert.equal(dependencyHash,'04255e482e181687823a95b207802ddd32e746c65dce4c95a5176fc192735960');
fs.writeFileSync('/tmp/cache-proof','temporary cache allowed');
console.log(JSON.stringify({uid:process.getuid(),network:'none',protectedWrites:'refused',rootfsWrite:'refused',capabilities:'none',lockHash,dependencyHash}));
if(process.argv.includes('--wait')) { fs.writeFileSync('/tmp/cue-check-started','ready'); await new Promise(resolve=>setTimeout(resolve,120000)); }
else assert.equal(value,2,'independent synthetic value assertion');
`;
const source: SourceSnapshot = new Map([
  [
    "src/value.mjs",
    { bytes: Buffer.from("export const value = 1;"), mode: 0o644 },
  ],
  ["check.mjs", { bytes: Buffer.from(check), mode: 0o644 }],
  [
    "package.json",
    {
      bytes: Buffer.from(
        JSON.stringify({
          name: "synthetic",
          version: "1.0.0",
          type: "module",
          dependencies: { "is-number": "7.0.0" },
        }),
      ),
      mode: 0o644,
    },
  ],
  [lockName, { bytes: Buffer.from(lock), mode: 0o644 }],
]);
await fs.mkdir(path.join(repo, "src"));
for (const [file, value] of source)
  await fs.writeFile(path.join(repo, file), value.bytes);
const controller = new AbortController();
const signal = AbortSignal.any([
  controller.signal,
  AbortSignal.timeout(90_000),
]);
let cachePlacement:
  | { cacheFile: string; cacheFs: number; tmpFs: number }
  | undefined;
const event = async (title: string, detail: string) => {
  if (title === "Bun dependencies installed") {
    const box = JSON.parse(detail);
    const probe = await dockerCommand(context, [
      "exec",
      box.sandboxId,
      "node",
      "-e",
      `
      const fs=require('node:fs'),path=require('node:path');let found;
      function visit(dir,depth=0){if(depth>8||found)return;for(const name of fs.readdirSync(dir)){const file=path.join(dir,name),s=fs.lstatSync(file);if(s.isDirectory())visit(file,depth+1);else if(name==='package.json'&&JSON.parse(fs.readFileSync(file,'utf8')).name==='is-number'){found=file;return;}}}
      visit('/opt');if(!found)throw new Error('Installed Bun package was not found in disk cache');
      console.log(JSON.stringify({cacheFile:found,cacheFs:fs.statfsSync(found).type,tmpFs:fs.statfsSync('/tmp').type}));
    `,
    ]);
    assert.equal(probe.code, 0, probe.stderr.toString());
    cachePlacement = JSON.parse(probe.stdout.toString());
    assert.ok(cachePlacement);
    assert.notEqual(
      cachePlacement.cacheFs,
      0x01021994,
      "Bun package cache must not use tmpfs",
    );
    assert.equal(
      cachePlacement.tmpFs,
      0x01021994,
      "check temporary-filesystem bound remains in force",
    );
    return;
  }
  if (title === "Locked dependencies prepared") {
    images.add(JSON.parse(detail).imageId);
    return;
  }
  if (title !== "Isolated execution started") return;
  const box = JSON.parse(detail);
  ids.push(box.sandboxId);
  const result = await dockerCommand(context, ["inspect", box.sandboxId]);
  assert.equal(result.code, 0);
  const [info] = JSON.parse(result.stdout.toString());
  assert.equal(info.HostConfig.Privileged, false);
  assert.deepEqual(info.HostConfig.CapDrop, ["ALL"]);
  assert.ok(
    info.HostConfig.SecurityOpt.some((value: string) =>
      value.includes("no-new-privileges"),
    ),
  );
  assert.equal(info.HostConfig.Memory, 4 * 1024 ** 3);
  assert.equal(info.HostConfig.PidsLimit, 256);
  assert.ok(
    info.Mounts.every(
      (mount: { Type: string; Destination: string }) =>
        mount.Type !== "bind" && !mount.Destination.includes("docker.sock"),
    ),
  );
  assert.ok(
    info.Config.Env.every(
      (value: string) => !/^(META_|GH_|GITHUB_|MODAL_)/.test(value),
    ),
  );
  if (box.purpose === "dependencies") {
    const absent = await dockerCommand(context, [
      "exec",
      box.sandboxId,
      "test",
      "!",
      "-e",
      "/workspace/src",
    ]);
    assert.equal(
      absent.code,
      0,
      "source absent during network-enabled dependency preparation",
    );
  } else {
    assert.equal(info.HostConfig.ReadonlyRootfs, true);
    assert.equal(info.HostConfig.NetworkMode, "none");
    const mount = info.Mounts.find(
      (mount: { Destination: string }) => mount.Destination === "/workspace",
    );
    assert.equal(mount.Type, "volume");
    assert.ok(
      !volumes.has(mount.Name),
      "each workspace has a fresh private volume",
    );
    volumes.add(mount.Name);
  }
  observed.push({
    purpose: box.purpose,
    id: box.sandboxId,
    network: info.HostConfig.NetworkMode,
    rootfsReadOnly: info.HostConfig.ReadonlyRootfs,
    mounts: info.Mounts.map((mount: { Type: string }) => mount.Type),
  });
};
const cancelled = process.argv.includes("--cancel");
try {
  const operation = withIsolatedCoding(
    {
      repo,
      source,
      policy: cancelled
        ? {
            ...policy,
            testCommands: [{ program: "node", args: ["check.mjs", "--wait"] }],
          }
        : policy,
      runId: "local-proof-" + randomUUID(),
      signal,
      event,
    },
    async (execution) => {
      const baseline = await execution.open("baseline");
      if (cancelled) {
        const pending = baseline.check().then(
          () => null,
          (error) => error,
        );
        let started = false;
        for (let n = 0; n < 50; n++) {
          const result = await dockerCommand(context, [
            "exec",
            baseline.id,
            "test",
            "-f",
            "/tmp/cue-check-started",
          ]);
          if (result.code === 0) {
            started = true;
            break;
          }
          await pause(100);
        }
        assert.ok(started, "actual isolated check started before cancellation");
        controller.abort();
        const error = await pending;
        assert.ok(error instanceof Error);
        throw error;
      }
      const before = await baseline.check();
      assert.equal(before.passed, false);
      assert.match(before.output, /independent synthetic value assertion/);
      await execution.close(baseline);
      const implementation = await execution.open("implementation");
      await implementation.write("src/value.mjs", "export const value = 2;");
      assert.equal((await implementation.check()).passed, true);
      await implementation.write("src/value.mjs", "export const value = 2;");
      assert.equal((await implementation.check()).passed, true);
      await execution.close(implementation);
      const verification = await execution.open(
        "verification",
        new Map([["src/value.mjs", "export const value = 2;"]]),
      );
      const after = await verification.check();
      assert.equal(after.passed, true);
      await execution.close(verification);
      assert.equal(
        (await fs.readFile(path.join(repo, "src/value.mjs"))).toString(),
        "export const value = 1;",
      );
      return after.output;
    },
  );
  if (cancelled) await assert.rejects(operation);
  else console.log(await operation);
  for (const id of ids)
    assert.notEqual(
      (await dockerCommand(context, ["inspect", id])).code,
      0,
      "container removed",
    );
  for (const volume of volumes)
    assert.notEqual(
      (await dockerCommand(context, ["volume", "inspect", volume])).code,
      0,
      "private volume removed",
    );
  for (const image of images)
    assert.notEqual(
      (await dockerCommand(context, ["image", "inspect", image])).code,
      0,
      "transient dependency image removed",
    );
  if (bun)
    assert.ok(cachePlacement, "Bun preparation cache placement was observed");
  console.log(
    JSON.stringify({
      ok: true,
      packageManager: bun ? "bun" : "npm",
      cachePlacement,
      cancelled,
      observed,
      removedContainers: ids.length,
      removedVolumes: volumes.size,
      removedImages: images.size,
    }),
  );
} finally {
  controller.abort();
  await fs.rm(repo, { recursive: true, force: true });
}
