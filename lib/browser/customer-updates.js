function showCustomerUpdate(delivery, notice = "") {
  const intent = delivery.supportIntent;
  if (!intent) throw new Error("Reviewed customer update unavailable");
  const { target, evidence } = intent.review,
    state = intent.state;
  const destination =
    target.kind === "x"
      ? `Reply as @${target.brandUsername} to original X post ${target.postId}`
      : `Email from ${target.sender} to ${target.recipient}`;
  const outcome =
    state.kind === "verified"
      ? target.kind === "x"
        ? "Reply read back from X. Author, original post and exact text match."
        : "Provider email record verified. Inbox delivery has not been confirmed."
      : state.kind === "accepted"
        ? "Provider accepted the message. Read-back still needs reconciliation."
        : ["sending", "unknown"].includes(state.kind)
          ? "Delivery outcome is pending or uncertain. Do not resend. Reconcile using the provider record."
          : "Review the exact text and destination before sending.";
  const editable = ["prepared", "approved"].includes(state.kind);
  const attributes = `data-id="${esc(delivery._id)}" data-review-hash="${esc(intent.reviewHash)}"`;
  openDrawer(
    "Review customer preview update",
    `<div id="customer-update-review" data-id="${esc(delivery._id)}"><p>${esc(destination)}</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(delivery.body)}</pre><p>Approved preview commit <span class="mono">${esc(evidence.deployment.commit)}</span></p><p>${esc(outcome)}</p>${!editable && state.kind !== "verified" ? '<label for="customer-update-provider-id">Provider post or message ID, if the saved receipt is missing</label><input class="inp" id="customer-update-provider-id" maxlength="200">' : ""}${"providerId" in state ? `<p>Provider receipt ${esc(state.providerId)}</p>` : ""}<p id="customer-update-error" role="alert">${esc(notice)}</p></div>`,
    `<button class="btn" data-act="close">Close</button>${editable ? `<button class="btn primary" data-act="sendCustomerUpdate" ${attributes}>Approve and send exact update</button>` : state.kind !== "verified" ? `<button class="btn" data-act="reconcileCustomerUpdate" ${attributes}>Read back provider record</button>` : ""}`,
  );
}
A.prepareCustomerUpdate = async (button) => {
  const report = curCase(),
    caseId = report?._backend,
    scope = S.scopeApp;
  const stored = liveSnapshot?.cases.find((c) => c._id === caseId);
  const run = liveSnapshot?.runs
    .filter((r) => r.issueId === stored?.issueId)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!caseId || !run?.previewAcceptance)
    return toast("Current preview acceptance is required first.", "warn");
  button.disabled = true;
  openDrawer(
    "Prepare customer preview update",
    `<p id="customer-update-loading" data-case-id="${esc(caseId)}">Preparing exact destination and preview evidence…</p>`,
    '<button class="btn" data-act="close">Cancel</button>',
  );
  try {
    const result = await cueAPI("customerUpdatePrepare", {
      caseId,
      runId: run._id,
    });
    if (
      curCase()?._backend !== caseId ||
      S.scopeApp !== scope ||
      $("#customer-update-loading")?.dataset.caseId !== caseId
    )
      return;
    showCustomerUpdate(result.delivery);
  } catch (error) {
    const loading = $("#customer-update-loading");
    if (loading?.dataset.caseId === caseId) loading.textContent = error.message;
  } finally {
    button.disabled = false;
  }
};
A.reviewCustomerUpdate = async (button) => {
  button.disabled = true;
  const reportId = curCase()?._backend,
    scope = S.scopeApp,
    section = S.sec,
    id = button.dataset.id;
  openDrawer(
    "Load customer preview update",
    `<p id="customer-update-loading" data-id="${esc(id)}">Loading saved review…</p>`,
    '<button class="btn" data-act="close">Cancel</button>',
  );
  try {
    const result = await cueAPI("customerUpdateReview", { id });
    if (
      curCase()?._backend === reportId &&
      S.scopeApp === scope &&
      S.sec === section &&
      $("#customer-update-loading")?.dataset.id === id
    )
      showCustomerUpdate(result.delivery);
  } catch (error) {
    toast(error.message, "fail");
  } finally {
    button.disabled = false;
  }
};
async function applyCustomerUpdate(button, reconcile) {
  if (button.disabled) return;
  const id = button.dataset.id,
    reviewHash = button.dataset.reviewHash;
  const displayed = $("#customer-update-review");
  if (displayed?.dataset.id !== id) return;
  const providerId = $("#customer-update-provider-id")?.value.trim();
  button.disabled = true;
  try {
    const result = await cueAPI(
      reconcile ? "customerUpdateReconcile" : "customerUpdateSend",
      { id, reviewHash, ...(providerId ? { providerId } : {}) },
    );
    if ($("#customer-update-review")?.dataset.id === id)
      showCustomerUpdate(result.delivery);
    await loadCue();
  } catch (error) {
    try {
      const result = await cueAPI("customerUpdateReview", { id });
      if ($("#customer-update-review")?.dataset.id === id)
        showCustomerUpdate(result.delivery, error.message);
    } catch {
      const notice = $("#customer-update-error");
      if (notice) notice.textContent = error.message;
    }
  } finally {
    button.disabled = false;
  }
}
A.sendCustomerUpdate = (button) => applyCustomerUpdate(button, false);
A.reconcileCustomerUpdate = (button) => applyCustomerUpdate(button, true);
const conversationBeforeCustomerUpdates = conversation;
conversation = (report) => {
  const content = conversationBeforeCustomerUpdates(report);
  const stored = liveSnapshot?.cases.find((c) => c._id === report._backend);
  const run = liveSnapshot?.runs
    .filter((r) => r.issueId === stored?.issueId)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (
    !stored ||
    !run?.previewAcceptance ||
    !(
      stored.channel === "x" ||
      (stored.channel === "chat" &&
        stored.notificationEmail?.kind === "opted_in")
    )
  )
    return content;
  const latest = liveSnapshot.deliveries
    .filter(
      (d) =>
        d.supportIntent?.review.caseId === stored._id &&
        d.supportIntent.review.runId === run._id,
    )
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  return (
    content +
    `<div style="padding:12px 24px">${latest ? `<button class="btn" data-act="reviewCustomerUpdate" data-id="${esc(latest._id)}">Review preview update · ${esc(latest.supportIntent.state.kind)}</button>` : '<button class="btn" data-act="prepareCustomerUpdate">Prepare preview update for this reporter</button>'}</div>`
  );
};
