/* Supplied v3/v4 layouts with persisted product state and authenticated actions. */
NAV_GROUPS = [
  ["", ["home", "inbox"]],
  ["", ["issues", "features", "growth", "knowledge"]],
  ["", ["agents", "settings"]],
];
GO_KEYS = {
  h: "home",
  i: "inbox",
  s: "issues",
  f: "features",
  g: "growth",
  k: "knowledge",
  a: "agents",
  ",": "settings",
};
KEY_OF = Object.fromEntries(
  Object.entries(GO_KEYS).map(([key, value]) => [value, key]),
);
S.scopeApp = "all";
S.ctxOpen = false;
S.fr = { view: "all", sort: "asked", q: "" };
S.growth.capF = "all";
try {
  S.scopeApp = sessionStorage.getItem("cue-workspace-scope") || "all";
} catch {}
const productAppName = () => S.ag.appName || "your app";
const productApps = () => {
  const apps = [...(S.ag.apps || [])];
  if (
    S.cases.some((c) => c.appId === "bloom") &&
    !apps.some((a) => a.id === "bloom")
  )
    apps.push({ id: "bloom", name: "Legacy Bloom" });
  return apps;
};
const scopedRecord = (record) =>
  S.scopeApp === "all" || (record.appId || "bloom") === S.scopeApp;
const scopedCases = () => S.cases.filter(scopedRecord);
const scopedIssues = () => Object.values(S.issues).filter(scopedRecord);
const scopedFeatures = () => S.features.filter(scopedRecord);
const productSyncCue = syncCue;
syncCue = (data) => {
  productSyncCue(data);
  const visible = scopedCases();
  if (!visible.some((c) => c.id === S.sel)) S.sel = visible[0]?.id;
  S.inboxState = visible.length ? "populated" : "empty";
};
const productHref = (path) =>
  path +
  (S.ag.appId && S.ag.appId !== "bloom"
    ? "?app=" + encodeURIComponent(S.ag.appId)
    : "");
