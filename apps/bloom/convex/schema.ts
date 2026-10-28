import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
export default defineSchema({
  memories: defineTable({
    owner: v.string(),
    fileId: v.id("_storage"),
    title: v.string(),
    caption: v.string(),
    date: v.string(),
    w: v.number(),
    h: v.number(),
    deleted: v.boolean(),
  }).index("by_owner_and_deleted", ["owner", "deleted"]),
  photoUploads: defineTable({
    owner: v.string(),
    fileId: v.id("_storage"),
    verified: v.boolean(),
    used: v.boolean(),
    expiresAt: v.number(),
    w: v.optional(v.number()),
    h: v.optional(v.number()),
  })
    .index("by_fileId", ["fileId"])
    .index("by_used_and_expiresAt", ["used", "expiresAt"]),
  uploadTickets: defineTable({
    owner: v.string(),
    tokenHash: v.string(),
    expiresAt: v.number(),
    claimed: v.boolean(),
  })
    .index("by_tokenHash", ["tokenHash"])
    .index("by_expiresAt", ["expiresAt"]),
  supportLinks: defineTable({
    owner: v.string(),
    token: v.string(),
    expiresAt: v.number(),
  }).index("by_owner", ["owner"]),
});
