import { expect, test, vi } from "vitest";
import { createWidgetEmailSupport } from "../lib/customer-updates";
import {
  previewUpdateBody,
  type SupportTarget,
} from "../convex/supportDeliveryValidators";

const config = {
  appId: "app-a",
  from: "support@example.test",
  apiKey: "re_deterministic",
};
const target = {
  kind: "widget_email",
  recipient: "alice@example.test",
  sender: config.from,
  consentRevision: 1,
} satisfies SupportTarget;
const body = previewUpdateBody("https://preview-demo.vercel.app/");
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });

test("widget email verifies domain, sends consent recipient without borrowed thread headers, and reads provider record separately", async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      response({
        data: [
          {
            name: "example.test",
            status: "verified",
            capabilities: { sending: "enabled" },
          },
        ],
      }),
    )
    .mockResolvedValueOnce(response({ id: "mail_900" }))
    .mockResolvedValueOnce(
      response({
        id: "mail_900",
        from: config.from,
        to: [target.recipient],
        text: body,
        last_event: "queued",
        cc: [],
        bcc: [],
        reply_to: [],
      }),
    );
  const email = createWidgetEmailSupport(config, target, request);
  await email.verify();
  expect(await email.send(body, "immutable-review-key")).toBe("mail_900");
  expect(await email.readback("mail_900", body)).toEqual({
    kind: "widget_email",
    providerId: "mail_900",
    sender: config.from,
    recipient: target.recipient,
    body,
  });
  expect(request.mock.calls.map(([url]) => String(url))).toEqual([
    "https://api.resend.com/domains?limit=100",
    "https://api.resend.com/emails",
    "https://api.resend.com/emails/mail_900",
  ]);
  const payload: unknown = JSON.parse(String(request.mock.calls[1][1]?.body));
  expect(payload).toEqual({
    from: config.from,
    to: [target.recipient],
    subject: "Your requested preview is ready",
    text: body,
  });
  expect(request.mock.calls[1][1]?.headers).toMatchObject({
    "idempotency-key": "immutable-review-key",
  });
  for (const [, options] of request.mock.calls)
    expect(options).toMatchObject({ redirect: "error", cache: "no-store" });
});

test("unverified, wrong and sending-disabled domains cannot pass sender verification", async () => {
  for (const value of [
    {
      name: "example.test",
      status: "pending",
      capabilities: { sending: "enabled" },
    },
    {
      name: "other.test",
      status: "verified",
      capabilities: { sending: "enabled" },
    },
    {
      name: "example.test",
      status: "verified",
      capabilities: { sending: "disabled" },
    },
  ]) {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response({ data: [value] }));
    await expect(
      createWidgetEmailSupport(config, target, request).verify(),
    ).rejects.toThrow("not verified");
    expect(request.mock.calls[0][1]?.method).toBe("GET");
    expect(request).toHaveBeenCalledTimes(1);
  }
});

test("extra recipients, changed sender, altered body, borrowed reply destination and provider errors never verify", async () => {
  const valid = {
    id: "mail_900",
    from: config.from,
    to: [target.recipient],
    text: body,
    cc: [],
    bcc: [],
    reply_to: [],
  };
  for (const value of [
    { ...valid, to: [target.recipient, "extra@example.test"] },
    { ...valid, from: "wrong@example.test" },
    { ...valid, text: "Altered" },
    { ...valid, bcc: ["hidden@example.test"] },
    { ...valid, reply_to: ["borrowed@example.test"] },
    { ...valid, id: "mail_901" },
  ]) {
    const request = vi.fn<typeof fetch>().mockResolvedValue(response(value));
    await expect(
      createWidgetEmailSupport(config, target, request).readback(
        "mail_900",
        body,
      ),
    ).rejects.toThrow("does not match");
    expect(request).toHaveBeenCalledTimes(1);
  }
});

test("provider write timeout, HTTP error and malformed acceptance make one attempt and require reconciliation", async () => {
  for (const request of [
    vi.fn<typeof fetch>().mockRejectedValue(new Error("timeout")),
    vi.fn<typeof fetch>().mockResolvedValue(response({}, 500)),
    vi.fn<typeof fetch>().mockResolvedValue(response({})),
  ]) {
    await expect(
      createWidgetEmailSupport(config, target, request).send(
        body,
        "review-key",
      ),
    ).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  }
});
