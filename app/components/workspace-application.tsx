"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "./ui";
import {
  rememberApplication,
  selectedApplicationId,
} from "@/lib/application-selection";

// One registered app selects context. The browser shell additionally offers an
// All apps report view; retrieval and model work always name an actual app.
export function WorkspaceApplication({
  apps,
  workspaceName,
  defaultAppId,
}: {
  apps: { id: string; name: string }[];
  workspaceName: string;
  defaultAppId?: string;
}) {
  const selected = useSyncExternalStore(
    (notify) => {
      window.addEventListener("popstate", notify);
      window.addEventListener("storage", notify);
      window.addEventListener("cue-application-changed", notify);
      return () => {
        window.removeEventListener("popstate", notify);
        window.removeEventListener("storage", notify);
        window.removeEventListener("cue-application-changed", notify);
      };
    },
    () => {
      const requested = new URL(window.location.href).searchParams.get("app");
      let saved: string | null = null;
      try {
        saved = sessionStorage.getItem("cue-agent-app");
      } catch {}
      return selectedApplicationId(apps, requested, saved, defaultAppId);
    },
    () => defaultAppId || "",
  );
  function change(appId: string) {
    if (!apps.some((app) => app.id === appId)) return;
    rememberApplication(appId);
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
