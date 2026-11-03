import { createHash } from "node:crypto";
import { z } from "zod";
import { api, db, secret } from "./server-store";
import {
  readIntegrations,
  type IntegrationConfig,
  type EmailConfig,
} from "./integration-config";
import { createXSupport } from "./x-support";
import {
  previewUpdateBody,
  type SupportTarget,
} from "../convex/supportDeliveryValidators";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type {
  FunctionReference,
  FunctionReturnType,
  OptionalRestArgs,
} from "convex/server";

type WidgetTarget = Extract<SupportTarget, { kind: "widget_email" }>;
type Readback =
  | {
      kind: "x";
      providerId: string;
      authorId: string;
      postId: string;
      body: string;
    }
  | {
      kind: "widget_email";
      providerId: string;
      sender: string;
      recipient: string;
      body: string;
    };
export type CustomerUpdateProvider = {
  verify(): Promise<void>;
  send(body: string, key: string): Promise<string>;
  readback(providerId: string, body: string): Promise<Readback>;
};
// Both ConvexHttpClient and convex-test implement the current reference protocol.
type Store = {
  query<Query extends FunctionReference<"query">>(
    query: Query,
    ...args: OptionalRestArgs<Query>
  ): Promise<FunctionReturnType<Query>>;
  mutation<Mutation extends FunctionReference<"mutation">>(
    mutation: Mutation,
    ...args: OptionalRestArgs<Mutation>
  ): Promise<FunctionReturnType<Mutation>>;
};
export type CustomerUpdateDependencies = {
  store: Store;
  secret: string;
  config(): Promise<IntegrationConfig>;
  provider?(
    config: IntegrationConfig,
    target: SupportTarget,
  ): CustomerUpdateProvider;
};

const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
function configured(
  config: IntegrationConfig,
  target: SupportTarget,
  appId: string,
  operation: "send" | "reconcile",
) {
  if (target.kind === "x") {
    const x = config.x;
    if (
      !x ||
      (operation === "send" && !x.enabled) ||
      !x.userAccessToken ||
      x.appId !== appId ||
      x.userId !== target.brandUserId ||
      x.username.toLowerCase() !== target.brandUsername.toLowerCase()
    )
      throw new Error(
        "X reply requires this application's configured user-authorized brand",
      );
    return digest({
      appId: x.appId,
      enabled: x.enabled,
      userId: x.userId,
      username: x.username.toLowerCase(),
      userAccessToken: x.userAccessToken,
    });
  }
  const email = config.email;
  if (
    !email ||
    email.appId !== appId ||
    email.from !== target.sender ||
    email.from.toLowerCase() === "onboarding@resend.dev"
  )
    throw new Error(
      "Widget notification requires this application's verified sender",
    );
  return digest({ appId: email.appId, from: email.from, apiKey: email.apiKey });
}

