"use client";
import { useEffect, useState, type FormEvent } from "react";
import { TeamEditor } from "../settings/team-editor";
import { EmptyState, Button, Icon } from "../components/ui";
import { AppConfiguration } from "./app-configuration";
import "./setup.css";
import type { TeamMember } from "@/lib/roles";
export type App = {
  id: string;
  name: string;
  origins: string[];
  widget?: { answers: boolean; voice: boolean; screenshots: boolean };
};
type Status = {
  x: {
    configured: boolean;
    enabled: boolean;
    username?: string;
    userId?: string;
    connected: boolean;
    detail: string;
    imported: number;
    lastPollAt: number | null;
  };
  apps: App[];
  ownerEmail?: string;
  coding: Array<{
    appId: string;
    repository: string;
    baseBranch: string;
    allowedPaths: string[];
    testCommands: Array<{ program: string; args: string[] }>;
  }>;
  slack: {
    configured: boolean;
    connected?: boolean;
    deliveryMode?: "socket" | "webhook";
    detail?: string;
    workspace?: string;
    teamId?: string;
    supportChannel?: string;
    engineeringChannel?: string;
    operatorIds?: string[];
    members?: TeamMember[];
  };
  email: {
    configured: boolean;
    from?: string;
    replyTo?: string;
    inbound?: boolean;
    notificationImport?: boolean;
    pollReceiving?: boolean;
    receivingAddress?: string;
    supportReceivingAddress?: string;
    notifications?: {
      connected: boolean;
      detail: string;
      imported: number;
      needsReview: number;
      lastPollAt: number | null;
    };
  };
};
export function SetupClient({
  origin,
  initialSection = "applications",
  embedded = false,
}: {
  origin: string;
  initialSection?: string;
  embedded?: boolean;
}) {
  const [active, setActive] = useState(initialSection);
  useEffect(() => {
    const sync = () => setActive(location.hash.slice(1) || initialSection);
    queueMicrotask(sync);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [initialSection]);
  const [status, setStatus] = useState<Status>(),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [codex, setCodex] = useState<{
      ok: boolean;
      loggedIn: boolean;
      workerOnline: boolean;
      github: boolean;
      repo: string | null;
    }>();
  useEffect(() => {
    void fetch("/api/integrations", { cache: "no-store" })
      .then(async (r) => {
        const b = await r.json();
        if (r.ok) setStatus(b);
        else setMessage(b.error);
      })
      .catch(() => setMessage("Could not load connections. Refresh to retry."));
  }, []);
  async function load() {
    const r = await fetch("/api/integrations", { cache: "no-store" });
    const b = await r.json();
    if (r.ok) setStatus(b);
    else setMessage(b.error);
  }
  async function send(data: object) {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/integrations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setMessage(
        b.message ||
          (b.connected === false
            ? "Credentials work; waiting for channel delivery to be verified."
            : b.ok === false
              ? "Credentials saved. Complete the remaining provider setup."
              : "Saved and verified."),
      );
      await load();
      return b;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function form(e: FormEvent<HTMLFormElement>, action: string) {
    e.preventDefault();
    const target = e.currentTarget,
      values = Object.fromEntries(new FormData(target));
    const data =
      action === "app"
        ? {
            action,
            name: values.name,
            origins: String(values.origins).split(/\s+/).filter(Boolean),
          }
        : action === "slack"
          ? {
              action,
              ...values,
              operatorIds: String(values.operatorIds)
                .split(/[\s,]+/)
                .filter(Boolean),
            }
          : action === "x"
            ? { action, ...values, enabled: values.enabled === "on" }
            : {
                action,
                ...values,
                notificationImport: values.notificationImport === "on",
                pollReceiving: values.pollReceiving === "on",
              };
    if (await send(data))
      for (const input of target.querySelectorAll<HTMLInputElement>(
        'input[type="password"]',
      ))
        input.value = "";
  }
  return (
    <main className={`setup ${embedded ? "" : "ui-page"}`}>
      {!embedded && <h1>App setup</h1>}
      {!embedded && (
        <p className="lede">
          Install Cue in your app. Bring support conversations and engineering
          work into one workspace.
        </p>
      )}
      <div className={embedded ? "" : "setup-layout"}>
        {!embedded && (
          <nav className="setup-sections" aria-label="Setup sections">
            {[
              ["applications", "Applications", "panel"],
              ["domains", "Allowed domains", "globe"],
              ["widget", "In-app widget", "widget"],
              ["coding", "Repositories", "github"],
              ["email", "Email", "mail"],
              ["slack", "Slack", "slack"],
              ["x", "X", "xlogo"],
              ["reddit", "Reddit", "reddit"],
              ["team", "Team access", "users"],
              ["codex", "Coding worker", "bot"],
            ].map(([key, label, icon]) => (
              <a
                key={key}
                href={`#${key}`}
                className={active === key ? "active" : ""}
              >
                <Icon name={icon} size={14} />
                {label}
              </a>
            ))}
          </nav>
        )}
        <div className="setup-body">
          <div className="setup-notice" role="status">
            {message ||
              "Credentials stay on the server. Connection checks show what is working."}
          </div>
          {status ? (
            <>
              {["applications", "domains", "widget"].includes(active) && (
                <AppConfiguration
                  apps={status?.apps || []}
                  section={active}
                  origin={origin}
                  busy={busy}
                  send={send}
                  register={(e) => void form(e, "app")}
                />
              )}
              <section id="reddit" hidden={active !== "reddit"}>
                <div className="section-heading">
                  <h2>Reddit</h2>
                  <span className="badge">Assisted capture</span>
                </div>
                <p>
                  Reddit notifications are imported through the configured email
                  inbox. General Reddit search is unavailable until API access
                  is approved.
                </p>
                <a className="ui-button" href="#email">
                  Configure notification email
                </a>
                <a className="ui-button" href="/cue#/integrations">
                  Capture a Reddit post
                </a>
              </section>
              <section id="x" hidden={active !== "x"}>
                <div className="section-heading">
                  <h2>X</h2>
                  <span className="badge">
                    {status?.x.connected
                      ? "API polling active"
                      : status?.x.configured
                        ? "Configured"
                        : "Setup needed"}
                  </span>
                </div>
                <p>
                  Collect public posts that tag your brand through the official
                  X API. Cue checks free credits before each poll and pauses
                  below a $1 reserve. API replies remain reviewable drafts.
                </p>
                <p>
                  {status?.x.detail}{" "}
                  {status?.x.configured &&
                    `${status.x.imported} posts collected.`}
                </p>
                <div className="links">
                  <a
                    href="https://console.x.com"
                    target="_blank"
                    rel="noreferrer"
                  >
                    X developer console ↗
                  </a>
                  <a
                    href="https://docs.x.com/x-api/getting-started/free-credits"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Free-credit eligibility ↗
                  </a>
                </div>
                <form
                  key={status?.x.userId || "x"}
                  onSubmit={(e) => void form(e, "x")}
                >
                  <div className="fields">
                    <label>
                      Brand handle
                      <input
                        name="username"
                        required
                        pattern="[A-Za-z0-9_]{1,15}"
                        placeholder="bloomwithcue"
                        defaultValue={status?.x.username}
                      />
                    </label>
                    <label>
                      Brand user ID
                      <input
                        name="userId"
                        required
                        pattern="[0-9]{1,30}"
                        placeholder="Numeric X user ID"
                        defaultValue={status?.x.userId}
                      />
                    </label>
                    <label>
                      App bearer token
                      <input
                        name="bearerToken"
                        type="password"
                        autoComplete="off"
                        required={!status?.x.configured}
                        placeholder={
                          status?.x.configured
                            ? "Leave empty to keep current token"
                            : "From your own X developer app"
                        }
                      />
                    </label>
                  </div>
                  <label className="check">
                    <input
                      name="enabled"
                      type="checkbox"
                      defaultChecked={status?.x.enabled}
                    />
                    Enable automatic collection using available free credits
                  </label>
                  <button disabled={busy}>Save X connection</button>
                </form>
                <p className="small">
                  Your developer account must already have free credits.
                  Availability varies; adding a payment method does not
                  guarantee eligibility. Cue never buys credits or configures
                  auto-recharge. Keep auto-recharge disabled in X. Cue’s
                  collector must be online; hosted installations use a server
                  schedule. Only mentions after activation are imported. Email
                  notifications remain available as a best-effort fallback.
                </p>
              </section>
              <section id="slack" hidden={active !== "slack"}>
                <div className="section-heading">
                  <h2>Slack</h2>
                  <span className="badge">
                    {status?.slack.connected
                      ? "Connected"
                      : status?.slack.configured
                        ? "Configured"
                        : "Setup needed"}
                  </span>
                </div>
                <p>
                  {status?.slack.deliveryMode === "webhook"
                    ? "Messages and approval buttons are delivered directly to the hosted Cue app over HTTPS."
                    : "Socket Mode connects Slack to your local worker. Hosted installations can receive signed events over HTTPS."}
                </p>
                {status?.slack.detail && <p>{status.slack.detail}</p>}
                <div className="links">
                  <a
                    href="https://api.slack.com/apps"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Create Slack app ↗
                  </a>
                  <a href="/slack-manifest.json" download>
                    Download app manifest
                  </a>
                  <a href="/connections">WorkOS account connections ↗</a>
                </div>
                <ol>
                  <li>
                    Create an app from the manifest in your workspace and
                    install it.
                  </li>
                  <li>
                    Copy the bot token and invite Cue to support and engineering
                    channels. For Socket Mode, generate an app-level token with
                    connections:write.
                  </li>
                  <li>
                    Enter credentials and channel IDs below. Cue only accepts
                    reports and approvals from the configured workspace and
                    channels.
                  </li>
                  <li>
                    For hosted HTTPS delivery, save the signing secret, disable
                    Socket Mode in Slack, and set both Event Subscriptions and
                    Interactivity to
                    <code>{origin}/api/webhooks/slack</code>. Keep bot
                    subscriptions for app_mention and message.channels.
                  </li>
                </ol>
                <form
                  key={status?.slack.teamId || "slack"}
                  onSubmit={(e) => void form(e, "slack")}
                >
                  <div className="fields">
                    <label>
                      Event delivery
                      <select
                        name="deliveryMode"
                        defaultValue={status?.slack.deliveryMode || "socket"}
                      >
                        <option value="socket">
                          Local worker · Socket Mode
                        </option>
                        <option value="webhook">
                          Hosted app · signed HTTPS
                        </option>
                      </select>
                    </label>
                    <label>
                      Bot token
                      <input
                        name="botToken"
                        type="password"
                        autoComplete="off"
                        placeholder={
                          status?.slack.configured
                            ? "Saved · leave blank to keep"
                            : "xoxb-…"
                        }
                        required={!status?.slack.configured}
                      />
                    </label>
                    <label>
                      App-level token
                      <input
                        name="appToken"
                        type="password"
                        autoComplete="off"
                        placeholder="xapp-…"
                      />
                    </label>
                    <label>
                      Workspace ID
                      <input
                        name="teamId"
                        required
                        placeholder="T…"
                        defaultValue={status?.slack.teamId}
                      />
                    </label>
                    <label>
                      Support channel ID
                      <input
                        name="supportChannel"
                        required
                        placeholder="C…"
                        defaultValue={status?.slack.supportChannel}
                      />
                    </label>
                    <label>
                      Engineering channel ID
                      <input
                        name="engineeringChannel"
                        required
                        placeholder="C…"
                        defaultValue={status?.slack.engineeringChannel}
                      />
                    </label>
                    <label>
                      Allowed operator user IDs
                      <input
                        name="operatorIds"
                        required
                        placeholder="U…"
                        defaultValue={status?.slack.operatorIds?.join(", ")}
                      />
                    </label>
                    <label>
                      Signing secret (HTTP mode only)
                      <input
                        name="signingSecret"
                        type="password"
                        autoComplete="off"
                        placeholder="Optional with Socket Mode"
                      />
                    </label>
                  </div>
                  <button disabled={busy}>Save and verify Slack</button>{" "}
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || !status?.slack.configured}
                    onClick={() =>
                      void send({ action: "check", target: "slack" })
                    }
                  >
                    Check connection
                  </button>
                </form>
              </section>
              <section id="team" hidden={active !== "team"}>
                <TeamEditor
                  members={status?.slack.members || []}
                  ownerEmail={status?.ownerEmail}
                  canManage={true}
                  connected={!!status?.slack.configured}
                  onSaved={load}
                />
              </section>
              <section id="coding" hidden={active !== "coding"}>
                <div className="section-heading">
                  <h2>App repositories</h2>
                  <span className="badge">Codex implementation</span>
                </div>
                <p>
                  Connect a repository and fixed validation commands. Product
                  approves specifications; Codex prepares scoped, tested PRs;
                  Engineering reviews the exact commit. Your repository’s
                  release process controls deployment.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    try {
                      void send({
                        action: "coding",
                        appId: data.get("appId"),
                        repository: data.get("repository"),
                        baseBranch: data.get("baseBranch"),
                        allowedPaths: String(data.get("allowedPaths"))
                          .split(/\s+/)
                          .filter(Boolean),
                        testCommands: JSON.parse(
                          String(data.get("testCommands")),
                        ),
                      });
                    } catch {
                      setMessage(
                        "Validation commands must be a JSON array of program and args objects.",
                      );
                    }
                  }}
                >
                  <label>
                    App
                    <select name="appId">
                      <option value="bloom">Bloom</option>
                      {status?.apps.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    GitHub repository
                    <input
                      name="repository"
                      required
                      placeholder="owner/repository"
                    />
                  </label>
                  <label>
                    Base branch
                    <input name="baseBranch" required defaultValue="main" />
                  </label>
                  <label>
                    Allowed changed files or directories
                    <textarea
                      name="allowedPaths"
                      required
                      placeholder="src/ tests/new-feature.test.ts"
                    />
                  </label>
                  <label>
                    Fixed validation commands
                    <textarea
                      name="testCommands"
                      required
                      defaultValue={
                        '[{"program":"npm","args":["run","typecheck"]},{"program":"npm","args":["run","test:backend"]}]'
                      }
                    />
                  </label>
                  <button disabled={busy}>Save repository policy</button>
                </form>
                {status?.coding?.map((c) => (
                  <div className="install" key={c.appId}>
                    <h3>{c.repository}</h3>
                    <p>
                      {c.appId === "bloom"
                        ? "Bloom"
                        : status.apps.find((a) => a.id === c.appId)?.name}{" "}
                      · {c.baseBranch}
                    </p>
                    <p>Allowed changes: {c.allowedPaths.join(", ")}</p>
                    <pre>{JSON.stringify(c.testCommands, null, 2)}</pre>
                  </div>
                ))}
              </section>
              <section id="email" hidden={active !== "email"}>
                <div className="section-heading">
                  <h2>Email</h2>
                  <span className="badge">
                    {status?.email.configured ? "Configured" : "Setup needed"}
                  </span>
                </div>
                <p>
                  Send support replies from your verified address through
                  Resend. Collect X and Reddit notification emails locally, or
                  receive support emails through a signed webhook.
                </p>
                <div className="links">
                  <a
                    href="https://resend.com/domains"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Verify sender domain ↗
                  </a>
                  <a
                    href="https://resend.com/api-keys"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get API key ↗
                  </a>
                  <a
                    href="https://resend.com/emails"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Get receiving address ↗
                  </a>
                </div>
                <form
                  key={status?.email.from || "email"}
                  onSubmit={(e) => void form(e, "email")}
                >
                  <div className="fields">
                    <label>
                      Resend API key
                      <input
                        name="apiKey"
                        type="password"
                        autoComplete="off"
                        placeholder={
                          status?.email.configured
                            ? "Saved · leave blank to keep"
                            : "re_…"
                        }
                        required={!status?.email.configured}
                      />
                    </label>
                    <label>
                      From address
                      <input
                        name="from"
                        type="email"
                        defaultValue={
                          status?.email.from || "avichal@latchgrid.in"
                        }
                        required
                      />
                    </label>
                    <label>
                      Reply-to receiving address
                      <input
                        name="replyTo"
                        type="email"
                        defaultValue={status?.email.replyTo}
                        placeholder="Your Resend receiving address"
                      />
                    </label>
                    <label>
                      Webhook signing secret
                      <input
                        name="webhookSecret"
                        type="password"
                        autoComplete="off"
                        placeholder="whsec_…"
                      />
                    </label>
                    <label>
                      <span>Support receiving address</span>
                      <input
                        name="supportReceivingAddress"
                        type="email"
                        defaultValue={status?.email.supportReceivingAddress}
                        placeholder="support@your-id.resend.app"
                      />
                    </label>
                    <label className="checkbox-field">
                      <input
                        name="notificationImport"
                        type="checkbox"
                        defaultChecked={
                          status?.email.notificationImport || false
                        }
                      />
                      Import X and Reddit mention notification emails
                    </label>
                    <label>
                      Dedicated notification receiving address
                      <input
                        name="receivingAddress"
                        type="email"
                        defaultValue={status?.email.receivingAddress}
                        placeholder="mentions@your-id.resend.app"
                      />
                    </label>
                    <label className="checkbox-field">
                      <input
                        name="pollReceiving"
                        type="checkbox"
                        defaultChecked={status?.email.pollReceiving || false}
                      />
                      Poll configured inboxes locally every 30 seconds
                    </label>
                  </div>
                  <button disabled={busy}>Save and verify email</button>{" "}
                  <button
                    type="button"
                    className="secondary"
                    disabled={busy || !status?.email.configured}
                    onClick={() => void send({ action: "email-test" })}
                  >
                    Send test to my operator inbox
                  </button>
                  {status?.email.pollReceiving && (
                    <button
                      type="button"
                      className="secondary"
                      disabled={busy}
                      onClick={() => void load()}
                    >
                      Refresh polling status
                    </button>
                  )}
                </form>
                {status?.email.pollReceiving && (
                  <p role="status" className="small">
                    {status.email.notifications?.connected
                      ? "Inbox connected. "
                      : "Inbox not connected. "}
                    {status.email.notifications?.detail}
                    {status.email.notifications?.lastPollAt &&
                      ` Last successful poll: ${new Date(status.email.notifications.lastPollAt).toLocaleTimeString()}.`}
                    {` New reports imported: ${status.email.notifications?.imported || 0}. Notifications needing review in Resend: ${status.email.notifications?.needsReview || 0}.`}
                  </p>
                )}
                <p className="small">
                  Local polling needs an API key and dedicated Resend receiving
                  address; no public URL or custom domain is needed for intake.
                  It imports emails received after polling is enabled. Sender
                  verification is still required for branded outbound replies.
                  The provider&apos;s onboarding@resend.dev sender is limited to
                  the account owner&apos;s inbox. Support and notification
                  addresses must be separate. For the webhook alternative,
                  configure <code>{origin}/api/webhooks/email</code> at a
                  reachable HTTPS origin; localhost cannot receive webhooks.
                </p>
                <p className="small">
                  Enable mention emails on the brand accounts, then forward only
                  those notifications to your receiving address. Cue imports
                  direct post links and notification excerpts, with duplicate
                  posts ignored. Social replies stay as drafts. Digests may
                  arrive late or omit mentions; tracking-only links require
                  manual capture.
                </p>
              </section>
              <section id="codex" hidden={active !== "codex"}>
                <div className="section-heading">
                  <h2>Codex runner</h2>
                  <span className="badge">
                    {codex?.ok ? "Connected" : "Local account"}
                  </span>
                </div>
                <p>
                  Your local Codex login stays on your machine. Cue delegates
                  work through the Codex SDK and streams results into the case
                  timeline.
                </p>
                <pre>
                  codex login{"\n"}CONVEX_AGENT_MODE=anonymous npm run dev
                </pre>
                <button
                  disabled={busy}
                  onClick={() =>
                    void send({ action: "check", target: "codex" }).then(
                      (b) => {
                        if (b) setCodex(b);
                      },
                    )
                  }
                >
                  Check Codex and runner
                </button>
                {codex && (
                  <ul>
                    <li>
                      Codex login: {codex.loggedIn ? "Ready" : "Sign-in needed"}
                    </li>
                    <li>Worker: {codex.workerOnline ? "Online" : "Offline"}</li>
                    <li>
                      GitHub:{" "}
                      {codex.github ? "Authenticated" : "Sign-in needed"}
                    </li>
                    <li>
                      Repository:{" "}
                      {codex.repo ? (
                        <a
                          href={`https://github.com/${codex.repo}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View connected repository ↗
                        </a>
                      ) : (
                        "Local repository"
                      )}
                    </li>
                  </ul>
                )}
                <p className="small">
                  Bloom upload fixes run through deployment verification.
                  Approved features use the connected app repository policy
                  above to produce tested PRs for Engineering review.
                </p>
              </section>
            </>
          ) : (
            <div className="ui-card">
              <EmptyState
                icon="plug"
                title={
                  message
                    ? "Couldn’t load connections"
                    : "Loading saved connections…"
                }
                action={
                  message && (
                    <Button
                      onClick={() => {
                        setMessage("");
                        void load();
                      }}
                    >
                      Retry
                    </Button>
                  )
                }
              >
                Connection settings are available to workspace owners.
              </EmptyState>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
