import { z } from "zod";
import type { XConfig } from "./integration-config";
import type { SupportTarget } from "../convex/supportDeliveryValidators";

const id = z.string().regex(/^\d{1,30}$/);
const identity = z.object({
  data: z.object({ id, username: z.string().regex(/^[A-Za-z0-9_]{1,15}$/) }),
});
const created = z.object({ data: z.object({ id }) });
const post = z.object({
  data: z.object({
    id,
    text: z.string(),
    author_id: id,
    referenced_tweets: z.array(z.object({ type: z.string(), id })),
    entities: z
      .object({
        urls: z
          .array(z.object({ url: z.url(), expanded_url: z.url() }))
          .optional(),
      })
      .optional(),
  }),
});
type XTarget = Extract<SupportTarget, { kind: "x" }>;

// Official protocol: https://docs.x.com/x-api/posts/create-post,
// /x-api/users/get-my-user and /x-api/posts/get-post-by-id.
// Supplying an app-only bearer token is deliberately insufficient here.
export function createXSupport(config: XConfig, request: typeof fetch = fetch) {
  if (!config.appId || !config.userAccessToken || !config.enabled)
    throw new Error(
      "Configure user-authorized X reply access for this application first",
    );
  const token = config.userAccessToken;
  async function call(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
  ): Promise<unknown> {
    const response = await request(`https://api.x.com/2/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        `X ${method === "POST" ? "send outcome requires reconciliation" : "read failed"} (${response.status})`,
      );
    return await response.json();
  }
  return {
    async verifyBrand(target: Pick<XTarget, "brandUserId" | "brandUsername">) {
      const account = identity.parse(await call("users/me", "GET")).data;
      if (
        account.id !== config.userId ||
        account.username.toLowerCase() !== config.username.toLowerCase() ||
        account.id !== target.brandUserId ||
        account.username.toLowerCase() !== target.brandUsername.toLowerCase()
      )
        throw new Error(
          "X user-context token does not belong to the configured brand",
        );
    },
    async send(target: XTarget, body: string) {
      if (!/^\d{1,30}$/.test(target.postId) || body.length > 280)
        throw new Error("Invalid native X reply");
      return created.parse(
        await call("tweets", "POST", {
          text: body,
          reply: { in_reply_to_tweet_id: target.postId },
        }),
      ).data.id;
    },
    async readback(providerId: string, target: XTarget, approvedBody: string) {
      if (!/^\d{1,30}$/.test(providerId))
        throw new Error("Invalid X provider post identity");
      const value = post.parse(
        await call(
          `tweets/${providerId}?tweet.fields=author_id,referenced_tweets,entities`,
          "GET",
        ),
      ).data;
      // X substitutes t.co links. Expand only documented entities to recover the
      // exact submitted text; unrelated URL/text differences fail closed.
      let body = value.text;
      for (const entity of value.entities?.urls ?? []) {
        if (approvedBody.includes(entity.expanded_url))
          body = body.replaceAll(entity.url, () => entity.expanded_url);
      }
      const replies = value.referenced_tweets.filter(
        (reference) => reference.type === "replied_to",
      );
      if (
        value.id !== providerId ||
        value.author_id !== target.brandUserId ||
        replies.length !== 1 ||
        replies[0].id !== target.postId ||
        body !== approvedBody
      )
        throw new Error(
          "X readback does not match the approved author, original reply target and exact text",
        );
      return {
        kind: "x" as const,
        providerId,
        authorId: value.author_id,
        postId: replies[0].id,
        body,
      };
    },
  };
}
