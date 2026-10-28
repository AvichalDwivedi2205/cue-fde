import { defineApp } from "convex/server";
import { v } from "convex/values";
export default defineApp({
  env: {
    BLOOM_SERVER_SECRET: v.optional(v.string()),
    BLOOM_ALLOWED_ORIGINS: v.optional(v.string()),
  },
});