const plainProductText = (value) =>
  String(value || "")
    .replace(/\s*\b(?:T|ISS|FR|OPP|CAP)-\d+\b(?:\s*·)?/g, " ")
    .replace(/\s*(?:draft\s*)?#[0-9a-f]{4,8}\b/gi, " draft")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s·]+|[\s·]+$/g, "");
const productTaskTitle = (task) => plainProductText(task.title);
function productYourTurn() {
  const tasks = allTasks().filter((task) => {
    const view = tv(task);
    return (
      view.state === "awaiting" || (view.state === "blocked" && view.person)
    );
  });
  for (const conversation of scopedCases().filter(
    (c) =>
      !c.sample &&
      c.status !== "resolved" &&
      c.tags?.includes("Needs human reply"),
  )) {
    tasks.push({
      id: "reply-" + conversation._backend,
      agent: "support",
      state: "awaiting",
      person: true,
      title: conversation.customer + " still needs help",
      note: "Review the preserved conversation and reply to the customer.",
      review: { l: "Open conversation", h: "#/inbox/" + conversation.id },
    });
  }
  // Legacy investigations and specifications can predate persisted Agent tasks.
  // Keep their exact existing review receipts visible without inventing a task.
  for (const item of approvals()) {
    if (
      item.kind === "fix" &&
      (!S.liveRun ||
        !scopedIssues().some((i) => i._backend === S.liveRun.issueId))
    )
      continue;
    if (item.kind === "spec" && !scopedRecord(item.f)) continue;
    const duplicate = tasks.some((task) =>
      item.kind === "fix"
        ? task.issueId === S.liveRun?.issueId
        : item.kind === "spec"
          ? task.issueId === item.f._backend
          : task.opportunityId === item.o.id,
    );
    if (!duplicate)
      tasks.push({
        id:
          item.kind === "fix"
            ? "review-fix"
            : item.kind === "spec"
              ? "review-spec-" + item.f.id
              : "review-growth-" + item.o.id,
        agent: item.kind === "growth" ? "growth" : "engineering",
        title:
          item.kind === "fix"
            ? "Review the tested upload fix"
            : item.kind === "spec"
              ? "Review “" + item.f.title + "”"
              : "Review reply to " + item.o.author,
        state: "awaiting",
        person: true,
        note:
          item.kind === "fix"
            ? "Approve the exact commit before deployment."
            : item.kind === "spec"
              ? "Approve the specification before engineering starts."
              : "Review the exact draft before publication.",
        review:
          item.kind === "fix"
            ? { l: "Review fix", h: "#/issues/ISS-14" }
            : item.kind === "spec"
              ? { l: "Review request", h: "#/features/" + item.f.id }
              : { l: "Review reply", h: "#/growth/" + item.o.id },
      });
  }
  return tasks;
}
function productTurnItem(task) {
  const view = tv(task),
    agent = agentById(task.agent);
  const href =
    view.review?.h ||
    (task.opportunityId
      ? "#/growth/" + task.opportunityId
      : "#/agents/" + task.agent + "/" + task.id);
  const action = view.review?.act
    ? `<button class="btn primary sm" data-act="${esc(view.review.act)}">${esc(view.review.l)}</button>`
    : `<a class="btn primary sm" href="${esc(href)}">${esc(view.review?.l || "Open")}</a>`;
  return `<div class="turn">${agent ? agIc(agent) : ic("hourglass", 16)}<div class="turn-b"><a class="turn-t" href="${esc(href)}">${esc(productTaskTitle(task))}</a><p>${esc(plainProductText(view.blocker || view.note || view.stage))}</p></div>${action}</div>`;
}
renderSidebar = () => {
  const open = scopedCases().filter((c) => caseStatus(c) !== "resolved").length;
  const turn = productYourTurn().length;
  const names = {
    home: ["Home", "home", turn || ""],
    inbox: ["Inbox", "inbox", open || ""],
    issues: [
      "Issues",
      "bug",
      scopedIssues().filter((i) => i.status !== "resolved").length || "",
    ],
    features: [
      "Requests",
      "bulb",
      scopedFeatures().filter((f) => f.status === "spec-ready").length || "",
    ],
    growth: [
      "Growth",
      "trend",
      S.growth.opps.filter(
        (o) =>
          !o.controlled &&
          ["drafted", "awaiting", "approved"].includes(o.status),
      ).length || "",
    ],
    knowledge: ["Knowledge", "book", ""],
    agents: ["Agents", "bot", ""],
    settings: ["Settings", "settings", ""],
  };
  const selected =
    { agent: "agents", integrations: "settings", setup: "settings" }[S.sec] ||
    S.sec;
  const links = NAV_GROUPS.map(
    ([, keys]) =>
      `<div class="sb-grp">${keys
        .map((key) => {
          const [label, icon, count] = names[key];
          const href =
            key === "knowledge" || key === "settings"
              ? productHref("/" + key)
              : "#/" + key;
          return `<a class="nav ${selected === key ? "on" : ""}" href="${href}" ${selected === key ? 'aria-current="page"' : ""} title="${label}">${ic(icon, 16)}<span class="lbl">${label}</span>${count !== "" ? `<span class="cnt">${count}</span>` : ""}</a>`;
        })
        .join("")}</div>`,
  ).join("");
  $("#sb").innerHTML =
    `<a class="sb-top" href="#/home" aria-label="Cue home">${cueSymbol(22)}<span>${cueWordmark(15)}</span></a>${links}<div class="sb-foot"><button class="sb-keys" data-act="keys" aria-label="Keyboard shortcuts">${ic("zap", 13)}<span>Shortcuts</span><span class="kbd">?</span></button><div class="sb-ws">${ic("leaf", 14, "#6fcf97")}<span>${esc(S.integrations?.workspaceName || "Cue workspace")}</span></div></div>`;
};
renderTop = () => {
  const count = productYourTurn().length;
  const apps = productApps();
  const selected =
    S.scopeApp === "all"
      ? "All apps"
      : apps.find((a) => a.id === S.scopeApp)?.name || "Application";
  $("#top").innerHTML =
    `<div class="app-pick"><button class="ws-btn" data-act="productAppMenu" aria-expanded="${!!S.appMenu}" aria-label="Select application"><span class="ws-logo">${ic("leaf", 12, "#fff")}</span><span class="wn">${esc(selected)}</span>${ic("chevD", 14, "var(--ink-3)")}</button>${S.appMenu ? `<div class="app-menu" role="menu"><button role="menuitem" data-act="productApp" data-v="all">All apps${S.scopeApp === "all" ? ic("check", 13) : ""}</button>${apps.map((a) => `<button role="menuitem" data-act="productApp" data-v="${esc(a.id)}">${esc(a.name)}${S.scopeApp === a.id ? ic("check", 13) : ""}</button>`).join("")}<a href="/setup#applications">Manage applications ↗</a></div>` : ""}</div><button class="search-btn" data-act="palette" aria-label="Search (Command K)">${ic("search", 15)}<span class="t">Search or jump to…</span><span class="kbd">⌘K</span></button><div class="top-r"><a class="btn ghost appr-btn" href="#/home" aria-label="${count} things waiting on you">${ic("hourglass", 15)}<span class="t">Your turn</span>${count ? `<span class="badge">${count}</span>` : ""}</a><a class="av" href="/settings" style="background:${OP.color}" title="${esc(OP.name)} · ${esc(S.integrations?.role || S.ag.role || "Member")}">${esc(OP.ini)}</a></div>`;
};
homePage = () => {
  const rows = allTasks()
    .map((task) => [task, tv(task)])
    .sort((a, b) => lastT(b[0]) - lastT(a[0]));
  const turn = productYourTurn();
  const stuck = rows
    .filter(
      ([, view]) =>
        ["failed", "retrying"].includes(view.state) ||
        (view.state === "blocked" && !view.person),
    )
    .map(([task]) => task);
  const running = rows
    .filter(([, view]) =>
      ["running", "queued", "canceling"].includes(view.state),
    )
    .map(([task]) => task);
  const done = rows
    .filter(([, view]) => view.state === "completed")
    .slice(0, 4)
    .map(([task]) => task);
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: S.integrations?.timezone || "Asia/Kolkata",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date()),
  );
  const summary = turn.length
    ? `${turn.length} ${turn.length === 1 ? "thing is" : "things are"} waiting on you.`
    : "Nothing needs a decision right now.";
  const line = (icon, tone, tasks, text) =>
    tasks.length
      ? `<a class="h-line ${tone}" href="#/agent">${ic(icon, 14)}<span><b>${text}</b> ${esc(tasks.slice(0, 2).map(productTaskTitle).join(" · "))}</span><span class="r">Activity →</span></a>`
      : "";
  return `<div class="page enter v3-read"><div class="page-h"><div><span class="home-date">${new Date().toLocaleDateString(undefined, { timeZone: S.integrations?.timezone || "Asia/Kolkata", weekday: "long", month: "long", day: "numeric" })}</span><h1>${hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"}, ${esc(OP.short || OP.name)}.</h1><p>${summary}</p></div></div>${loopStrip()}<section class="turns" id="your-turn" aria-label="Your turn"><div class="turns-h">${ic("hourglass", 15)}<b>Your turn</b>${turn.length ? `<span class="n">${turn.length}</span>` : ""}</div>${turn.length ? turn.map(productTurnItem).join("") : `<div class="turns-empty">${ic("check", 16, "var(--accent)")}<div><b>You’re all caught up.</b><span>Cue will put anything that needs you here.</span></div></div>`}</section>${line("alert", "fail", stuck, stuck.length + " need attention.")}${line("zap", "run", running, running.length + " running or queued.")}${done.length ? `<section class="h-done"><h6>Recently done</h6>${done.map((task) => `<a href="#/agents/${task.agent}/${task.id}">${ic("check", 13, "var(--accent)")}<span>${esc(productTaskTitle(task))}</span><small>${rel(lastT(task))} ago</small></a>`).join("")}</section>` : ""}</div>`;
};
loopStrip = () => {
  const reported = scopedCases().filter(
    (c) => caseStatus(c) !== "resolved",
  ).length;
  const issueIds = new Set(scopedIssues().map((i) => i._backend));
  const runs = (liveSnapshot?.runs || []).filter((run) =>
    issueIds.has(run.issueId),
  );
  const fixing = runs.filter((run) =>
    ["running", "awaiting_approval"].includes(run.status),
  ).length;
  const verified = scopedIssues().filter(
    (issue) =>
      issue.status === "resolved" &&
      runs.some(
        (run) => run.issueId === issue._backend && run.verified && run.deployed,
      ),
  ).length;
  const published = S.growth.opps.filter(
    (o) => !o.controlled && o.pub?.state === "verified",
  ).length;
  const cells = [
    ["inbox", "Reported", reported, "open reports", "#/inbox"],
    ["zap", "Being fixed", fixing, "active investigations", "#/issues"],
    ["hourglass", "Your turn", productYourTurn().length, "decisions", "#/home"],
    ["check", "Fixed", verified, "deployed and verified", "#/issues"],
    [
      "trend",
      "Replies published",
      published,
      "verified public replies",
      "#/growth",
    ],
  ];
  return `<nav class="loop" aria-label="Customer work">${cells.map(([icon, label, count, note, href], index) => `<a class="lp" href="${href}"><span class="lp-t">${ic(icon, 13)}${label}</span><b>${count}</b><small>${note}</small>${index < cells.length - 1 ? `<span class="lp-arrow">${ic("chevR", 14)}</span>` : ""}</a>`).join("")}</nav>`;
};
rowHtml = (c) =>
  `<button class="row ${c.id === S.sel ? "on" : ""}" role="option" aria-selected="${c.id === S.sel}" data-act="selCase" data-id="${esc(c.id)}"><div class="av-wrap">${av(c)}${chIc(c.channel)}</div><div class="r-main"><div class="r-top"><b>${esc(c.customer)}</b><span class="r-time">${rel(c.t)}</span></div><div class="r-subj"><span class="pdot ${c.priority.toLowerCase()}" title="${esc(c.priority)}"></span>${esc(c.subject)}</div><div class="r-ex">${esc(c.excerpt)}</div><div class="r-st">${STATUS_LABEL[caseStatus(c)] || esc(caseStatus(c))}${c.issue ? " · part of a known issue" : c.fr ? " · feature request" : ""}</div></div></button>`;
