"use client";
import { useCallback, useEffect, useState } from "react";
import type { TeamMember } from "@/lib/roles";
import { roleLabels, can, type Role } from "@/lib/roles";
import { Badge, Button, EmptyState, Icon, Notice } from "../components/ui";
import { TeamEditor } from "./team-editor";
import { useRouter } from "next/navigation";
import { CompanyContextPanel } from "../knowledge/company-context-panel";
type Snapshot = {
  actor: { name: string; email: string; role: Role };
  canManage: boolean;
  workspace: { name: string; timezone: string };
  ownerEmail?: string;
  members: TeamMember[];
  slackConfigured: boolean;
  models: {
    support: string;
    agent: string;
    qualification: string;
    coding: string;
    growth: string;
    embedding: string;
    dimensions: number;
    litellm: boolean;
    litellmCreditsRemaining: null;
  };
};
const sections = [
  ["general", "General", "settings"],
  ["team", "Team and roles", "users"],
  ["models", "Models", "cpu"],
  ["brand", "Brand voice", "sparkle"],
  ["usage", "Usage and limits", "gauge"],
  ["approvals", "Approvals", "shield"],
];
export function SettingsClient() {
  const router = useRouter();
  const [data, setData] = useState<Snapshot>(),
    [section, setSection] = useState("general"),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [model, setModel] = useState(""),
    [growthModel, setGrowthModel] = useState("");
  const load = useCallback(async () => {
    const r = await fetch("/api/settings", { cache: "no-store" }),
      d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
    setModel(d.models.support);
    setGrowthModel(d.models.growth);
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load().catch((e) => setError(e.message)));
    const sync = () =>
      setSection(
        sections.some((s) => s[0] === location.hash.slice(1))
          ? location.hash.slice(1)
          : "general",
      );
    queueMicrotask(sync);
    addEventListener("hashchange", sync);
    return () => removeEventListener("hashchange", sync);
  }, [load]);
  async function save(body: object) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch("/api/settings", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
      setNotice("Settings saved.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  const row = (
    title: string,
    description: string,
    control: React.ReactNode,
  ) => (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-cue-line p-4 last:border-0">
      <div className="min-w-40 flex-1">
        <b className="text-xs font-medium">{title}</b>
        <p className="mt-1 text-[11px] text-cue-muted">{description}</p>
      </div>
      {control}
    </div>
  );
  return (
    <main className="ui-page max-w-[1160px]">
      <h1 className="text-[22px] font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 mb-5 text-cue-muted">
        {data?.workspace.name || "Cue workspace"}
        {data ? ` · signed in as ${roleLabels[data.actor.role]}` : ""}
      </p>
      <div className="grid items-start gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
        <nav className="ui-section-nav" aria-label="Settings sections">
          {sections.map(([k, l, i]) => (
            <a key={k} href={`#${k}`} className={section === k ? "active" : ""}>
              <Icon name={i} size={14} />
              {l}
            </a>
          ))}
        </nav>
        <div className="min-w-0">
          {error && <Notice error>{error}</Notice>}
          {notice && <Notice>{notice}</Notice>}
          {!data ? (
            <div className="ui-card">
              <EmptyState
                icon="settings"
                title={error ? "Couldn’t load settings" : "Loading settings…"}
                action={
                  error && (
                    <Button
                      onClick={() =>
                        void load()
                          .then(() => setError(""))
                          .catch((e) => setError(e.message))
                      }
                    >
                      Retry
                    </Button>
                  )
                }
              >
                Only signed-in team members can view workspace settings.
              </EmptyState>
            </div>
          ) : (
            <>
              {section === "brand" && <CompanyContextPanel kind="brand" />}
              {section === "general" && (
                <form
                  className="ui-card"
                  key={data.workspace.name + data.workspace.timezone}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void save({
                      action: "workspace",
                      name: f.get("name"),
                      timezone: f.get("timezone"),
                    });
                  }}
                >
                  {row(
                    "Workspace name",
                    "Shown to your team",
                    <input
                      className="ui-input max-w-xs"
                      name="name"
                      aria-label="Workspace name"
                      defaultValue={data.workspace.name}
                      required
                      maxLength={60}
                      disabled={!data.canManage}
                    />,
                  )}
                  {row(
                    "Operator",
                    "Your verified account",
                    <span className="text-xs">
                      {data.actor.name} · {data.actor.email}
                    </span>,
                  )}
                  {row(
                    "Time zone",
                    "Display preference for your workspace",
                    <select
                      className="ui-input max-w-xs"
                      name="timezone"
                      aria-label="Time zone"
                      defaultValue={data.workspace.timezone}
                      disabled={!data.canManage}
                    >
                      {[
                        ...new Set([
                          data.workspace.timezone,
                          "Asia/Kolkata",
                          "Europe/London",
                          "America/New_York",
                          "UTC",
                        ]),
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>,
                  )}
                  <div className="flex items-center justify-between p-4">
                    <a className="text-xs text-cue-green" href="/connections">
                      Account and provider connections
                    </a>
                    <Button
                      variant="primary"
                      disabled={busy || !data.canManage}
                    >
                      Save workspace
                    </Button>
                  </div>
                </form>
              )}
              {section === "team" && (
                <>
                  <TeamEditor
                    members={data.members}
                    ownerEmail={data.ownerEmail}
                    canManage={data.canManage}
                    connected={data.slackConfigured}
                    onSaved={load}
                  />
                  <div className="ui-card mt-4 overflow-x-auto">
                    <h2 className="border-b border-cue-line p-4 text-xs font-semibold">
                      What each role can do
                    </h2>
                    <table className="w-full min-w-[520px] text-xs">
                      <thead>
                        <tr className="text-cue-subtle">
                          <th className="p-3 text-left font-normal">Action</th>
                          {Object.values(roleLabels).map((r) => (
                            <th key={r} className="p-3 font-normal">
                              {r}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          ["Reply to customers", "support"],
                          ["Investigate and implement", "investigate"],
                          ["Approve deployment", "deploy"],
                          ["Review specifications", "spec"],
                          ["Manage connections and team", "manage"],
                        ].map(([label, permission]) => (
                          <tr key={label} className="border-t border-cue-line">
                            <td className="p-3">{label}</td>
                            {Object.keys(roleLabels).map((r) => (
                              <td
                                key={r}
                                className="p-3 text-center text-cue-green"
                              >
                                {can(
                                  r as Role,
                                  permission as Parameters<typeof can>[1],
                                )
                                  ? "✓"
                                  : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                        {[
                          ["Draft knowledge", ["owner", "product", "support"]],
                          ["Publish knowledge", ["owner", "product"]],
                          ["Customer research", ["owner", "product"]],
                        ].map(([label, roles]) => (
                          <tr
                            key={String(label)}
                            className="border-t border-cue-line"
                          >
                            <td className="p-3">{label}</td>
                            {Object.keys(roleLabels).map((r) => (
                              <td
                                key={r}
                                className="p-3 text-center text-cue-green"
                              >
                                {(roles as string[]).includes(r) ? "✓" : "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {section === "models" && (
                <>
                  <div className="ui-card">
                    {row(
                      "Provider route",
                      "Gemini directly. Additional models use the connected LiteLLM proxy.",
                      <Badge tone="green">
                        Gemini
                        {data.models.litellm ? " + LiteLLM available" : ""}
                      </Badge>,
                    )}
                    {row(
                      "Widget answers",
                      "Uses published passages and validates supporting citations.",
                      <select
                        className="ui-input max-w-xs"
                        value={model}
                        aria-label="Widget answer model"
                        disabled={!data.canManage || busy}
                        onChange={(e) => setModel(e.target.value)}
                      >
                        <option value="gemini-2.5-flash">Gemini Flash</option>
                        {data.models.litellm && (
                          <>
                            <option value="nova-lite">
                              Nova Lite · LiteLLM
                            </option>
                            <option value="claude-haiku">
                              Claude Haiku · LiteLLM
                            </option>
                            <option value="claude-sonnet-4.6">
                              Claude Sonnet · LiteLLM
                            </option>
                          </>
                        )}
                      </select>,
                    )}
                    {row(
                      "Qualification and triage",
                      "Checks whether an explicit need matches a verified capability.",
                      <span className="font-mono text-[11px]">
                        {data.models.qualification}
                      </span>,
                    )}
                    {row(
                      "Growth writing",
                      "Uses published company context and brand voice. Every draft needs human review before publication.",
                      <select
                        className="ui-input max-w-xs"
                        value={growthModel}
                        aria-label="Growth draft model"
                        disabled={!data.canManage || busy}
                        onChange={(e) => setGrowthModel(e.target.value)}
                      >
                        <option value="gemini-2.5-flash">Gemini Flash</option>
                        {data.models.litellm && (
                          <option value="claude-sonnet-4.6">
                            Claude Sonnet 4.6 · LiteLLM
                          </option>
                        )}
                      </select>,
                    )}
                    {row(
                      "Code changes",
                      "The connected coding worker implements scoped changes. Deployment requires exact-commit approval and verification.",
                      <span className="text-xs">{data.models.coding}</span>,
                    )}
                    {row(
                      "Reviewed FAQ answers",
                      "An exact published FAQ answer is returned as reviewed.",
                      <Badge>No model call</Badge>,
                    )}
                    {row(
                      "Embeddings",
                      "Shared by source indexing and semantic retrieval.",
                      <span className="font-mono text-[11px]">
                        {data.models.embedding} · {data.models.dimensions}{" "}
                        dimensions
                      </span>,
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                      <p className="max-w-md text-[11px] text-cue-muted">
                        Provider credentials stay on the server. Changing the
                        widget model affects future answers; existing answers
                        stay recorded.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="primary"
                          disabled={
                            !data.canManage ||
                            busy ||
                            model === data.models.support
                          }
                          onClick={() =>
                            void save({ action: "model", supportModel: model })
                          }
                        >
                          Save widget model
                        </Button>
                        <Button
                          variant="primary"
                          disabled={
                            !data.canManage ||
                            busy ||
                            growthModel === data.models.growth
                          }
                          onClick={() =>
                            void save({
                              action: "growth-model",
                              growthModel,
                            })
                          }
                        >
                          Save Growth model
                        </Button>
                      </div>
                    </div>
                  </div>
                  <Notice>
                    Gemini is the default for support. A Growth provider outage
                    falls back to Gemini with the same facts and recorded
                    provider. Unsupported or invalid output stays blocked. You
                    can compare support models for individual questions in{" "}
                    <a className="underline" href="/knowledge#test">
                      Test answers
                    </a>
                    .
                  </Notice>
                </>
              )}
              {section === "usage" && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="ui-card p-5">
                      <span className="font-mono text-[10px] text-cue-subtle uppercase">
                        Gemini
                      </span>
                      <h2 className="mt-3 text-lg font-semibold">
                        Provider-managed billing
                      </h2>
                      <p className="mt-2 text-xs leading-relaxed text-cue-muted">
                        The workspace doesn’t receive a live Gemini balance.
                        Check usage and limits in your Google project.
                      </p>
                      <a
                        className="ui-button mt-4"
                        href="https://console.cloud.google.com/billing"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Google Cloud billing
                        <Icon name="ext" size={12} />
                      </a>
                    </div>
                    <div className="ui-card p-5">
                      <span className="font-mono text-[10px] text-cue-subtle uppercase">
                        LiteLLM
                      </span>
                      <h2 className="mt-3 text-lg font-semibold">
                        {data.models.litellm
                          ? "Configured · balance unavailable"
                          : "Not configured"}
                      </h2>
                      <p className="mt-2 text-xs leading-relaxed text-cue-muted">
                        The proxy enforces its shared team budget. Remaining
                        credits aren’t reported to this dashboard.
                      </p>
                      <a className="ui-button mt-4" href="/knowledge#test">
                        Test a model
                      </a>
                    </div>
                  </div>
                  <div className="ui-card mt-4">
                    {row(
                      "Combined monthly spending limit",
                      "A shared Gemini + LiteLLM ledger is not connected. Configure provider limits directly.",
                      <Badge>Provider-managed</Badge>,
                    )}
                    {row(
                      "Growth discovery",
                      "Official X reads have a bounded campaign budget. Reviewed replies are published by a person.",
                      <a className="ui-button" href="/cue#/growth">
                        Open Growth
                      </a>,
                    )}
                    {row(
                      "When an answer can’t be generated",
                      "The conversation stays in your Inbox for the team. Customers can ask for a person.",
                      <Icon name="lock" size={14} />,
                    )}
                    <div className="p-4 text-[11px] text-cue-muted">
                      Token counts and retrieval details are recorded for each
                      tested answer and generated Growth draft. Aggregate cost
                      charts and automatic budget alerts require a billing
                      ledger.
                    </div>
                  </div>
                </>
              )}
              {section === "approvals" && (
                <div className="ui-card">
                  {row(
                    "Human approval before deployment",
                    "An operator reviews the exact commit before the deployment action.",
                    <Badge tone="green">
                      <Icon name="lock" size={12} />
                      Always on
                    </Badge>,
                  )}
                  {row(
                    "Resolve only after verification",
                    "A customer scenario and its negative control must pass on the deployed build.",
                    <Badge tone="green">
                      <Icon name="lock" size={12} />
                      Always on
                    </Badge>,
                  )}
                  {row(
                    "Growth replies are posted by a person",
                    "Approval is separate from publication. Record the post URL for verification.",
                    <Badge tone="green">
                      <Icon name="lock" size={12} />
                      Always on
                    </Badge>,
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
