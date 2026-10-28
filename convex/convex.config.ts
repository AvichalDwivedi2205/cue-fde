import { defineApp } from "convex/server";
import { v } from "convex/values";
import workpool from "@convex-dev/workpool/convex.config";
const app = defineApp({
  env: {
    CUE_DEMO_SECRET: v.optional(v.string()),
    CUE_BACKGROUND_ORIGIN: v.optional(v.string()),
  },
});
app.use(workpool, { name: "triagePool" });
export default app;
