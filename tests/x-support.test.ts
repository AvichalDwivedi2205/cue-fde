import { expect, test, vi } from "vitest";
import { createXSupport } from "../lib/x-support";
import type { XConfig } from "../lib/integration-config";
import {
  previewUpdateBody,
  type SupportTarget,
} from "../convex/supportDeliveryValidators";

const config: XConfig = {
  appId: "app-a",
  enabled: true,
  userId: "200",
  username: "brand",
  bearerToken: "only-read-bearer",
  userAccessToken: "authorized-user-context-token",
  startedAt: 1,
};
const target = {
  kind: "x",
  postId: "100",
  brandUserId: "200",
  brandUsername: "brand",
} satisfies SupportTarget;
const body = previewUpdateBody("https://preview-demo.vercel.app/");
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

test("X replies require separate user context; verify users/me identity before native reply, then read independently", async () => {
  expect(() =>
    createXSupport({ ...config, userAccessToken: undefined }),
  ).toThrow("user-authorized");
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response({ data: { id: "200", username: "brand" } }))
    .mockResolvedValueOnce(response({ data: { id: "900" } }))
    .mockResolvedValueOnce(
      response({
        data: {
          id: "900",
          text: body,
          author_id: "200",
          referenced_tweets: [{ type: "replied_to", id: "100" }],
        },
      }),
    );
  const x = createXSupport(config, request);
  await x.verifyBrand(target);
  expect(await x.send(target, body)).toBe("900");
  expect(await x.readback("900", target, body)).toEqual({
    kind: "x",
    providerId: "900",
    authorId: "200",
    postId: "100",
    body,
  });
  expect(request.mock.calls.map(([url]) => String(url))).toEqual([
    "https://api.x.com/2/users/me",
    "https://api.x.com/2/tweets",
    "https://api.x.com/2/tweets/900?tweet.fields=author_id,referenced_tweets,entities",
  ]);
  for (const [, options] of request.mock.calls) {
    expect(options?.headers).toMatchObject({
      authorization: "Bearer authorized-user-context-token",
    });
    expect(options?.redirect).toBe("error");
  }
  expect(JSON.parse(String(request.mock.calls[1][1]?.body))).toEqual({
    text: body,
    reply: { in_reply_to_tweet_id: "100" },
  });
});
test("a paused connection permits outcome readback while every send stays blocked", async () => {
  const request = vi.fn<typeof fetch>()
    .mockResolvedValueOnce(response({ data: { id: "200", username: "brand" } }))
    .mockResolvedValueOnce(response({ data: { id: "900", text: body, author_id: "200", referenced_tweets: [{ type: "replied_to", id: "100" }] } }));
  const x = createXSupport({ ...config, enabled: false }, request);
  await x.verifyBrand(target);
  await x.readback("900", target, body);
  await expect(x.send(target, body)).rejects.toThrow("paused");
  expect(request.mock.calls).toHaveLength(2);
  expect(request.mock.calls.every(([, options]) => options?.method === "GET")).toBe(true);
});

test("wrong configured brand and wrong target brand cannot pass identity verification", async () => {
  for (const value of [
    { id: "999", username: "brand" },
    { id: "200", username: "other" },
  ]) {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ data: value }));
    await expect(
      createXSupport(config, request).verifyBrand(target),
    ).rejects.toThrow("configured brand");
    expect(request).toHaveBeenCalledTimes(1);
  }
});

test("readback rejects wrong post identity, author, original target and changed body", async () => {
  const valid = {
    id: "900",
    text: body,
    author_id: "200",
    referenced_tweets: [{ type: "replied_to", id: "100" }],
  };
  for (const changed of [
    { ...valid, id: "901" },
    { ...valid, author_id: "999" },
    { ...valid, text: "Changed" },
    { ...valid, referenced_tweets: [{ type: "quoted", id: "100" }] },
    { ...valid, referenced_tweets: [{ type: "replied_to", id: "999" }] },
  ]) {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ data: changed }));
    await expect(
      createXSupport(config, request).readback("900", target, body),
    ).rejects.toThrow("readback");
    expect(request.mock.calls[0][1]?.method).toBe("GET");
  }
});

test("documented t.co URL entity expands to exact approved text; unapproved expansion fails", async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(async () =>
    response({
      data: {
        id: "900",
        text: body.replace(
          "https://preview-demo.vercel.app/",
          "https://t.co/abc",
        ),
        author_id: "200",
        referenced_tweets: [{ type: "replied_to", id: "100" }],
        entities: {
          urls: [
            {
              url: "https://t.co/abc",
              expanded_url: "https://preview-demo.vercel.app/",
            },
          ],
        },
      },
    }),
  );
  expect(
    (await createXSupport(config, request).readback("900", target, body)).body,
  ).toBe(body);
  await expect(
    createXSupport(config, request).readback("900", target, body + " changed"),
  ).rejects.toThrow("readback");
});

test("redirect, timeout, authorization and invalid JSON never produce a successful X send", async () => {
  for (const result of [
    response({}, 403),
    response({}, 307),
    new Response("invalid JSON"),
  ]) {
    const request = vi.fn<typeof fetch>().mockResolvedValue(result);
    await expect(
      createXSupport(config, request).send(target, body),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  }
  const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout"));
  await expect(
    createXSupport(config, request).send(target, body),
  ).rejects.toThrow("timeout");
  expect(request).toHaveBeenCalledTimes(1);
});
