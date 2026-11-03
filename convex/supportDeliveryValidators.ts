import { v, type Infer } from "convex/values";
import {
  previewAcceptance,
  previewDeployment,
} from "./previewAcceptanceValidators";

export const notificationEmail = v.union(
  v.object({
    kind: v.literal("opted_in"),
    address: v.string(),
    revision: v.number(),
    consentedAt: v.number(),
  }),
  v.object({
    kind: v.literal("revoked"),
    revision: v.number(),
    revokedAt: v.number(),
  }),
);
export const supportTarget = v.union(
  v.object({
    kind: v.literal("x"),
    postId: v.string(),
    brandUserId: v.string(),
    brandUsername: v.string(),
  }),
  v.object({
    kind: v.literal("widget_email"),
    recipient: v.string(),
    sender: v.string(),
    consentRevision: v.number(),
  }),
);
const approval = { actor: v.string(), approvedAt: v.number() };
const attempt = { ...approval, startedAt: v.number() };
export const supportState = v.union(
  v.object({ kind: v.literal("prepared") }),
  v.object({ kind: v.literal("approved"), ...approval }),
  v.object({ kind: v.literal("sending"), ...attempt }),
  v.object({ kind: v.literal("unknown"), ...attempt, detail: v.string() }),
  v.object({ kind: v.literal("accepted"), ...attempt, providerId: v.string() }),
  v.object({
    kind: v.literal("verified"),
    ...attempt,
    providerId: v.string(),
    verifiedAt: v.number(),
  }),
);
export const supportEvidence = v.object({
  deployment: previewDeployment,
  acceptance: previewAcceptance,
});
export const supportReview = v.object({
  stage: v.literal("preview_ready"),
  appId: v.string(),
  caseId: v.id("cases"),
  issueId: v.id("issues"),
  runId: v.id("runs"),
  evidence: supportEvidence,
  target: supportTarget,
  configDigest: v.string(),
});
export const supportIntent = v.object({
  review: supportReview,
  reviewHash: v.string(),
  state: supportState,
});
export type SupportTarget = Infer<typeof supportTarget>;
export type SupportReview = Infer<typeof supportReview>;
export type SupportIntent = Infer<typeof supportIntent>;

// Stable key ordering keeps the approved bytes independent of object construction order.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
export async function supportReviewHash(
  body: string,
  review: SupportReview,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical({ body, review })),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function previewUpdateBody(url: string): string {
  return `An approved preview passed our browser check. Try it: ${url} Production is unchanged.`;
}
