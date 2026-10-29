"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Button, EmptyState, Icon, Notice } from "../components/ui";
import type { App } from "./setup-client";
export function AppConfiguration({
  apps,
  section,
  origin,
  busy,
  send,
  register,
}: {
  apps: App[];
  section: string;
  origin: string;
  busy: boolean;
  send: (body: object) => Promise<unknown>;
  register: (e: FormEvent<HTMLFormElement>) => void;
}) {
  const [id, setId] = useState(""),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    queueMicrotask(() => {
      if (!apps.some((a) => a.id === id)) {
        let preferred = "";
        try {
          preferred = sessionStorage.getItem("cue-agent-app") || "";
        } catch {}
        setId(apps.find((a) => a.id === preferred)?.id || apps[0]?.id || "");
      }
    });
  }, [apps, id]);
  const app = apps.find((a) => a.id === id),
    snippet = app
      ? `<script async src="${origin}/widget.js" data-app="${app.id}"></script>`
      : "";
  const [options, setOptions] = useState({
    answers: true,
    voice: true,
    screenshots: true,
  });
  useEffect(() => {
    queueMicrotask(() =>
      setOptions(
        app?.widget || { answers: true, voice: true, screenshots: true },
      ),
    );
  }, [app]);
  const picker = apps.length > 0 && (
    <label className="ui-field mb-5">
      Application
      <select
        className="ui-input"
        value={id}
        onChange={(e) => {
          setId(e.target.value);
          try {
            sessionStorage.setItem("cue-agent-app", e.target.value);
          } catch {}
          setCopied(false);
        }}
      >
        {apps.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section className="ui-card p-5">
      <div className="section-heading">
        <h2>
          {section === "applications"
            ? "Applications"
            : section === "domains"
              ? "Allowed domains"
              : "In-app widget"}
        </h2>
        <Icon name={section === "domains" ? "globe" : "widget"} size={16} />
      </div>
      {section === "applications" ? (
        <>
          <p>
            Register the products your customers use. Knowledge, conversations
            and repository policies are scoped by application.
          </p>
          {apps.length > 0 && (
            <div className="mb-6 divide-y divide-cue-line rounded-lg border border-cue-line">
              {apps.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3"
                >
                  <div>
                    <b className="text-xs font-medium">{a.name}</b>
                    <p className="mt-1 font-mono text-[10px] text-cue-subtle">
                      {a.id}
                    </p>
                  </div>
                  <a
                    className="ui-button"
                    href="#domains"
                    onClick={() => {
                      setId(a.id);
                      try {
                        sessionStorage.setItem("cue-agent-app", a.id);
                      } catch {}
                    }}
                  >
                    Configure
                  </a>
                </div>
              ))}
            </div>
          )}
          <h3 className="mb-4 text-sm font-semibold">
            Register an application
          </h3>
          <form onSubmit={register}>
            <div className="fields">
              <label>
                App name
                <input
                  name="name"
                  placeholder="Your app"
                  required
                  maxLength={60}
                />
              </label>
              <label>
                Allowed website origins
                <textarea
                  name="origins"
                  placeholder="https://yourapp.com"
                  required
                />
              </label>
            </div>
            <Button variant="primary" disabled={busy}>
              <Icon name="plus" size={14} />
              Register application
            </Button>
          </form>
        </>
      ) : !app ? (
        <EmptyState
          title="Register an application first"
          action={
            <a className="ui-button ui-primary" href="#applications">
              Register application
            </a>
          }
        >
          The widget and its knowledge belong to an application.
        </EmptyState>
      ) : (
        <>
          {picker}
          {section === "domains" ? (
            <form
              key={id + app.origins.join()}
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void send({
                  action: "appUpdate",
                  id: app.id,
                  name: f.get("name"),
                  origins: String(f.get("origins"))
                    .split(/\s+/)
                    .filter(Boolean),
                });
              }}
            >
              <p>
                Only these exact origins can embed the widget. Use HTTPS; HTTP
                is supported for localhost testing.
              </p>
              <label>
                Application name
                <input
                  name="name"
                  defaultValue={app.name}
                  required
                  maxLength={60}
                />
              </label>
              <label>
                Allowed website origins
                <textarea
                  name="origins"
                  defaultValue={app.origins.join("\n")}
                  rows={5}
                  required
                />
                <small>
                  One origin per line, including https://. No paths or
                  wildcards.
                </small>
              </label>
              <Button variant="primary" disabled={busy}>
                Save application and origins
              </Button>
            </form>
          ) : (
            <>
              <p>
                Paste this before your closing body tag wherever customers
                should see support.
              </p>
              <div className="overflow-hidden rounded-lg border border-cue-line">
                <div className="flex items-center justify-between border-b border-cue-line bg-cue-sunken/50 px-3 py-2">
                  <span className="flex items-center gap-2 text-xs">
                    <Icon name="code" size={14} />
                    Copy-paste install
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void navigator.clipboard
                        .writeText(snippet)
                        .then(() => setCopied(true))
                    }
                  >
                    <Icon name={copied ? "check" : "copy"} size={13} />
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <pre className="overflow-x-auto p-4 font-mono text-[11px] whitespace-pre-wrap break-all">
                  {snippet}
                </pre>
              </div>
              <div className="mt-5 divide-y divide-cue-line">
                {[
                  [
                    "answers",
                    "Answer from knowledge",
                    "Uses only published, customer-facing sources.",
                  ],
                  ["voice", "Voice", "Customers can talk instead of typing."],
                  [
                    "screenshots",
                    "Screenshots",
                    "Attach a screenshot up to 3 MB.",
                  ],
                ].map(([k, l, d]) => (
                  <label
                    key={k}
                    className="flex flex-row items-center justify-between gap-4 py-3"
                  >
                    <span>
                      <b className="text-xs font-medium">{l}</b>
                      <small className="mt-1 block text-[11px] text-cue-muted">
                        {d}
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="size-4 accent-cue-green"
                      checked={options[k as keyof typeof options]}
                      disabled={busy}
                      onChange={(e) =>
                        setOptions((o) => ({ ...o, [k]: e.target.checked }))
                      }
                    />
                  </label>
                ))}
                <div className="flex items-center justify-between py-3">
                  <span>
                    <b className="text-xs font-medium">Ask for a person</b>
                    <small className="mt-1 block text-[11px] text-cue-muted">
                      Always available. Saves the request in the Inbox.
                    </small>
                  </span>
                  <Icon name="lock" size={14} />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={busy}
                  onClick={() =>
                    void send({
                      action: "widget",
                      appId: app.id,
                      widget: options,
                    })
                  }
                >
                  Save widget settings
                </Button>
                <a className="ui-button" href="/knowledge#widget">
                  Test widget
                  <Icon name="ext" size={12} />
                </a>
              </div>
              <Notice>
                Anonymous visitors get private, persistent conversations.
                Screenshots upload only when selected. Your site’s CSP must
                allow Cue’s script and frame origins.
              </Notice>
            </>
          )}
        </>
      )}
    </section>
  );
}
