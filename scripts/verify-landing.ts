import assert from "node:assert/strict";
import { parse, type DefaultTreeAdapterTypes } from "parse5";

const origin = process.env.CUE_VERIFY_ORIGIN || "https://cue.latchgrid.in";
const get = (path: string) =>
  fetch(new URL(path, origin), { redirect: "manual" });
const root = await get("/");
assert.equal(
  root.status,
  200,
  "Root must show the public landing, not redirect to sign-in",
);
assert.match(root.headers.get("content-type") || "", /text\/html/);
const html = await root.text();
assert(
  html.includes("Your customers already told you.") &&
    html.includes("Join the waitlist"),
);
console.log("PASS · Anonymous root serves the Cue email waitlist");

function elements(
  node: DefaultTreeAdapterTypes.Node,
): DefaultTreeAdapterTypes.Element[] {
  return [
    ...("tagName" in node ? [node] : []),
    ...("childNodes" in node ? node.childNodes.flatMap(elements) : []),
  ];
}
const nodes = elements(parse(html));
const attr = (node: DefaultTreeAdapterTypes.Element, name: string) =>
  node.attrs.find((a) => a.name === name)?.value;
const links = nodes.filter((n) => n.tagName === "a");
assert.equal(
  links.filter((n) => attr(n, "href")?.startsWith("/cue")).length,
  0,
);
assert(
  nodes.some(
    (n) => n.tagName === "form" && attr(n, "action") === "/api/waitlist",
  ),
);
assert(nodes.some((n) => n.tagName === "input" && attr(n, "type") === "email"));
assert(!nodes.some((n) => attr(n, "id") === "app"));
assert(!html.includes("loadCue") && !html.includes("S.cases"));
const scripts = nodes.filter((n) => n.tagName === "script");
assert.deepEqual(
  scripts.map((n) => attr(n, "src")),
  ["/cue-landing.js", "/cue-waitlist.js"],
);
assert(scripts.every((n) => n.childNodes.length === 0));
for (const asset of [
  "/cue-landing.js",
  "/cue-workspace.css",
  "/cue-waitlist.js",
  "/cue-waitlist.css",
  "/cue-favicon.svg",
])
  assert.equal((await get(asset)).status, 200);
console.log(
  "PASS · Email signup and waitlist assets are present; private app omitted",
);

const workspace = await get("/cue");
assert.equal(workspace.status, 302);
assert.equal(workspace.headers.get("location"), origin + "/auth/login");
for (const path of [
  "/api/demo",
  "/api/agents",
  "/api/growth",
  "/api/integrations",
])
  assert.equal(
    (await get(path)).status,
    401,
    `${path} must remain authenticated`,
  );
console.log("PASS · Workspace and operator APIs remain protected");

const login = await get("/auth/login");
assert.equal(login.status, 307);
const destination = new URL(login.headers.get("location")!);
assert.equal(
  destination.searchParams.get("redirect_uri"),
  origin + "/auth/callback",
);
assert(destination.searchParams.has("code_challenge"));
console.log(
  "PASS · Existing WorkOS login still initiates PKCE with the public callback",
);

const health = await (await get("/api/bloom")).json();
assert.match(health.health.release, /^[a-f0-9]{40}$/);
if (process.env.CUE_VERIFY_RELEASE)
  assert.equal(health.health.release, process.env.CUE_VERIFY_RELEASE);
console.log(`PASS · Public application release ${health.health.release}`);
