// The reference's new screens are React pages backed by Cue's APIs. Old hash
// links and keyboard navigation continue to reach the same product flows.
const suppliedRoute = route;
route = () => {
  // Signed-in users enter their real workspace, including direct /cue visits.
  // The public marketing page is served separately at /.
  if (!location.hash.startsWith("#/") || location.hash === "#/") {
    location.replace("#/home");
    return;
  }
  const p = location.hash.replace(/^#\//, "").split("/");
  const [section, id, detail] = p;
  let target;
  if (section === "knowledge")
    target =
      "/knowledge" +
      (S.ag.appId && S.ag.appId !== "bloom"
        ? "?app=" + encodeURIComponent(S.ag.appId)
        : "") +
      "#" +
      (id === "test" || id === "widget"
        ? id
        : id === "new"
          ? "new/" + (detail || "faq")
          : id
            ? "source/" + encodeURIComponent(id)
            : "sources");
  if (section === "settings")
    target =
      id === "connections"
        ? "/setup#applications"
        : "/settings#" + (id || "general");
  if (section === "integrations" && id !== "setup")
    target = "/setup#applications";
  if (section === "growth" && id === "prospects") target = "/customers";
  if (section === "integrations" && id === "setup")
    target =
      "/setup#" +
      ({ app: "applications", repo: "coding" }[detail] ||
        detail ||
        "applications");
  if (target) {
    location.replace(target);
    return;
  }
  suppliedRoute();
};
removeEventListener("hashchange", suppliedRoute);
addEventListener("hashchange", route);
const workspaceTime = (t, seconds) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone: S.integrations?.timezone || "Asia/Kolkata",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    ...(seconds ? { second: "2-digit" } : {}),
  }).format(new Date(t));
clock = (t) => workspaceTime(t, true);
hm = (t) => workspaceTime(t, false);
const suppliedTop = renderTop;
renderTop = () => {
  suppliedTop();
  const name = $("#top .wn");
  if (name) name.textContent = S.integrations?.workspaceName || "Cue workspace";
};
