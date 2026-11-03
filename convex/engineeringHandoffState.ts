import { ConvexError } from "convex/values";
import type { EngineeringSlackContext } from "./engineeringHandoffValidators";
export {
  engineeringHandoff,
  engineeringSlackContext,
} from "./engineeringHandoffValidators";
export type {
  EngineeringHandoff,
  EngineeringSlackContext,
} from "./engineeringHandoffValidators";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { packByAppId } from "./appPacks";
import { engineeringInput } from "../lib/app-pack-schema";

export function issueContext(
  issue: Pick<Doc<"issues">, "title" | "description" | "appId">,
) {
  return JSON.stringify([issue.appId, issue.title, issue.description]);
}
export async function currentHandoff(ctx: MutationCtx, issue: Doc<"issues">) {
  const h = issue.engineeringHandoff;
  if (!h) throw new ConvexError("Engineering handoff missing");
  const pack = await packByAppId(ctx, h.appId);
  if (
    !pack ||
    pack.status !== "active" ||
    !pack.engineering ||
    issue.appId !== h.appId ||
    issueContext(issue) !== h.issueContext ||
    pack.routing?.engineeringMemberId !== h.assignedMember ||
    pack.routing?.engineeringChannel !== h.routingChannel ||
    JSON.stringify(engineeringInput.parse(pack.engineering)) !==
      JSON.stringify(engineeringInput.parse(h.policy))
  )
    throw new ConvexError(
      "Engineering handoff context or repository policy changed",
    );
  return h;
}
export async function verifyHandoff(
  ctx: MutationCtx,
  issue: Doc<"issues">,
  slack: EngineeringSlackContext,
) {
  const h = await currentHandoff(ctx, issue);
  if (
    h.kind === "posting" ||
    h.revision !== slack.revision ||
    h.reproductionDigest !== slack.reproductionDigest ||
    h.team !== slack.team ||
    h.channel !== slack.channel ||
    h.rootTs !== slack.rootTs ||
    h.assignedMember !== slack.member
  )
    throw new ConvexError(
      "Engineering handoff changed or operator not assigned",
    );
  return h;
}
