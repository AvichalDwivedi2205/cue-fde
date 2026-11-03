/* Quiet signals: bounded batch import, configured-route analysis, and build
   handoffs promoted into the ordinary feature workflow. */

let signalsSnapshot = { batches: [] },
  signalsBatch = null,
  signalsSignature = "",
  signalsLoading = false,
  signalsError = null,
  signalsForm = { mode: "fixture", fixture: "v1", requestKey: "fixture-v1", pasted: "" },
  signalsBusy = { import: false, analyze: false, promote: {} };

function signalsAppId() {
  const scope = S.scopeApp;
  if (scope && scope !== "all") return scope;
  return S.ag.appId || "bloom";
}
function signalsCan(permission) {
  return !S.integrations?.permissions || !!S.integrations.permissions[permission];
}
async function signalsAPI(action, data = {}) {
  const r = await fetch("/api/signals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || "Request failed");
  return body;
}
async function loadSignals(keepSelection = true) {
  if (signalsLoading || !S.sec) return;
  signalsLoading = true;
  signalsError = null;
  try {
    const r = await fetch(
      "/api/signals?appId=" + encodeURIComponent(signalsAppId()),
      { cache: "no-store" },
    );
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    signalsSnapshot = data;
    const selected = keepSelection ? sessionStorage.getItem("cue-signals-batch") : null;
    if (selected && data.batches.some((b) => b.batchId === selected))
      await loadSignalsBatch(selected);
    else if (!keepSelection || !signalsBatch) signalsBatch = null;
    renderSignals();
  } catch (error) {
    signalsError = error.message;
    if (S.sec === "signals") renderSignals();
  } finally {
    signalsLoading = false;
  }
}
async function loadSignalsBatch(batchId) {
  const r = await fetch(
    "/api/signals?batchId=" + encodeURIComponent(batchId),
    { cache: "no-store" },
  );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  signalsBatch = data.batch;
  sessionStorage.setItem("cue-signals-batch", batchId);
}
const signalsOutcomeChip = (outcome) => {
  const tones = {
    evidence: "ok",
    duplicate: "outline",
    spam: "fail",
    "off-topic": "outline",
    insufficient: "warn",
    "other-need": "warn",
  };
  const labels = {
    evidence: "Evidence",
    duplicate: "Duplicate",
    spam: "Spam or manipulation",
    "off-topic": "Off-topic",
    insufficient: "Insufficient detail",
    "other-need": "Different valid need",
  };
  return `<span class="chip ${tones[outcome] || "outline"}">${labels[outcome] || esc(outcome)}</span>`;
};
const signalsProvenanceBanner = (p) =>
  p.kind === "synthetic-fixture"
    ? `<div class="callout sig-prov">Imported <b>synthetic operator fixture</b> ${esc(p.fixture || "")} ${esc(p.version || "")} · authors are fictional. Nothing here is a real customer. The exact saved input is shown before any analysis.</div>`
    : `<div class="callout sig-prov">Operator-supplied capture · ${esc(p.note || "provenance not platform-verified")}. A pasted link is not verified platform provenance.</div>`;
function signalsImportCard() {
  const fixtures = [
    ["v1", "quiet-signals-evaluation v1", "12 synthetic posts · mixed needs, duplicates, noise, one injection attempt"],
    ["v2-heldout", "quiet-signals-heldout v2", "held-out evaluation batch · fictional authors"],
    ["v3-all-noise", "quiet-signals-all-noise v3", "all-noise batch · should produce no proposal"],
  ];
  return `<div class="blk sig-import"><div class="blk-h">Import a bounded batch</div><div class="blk-b">
    <p>Synthetic or operator-captured posts only. Limits: 40 posts, 1,500 characters each, 24,000 total. The saved input is frozen after import; the provenance label below is shown before any analysis.</p>
    <div class="sig-fx">${fixtures
      .map(
        ([v, label, detail]) =>
          `<button class="btn ${signalsForm.mode === "fixture" && signalsForm.fixture === v ? "primary" : ""}" data-act="signalsPickFixture" data-v="${v}">${esc(label)}</button><small class="sig-fx-d">${esc(detail)}</small>`,
      )
      .join("")}</div>
    <div class="field"><label for="sig-key">Request key</label><input class="inp" id="sig-key" value="${esc(signalsForm.requestKey)}" maxlength="80"><small>Same key and identical input reopens the saved batch; a reused key with different input is refused.</small></div>
    <div class="field"><label for="sig-paste">Or paste posts (JSON array of {id, author, text})</label><textarea class="inp" id="sig-paste" rows="4" placeholder="[ { &quot;id&quot;: &quot;q1&quot;, &quot;author&quot;: &quot;Alias&quot;, &quot;text&quot;: &quot;...&quot; } ]"></textarea><small>Pasted batches are recorded as operator-supplied capture; a pasted URL is not verified platform provenance.</small></div>
    <p class="sig-prov-line">${signalsForm.mode === "fixture" ? "Provenance: synthetic operator fixture · fictional authors" : "Provenance: operator-supplied capture · not platform-verified"}</p>
    <button class="btn primary" data-act="signalsImport" ${signalsBusy.import || !signalsCan("spec") ? "disabled" : ""}>Import batch</button>
    ${signalsBusy.import ? '<span class="dot investigating pulse"></span>' : ""}
  </div></div>`;
}
function signalsBatchRow(b) {
  const chips = {
    ready: ["outline", "Ready"],
    analyzing: ["warn", "Analyzing"],
    analyzed: ["ok", "Analyzed"],
    failed: ["fail", "Failed"],
  };
  const [tone, label] = chips[b.state] || ["outline", b.state];
  return `<button class="rel sig-brow ${signalsBatch?._id === b.batchId ? "on" : ""}" data-act="signalsSelect" data-id="${esc(b.batchId)}"><span class="rel-t">${esc(b.requestKey)}</span><span class="rel-m">${b.postCount} posts · ${b.clusterCount} ${b.clusterCount === 1 ? "cluster" : "clusters"} · ${b.promotedCount} handoffs</span><span class="chip ${tone}">${label}</span></button>`;
}
function signalsPostsTable(posts, dispositions) {
  const byId = Object.fromEntries((dispositions || []).map((d) => [d.postId, d]));
  const clusters = signalsBatch?.analysis?.clusters || [];
  const clusterTitle = (id) => {
    const c = clusters.find((c) => c.id === id);
    return c ? esc(c.proposal.title) : "";
  };
  return `<div class="blk"><div class="blk-h">Saved input · ${posts.length} posts</div><div class="blk-b"><table class="table sig-posts"><thead><tr><th>ID</th><th>Author</th><th>Post</th><th>Disposition</th></tr></thead><tbody>${posts
    .map(
      (p) =>
        `<tr><td class="mono">${esc(p.id)}</td><td>${esc(p.author)}${signalsBatch?.provenance?.kind === "synthetic-fixture" ? ' <span class="chip outline">synthetic author</span>' : ""}</td><td class="sig-text">${esc(p.text)}</td><td>${
          byId[p.id]
            ? `${signalsOutcomeChip(byId[p.id].outcome)}${byId[p.id].quote ? `<div class="sig-quote">“${esc(byId[p.id].quote)}”</div>` : ""}${byId[p.id].clusterId ? `<a class="sig-cl" href="#/signals">${clusterTitle(byId[p.id].clusterId)}</a>` : ""}<div class="sig-why">${esc(byId[p.id].reason)}</div>`
            : '<span class="chip outline">—</span>'
        }</td></tr>`,
    )
    .join("")}</tbody></table></div></div>`;
}
function signalsClusterCard(c) {
  const promoted = (signalsBatch?.promoted || []).find(
    (p) => p.clusterId === c.id && p.analysisRevision === signalsBatch?.analysis?.revision,
  );
  const feature = promoted && S.features.find((f) => f._backend === promoted.issueId);
  const sentiment = c.sentiment
    ? `<span class="chip outline">Sentiment · model interpretation: ${esc(c.sentiment)}</span>`
    : "";
  return `<div class="blk sig-cluster" id="sig-cluster-${esc(c.id)}"><div class="blk-h">Inferred need · ${esc(c.proposal.title)}</div><div class="blk-b">
    <p><b>${esc(c.need)}</b></p>
    <p class="sig-why">${esc(c.rationale)}</p>
    <p>${c.repeatedEvidence
      ? `<span class="chip ok">Repeated need · ${c.sources.length} posts · ${c.distinctAuthors} distinct authors</span>`
      : `<span class="chip warn">Single report · not enough to establish a repeated pattern</span>`}</p>
    <div class="sig-sources">${c.sources
      .map(
        (s) =>
          `<div class="sig-source"><span class="mono">${esc(s.postId)}</span> <b>${esc(s.author)}</b><blockquote>“${esc(s.quote)}”</blockquote></div>`,
      )
      .join("")}</div>
    ${sentiment}
    <div class="sig-assumptions">${c.proposal.assumptions.length ? `<b>Proposed assumptions for Product review</b><ul>${c.proposal.assumptions.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>` : ""}</div>
    <details class="sig-spec"><summary>Initial specification</summary><p><b>Need</b> ${esc(c.proposal.specification.need)}</p><p><b>Specification</b> ${esc(c.proposal.specification.specification)}</p><b>Acceptance criteria</b><ul>${c.proposal.specification.acceptanceCriteria.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></details>
    ${promoted
      ? `<div class="sig-handoff"><span class="chip ok">Handoff ready</span> Promoted to the ordinary feature workflow. Product approval is still required before any implementation.${feature ? ` <a class="btn primary sm" href="#/features/${esc(feature.id)}">Open the feature</a>` : ""}</div>`
      : signalsBatch?.state === "analyzed"
        ? `<button class="btn primary" data-act="signalsPromote" data-id="${esc(c.id)}" ${signalsBusy.promote[c.id] || !signalsCan("spec") ? "disabled" : ""}>Create build handoff</button> <small>Opens the ordinary feature flow at spec_ready. Nothing is implemented by promoting.</small>`
        : ""}
  </div></div>`;
}
function signalsReceiptLine() {
  const receipt = signalsBatch?.analysis?.receipt;
  if (!receipt) return "";
  const providerName = receipt.provider === "litellm" ? "LiteLLM" : receipt.provider === "meta" ? "Meta" : receipt.provider === "google" ? "Gemini API" : receipt.provider;
  return `<div class="blk"><div class="blk-h">Model receipt</div><div class="blk-b"><p class="fr-receipt">Requested ${esc(receipt.requestedModel)} · served ${esc(receipt.model)} via ${esc(providerName)} · ${receipt.inputTokens}+${receipt.outputTokens} tokens · ${receipt.durationMs} ms</p><p class="sig-why">The button label names the intended model; this receipt records what actually served.</p></div></div>`;
}
function signalsPage() {
  const batches = signalsSnapshot.batches || [];
  let body;
  if (!signalsBatch) {
    body =
      (signalsError
        ? `<div class="err-banner">${esc(signalsError)} <button class="btn sm" data-act="signalsReload">Retry</button></div>`
        : "") +
      signalsImportCard() +
      (batches.length
        ? `<div class="blk"><div class="blk-h">Batches for this application</div><div class="blk-b">${batches.map(signalsBatchRow).join("")}</div></div>`
        : "");
  } else {
    const state = signalsBatch.state;
    const attempts = signalsBatch.attempts || [];
    const analyzing =
      state === "analyzing" &&
      `<div class="callout"><span class="dot investigating pulse"></span> Analysis running · attempt ${attempts.length || 1} of at most 2. The result is discarded if this page's claim goes stale.</div>`;
    const failed =
      state === "failed"
        ? `<div class="blk"><div class="blk-h">Last attempt failed</div><div class="blk-b"><p class="err-banner">${esc(attempts[attempts.length - 1]?.error || "Unknown failure")}</p><p class="sig-why">Paid attempts keep their receipts. Retrying is explicit and capped at one retry.</p>${attempts.length < 2 ? `<button class="btn primary" data-act="signalsRetry" ${signalsBusy.analyze || !signalsCan("spec") ? "disabled" : ""}>Retry analysis</button>` : '<p class="chip fail">Retry budget used</p>'}</div></div>`
        : "";
    const analysis =
      signalsBatch.analysis
        ? `${signalsReceiptLine()}${
            signalsBatch.analysis.clusters.length
              ? signalsBatch.analysis.clusters.map(signalsClusterCard).join("")
              : '<div class="blk"><div class="blk-h">No supported need found</div><div class="blk-b"><p>Every input was excluded as noise, duplicates, or unrelated feedback. No feature was proposed and nothing was queued. This is a valid outcome.</p></div></div>'
          }`
        : "";
    body = `<a class="btn ghost sm" href="#/signals" data-act="signalsBack">← New import</a>
      ${signalsProvenanceBanner(signalsBatch.provenance)}
      ${signalsPostsTable(signalsBatch.posts, signalsBatch.analysis?.dispositions)}
      ${state === "ready" ? `<div class="blk"><div class="blk-h">Analyze</div><div class="blk-b"><button class="btn primary" data-act="signalsAnalyze" ${signalsBusy.analyze || !signalsCan("spec") ? "disabled" : ""}>Analyze with Muse Spark</button> <small>One bounded call. The receipt will record the model that actually served.</small>${signalsBusy.analyze ? '<span class="dot investigating pulse"></span>' : ""}</div></div>` : analyzing}${failed}${analysis}`;
  }
  return `<div class="page enter sig"><div class="page-h"><div><h1>Quiet signals</h1><p>Import a bounded batch of indirect posts, review every disposition against the saved input, and promote at most one proposal per cluster into the ordinary feature workflow.</p></div></div>${body}</div>`;
}
function renderSignals() {
  if (S.sec !== "signals") return;
  const main = $("#main");
  if (!main) return;
  const signature = JSON.stringify([signalsSnapshot, signalsBatch, signalsBusy, signalsError, signalsForm]);
  if (signature === signalsSignature) return;
  signalsSignature = signature;
  main.innerHTML = `<div class="view">${signalsPage()}</div>`;
  applyRoleControls();
}
A.signalsReload = () => {
  signalsError = null;
  void loadSignals();
};
A.signalsBack = () => {
  signalsBatch = null;
  sessionStorage.removeItem("cue-signals-batch");
  renderSignals();
};
A.signalsPickFixture = (button) => {
  signalsForm = { ...signalsForm, mode: "fixture", fixture: button.dataset.v };
  renderSignals();
};
A.signalsImport = async (button) => {
  if (signalsBusy.import) return;
  const key = $("#sig-key")?.value.trim() || signalsForm.requestKey;
  signalsForm.requestKey = key;
  let posts;
  let provenance;
  const pasted = $("#sig-paste")?.value.trim();
  if (pasted) {
    signalsForm.mode = "paste";
    try {
      posts = JSON.parse(pasted).map((p) => ({
        id: String(p.id || "").trim(),
        author: String(p.author || "").trim(),
        text: String(p.text || "").trim(),
      }));
    } catch {
      return toast("Pasted batch must be a JSON array of posts", "fail");
    }
    provenance = {
      kind: "operator-capture",
      note: "Pasted by " + (OP.name || "the operator") + " · not platform-verified",
    };
  } else {
    const response = await fetch(`/quiet-signals-fixture-${signalsForm.fixture}.json`);
    if (!response.ok) return toast("Fixture unavailable: " + response.status, "fail");
    const fixture = await response.json();
    posts = fixture.posts;
    provenance = {
      kind: "synthetic-fixture",
      fixture: fixture.fixture,
      version: fixture.version,
    };
  }
  if (!posts.length) return toast("The batch has no posts", "warn");
  signalsBusy.import = true;
  if (button) button.disabled = true;
  try {
    const result = await signalsAPI("import", {
      appId: signalsAppId(),
      requestKey: key,
      provenance,
      posts,
    });
    await loadSignalsBatch(result.batchId);
    await loadSignals();
    toast(result.created ? "Batch saved · input is frozen" : "Existing batch reopened");
  } catch (error) {
    toast(error.message, "fail");
  } finally {
    signalsBusy.import = false;
    renderSignals();
  }
};
A.signalsSelect = async (button) => {
  try {
    await loadSignalsBatch(button.dataset.id);
    signalsSignature = "";
    renderSignals();
  } catch (error) {
    toast(error.message, "fail");
  }
};
async function signalsRunAnalysis(button) {
  if (signalsBusy.analyze || !signalsBatch) return;
  signalsBusy.analyze = true;
  signalsSignature = "";
  if (button) button.disabled = true;
  try {
    const result = await signalsAPI("analyze", {
      batchId: signalsBatch._id,
      expectedFingerprint: signalsBatch.inputFingerprint,
    });
    await loadSignalsBatch(signalsBatch._id);
    signalsSignature = "";
    renderSignals();
    if (result.state === "failed") toast(result.error || "Analysis failed", "fail");
    else toast("Analysis saved · every input has a disposition");
  } catch (error) {
    await loadSignalsBatch(signalsBatch._id).catch(() => {});
    signalsSignature = "";
    renderSignals();
    toast(error.message, "fail");
  } finally {
    signalsBusy.analyze = false;
    signalsSignature = "";
    renderSignals();
  }
}
A.signalsAnalyze = (button) => signalsRunAnalysis(button);
A.signalsRetry = (button) => signalsRunAnalysis(button);
A.signalsPromote = async (button) => {
  if (!signalsBatch?.analysis) return;
  const clusterId = button.dataset.id;
  if (signalsBusy.promote[clusterId]) return;
  signalsBusy.promote[clusterId] = true;
  button.disabled = true;
  try {
    const { issueId } = await signalsAPI("promote", {
      batchId: signalsBatch._id,
      expectedAnalysisRevision: signalsBatch.analysis.revision,
      clusterId,
    });
    await loadCue();
    await loadSignalsBatch(signalsBatch._id);
    const feature = S.features.find((f) => f._backend === issueId);
    if (feature) go("#/features/" + feature.id);
    toast("Handoff ready · Product approval required before implementation");
  } catch (error) {
    toast(error.message, "fail");
  } finally {
    signalsBusy.promote[clusterId] = false;
    signalsSignature = "";
    renderSignals();
  }
};
const signalsProductRequests = productRequests;
productRequests = () =>
  signalsProductRequests().replace(
    '<div class="fr-bar">',
    `<div class="sig-entry"><a class="btn" href="#/signals">Quiet signals →</a><span>Import a bounded batch of indirect posts; Spark infers needs with saved evidence.</span></div><div class="fr-bar">`,
  );
const signalsRoute = route;
route = () => {
  const wasSignals = S.sec === "signals";
  signalsRoute();
  if (S.sec === "signals" && !wasSignals) {
    const saved = sessionStorage.getItem("cue-signals-batch");
    void loadSignals(!!saved);
  }
};
const signalsApplyRoleControls = applyRoleControls;
applyRoleControls = () => {
  signalsApplyRoleControls();
  const permissions = {
    signalsImport: "spec",
    signalsAnalyze: "spec",
    signalsRetry: "spec",
    signalsPromote: "spec",
  };
  for (const button of document.querySelectorAll("button[data-act]")) {
    const permission = permissions[button.dataset.act];
    if (
      permission &&
      S.integrations?.permissions &&
      !S.integrations.permissions[permission]
    ) {
      button.disabled = true;
      button.title = `Your ${S.integrations.role} role cannot perform this action`;
    }
  }
};
const signalsMain = renderMain;
renderMain = (anim) => {
  if (S.sec !== "signals") return signalsMain(anim);
  const main = $("#main");
  main.dataset.anim = anim ? "1" : "0";
  main.innerHTML = `<div class="view">${signalsPage()}</div>`;
  document.title = "Quiet signals · Cue";
  applyRoleControls();
};
setInterval(() => {
  if (!document.hidden && S.sec === "signals") void loadSignals();
}, 2500);