const productFiltered = filtered;
filtered = () => productFiltered().filter(scopedRecord);
const productCaseHead = renderCaseHead;
renderCaseHead = () => {
  productCaseHead();
  const toggle = $(".ctx-toggle");
  if (toggle) {
    toggle.innerHTML = ic("panel", 14) + "<span>Details</span>";
    toggle.classList.remove("icon");
    toggle.setAttribute("aria-pressed", String(S.ctxOpen));
  }
};
const productInbox = renderInbox;
renderInbox = () => {
  productInbox();
  const inbox = $("#inbox");
  if (inbox) inbox.classList.toggle("ctx-open", S.ctxOpen);
};
const productContext = renderCtx;
renderCtx = () => {
  productContext();
  const next = $("#ctx .ctx-s");
  if (next && /Next action/.test(next.textContent)) next.remove();
};
function productIssueStage(issue) {
  if (issue.status === "resolved")
    return ["fixed", "Resolved · open for release evidence"];
  const run = (liveSnapshot?.runs || [])
    .filter((r) => r.issueId === issue._backend && r.status !== "archived")
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!run) return ["todo", "Not started"];
  if (run.verified && run.deployed)
    return ["fixed", "Deployed and independently verified"];
  return [
    "doing",
    run.status === "awaiting_approval"
      ? "Fix ready · waiting for review"
      : run.error
        ? "Needs attention · evidence preserved"
        : run.phase.replaceAll("_", " "),
  ];
}
issuesList = () => {
  const issues = scopedIssues();
  return `<div class="page enter"><div class="page-h"><div><h1>Issues</h1><p>Reports about the same problem share one investigation.</p></div></div>${
    !issues.length
      ? '<div class="turns-empty"><div><b>No issues in this view.</b><span>New customer problems will appear here.</span></div></div>'
      : [
          ["todo", "Needs a fix"],
          ["doing", "Being fixed"],
          ["fixed", "Resolved"],
        ]
          .map(([key, label]) => {
            const rows = issues.filter(
              (issue) => productIssueStage(issue)[0] === key,
            );
            return rows.length
              ? `<section class="v3-grp"><h6>${label}<span>${rows.length}</span></h6><div class="v3-list">${rows
                  .map((issue) => {
                    const cases = issue.cases.map(caseById).filter(Boolean);
                    return `<a class="v3-row" href="#/issues/${esc(issue.id)}"><span class="pdot ${issue.priority.toLowerCase()}"></span><span class="v3-main"><b>${esc(issue.title)}</b><small>${esc(productIssueStage(issue)[1])}</small></span><span class="v3-meta"><span class="chs">${[...new Set(cases.map((c) => c.channel))].map(chIc).join("")}</span>${cases.length} ${cases.length === 1 ? "report" : "reports"}</span>${ic("chevR", 14, "var(--ink-3)")}</a>`;
                  })
                  .join("")}</div></section>`
              : "";
          })
          .join("")
  }</div>`;
};
const productIssueDetail = issueDetail;
issueDetail = (id) =>
  scopedIssues().some((issue) => issue.id === id)
    ? productIssueDetail(id)
    : '<div class="page"><h1>Issue unavailable</h1><p>Select All apps or return to Issues.</p><a class="btn" href="#/issues">All issues</a></div>';
