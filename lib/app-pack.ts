import { api } from "../convex/_generated/api";
import { db, secret } from "./server-store";
import { engineeringInput } from "./app-pack-schema";
import type { EngineeringBinding } from "./app-pack-schema";
import type { CodingConfig, WidgetApp } from "./integration-config";

// Node-side read model for the app-pack aggregate (convex/appPacks.ts owns
// the data). One rule for every surface: ask the pack. The as* helpers keep
// the two legacy shapes (widget sessions, coding policy) byte-compatible so
// lib/widget-session.ts and lib/coding-policy.ts stay untouched.

export type AppContext = {
  appId: string;
  name: string;
  status: "draft" | "active" | "suspended";
  origins: string[];
  aliases?: string[];
  widget?: { answers: boolean; voice: boolean; screenshots: boolean };
  engineering?: EngineeringBinding;
  routing?: { label?: string; engineeringChannel?: string; engineeringMemberId?: string };
  installCheckedAt?: number;
};

// Boundary parse: Convex rows carry looser field types (e.g. test command
// program is a plain string) than the domain type; construct the AppContext
// field by field so the domain narrowing happens here and nowhere else.
function normalize(pack: {
  appId: string;
  name: string;
  status: AppContext["status"];
  origins: string[];
  aliases?: string[];
  widget?: { answers: boolean; voice: boolean; screenshots: boolean };
  engineering?: unknown;
  routing?: { label?: string; engineeringChannel?: string; engineeringMemberId?: string };
  installCheckedAt?: number;
}): AppContext {
  return {
    appId: pack.appId,
    name: pack.name,
    status: pack.status,
    origins: pack.origins,
    aliases: pack.aliases,
    widget: pack.widget,
    engineering: pack.engineering
      ? engineeringInput.parse(pack.engineering)
      : undefined,
    routing: pack.routing,
    installCheckedAt: pack.installCheckedAt,
  };
}

export async function packContext(appId: string): Promise<AppContext | null> {
  const pack = await db().query(api.appPacks.get, {
    secret: secret(),
    appId,
  });
  return pack ? normalize(pack) : null;
}

export async function listPacks(): Promise<AppContext[]> {
  return (await db().query(api.appPacks.list, { secret: secret() })).map((p) =>
    normalize(p),
  );
}

// Sessions and intake are allowed for draft packs (that is how the install
// check delivers its first case) but never for suspended ones.
export async function requireSessionPack(appId: string): Promise<AppContext> {
  const resolved = await resolveAppPack(appId);
  if (!resolved) throw new Error("App origin is not allowed");
  if (resolved.status === "suspended")
    throw new Error("This application is suspended");
  return resolved;
}

// Coding, knowledge publishing, and any other full-loop surface require an
// active pack.
export async function requireActivePack(appId: string): Promise<AppContext> {
  const resolved = await resolveAppPack(appId);
  if (!resolved) throw new Error("Register the application in Setup first");
  if (resolved.status !== "active")
    throw new Error(
      resolved.status === "suspended"
        ? "This application is suspended"
        : "Activate the application in Setup first",
    );
  return resolved;
}

// The legacy "bloom" identifier (channel intake, coding bindings predating
// packs) resolves to the pack that serves the Bloom public origin — the same
// detection the knowledge page and agent workspace already use.
export async function resolveAppPack(
  appId?: string,
): Promise<AppContext | null> {
  if (appId && appId !== "bloom") return await packContext(appId);
  const bloomOrigin =
    process.env.CUE_BLOOM_PUBLIC_URL || "https://bloom-with-cue.vercel.app";
  const packs = await listPacks();
  return packs.find((p) => p.origins.includes(bloomOrigin)) ?? null;
}

export function asWidgetApp(pack: AppContext): WidgetApp {
  return {
    id: pack.appId,
    name: pack.name,
    createdAt: 0,
    origins: pack.origins,
    widget: pack.widget,
  };
}

export function asCodingConfig(pack: AppContext): CodingConfig {
  if (!pack.engineering) throw new Error("App has no repository binding");
  return { appId: pack.appId, ...pack.engineering };
}

// App reference for team surfaces (Slack cards, digests, inbox labels).
export type AppRef = { appId: string; name: string };

export function asAppRef(pack: AppContext): AppRef {
  return {
    appId: pack.appId,
    name: pack.routing?.label || pack.name,
  };
}
