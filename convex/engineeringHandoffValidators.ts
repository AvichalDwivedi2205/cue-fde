import { v, type Infer } from "convex/values";
import { engineeringBinding } from "./workspaceValidators";
const pinned = {
  revision: v.number(),
  appId: v.string(),
  team: v.string(),
  channel: v.string(),
  assignedMember: v.string(),
  routingChannel: v.optional(v.string()),
  reproduction: v.string(),
  reproductionDigest: v.string(),
  issueContext: v.string(),
  policy: engineeringBinding,
  deliveryId: v.id("deliveries"),
};
export const engineeringHandoff = v.union(
  v.object({ ...pinned, kind: v.literal("posting") }),
  v.object({ ...pinned, kind: v.literal("ready"), rootTs: v.string() }),
  v.object({
    ...pinned,
    kind: v.literal("started"),
    rootTs: v.string(),
    runId: v.id("runs"),
  }),
);
export type EngineeringHandoff = Infer<typeof engineeringHandoff>;
export const engineeringSlackContext = v.object({
  revision: v.number(),
  reproductionDigest: v.string(),
  team: v.string(),
  channel: v.string(),
  rootTs: v.string(),
  cardTs: v.string(),
  member: v.string(),
});
export type EngineeringSlackContext = Infer<typeof engineeringSlackContext>;
