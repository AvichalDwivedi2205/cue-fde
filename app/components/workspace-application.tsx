"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./ui";

// One registered app selects context. The browser shell additionally offers an
// All apps report view; retrieval and model work always name an actual app.
export function WorkspaceApplication({
  apps,
  workspaceName,
}: {
  apps: { id: string; name: string }[];
  workspaceName: string;
}) {
  const selected = useSyncExternalStore(
    (notify) => {
      window.addEventListener("popstate", notify);
      window.addEventListener("storage", notify);
      return () => {
        window.removeEventListener("popstate", notify);
        window.removeEventListener("storage", notify);
      };
    },
    () => {
      const requested = new URL(window.location.href).searchParams.get("app");
      let saved: string | null = null;
      try {
        saved = sessionStorage.getItem("cue-agent-app");
      } catch {}
      const app =
        apps.find((a) => a.id === requested) ||
        apps.find((a) => a.id === saved);
      return app?.id || "";
    },
    () => "",
  );
  function change(appId: string) {
    if (!apps.some((app) => app.id === appId)) return;
    try {
      sessionStorage.setItem("cue-agent-app", appId);
      sessionStorage.setItem("cue-workspace-scope", appId);
    } catch {}
    const url = new URL(window.location.href);
    url.searchParams.set("app", appId);
    window.location.assign(url.toString());
  }
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs font-semibold">
      <span className="grid size-5 shrink-0 place-items-center rounded-md bg-cue-green text-white">
        <Icon name="leaf" size={12} />
      </span>
      <span className="sr-only">Selected application</span>
      {apps.length ? (
        <select
          className="max-w-36 truncate border-0 bg-transparent py-1 text-xs font-semibold sm:max-w-48"
          aria-label="Selected application"
          value={selected}
          onChange={(event) => change(event.target.value)}
        >
          <option value="">{workspaceName}</option>
          {apps.map((app) => (
            <option value={app.id} key={app.id}>
              {app.name}
            </option>
          ))}
        </select>
      ) : (
        <span className="max-w-32 truncate sm:max-w-48">{workspaceName}</span>
      )}
    </label>
  );
}
