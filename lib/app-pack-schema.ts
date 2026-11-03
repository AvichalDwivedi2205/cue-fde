import { z } from "zod";

// Pure validation schemas for registered apps ("app packs"). Imported by both
// the gateway (lib/integration-config.ts, app routes) and Convex mutations
// (convex/appPacks.ts), so operator input and server-trust writes share one
// set of rules. No Node-only imports allowed in this module.

const originSchema = z
  .string()
  .url()
  .transform((value, ctx) => {
    const url = new URL(value);
    if (
      url.pathname !== "/" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ))
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Use an HTTPS origin, or HTTP localhost, without a path",
      });
      return z.NEVER;
    }
    return url.origin;
  });

export { originSchema };

export const appInput = z.object({
  name: z.string().trim().min(1).max(60),
  origins: z.array(originSchema).min(1).max(20),
});

export const widgetOptionsInput = z
  .object({
    answers: z.boolean(),
    voice: z.boolean(),
    screenshots: z.boolean(),
  })
  .strict();

export const packageDirectoryInput = z
  .string()
  .min(1)
  .max(200)
  .refine(
    (value) =>
      value === "." ||
      (!value.startsWith("/") &&
        !value.includes("\\") &&
        value
          .split("/")
          .every(
            (part) =>
              !!part &&
              part !== ".." &&
              !part.startsWith(".") &&
              !/[\u0000-\u001f\u007f]/.test(part),
          )),
    "Use a safe repository-relative package directory",
  );

export const engineeringInput = z.object({
  packageDirectory: packageDirectoryInput.optional(),
  packageManager: z.enum(["npm", "bun", "none"]).optional(),
  repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
  baseBranch: z
    .string()
    .regex(/^[\w./-]+$/)
    .refine((v) => !v.includes("..") && !v.startsWith("-")),
  allowedPaths: z
    .array(
      z
        .string()
        .min(1)
        .max(200)
        .refine(
          (p) =>
            !p.startsWith("/") &&
            !p.includes("..") &&
            !p.includes("\\") &&
            !p.startsWith(".") &&
            !p.includes("node_modules"),
        ),
    )
    .min(1)
    .max(30),
  testCommands: z
    .array(
      z.object({
        program: z.enum(["node", "npm"]),
        args: z.array(z.string().min(1).max(200)).min(1).max(10),
      }),
    )
    .min(1)
    .max(6),
});

// Byte-compatible with the historical vault schema: same fields, same rules,
// same validation errors. codingInput = engineering binding + the app it is
// bound to (vault entries carry appId; packs carry it as their identity).
export const codingInput = engineeringInput.extend({
  appId: z.string().min(1).max(100),
});

export type EngineeringBinding = z.infer<typeof engineeringInput>;
