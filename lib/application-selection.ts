export type ApplicationChoice = { id: string; name: string };

export function selectedApplicationId(
  apps: ApplicationChoice[],
  requested: string | null,
  saved: string | null,
  defaultAppId?: string,
) {
  return (
    [requested, saved, defaultAppId, apps[0]?.id].find(
      (id) => id && apps.some((app) => app.id === id),
    ) || ""
  );
}

export function rememberApplication(appId: string) {
  try {
    sessionStorage.setItem("cue-agent-app", appId);
    sessionStorage.setItem("cue-workspace-scope", appId);
  } catch {}
  window.dispatchEvent(new Event("cue-application-changed"));
}
