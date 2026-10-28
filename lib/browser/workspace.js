/* Supplied screens backed by persisted coordinator and Agent threads. */
let workspaceBusy = false,
  workspaceSignature = "";
agHealth = (a) => a.health;
async function workspaceAPI(body) {
  const response = await fetch("/api/agents", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Agent unavailable");
  return result;
}
async function loadWorkspace() {
  if (workspaceBusy) return;
  workspaceBusy = true;
  try {
    const response = await fetch(
      "/api/agents" +
        (S.ag.appId ? "?app=" + encodeURIComponent(S.ag.appId) : ""),
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    const signature = JSON.stringify(data);
    if (signature !== workspaceSignature) {
      workspaceSignature = signature;
      S.ag.connected = true;
      S.ag.appId = data.app.id;
      S.ag.appName = data.app.name;
      S.ag.apps = data.apps;
      S.ag.agents = data.agents;
      S.ag.tasks = data.tasks;
      S.ag.convos = Object.fromEntries(
        data.conversations.map((c) => [
          c.agent,
          c.messages.map((m) => ({
            who: m.role === "user" ? "op" : "agent",
            text: m.text.split("\n").filter(Boolean),
            t: m.at,
            via: m.via,
            ctx: m.context,
            refs: [
              ...m.text.matchAll(
                /#\/agents\/(x|reddit|growth|engineering)\/([a-z0-9]+)/g,
              ),
            ].map((x) => ({ l: x[2], h: x[0] })),
          })),
        ]),
      );
      // Operator messages are plain text, assistant messages may be paragraphs.
      Object.values(S.ag.convos)
        .flat()
        .forEach((m) => {
          if (m.who === "op") m.text = m.text.join("\n");
        });
      agRefresh();
    }
  } catch (e) {
    S.ag.connected = false;
    S.ag.error = e.message;
  } finally {
    workspaceBusy = false;
  }
}
const designAgentsPage = agentsPage;
agentsPage = () =>
  designAgentsPage()
    .replace(
      "Agent conversations aren’t connected in this workspace yet",
      S.ag.connected
        ? "Ask about saved work, or give an instruction…"
        : "Agent connection unavailable",
    )
    .replace(
      /<span class="chip outline">([^<]|<[^>]+>)*?Bloom<\/span><label for="ag-ctx"/,
      `<select id="ag-app" aria-label="Application">${(S.ag.apps || []).map((a) => `<option value="${esc(a.id)}" ${a.id === S.ag.appId ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select><label for="ag-ctx"`,
    )
    .replace(
      '>Bloom</span><label for="ag-ctx"',
      `>${esc(S.ag.appName || "Bloom")}</span><label for="ag-ctx"`,
    )
    .replace("disabled>", S.ag.connected && !S.ag.typing ? ">" : "disabled>")
    .replace(
      /id="ag-send" disabled/,
      S.ag.connected && S.ag.draft.trim() && !S.ag.typing
        ? 'id="ag-send"'
        : 'id="ag-send" disabled',
    );
allTasks = () => S.ag.tasks;
agSend = async (text) => {
  const a = agentById(S.id) || S.ag.agents[0];
  text = String(text || "").trim();
  if (!text || !S.ag.connected || S.ag.typing) return;
  const key = S.ag.pendingKey || crypto.randomUUID();
  S.ag.pendingKey = key;
  S.ag.typing = a.id;
  agRefresh();
  try {
    await workspaceAPI({
      agent: a.id,
      appId: S.ag.appId,
      text,
      key,
      ...(S.sub ? { taskId: S.sub } : {}),
    });
    S.ag.draft = "";
    S.ag.pendingKey = null;
    workspaceSignature = "";
    await loadWorkspace();
  } catch (e) {
    toast(e.message, "fail");
  } finally {
    S.ag.typing = null;
    agRefresh();
  }
};
A.agSend = () => agSend(S.ag.draft);
A.agSugg = (el) => agSend(el.dataset.v);
A.tkCancel = async (el) => {
  try {
    await workspaceAPI({
      action: "cancel",
      appId: S.ag.appId,
      taskId: el.dataset.id,
    });
    workspaceSignature = "";
    await loadWorkspace();
  } catch (e) {
    toast(e.message, "fail");
  }
};
A.tkRetry = () =>
  toast(
    "Use explicit collection instruction. Review uncertain external outcomes first.",
    "info",
  );
loadWorkspace();
document.addEventListener("change", (e) => {
  if (e.target.id !== "ag-app") return;
  S.ag.appId = e.target.value;
  S.ag.convos = {};
  S.ag.tasks = [];
  S.ag.pendingKey = null;
  workspaceSignature = "";
  S.sub = "";
  loadWorkspace();
});
setInterval(() => {
  if (!document.hidden) loadWorkspace();
}, 5000);