const productFeatureDetail = featureDetail;
const productRequestStage = (f) =>
  f.status === "released"
    ? "shipped"
    : f.status === "approved"
      ? "planned"
      : f.status === "spec-ready"
        ? "decide"
        : "collecting";
const productRequestLabels = {
  decide: ["warn", "Needs your decision"],
  collecting: ["outline", "Collecting"],
  planned: ["ok", "Planned"],
  shipped: ["ok", "Released · verified"],
};
function productRequests() {
  const all = scopedFeatures();
  const query = S.fr.q.trim().toLowerCase();
  const score = (f) =>
    S.fr.sort === "newest"
      ? -f.created
      : S.fr.sort === "growing"
        ? -f.week
        : -f.requesters.length;
  const rows = all
    .filter(
      (f) =>
        (S.fr.view === "all" || productRequestStage(f) === S.fr.view) &&
        (!query || (f.title + " " + f.need).toLowerCase().includes(query)),
    )
    .sort((a, b) => score(a) - score(b));
  const rank = [...all].sort(
    (a, b) => b.requesters.length - a.requesters.length,
  );
  const filters = [
    ["all", "All", all.length],
    ...Object.entries(productRequestLabels).map(([key, [, label]]) => [
      key,
      label,
      all.filter((f) => productRequestStage(f) === key).length,
    ]),
  ];
  return `<div class="page enter"><div class="page-h"><div><h1>Requests</h1><p>What customers want — grouped by the need and ranked by recorded reports.</p></div></div><div class="fr-bar"><div class="fr-chips">${filters
    .filter(([key, , count]) => key === "all" || count)
    .map(
      ([key, label, count]) =>
        `<button class="kb-chip ${S.fr.view === key ? "on" : ""}" data-act="productRequestView" data-v="${key}">${label}<span>${count}</span></button>`,
    )
    .join(
      "",
    )}</div><label class="x-search">${ic("search", 14)}<input id="product-fr-q" placeholder="Search requests" value="${esc(S.fr.q)}" aria-label="Search requests"></label><select class="inp fr-sort" id="product-fr-sort" aria-label="Sort requests">${[
    ["asked", "Most asked"],
    ["growing", "Most reports this week"],
    ["newest", "Newest"],
  ]
    .map(
      ([key, label]) =>
        `<option value="${key}" ${S.fr.sort === key ? "selected" : ""}>${label}</option>`,
    )
    .join(
      "",
    )}</select></div><div class="fr-t" role="table" aria-label="Requests"><div class="fr-r hd" role="row"><span>#</span><span>Request</span><span>Reports</span><span>This week</span><span>From</span><span>Status</span></div>${
    rows.length
      ? rows
          .map((f) => {
            const [tone, status] = productRequestLabels[productRequestStage(f)];
            return `<a class="fr-r" role="row" href="#/features/${esc(f.id)}"><span class="fr-rank">${rank.indexOf(f) + 1}</span><span class="fr-main"><b>${esc(f.title)}</b><small>${esc(f.need)}</small></span><span class="fr-n"><span class="avs">${f.requesters
              .slice(0, 3)
              .map((q) => av(q, "xs"))
              .join(
                "",
              )}</span>${f.requesters.length}</span><span class="fr-w ${f.week ? "up" : ""}">${f.week ? "+" + f.week : "—"}</span><span class="chs">${[...new Set(f.requesters.map((q) => q.channel))].map(chIc).join("")}</span><span><span class="chip ${tone}">${status}</span></span></a>`;
          })
          .join("")
      : '<div class="kb-none">No recorded requests match this view.</div>'
  }</div></div>`;
}
featuresPage = () => {
  if (!S.id) return productRequests();
  const f = S.features.find((item) => item.id === S.id && scopedRecord(item));
  return f
    ? `<div class="page enter fr3"><a class="x-back" href="#/features">${ic("arrowL", 14)}Requests</a>${productFeatureDetail(f)}</div>`
    : '<div class="page"><h1>Request unavailable</h1><p>Select All apps or return to Requests.</p><a class="btn" href="#/features">All requests</a></div>';
};
const productAgentDetail = agentsPage;
const productAgentTabs = (active) =>
  `<nav class="g-tabs" aria-label="Agents"><a href="#/agents" class="${active === "agents" ? "on" : ""}">What Cue is doing</a><a href="#/agent" class="${active === "activity" ? "on" : ""}">Activity</a></nav>`;
