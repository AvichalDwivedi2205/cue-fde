"use client";
import { useEffect, useState, type FormEvent } from "react";
type App = { id: string; name: string; origins: string[] };
type Status = {
  apps: App[];
  slack: {
    configured: boolean;
    connected?: boolean;
    workspace?: string;
    teamId?: string;
    supportChannel?: string;
    engineeringChannel?: string;
    operatorIds?: string[];
  };
  email: {
    configured: boolean;
    from?: string;
    replyTo?: string;
    inbound?: boolean;
    notificationImport?: boolean;
    pollReceiving?: boolean;
    receivingAddress?: string;
    notifications?: {
      connected: boolean;
      detail: string;
      imported: number;
      needsReview: number;
      lastPollAt: number | null;
    };
  };
};
export function SetupClient({ origin }: { origin: string }) {
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
            ? "Token works; Socket Mode listener is not connected yet."
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
  const snippet = (app: App) =>
    `<script async src="${origin}/widget.js" data-app="${app.id}"></script>`;
  return (
    <main className="setup">
      <a href="/cue#/integrations">← Back to Cue</a>
      <h1>Connect your channels</h1>
      <p className="lede">
        Install Cue in your app. Bring support conversations and engineering
        work into one workspace.
      </p>
      <div className="setup-notice" role="status">
        {message ||
          "Credentials stay on the server. Connection checks show what is working."}
      </div>
      <section id="widget">
        <div className="section-heading">
          <h2>In-app widget</h2>
          <span className="badge">Copy-paste install</span>
        </div>
        <p>
          Add your app name and allowed website origins, then paste the script
          before your closing body tag.
        </p>
        <form onSubmit={(e) => void form(e, "app")}>
          <label>
            App name
            <input name="name" placeholder="Your app" required maxLength={60} />
          </label>
          <label>
            Allowed website origins
            <textarea
              name="origins"
              placeholder="https://yourapp.com"
              required
            />
          </label>
          <button disabled={busy}>Create install snippet</button>
        </form>
        {status?.apps.map((app) => (
          <div className="install" key={app.id}>
            <h3>{app.name}</h3>
            <p>{app.origins.join(", ")}</p>
            <pre>{snippet(app)}</pre>
            <button
              className="secondary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(snippet(app))
                  .then(() => setMessage("Install snippet copied."))
              }
            >
              Copy snippet
            </button>{" "}
            <a href={`/widget-playground?app=${app.id}`}>Test widget ↗</a>
          </div>
        ))}
        <p className="small">
          Anonymous visitors get private, persistent conversations. Optional
          data-name identifies a visitor by their supplied display name.
          Screenshots are uploaded only when selected. Cross-site embeds may
          need your CSP to allow Cue’s script and frame origins.
        </p>
      </section>
      <section id="slack">
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
          Cue uses Socket Mode, so messages and approval buttons work without
          exposing your laptop to the internet.
        </p>
        <div className="links">
          <a href="https://api.slack.com/apps" target="_blank" rel="noreferrer">
            Create Slack app ↗
          </a>
          <a href="/slack-manifest.json" download>
            Download app manifest
          </a>
          <a href="/connections">WorkOS account connections ↗</a>
        </div>
        <ol>
          <li>
            Create an app from the manifest in your workspace and install it.
          </li>
          <li>
            Generate an app-level token with connections:write. Copy the bot
            token and invite Cue to support and engineering channels.
          </li>
          <li>
            Enter credentials and channel IDs below. Cue only accepts reports
            and approvals from the configured workspace and channels.
          </li>
        </ol>
        <form
          key={status?.slack.teamId || "slack"}
          onSubmit={(e) => void form(e, "slack")}
        >
          <div className="fields">
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
            onClick={() => void send({ action: "check", target: "slack" })}
          >
            Check connection
          </button>
        </form>
      </section>
      <section id="email">
        <div className="section-heading">
          <h2>Email</h2>
          <span className="badge">
            {status?.email.configured ? "Configured" : "Setup needed"}
          </span>
        </div>
        <p>
          Send support replies from your verified address through Resend.
          Collect X and Reddit notification emails locally, or receive support
          emails through a signed webhook.
        </p>
        <div className="links">
          <a href="https://resend.com/domains" target="_blank" rel="noreferrer">
            Verify sender domain ↗
          </a>
          <a
            href="https://resend.com/api-keys"
            target="_blank"
            rel="noreferrer"
          >
            Get API key ↗
          </a>
          <a href="https://resend.com/emails" target="_blank" rel="noreferrer">
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
                defaultValue={status?.email.from || "avichal@latchgrid.in"}
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
            <label className="checkbox-field">
              <input
                name="notificationImport"
                type="checkbox"
                defaultChecked={status?.email.notificationImport || false}
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
              Poll notification inbox locally every 30 seconds
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
          Local polling needs an API key and dedicated Resend receiving address;
          no public URL or custom domain is needed for notification intake. It
          imports emails received after polling is enabled. Sender verification
          is still required for outbound support replies. For the webhook
          alternative, configure <code>{origin}/api/webhooks/email</code> at a
          reachable HTTPS origin; localhost cannot receive webhooks.
        </p>
        <p className="small">
          Enable mention emails on the brand accounts, then forward only those
          notifications to your receiving address. Cue imports direct post links
          and notification excerpts, with duplicate posts ignored. Social
          replies stay as drafts. Digests may arrive late or omit mentions;
          tracking-only links require manual capture.
        </p>
      </section>
      <section id="codex">
        <div className="section-heading">
          <h2>Codex runner</h2>
          <span className="badge">
            {codex?.ok ? "Connected" : "Local account"}
          </span>
        </div>
        <p>
          Your local Codex login stays on your machine. Cue delegates work
          through the Codex SDK and streams results into the case timeline.
        </p>
        <pre>codex login{"\n"}CONVEX_AGENT_MODE=anonymous npm run dev</pre>
        <button
          disabled={busy}
          onClick={() =>
            void send({ action: "check", target: "codex" }).then((b) => {
              if (b) setCodex(b);
            })
          }
        >
          Check Codex and runner
        </button>
        {codex && (
          <ul>
            <li>Codex login: {codex.loggedIn ? "Ready" : "Sign-in needed"}</li>
            <li>Worker: {codex.workerOnline ? "Online" : "Offline"}</li>
            <li>GitHub: {codex.github ? "Authenticated" : "Sign-in needed"}</li>
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
          Automated implementation currently covers Bloom’s upload limit in
          isolated checkouts. Other repositories require runner configuration.
        </p>
      </section>
    </main>
  );
}
