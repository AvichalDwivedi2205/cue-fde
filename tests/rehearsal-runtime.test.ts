import { createServer } from "node:net";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { Script } from "node:vm";
import { afterEach, expect, test } from "vitest";
import { photo } from "../demo/bloom/fixture.mjs";
import {
  ensureRehearsal,
  rehearsalDirectory,
  sameRehearsal,
  shutdownRehearsals,
  type RehearsalConfig,
} from "../lib/rehearsal-runtime";
import { validateRehearsal } from "../lib/rehearsal-policy";
const directories: string[] = [];
afterEach(async () => {
  await shutdownRehearsals();
  for (const dir of directories.splice(0))
    await fs.rm(dir, { recursive: true, force: true });
});
async function port() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test port");
  const value = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return value;
}
test("runtime binding rejects public/legacy ports, traversal and metadata substitutions", () => {
  const config: RehearsalConfig = {
    appId: "cue_app_test_binding",
    key: "test-binding",
    frontendOrigin: "http://127.0.0.1:4402",
    backendOrigin: "http://127.0.0.1:4320",
    cueOrigin: "https://cue.test",
    baseCommit: "a".repeat(40),
  };
  expect(() => rehearsalDirectory("../../bloom-live")).toThrow();
  expect(() =>
    validateRehearsal({ ...config, backendOrigin: "http://127.0.0.1:4318" }),
  ).toThrow();
  expect(() =>
    validateRehearsal({
      ...config,
      frontendOrigin: "https://bloom-with-cue.vercel.app",
    }),
  ).toThrow();
  expect(() => sameRehearsal(config, { ...config, key: "different" })).toThrow(
    "registration",
  );
  expect(() =>
    sameRehearsal(config, {
      ...config,
      backendOrigin: "http://127.0.0.1:4321",
    }),
  ).toThrow("registration");
});
test("normal journal uploads use the protected isolated service and exact release; other visitors and public Bloom stay separate", async () => {
  const config: RehearsalConfig = {
    appId: "cue_app_test_" + randomBytes(8).toString("hex"),
    key: "isolated-test",
    frontendOrigin: `http://127.0.0.1:${await port()}`,
    backendOrigin: `http://127.0.0.1:${await port()}`,
    cueOrigin: "https://cue.example.test",
    baseCommit: "a".repeat(40),
  };
  const dir = rehearsalDirectory(config.appId);
  directories.push(dir);
  await fs.mkdir(dir, { recursive: true });
  await fs.cp("demo/bloom", path.join(dir, "live"), { recursive: true });
  await fs.writeFile(path.join(dir, "config.json"), JSON.stringify(config));
  const publicSource = await fs.readFile("lib/bloom-upload.ts", "utf8");
  const target = await ensureRehearsal(config.appId);
  const page = await (await fetch(config.frontendOrigin)).text();
  expect(page).toContain(`data-app="${config.appId}"`);
  expect(page).toContain(`${config.cueOrigin}/widget.js`);
  expect(page.includes("5 MB")).toBe(true);
  for (const script of page.matchAll(/<script>([\s\S]*?)<\/script>/g))
    expect(() => new Script(script[1])).not.toThrow();
  async function upload(size: number, cookie?: string) {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(photo(size))], { type: "image/png" }),
      "owned-synthetic-photo.png",
    );
    return fetch(config.frontendOrigin + "/api/bloom", {
      method: "POST",
      headers: { origin: config.frontendOrigin, ...(cookie ? { cookie } : {}) },
      body: form,
    });
  }
  expect((await upload(3 * 1024 * 1024)).status).toBe(413);
  expect((await upload(1024 * 1024)).status).toBe(201);
  await target.stop();
  // Test-only candidate emulates a release. It is not a Codex run or live proof.
  await fs.writeFile(
    path.join(target.live, "limits.mjs"),
    "export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;\n",
  );
  const release = "b".repeat(40);
  await target.start(release);
  const health = await (await fetch(config.frontendOrigin + "/health")).json();
  expect(health).toMatchObject({
    appId: config.appId,
    build: release,
    controlled: true,
    uploadOrigin: config.backendOrigin,
  });
  const uploaded = await upload(3 * 1024 * 1024);
  expect(uploaded.status).toBe(201);
  const cookie = uploaded.headers.get("set-cookie")!.split(";")[0];
  const image = await uploaded.json();
  const saved = await fetch(config.frontendOrigin + "/api/bloom", {
    method: "POST",
    headers: {
      origin: config.frontendOrigin,
      cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      action: "save",
      memory: {
        ...image,
        title: "Owned synthetic memory",
        caption: "Test-only sample",
        date: "2026-10-12",
      },
    }),
  });
  expect(saved.status).toBe(200);
  const own = await (
    await fetch(config.frontendOrigin + "/api/bloom", { headers: { cookie } })
  ).json();
  expect(own.memories).toHaveLength(1);
  expect(own.memories[0].title).toBe("Owned synthetic memory");
  const other = await (
    await fetch(config.frontendOrigin + "/api/bloom")
  ).json();
  expect(other.memories).toEqual([]);
  expect(
    (await fetch(config.frontendOrigin + own.memories[0].src)).status,
  ).toBe(400);
  expect((await upload(5 * 1024 * 1024, cookie)).status).toBe(201);
  expect((await upload(5 * 1024 * 1024 + 1, cookie)).status).toBe(413);
  expect((await upload(6 * 1024 * 1024, cookie)).status).toBe(413);
  expect(
    (
      await fetch(config.frontendOrigin + "/api/bloom", {
        method: "POST",
        headers: {
          origin: "https://unregistered.test",
          "content-type": "application/json",
        },
        body: JSON.stringify({ action: "save" }),
      })
    ).status,
  ).toBe(403);
  expect(await fs.readFile("lib/bloom-upload.ts", "utf8")).toBe(publicSource);
}, 30000);