agentsPage = () => {
  if (S.id) return productAgentDetail();
  return `<div class="page enter v3-read"><div class="page-h"><div><h1>Agents</h1><p>Ask about recorded work or give an instruction. Questions don’t start jobs.</p></div></div>${productAgentTabs("agents")}<div class="ask-cue"><span class="ask-ic">${ic("sparkle", 16)}</span><input id="product-ask-cue" placeholder="Ask Cue — “What’s waiting for review?”" aria-label="Ask Cue" ${S.ag.connected ? "" : "disabled"}><button class="btn primary" data-act="productAskCue" ${S.ag.connected ? "" : "disabled"}>Ask</button></div><div class="ag-grid">${S.ag.agents
    .map((agent) => {
      const health = agHealth(agent);
      const tasks = allTasks()
        .filter((task) => task.agent === agent.id)
        .sort((a, b) => lastT(b) - lastT(a));
      const active = tasks.find(
        (task) => !["completed", "canceled"].includes(tv(task).state),
      );
      const done = tasks.find((task) => tv(task).state === "completed");
      const view = active && tv(active);
      return `<a class="ag-tile" href="#/agents/${agent.id}">${agIc(agent)}<div class="ag-tile-b"><div class="ag-tile-t"><b>${esc(agent.name)}</b><span>${hDot(health?.st)}${esc(health?.label || "Health unavailable")}</span></div><p class="now">${view ? `${tsChip(view.state)}${esc(productTaskTitle(active))}` : '<span class="chip outline">Idle</span>Nothing in progress'}</p>${done ? `<p class="last">Last done: ${esc(productTaskTitle(done))} · ${rel(lastT(done))} ago</p>` : ""}</div></a>`;
    })
    .join("")}</div></div>`;
};
const productActivity = agentPage;
agentPage = () =>
  productActivity()
    .replace(/<h1>Agent activity<\/h1>/, "<h1>Agents</h1>")
    .replace(
      '<div class="ta-bar">',
      productAgentTabs("activity") + '<div class="ta-bar">',
    );