// API contract: https://resend.com/docs/api-reference/domains/list-domains,
// /emails/send-email and /emails/retrieve-email. Keep credentials on this origin.
export function createWidgetEmailSupport(
  config: EmailConfig,
  target: WidgetTarget,
  request: typeof fetch = fetch,
): CustomerUpdateProvider {
  const domains = z.object({
    data: z
      .array(
        z.object({
          name: z.string(),
          status: z.string(),
          capabilities: z.object({ sending: z.string() }),
        }),
      )
      .max(100),
  });
  const sent = z.object({ id: z.string().min(1).max(200) });
  const email = sent.extend({
    from: z.string(),
    to: z.array(z.string()),
    text: z.string(),
    cc: z.array(z.string()).nullish(),
    bcc: z.array(z.string()).nullish(),
    reply_to: z.array(z.string()).nullish(),
  });
  async function call(
    path: string,
    method: "GET" | "POST",
    body?: unknown,
    key?: string,
  ): Promise<unknown> {
    const response = await request(`https://api.resend.com/${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
        ...(key ? { "idempotency-key": key } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new Error(
        `Email ${method === "POST" ? "send outcome requires reconciliation" : "read failed"} (${response.status})`,
      );
    return await response.json();
  }
  return {
    async verify() {
      const domain = config.from.split("@")[1]?.toLowerCase();
      const response = domains.parse(await call("domains?limit=100", "GET"));
      if (
        !response.data.some(
          (value) =>
            value.name.toLowerCase() === domain &&
            value.status === "verified" &&
            value.capabilities.sending === "enabled",
        )
      )
        throw new Error(
          "Configured notification sender domain is not verified for sending",
        );
    },
    async send(body, key) {
      return sent.parse(
        await call(
          "emails",
          "POST",
          {
            from: target.sender,
            to: [target.recipient],
            subject: "Your requested preview is ready",
            text: body,
          },
          key,
        ),
      ).id;
    },
    async readback(providerId, body) {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(providerId))
        throw new Error("Invalid email provider identity");
      const value = email.parse(await call(`emails/${providerId}`, "GET"));
      if (
        value.id !== providerId ||
        value.from !== target.sender ||
        value.to.length !== 1 ||
        value.to[0] !== target.recipient ||
        value.text !== body ||
        (value.cc?.length ?? 0) !== 0 ||
        (value.bcc?.length ?? 0) !== 0 ||
        (value.reply_to?.length ?? 0) !== 0
      )
        throw new Error(
          "Email provider record does not match the exact approved notification",
        );
      return {
        kind: "widget_email",
        providerId,
        sender: value.from,
        recipient: value.to[0],
        body: value.text,
      };
    },
  };
}

function nativeProvider(
  config: IntegrationConfig,
  target: SupportTarget,
  operation: "send" | "reconcile",
): CustomerUpdateProvider {
  if (target.kind === "widget_email") {
    if (!config.email) throw new Error("Email configuration unavailable");
    return createWidgetEmailSupport(config.email, target);
  }
  if (!config.x) throw new Error("X configuration unavailable");
  // Pausing collection blocks sends, but existing outcomes still need read access.
  const x = createXSupport(
    operation === "reconcile" ? { ...config.x, enabled: true } : config.x,
  );
  return {
    verify: () => x.verifyBrand(target),
    send: (body) => x.send(target, body),
    readback: (id, body) => x.readback(id, target, body),
  };
}

// Providers are injectable so acceptance exercises never need tokens or external calls.
export function createCustomerUpdates(deps: CustomerUpdateDependencies) {
  const auth = { secret: deps.secret };
  async function get(id: Id<"deliveries">): Promise<Doc<"deliveries">> {
    return await deps.store.query(api.supportDeliveries.get, { ...auth, id });
  }
  async function provider(
    delivery: Doc<"deliveries">,
    operation: "send" | "reconcile",
  ) {
    if (!delivery.supportIntent)
      throw new Error("Reviewed customer update required");
    const config = await deps.config(),
      review = delivery.supportIntent.review;
    const configDigest = configured(
      config,
      review.target,
      review.appId,
      operation,
    );
    if (operation === "send" && configDigest !== review.configDigest)
      throw new Error(
        "Outbound configuration changed; prepare and approve a fresh update",
      );
    return {
      adapter: deps.provider
        ? deps.provider(config, review.target)
        : nativeProvider(config, review.target, operation),
      configDigest,
      target: review.target,
    };
  }
  return {
    async prepare(args: {
      caseId: Id<"cases">;
      runId: Id<"runs">;
      actor: string;
      body?: string;
    }) {
      const snapshot = await deps.store.query(api.cue.snapshot, auth);
      const conversation = snapshot.cases.find(
        (value) => value._id === args.caseId,
      );
      const run = snapshot.runs.find((value) => value._id === args.runId);
      const config = await deps.config();
      if (!conversation?.appId || !run?.previewDeployment)
        throw new Error("Application preview required");
      let target: SupportTarget;
      if (conversation.channel === "x") {
        if (!config.x || !conversation.sourceKey?.match(/^x:\d{1,30}$/))
          throw new Error("Original native X destination required");
        target = {
          kind: "x",
          postId: conversation.sourceKey.slice(2),
          brandUserId: config.x.userId,
          brandUsername: config.x.username,
        };
      } else {
        const consent = conversation.notificationEmail;
        if (
          conversation.channel !== "chat" ||
          consent?.kind !== "opted_in" ||
          !config.email
        )
          throw new Error("Explicit widget notification consent required");
        target = {
          kind: "widget_email",
          recipient: consent.address,
          sender: config.email.from,
          consentRevision: consent.revision,
        };
      }
      const configDigest = configured(
        config,
        target,
        conversation.appId,
        "send",
      );
      return await deps.store.mutation(api.supportDeliveries.prepare, {
        ...auth,
        caseId: args.caseId,
        runId: args.runId,
        actor: args.actor,
        body: args.body ?? previewUpdateBody(run.previewDeployment.url),
        target,
        configDigest,
      });
    },
    async approve(args: {
      id: Id<"deliveries">;
      reviewHash: string;
      actor: string;
    }) {
      return await deps.store.mutation(api.supportDeliveries.approve, {
        ...auth,
        ...args,
      });
    },
    async send(args: { id: Id<"deliveries">; reviewHash: string }) {
      const delivery = await get(args.id);
      if (
        !delivery.supportIntent ||
        delivery.supportIntent.reviewHash !== args.reviewHash
      )
        throw new Error("Exact approved review required");
      if (delivery.supportIntent.state.kind !== "approved")
        return { sent: false };
      const { adapter, configDigest, target } = await provider(
        delivery,
        "send",
      );
      // Verify the user-context identity/sender before reserving any external write.
      await adapter.verify();
      const claimed = await deps.store.mutation(api.supportDeliveries.claim, {
        ...auth,
        ...args,
        configDigest,
        target,
      });
      if (!claimed) return { sent: false };
      let providerId: string;
      try {
        providerId = await adapter.send(delivery.body, delivery.key);
        // Persist identity before the independent read; read failures never erase it.
        await deps.store.mutation(api.supportDeliveries.accepted, {
          ...auth,
          id: args.id,
          providerId,
        });
      } catch {
        await deps.store.mutation(api.supportDeliveries.unknown, {
          ...auth,
          id: args.id,
          detail:
            "Provider send or receipt persistence failed. Reconcile read-only; never blindly retry.",
        });
        throw new Error(
          "Customer update outcome unknown; read-only reconciliation required before any further action",
        );
      }
      const readback = await adapter.readback(providerId, delivery.body);
      await deps.store.mutation(api.supportDeliveries.verify, {
        ...auth,
        id: args.id,
        readback,
      });
      return { sent: true, providerId };
    },
    async reconcile(args: { id: Id<"deliveries">; providerId?: string }) {
      const delivery = await get(args.id),
        intent = delivery.supportIntent;
      if (
        !intent ||
        intent.state.kind === "prepared" ||
        intent.state.kind === "approved"
      )
        throw new Error("No claimed update to reconcile");
      const storedId =
        intent.state.kind === "accepted" || intent.state.kind === "verified"
          ? intent.state.providerId
          : undefined;
      if (storedId && args.providerId && storedId !== args.providerId)
        throw new Error("Persisted provider identity cannot change");
      const providerId = storedId ?? args.providerId;
      if (!providerId)
        throw new Error(
          "Locate the provider post/message identity for read-only reconciliation; resend remains blocked",
        );
      const { adapter } = await provider(delivery, "reconcile");
      await adapter.verify();
      const readback = await adapter.readback(providerId, delivery.body);
      await deps.store.mutation(api.supportDeliveries.verify, {
        ...auth,
        id: args.id,
        readback,
      });
      return { providerId };
    },
  };
}

function currentUpdates() {
  return createCustomerUpdates({
    store: db(),
    secret: secret(),
    config: readIntegrations,
  });
}
export const prepareCustomerUpdate = (
  args: Parameters<ReturnType<typeof createCustomerUpdates>["prepare"]>[0],
) => currentUpdates().prepare(args);
export const approveCustomerUpdate = (
  args: Parameters<ReturnType<typeof createCustomerUpdates>["approve"]>[0],
) => currentUpdates().approve(args);
export const sendCustomerUpdate = (
  args: Parameters<ReturnType<typeof createCustomerUpdates>["send"]>[0],
) => currentUpdates().send(args);
export const reconcileCustomerUpdate = (
  args: Parameters<ReturnType<typeof createCustomerUpdates>["reconcile"]>[0],
) => currentUpdates().reconcile(args);
