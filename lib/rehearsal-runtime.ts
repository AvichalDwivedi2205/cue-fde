import {
  createServer,
  type Server,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import {
  validateRehearsal,
  type RehearsalRegistration,
} from "./rehearsal-policy";

export type RehearsalConfig = RehearsalRegistration & { baseCommit: string };
type Runtime = {
  config: RehearsalConfig;
  child?: ChildProcess;
  frontend?: Server;
  build: string;
};
const runtimes = new Map<string, Runtime>();
export function rehearsalDirectory(appId: string) {
  if (!/^cue_app_[A-Za-z0-9_-]{3,80}$/.test(appId))
    throw new Error("Invalid rehearsal app");
  return path.join(process.cwd(), ".cue", "rehearsals", appId);
}
export async function readRehearsalConfig(appId: string) {
  const value = JSON.parse(
    await fs.readFile(
      path.join(rehearsalDirectory(appId), "config.json"),
      "utf8",
    ),
  ) as RehearsalConfig;
  validateRehearsal(value);
  if (value.appId !== appId || !/^[a-f0-9]{40}$/.test(value.baseCommit))
    throw new Error("Invalid frozen rehearsal baseline");
  return value;
}
export function sameRehearsal(
  config: RehearsalConfig,
  registered: RehearsalRegistration,
) {
  const fields = [
    "appId",
    "key",
    "frontendOrigin",
    "backendOrigin",
    "cueOrigin",
    "repository",
  ] as const;
  if (fields.some((field) => config[field] !== registered[field]))
    throw new Error("Rehearsal registration does not match local runtime");
}
async function body(req: IncomingMessage, max = 8 * 1024 * 1024) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk);
    size += bytes.length;
    if (size > max) throw new Error("Request too large");
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
async function renderJournal(config: RehearsalConfig) {
  let html = await fs.readFile(
    path.join(process.cwd(), "design/bloom.html"),
    "utf8",
  );
  let adapter = await fs.readFile(
    path.join(process.cwd(), "lib/browser/bloom.js"),
    "utf8",
  );
  adapter = adapter.split("const voiceButton = document.createElement")[0];
  const bridge = `${adapter}\nrestoreHistory = () => {}; renderDemo = () => {}; afterDelivered = () => {};\n`;
  html = html.replace(
    "/* ---------- Boot ---------- */",
    bridge + "\n/* ---------- Boot ---------- */",
  );
  html = html.replace(
    "</head>",
    "<style>#chatFab,#chat,#casePin,#demo{display:none!important}</style></head>",
  );
  const escape = (v: string) =>
    v
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;");
  return html.replace(
    "</body>",
    `<script src="${escape(config.cueOrigin)}/widget.js" data-app="${escape(config.appId)}" data-name="Bloom user"></script></body>`,
  );
}
async function serve(
  runtime: Runtime,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const { config } = runtime,
    dir = rehearsalDirectory(config.appId);
  const json = (status: number, value: unknown) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
    });
    res.end(JSON.stringify(value));
  };
  try {
    if (req.headers.host !== new URL(config.frontendOrigin).host)
      return json(403, { error: "Host rejected" });
    if (req.url === "/health")
      return json(200, {
        app: "Bloom",
        appId: config.appId,
        scenario: config.key,
        build: runtime.build,
        uploadOrigin: config.backendOrigin,
        controlled: true,
      });
    if (req.url === "/" || req.url === "/bloom") {
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      return res.end(await renderJournal(config));
    }
    if (req.url === "/memory-search.js") {
      res.writeHead(200, { "content-type": "application/javascript" });
      return res.end(
        await fs.readFile(path.join(process.cwd(), "public/memory-search.js")),
      );
    }
    // Local synthetic photos and journal records are visitor-scoped and survive reload.
    let visitor = req.headers.cookie?.match(
      /(?:^|;\s*)rehearsal_visitor=([a-f0-9-]{36})(?:;|$)/,
    )?.[1];
    if (!visitor) {
      visitor = randomUUID();
      res.setHeader(
        "set-cookie",
        `rehearsal_visitor=${visitor}; HttpOnly; SameSite=Strict; Path=/`,
      );
    }
    const ownerDir = path.join(dir, "visitors", visitor);
    await fs.mkdir(ownerDir, { recursive: true });
    const file = path.join(ownerDir, "memories.json");
    type Memory = {
      id: string;
      fileId: string;
      title: string;
      caption: string;
      date: string;
      w: number;
      h: number;
      src: string;
      deleted?: boolean;
    };
    const memories: Memory[] = await fs.readFile(file, "utf8").then(
      (v) => JSON.parse(v),
      () => [],
    );
    if (req.url?.startsWith("/photo/") && req.method === "GET") {
      const id = req.url.slice(7);
      if (!/^[a-f0-9-]{36}$/.test(id))
        return json(404, { error: "Photo unavailable" });
      const photo = await fs.readFile(path.join(ownerDir, id));
      res.writeHead(200, {
        "content-type": "image/png",
        "x-content-type-options": "nosniff",
      });
      return res.end(photo);
    }
    if (req.url !== "/api/bloom") return json(404, { error: "Not found" });
    if (req.method === "GET") {
      const health = await (
        await fetch(config.backendOrigin + "/health", {
          signal: AbortSignal.timeout(2000),
        })
      ).json();
      return json(200, {
        memories: memories.filter((m) => !m.deleted),
        conversation: null,
        supportAvailable: true,
        health,
      });
    }
    if (req.method !== "POST" || req.headers.origin !== config.frontendOrigin)
      return json(403, { error: "Origin rejected" });
    const bytes = await body(req);
    if (req.headers["content-type"]?.includes("multipart/form-data")) {
      const form = await new Request(config.frontendOrigin + "/api/bloom", {
        method: "POST",
        headers: { "content-type": req.headers["content-type"] },
        body: new Uint8Array(bytes),
      }).formData();
      const photo = form.get("file");
      if (!(photo instanceof File))
        return json(400, { error: "Choose a photo" });
      const content = Buffer.from(await photo.arrayBuffer());
      const metadata = await sharp(content, {
        limitInputPixels: 40000000,
      }).metadata();
      const mime = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }[
        metadata.format as "png" | "jpeg" | "webp"
      ];
      if (!mime || mime !== photo.type)
        return json(415, { error: "Use a valid JPG, PNG or WebP photo" });
      await sharp(content).raw().toBuffer();
      const uploaded = await fetch(config.backendOrigin + "/upload", {
        method: "POST",
        headers: { "content-type": mime },
        body: new Uint8Array(content),
      });
      if (uploaded.status !== 201)
        return json(uploaded.status, {
          error: "Couldn't upload your photo. Please try again.",
          code: uploaded.status,
        });
      const fileId = randomUUID();
      await fs.writeFile(path.join(ownerDir, fileId), content);
      return json(201, { fileId, w: metadata.width, h: metadata.height });
    }
    const value = JSON.parse(bytes.toString());
    if (value.action === "save") {
      const m = value.memory;
      if (
        !m ||
        typeof m.title !== "string" ||
        !m.title.trim() ||
        m.title.length > 80 ||
        typeof m.caption !== "string" ||
        m.caption.length > 280 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(m.date)
      )
        throw new Error("Invalid memory");
      if (m.id) {
        const existing = memories.find((item) => item.id === m.id);
        if (!existing) throw new Error("Memory unavailable");
        Object.assign(existing, {
          title: m.title,
          caption: m.caption,
          date: m.date,
        });
      } else {
        if (!/^[a-f0-9-]{36}$/.test(m.fileId))
          throw new Error("Upload a photo first");
        await fs.access(path.join(ownerDir, m.fileId));
        memories.push({
          id: randomUUID(),
          fileId: m.fileId,
          title: m.title,
          caption: m.caption,
          date: m.date,
          w: m.w,
          h: m.h,
          src: "/photo/" + m.fileId,
        });
      }
      await fs.writeFile(file, JSON.stringify(memories));
      return json(200, { id: m.id || memories.at(-1)!.id });
    }
    if (value.action === "delete") {
      const m = memories.find((item) => item.id === value.id);
      if (!m) throw new Error("Memory unavailable");
      m.deleted = !value.undo;
      await fs.writeFile(file, JSON.stringify(memories));
      return json(200, { ok: true });
    }
    return json(400, { error: "Use the connected support widget" });
  } catch (e) {
    return json(400, {
      error: e instanceof Error ? e.message : "Request failed",
    });
  }
}
async function startBackend(runtime: Runtime, build: string) {
  const dir = rehearsalDirectory(runtime.config.appId),
    live = path.join(dir, "live");
  const child = spawn(process.execPath, [path.join(live, "server.mjs")], {
    cwd: live,
    env: {
      NODE_ENV: "development",
      PATH: process.env.PATH,
      PORT: new URL(runtime.config.backendOrigin).port,
      BLOOM_BUILD: build,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  runtime.child = child;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Rehearsal upload startup timed out"));
    }, 10000);
    const failed = (error: Error) => {
      clearTimeout(timer);
      reject(error);
    };
    child.once("error", failed);
    child.once("exit", (code) =>
      failed(
        new Error(
          `Rehearsal upload process exited ${code}; dedicated port may be occupied`,
        ),
      ),
    );
    child.stdout!.on("data", (d) => {
      if (String(d).includes("BLOOM_URL=")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  runtime.build = build;
  await fs.writeFile(
    path.join(dir, "runtime.json"),
    JSON.stringify({ build, pid: child.pid }),
    { mode: 0o600 },
  );
}
async function stopBackend(runtime: Runtime) {
  const child = runtime.child;
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 3000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}
export async function ensureRehearsal(appId: string) {
  const config = await readRehearsalConfig(appId),
    dir = rehearsalDirectory(appId);
  let runtime = runtimes.get(appId);
  if (runtime) {
    sameRehearsal(config, runtime.config);
    if (runtime.config.baseCommit !== config.baseCommit)
      throw new Error("Running rehearsal baseline changed");
  }
  if (!runtime) {
    const saved = await fs
      .readFile(path.join(dir, "runtime.json"), "utf8")
      .then(
        (value) => JSON.parse(value),
        () => null,
      );
    runtime = { config, build: saved?.build || config.baseCommit };
    runtimes.set(appId, runtime);
    try {
      await startBackend(runtime, runtime.build);
      runtime.frontend = createServer((req, res) => {
        void serve(runtime!, req, res);
      });
      await new Promise<void>((resolve, reject) => {
        runtime!.frontend!.once("error", reject);
        runtime!.frontend!.listen(
          Number(new URL(config.frontendOrigin).port),
          "127.0.0.1",
          resolve,
        );
      });
    } catch (e) {
      await stopBackend(runtime);
      runtimes.delete(appId);
      throw e;
    }
  }
  return {
    config,
    origin: config.backendOrigin,
    live: path.join(dir, "live"),
    backup: path.join(dir, "backup"),
    releases: path.join(dir, "releases"),
    stop: () => stopBackend(runtime!),
    start: (build: string) => startBackend(runtime!, build),
  };
}
export async function shutdownRehearsals() {
  for (const runtime of runtimes.values()) {
    await stopBackend(runtime);
    await new Promise<void>((resolve) =>
      runtime.frontend ? runtime.frontend.close(() => resolve()) : resolve(),
    );
  }
  runtimes.clear();
}
export async function rehearsalCodeHashes(directory: string, files: string[]) {
  const result: Record<string, string> = {};
  for (const file of files)
    result[file] = createHash("sha256")
      .update(await fs.readFile(path.join(directory, file)))
      .digest("hex");
  return result;
}