const productGrowthDetail = gDetail;
const productGrowthCard = (opportunity) => {
  const capability = gCap(opportunity.cap);
  const generation = opportunity.draft?.generation;
  const status =
    opportunity.status === "discovered"
      ? "Checking the source against company knowledge"
      : opportunity.status === "qualified"
        ? "Verified fit · preparing a reply"
        : opportunity.status === "awaiting"
          ? "Exact draft waiting for Product review"
          : opportunity.status === "approved"
            ? "Approved · publication is still pending"
            : "Draft ready for review";
  return `<article class="gc" data-id="${esc(opportunity.id)}"><div class="gc-h">${av(opportunity, "sm")}<b>${esc(opportunity.name)}</b>${chIc(opportunity.ch)}<span class="t">${rel(opportunity.t)} ago</span><a class="gc-open" href="${esc(opportunity.url)}" target="_blank" rel="noopener">Open post ↗</a></div><p class="gc-q">${esc(opportunity.text)}</p>${capability ? `<details class="gc-cap"><summary>${ic("shield", 13)}<span>${esc(productAppName())} can help · <b>${esc(capability.title)}</b> · ${capability.status === "valid" ? "verified" : "needs a fresh check"}</span></summary><ul>${opportunity.reasons.map((reason) => `<li>${ic("check", 12)}${esc(reason)}</li>`).join("")}<li>${esc(capability.check)}</li></ul></details>` : ""}${opportunity.draft ? `<div class="gc-reply"><span>Proposed reply</span><p>${esc(opportunity.draft.text)}</p>${generation ? `<small>${esc(generation.model)} via ${generation.provider === "litellm" ? "LiteLLM" : "Gemini API"}${generation.fallbackFrom ? " · fallback recorded" : ""}</small>` : ""}</div>` : ""}<div class="gc-st">${esc(status)}</div><div class="gc-f"><a class="btn primary" href="#/growth/${esc(opportunity.id)}">${opportunity.draft ? "Review reply" : "Open source"}</a></div></article>`;
};
growthPage = () => {
  const growth = S.growth;
  const header = `<div class="page-h"><div><h1>Growth</h1><p>People asking for something ${esc(productAppName())} already does. Cue writes the reply; you decide what gets published.</p></div><a class="btn" href="#/growth/results">Results →</a></div>`;
  if (growth.tab === "results" || S.id === "results")
    return `<div class="page enter v3-read"><a class="x-back" href="#/growth">${ic("arrowL", 14)}Growth</a><div class="page-h"><h1>Growth results</h1></div>${gResults()}</div>`;
  if (growth.tab === "campaigns")
    return `<div class="page enter"><a class="x-back" href="#/growth">${ic("arrowL", 14)}Growth</a>${gCampaigns()}</div>`;
  const current = S.id && gOpp(S.id);
  if (current)
    return `<div class="page enter"><a class="x-back" href="#/growth">${ic("arrowL", 14)}Growth</a>${productGrowthDetail(current)}</div>`;
  const feed = growth.opps
    .filter(
      (o) =>
        !o.controlled &&
        ["discovered", "qualified", "drafted", "awaiting", "approved"].includes(
          o.status,
        ),
    )
    .sort((a, b) => b.t - a.t);
  const published = growth.opps.filter((o) => o.pub?.state === "verified");
  const unmet = growth.opps.filter((o) => o.status === "needs-feature");
  const other = growth.opps.filter(
    (o) => o.controlled || o.status === "dismissed",
  );
  const state =
    growth.state === "error"
      ? '<div class="err-banner">Couldn’t refresh Growth. Saved receipts are preserved. <button class="btn sm" data-act="gRetry">Retry</button></div>'
      : growth.state === "loading"
        ? '<div class="turns-empty">Loading saved sources…</div>'
        : "";
  return `<div class="page enter v3-read">${header}${growthAgentStatus()}<a class="g-sum" href="#/growth/results">${ic("trend", 14)}<span><b>${published.filter((o) => !o.controlled).length}</b> verified public replies · visits and activations are measured separately</span><span class="r">See results →</span></a>${state || (feed.length ? `<div class="gc-list">${feed.map(productGrowthCard).join("")}</div>` : '<div class="turns-empty big"><div><b>No replies ready for review.</b><span>Growth checks for matching requests automatically when the campaign is active.</span></div></div>')}<details class="product-growth-settings"><summary>Discovery settings and verified capabilities</summary>${gCampaigns()}</details>${unmet.length ? `<section class="kb-sec"><div class="kb-sec-h"><h2>People want things you don’t have yet</h2><span>No reply promises an unsupported feature.</span></div><div class="kb-gaps">${unmet.map((o) => `<div class="kb-gap">${av(o, "sm")}<div><b>${esc(o.need)}</b><small>${esc(o.author)}</small></div><a class="btn sm" href="#/growth/${esc(o.id)}">Review request</a></div>`).join("")}</div></section>` : ""}${published.length ? `<details class="g-posted"><summary>Publication receipts · ${published.length}</summary>${published.map((o) => `<a href="#/growth/${esc(o.id)}">${av(o, "xs")}<span>Reply to ${esc(o.author)}</span><small>${o.controlled ? "Controlled · excluded from organic results" : "Publication verified"}</small></a>`).join("")}</details>` : ""}${other.length ? `<details class="g-posted"><summary>Controlled and dismissed sources · ${other.length}</summary>${other.map((o) => `<a href="#/growth/${esc(o.id)}"><span>${esc(o.author)}</span><small>${o.controlled ? "Controlled" : "Dismissed"}</small></a>`).join("")}</details>` : ""}${growthData?.releaseHealth ? `<div class="callout">${esc(growthData.releaseHealth)}</div>` : ""}</div>`;
};
const productPalette = palItems;
palItems = (query) => {
  const cases = new Set(scopedCases().map((c) => "#/inbox/" + c.id));
  const issues = new Set(scopedIssues().map((i) => "#/issues/" + i.id));
  const requests = new Set(scopedFeatures().map((f) => "#/features/" + f.id));
  return productPalette(query)
    .filter(
      (item) =>
        item.l !== "Start investigation" &&
        item.l !== "Integrations" &&
        (item.g !== "Cases" || cases.has(item.go)) &&
        (item.g !== "Issues" || issues.has(item.go)) &&
        (item.g !== "Feature requests" || requests.has(item.go)),
    )
    .map((item) =>
      item.l === "Feature requests" ? { ...item, l: "Requests" } : item,
    );
};
const productPrimary = primary;
primary = (c) => {
  const action = productPrimary(c);
  if (!action) return action;
  action.label = action.label.replace(
    "Approve demo deployment",
    "Approve deployment",
  );
  action.next = action.next
    .replace("on demo", "on the deployed app")
    .replace("on stage", "at stage");
  if (S.run.status === "failed" && c.issue === "ISS-14")
    action.next =
      S.liveRun?.error ||
      "The investigation needs attention. Open its recorded error and evidence.";
  if (S.run.status === "deploying" && c.issue === "ISS-14")
    action.next =
      "Deployment is queued. The issue resolves after the deployed acceptance checks pass.";
  return action;
};
Object.assign(A, {
  productAppMenu: () => {
    S.appMenu = !S.appMenu;
    renderTop();
  },
  productApp: (button) => {
    const id = button.dataset.v;
    if (id !== "all" && !productApps().some((app) => app.id === id)) return;
    S.scopeApp = id;
    S.appMenu = false;
    try {
      sessionStorage.setItem("cue-workspace-scope", id);
    } catch {}
    if (id !== "all") selectWorkspaceApp(id);
    S.sel = scopedCases()[0]?.id;
    S.id = null;
    if (S.sec === "inbox") go("#/inbox");
    else if (["features", "issues", "growth", "agents"].includes(S.sec))
      go("#/" + S.sec);
    refresh({ thread: true });
  },
  ctxToggle: () => {
    S.ctxOpen = !S.ctxOpen;
    $("#inbox")?.classList.toggle("ctx-open", S.ctxOpen);
    $(".ctx-toggle")?.setAttribute("aria-pressed", String(S.ctxOpen));
  },
  productRequestView: (button) => {
    S.fr.view = button.dataset.v;
    renderMain(false);
  },
  productAskCue: () => {
    const question = $("#product-ask-cue")?.value.trim();
    if (!question || !S.ag.connected) return;
    const agent = /reddit/i.test(question)
      ? "reddit"
      : /\bx\b|tweet|mention|@/i.test(question)
        ? "x"
        : /reply|growth|post|campaign/i.test(question)
          ? "growth"
          : "engineering";
    S.id = agent;
    S.sub = null;
    go("#/agents/" + agent);
    agSend(question);
  },
  shot: () => {
    const attachments = (liveSnapshot?.attachments || []).filter(
      (attachment) => attachment.caseId === curCase()?._backend,
    );
    if (!attachments.length)
      return toast("No screenshot recorded for this conversation", "info");
    openDrawer(
      "Customer screenshots",
      attachments
        .map(
          (attachment) =>
            `<a href="${esc(attachment.url)}" target="_blank" rel="noopener"><img src="${esc(attachment.url)}" alt="Customer screenshot" style="max-width:100%;border-radius:10px"></a>`,
        )
        .join(""),
    );
  },
  ev: () => {
    if (!S.liveRun)
      return toast("No investigation evidence recorded yet", "info");
    openDrawer("Recorded investigation evidence", changes());
  },
});
for (const action of [
  "reset",
  "sampleX",
  "demoToggle",
  "demoInbox",
  "demoGrowth",
  "demoX",
  "demoRole",
  "demoSpend",
  "speed",
  "failToggle",
])
  delete A[action];
