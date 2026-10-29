import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { sameOrigin } from "@/lib/access";
import { api, db, secret } from "@/lib/server-store";
import { waitlistSubmission } from "@/lib/waitlist-policy";

export const runtime = "nodejs";
const MAX_BYTES = 2048;
const json = (
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) =>
  NextResponse.json(body, {
    status,
    headers: { "cache-control": "no-store", ...headers },
  });

async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Empty request");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw new RangeError("Request too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

export async function POST(request: Request) {
  try {
    sameOrigin(request);
  } catch {
    return json({ error: "Please join from the Cue website." }, 403);
  }
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
    "application/json"
  )
    return json({ error: "Invalid signup request." }, 415);

  let input: ReturnType<typeof waitlistSubmission.parse>;
  try {
    input = waitlistSubmission.parse(await readBody(request));
  } catch (error) {
    return json(
      {
        error:
          error instanceof RangeError
            ? "Signup request is too large."
            : "Enter a valid email address.",
      },
      error instanceof RangeError ? 413 : 400,
    );
  }
  // The off-screen field catches simple bots without adding friction to signup.
  if (input.website) return json({ ok: true });

  try {
    const auth = secret();
    const address =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      "unknown";
    const clientKey = createHmac("sha256", auth).update(address).digest("hex");
    const result = await db().mutation(api.waitlist.join, {
      secret: auth,
      email: input.email,
      clientKey,
    });
    if (result.status === "rate_limited") {
      const seconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
      return json({ error: `Please try again in ${seconds} seconds.` }, 429, {
        "retry-after": String(seconds),
      });
    }
    return json({ ok: true });
  } catch {
    return json(
      { error: "We couldn't save your email. Please try again." },
      503,
    );
  }
}
