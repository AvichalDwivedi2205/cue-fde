"use client";
import { useEffect, useState } from "react";
import type { TeamMember } from "@/lib/roles";
import { roleLabels } from "@/lib/roles";
import { Button, EmptyState, Icon, Notice } from "../components/ui";
export function TeamEditor({
  members,
  ownerEmail,
  canManage,
  connected,
  onSaved,
}: {
  members: TeamMember[];
  ownerEmail?: string;
  canManage: boolean;
  connected: boolean;
  onSaved: () => Promise<void>;
}) {
  const [rows, setRows] = useState(members),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    queueMicrotask(() => setRows(members));
  }, [members]);
  function change(i: number, key: keyof TeamMember, value: string) {
    setRows((r) => r.map((m, n) => (n === i ? { ...m, [key]: value } : m)));
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const r = await fetch("/api/integrations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "team",
            members: rows.map((m) => ({
              ...m,
              slackId: m.slackId || undefined,
            })),
          }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await onSaved();
      setMessage("Team access saved. No invitation email was sent.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save team");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ui-card">
      <div className="flex items-center justify-between border-b border-cue-line p-4">
        <h2 className="text-xs font-semibold">Members and account access</h2>
        <span className="text-[11px] text-cue-subtle">
          {members.length} configured members
        </span>
      </div>
      {message && (
        <div className="px-4">
          <Notice>{message}</Notice>
        </div>
      )}
      {!connected ? (
        <EmptyState
          icon="users"
          title="Connect Slack to manage team access"
          action={
            <a className="ui-button" href="/setup#slack">
              Slack setup
            </a>
          }
        >
          The current access list is shared with Slack reviewers. The configured
          owner keeps workspace access.
        </EmptyState>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          {rows.map((m, i) => (
            <div key={i} className="border-b border-cue-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <b className="text-xs font-medium">
                  {m.name || `New member ${i + 1}`}
                </b>
                {canManage && m.email !== ownerEmail && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove ${m.name || "member"}`}
                    disabled={busy}
                    onClick={() => setRows((r) => r.filter((_, n) => n !== i))}
                  >
                    <Icon name="x" size={13} />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="ui-field">
                  Name
                  <input
                    className="ui-input"
                    value={m.name}
                    required
                    maxLength={60}
                    disabled={!canManage || busy}
                    onChange={(e) => change(i, "name", e.target.value)}
                  />
                </label>
                <label className="ui-field">
                  Verified account email
                  <input
                    className="ui-input"
                    type="email"
                    value={m.email}
                    required
                    disabled={!canManage || busy || m.email === ownerEmail}
                    onChange={(e) => change(i, "email", e.target.value)}
                  />
                </label>
                <label className="ui-field">
                  Role
                  <select
                    className="ui-input"
                    value={m.role}
                    disabled={!canManage || busy || m.email === ownerEmail}
                    onChange={(e) => change(i, "role", e.target.value)}
                  >
                    {Object.entries(roleLabels).map(([k, l]) => (
                      <option
                        key={k}
                        value={k}
                        disabled={k === "owner" && m.email !== ownerEmail}
                      >
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="ui-field">
                  Slack member ID
                  <input
                    className="ui-input"
                    value={m.slackId || ""}
                    pattern="[UW][A-Z0-9]+"
                    disabled={!canManage || busy}
                    onChange={(e) => change(i, "slackId", e.target.value)}
                    placeholder="U… · optional for web access"
                  />
                </label>
              </div>
            </div>
          ))}
          {canManage && (
            <div className="flex flex-wrap items-center justify-between gap-3 p-4">
              <Button
                type="button"
                disabled={busy || rows.length >= 20}
                onClick={() =>
                  setRows((r) => [
                    ...r,
                    { name: "", email: "", role: "support" },
                  ])
                }
              >
                <Icon name="userPlus" size={14} />
                Add member
              </Button>
              <Button variant="primary" disabled={busy || !rows.length}>
                Save team access
              </Button>
              <p className="w-full text-[11px] text-cue-subtle">
                Adding a member grants their verified account access. Only the
                configured account can hold Owner. Slack approvals require a
                member ID.
              </p>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
