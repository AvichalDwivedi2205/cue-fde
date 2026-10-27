import { defineApp } from "convex/server";
import { v } from "convex/values";
export default defineApp({ env: { CUE_DEMO_SECRET: v.optional(v.string()) } });