resetAll = () => {};
renderDemo = () => {};
document.addEventListener("change", (event) => {
  if (event.target.id === "product-fr-sort") {
    S.fr.sort = event.target.value;
    renderMain(false);
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id !== "product-fr-q") return;
  S.fr.q = event.target.value;
  const start = event.target.selectionStart,
    end = event.target.selectionEnd;
  renderMain(false);
  const input = $("#product-fr-q");
  input?.focus({ preventScroll: true });
  input?.setSelectionRange(start, end);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.id === "product-ask-cue") {
    event.preventDefault();
    A.productAskCue();
  }
  if (event.key === "Escape" && S.appMenu) {
    S.appMenu = false;
    renderTop();
  }
});
const productMain = renderMain;
renderMain = (animate) => {
  if (
    S.sec === "inbox" &&
    S.inboxState === "populated" &&
    !scopedCases().some((c) => c.id === S.sel)
  )
    S.sel = scopedCases()[0]?.id;
  productMain(animate);
  if (S.sec === "inbox" && !scopedCases().length && liveSnapshot)
    $("#main").innerHTML =
      '<div class="page"><h1>Inbox</h1><div class="turns-empty"><div><b>No customer conversations in this view.</b><span>Select All apps to see the workspace.</span></div></div></div>';
};
