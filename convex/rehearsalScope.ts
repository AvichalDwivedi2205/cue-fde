import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  validateRehearsal,
  rehearsalFingerprint,
  type RehearsalRegistration,
} from "../lib/rehearsal-policy";

export async function rehearsalForApp(
  ctx: MutationCtx | QueryCtx,
  appId?: string,
) {
  if (!appId) return null;
  const row = await ctx.db
    .query("serverState")
    .withIndex("by_key", (q) => q.eq("key", `rehearsal:${appId}`))
    .unique();
  if (!row) return null;
  const registration = validateRehearsal(
    JSON.parse(row.value) as RehearsalRegistration,
  );
  if (registration.appId !== appId)
    throw new Error("Rehearsal registration changed");
  return registration;
}

export async function registeredRehearsal(
  ctx: MutationCtx | QueryCtx,
  issue: { appId?: string; fingerprint: string; kind: string },
) {
  if (issue.kind !== "bug" || !issue.fingerprint.includes(":rehearsal:"))
    return null;
  const registration = await rehearsalForApp(ctx, issue.appId);
  return registration &&
    issue.fingerprint ===
      rehearsalFingerprint(registration.appId, registration.key)
    ? registration
    : null;
}
