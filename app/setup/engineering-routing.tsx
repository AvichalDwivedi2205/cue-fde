"use client";
import { useState } from "react";
import type { App } from "./setup-client";
import type { TeamMember } from "@/lib/roles";
import { can } from "@/lib/roles";

export function EngineeringRouting({
  apps,
  members,
  onSaved,
}: {
  apps: App[];
  members: TeamMember[];
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const eligible = members.filter(
    (m) => m.slackId && can(m.role, "investigate") && can(m.role, "deploy"),
  );
  return (
    <div className="mb-6 rounded-lg border border-cue-line p-4">
      <h3>Engineering owners</h3>
      <p>
        Assign the engineer who can start and approve each app’s Slack handoff.
      </p>
      {notice && <p role="status">{notice}</p>}
      {apps
        .filter((a) => a.packStatus === "active")
        .map((app) => (
          <form
            key={`${app.id}:${app.routing?.engineeringMemberId || ""}:${app.routing?.engineeringChannel || ""}`}
            onSubmit={async (event) => {
              event.preventDefault();
              const fields = new FormData(event.currentTarget);
              setBusy(true);
              setNotice("");
              try {
                const response = await fetch("/api/onboarding", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({
                    action: "setRouting",
                    appId: app.id,
                    label: app.routing?.label,
                    engineeringMemberId: fields.get("member"),
                    engineeringChannel: fields.get("channel"),
                  }),
                });
                const result = await response.json();
                if (!response.ok)
                  throw new Error(result.error || "Routing save failed");
                await onSaved();
                setNotice(`Engineering owner saved for ${app.name}.`);
              } catch (error) {
                setNotice(
                  error instanceof Error
                    ? error.message
                    : "Routing save failed",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <b>{app.name}</b>
            <div className="fields">
              <label>
                Assigned engineer
                <select
                  name="member"
                  required
                  defaultValue={app.routing?.engineeringMemberId || ""}
                >
                  <option value="" disabled>
                    Choose a connected engineer
                  </option>
                  {eligible.map((member) => (
                    <option key={member.slackId} value={member.slackId}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Engineering channel
                <input
                  name="channel"
                  pattern="[CG][A-Z0-9]+"
                  placeholder="Use workspace default"
                  defaultValue={app.routing?.engineeringChannel || ""}
                />
              </label>
            </div>
            <button disabled={busy || !eligible.length}>
              Save engineering owner
            </button>
          </form>
        ))}
    </div>
  );
}
