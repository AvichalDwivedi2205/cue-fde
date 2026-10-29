/* Live adapter: actual uploads, persistent memories and customer conversations. */
let bloomLoading = false,
  bloomFeedbackBusy = false,
  bloomChatSignature = "",
  bloomMemorySignature = "";
const bloomOriginalMessageElement = msgEl;
msgEl = (message) => {
  const element = bloomOriginalMessageElement(message);
  if (message.serverId) element.dataset.messageId = message.serverId;
  for (const source of (message.citations || []).slice(0, 4)) {
    const card = document.createElement("details"),
      title = document.createElement("summary"),
      excerpt = document.createElement("p");
    card.className = "bloom-source-card";
    title.textContent =
      source.title +
      (source.page
        ? " · page " + source.page
        : source.heading
          ? " · " + source.heading
          : "");
    excerpt.textContent = source.excerpt;
    card.append(title, excerpt);
    element.append(card);
  }
  if (
    message.who === "bot" &&
    message.serverId &&
    (message.outcome || message.canFeedback)
  ) {
    const feedback = document.createElement("div");
    feedback.className = "bloom-answer-feedback";
    if (message.outcome) {
      feedback.textContent =
        message.outcome === "solved"
          ? "You marked this answer solved"
          : "The team has your request for help";
    } else {
      const label = document.createElement("small");
      label.textContent = "Did this solve your problem?";
      feedback.append(label);
      for (const [outcome, title] of [
        ["solved", "Solved"],
        ["needs_help", "Still need help"],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = title;
        button.onclick = async () => {
          if (bloomFeedbackBusy) return;
          bloomFeedbackBusy = true;
          feedback
            .querySelectorAll("button")
            .forEach((b) => (b.disabled = true));
          try {
            await bloomAPI("feedback", {
              caseId: message.caseId,
              messageId: message.serverId,
              outcome,
            });
            bloomChatSignature = "";
            await loadBloom();
            toast(
              outcome === "solved"
                ? "Thanks. Your feedback is saved."
                : "The team can review your original question and reply here.",
            );
          } catch (e) {
            feedback
              .querySelectorAll("button")
              .forEach((b) => (b.disabled = false));
            toast(e.message, { icon: "alert" });
          } finally {
            bloomFeedbackBusy = false;
          }
        };
        feedback.append(button);
      }
    }
    element.append(feedback);
  }
  return element;
};
const bloomSourceStyle = document.createElement("style");
bloomSourceStyle.textContent =
  ".bloom-source-card{background:#f0f6f0;border:1px solid #c7daca;border-radius:10px;padding:9px 11px;max-width:100%;color:#24553a;font-size:12px;line-height:1.5}.bloom-source-card summary{cursor:pointer;font-weight:600}.bloom-source-card p{margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;color:#294c38}.bloom-answer-feedback{display:flex;flex-wrap:wrap;gap:6px;max-width:100%;font-size:11px;color:#294c38;line-height:1.5}.bloom-answer-feedback small{flex-basis:100%}.bloom-answer-feedback button{padding:6px 9px;border:1px solid #b4cbb8;border-radius:8px;background:#fff;color:#24553a;font:inherit;cursor:pointer}.bloom-answer-feedback button:hover:not(:disabled){background:#e4eee6}.bloom-answer-feedback button:disabled{opacity:.5;cursor:default}";
document.head.append(bloomSourceStyle);
const bloomMemorySearchReady = new Promise((resolve) => {
  const script = document.createElement("script");
  script.src = "/memory-search.js";
  script.onload = resolve;
  script.onerror = resolve;
  document.head.append(script);
});
const originalRenderJournal = renderJournal;
const originalRenderGreet = renderGreet;
renderGreet = () => {
  originalRenderGreet();
  $("#greetH").textContent = greeting() + ".";
};
const journalAvatar = document.querySelector(".topbar .avatar");
if (journalAvatar) {
  journalAvatar.textContent = "B";
  journalAvatar.title = "Your Bloom journal";
  journalAvatar.setAttribute("aria-label", "Your Bloom journal");
}
const journalClosing = document.querySelector("#closing p");
if (journalClosing)
  journalClosing.textContent =
    "Your journal stays with this browser. Keep the small moments, one page at a time.";
const captionSearchDescription = document.querySelector(
  '#how [data-beat="2"] p',
);
if (captionSearchDescription)
  captionSearchDescription.textContent =
    "Find memories using words in their captions. Your journal grows quietly, one page at a time.";
renderJournal = (stagger) => {
  const query = S.query.trim();
  if (!query || S.journalState === "loading" || S.journalState === "error") {
    originalRenderJournal(stagger);
    return;
  }

  const memories = S.memories;
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches =
    window.BloomMemorySearch?.filterMemoriesByCaption(memories, query) ??
    memories.filter((memory) => {
      const caption = memory.caption?.toLowerCase();
      return (
        caption !== undefined && terms.every((term) => caption.includes(term))
      );
    });

  if (!matches.length) {
    renderGreet();
    $("#jbody").innerHTML =
      `<div class="state" role="status"><div class="state-ic">${icon("search")}</div><h3>No results found</h3><p>Try another caption keyword.</p><button class="btn btn-ghost" id="clearQ">Clear search</button></div>`;
    $("#clearQ").onclick = clearSearch;
    return;
  }

  const searchQuery = S.query;
  S.memories = matches;
  S.query = "";
  try {
    originalRenderJournal(stagger);
  } finally {
    S.memories = memories;
    S.query = searchQuery;
  }
  renderGreet();
};
caseCardHTML = () => {
  const p = S.liveProgress;
  if (!p) return "";
  return `<div class="case-card"><div class="cc-h"><span>Case ${esc(S.liveCaseRef)}</span><em>${esc(p.label)}</em></div><p class="cc-sub">${esc(S.liveCaseTitle)}</p><ol class="cc-steps">${p.steps.map((step) => `<li class="${step.state === "complete" ? "done" : step.state === "current" ? "active" : "todo"}" aria-current="${step.state === "current" ? "step" : "false"}"><span class="cc-dot">${step.state === "complete" ? drawCheck() : ""}</span><div><b>${esc(step.title)}</b>${step.state === "current" ? `<small>${esc(p.detail)}</small>` : ""}</div></li>`).join("")}</ol></div>`;
};
renderPin = () => {
  const pin = $("#casePin");
  pin.hidden = !S.liveProgress;
  if (S.liveProgress)
    pin.innerHTML = `<span class="pd"></span> Case ${esc(S.liveCaseRef)} · ${esc(S.liveProgress.label)}`;
};
const originalMsg = msgEl;
msgEl = (m) => originalMsg(m.kind === "fix" ? { ...m, text: esc(m.text) } : m);
async function bloomAPI(action, data = {}) {
  const r = await fetch("/api/bloom", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || "Request failed");
  return result;
}
acceptFile = (f) => {
  S.dzMsg = "";
  if (!OK_TYPES.includes(f.type)) {
    S.dzMsg = "That file type isn't supported. Use JPG, PNG or WebP.";
    renderDZ();
    return;
  }
  if (f.size > 5 * MB) {
    S.dzMsg = "This photo is larger than 5 MB.";
    renderDZ();
    return;
  }
  const file = f.file || f,
    url = f.url || URL.createObjectURL(file);
  S.upload = {
    name: f.name,
    size: f.size,
    type: f.type,
    url,
    file,
    status: "uploading",
    progress: 0,
    w: 4,
    h: 3,
  };
  S.lastFile = { ...S.upload };
  startUpload();
};
startUpload = () => {
  const u = S.upload;
  if (!u) return;
  const file = u.file || S.lastFile?.file;
  if (!file) {
    u.status = "error";
    S.dzMsg = "Choose the photo again.";
    renderDZ();
    return;
  }
  u.status = "uploading";
  u.progress = 0;
  S.dzMsg = "";
  renderDZ();
  updateSave();
  const xhr = new XMLHttpRequest(),
    form = new FormData();
  form.append("file", file);
  xhr.open("POST", "/api/bloom");
  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      u.progress = Math.round((e.loaded / e.total) * 100);
      const b = $("#upBar"),
        p = $("#upPct");
      if (b) b.style.width = u.progress + "%";
      if (p) p.textContent = u.progress + "%";
    }
  };
  const failed = () => {
    u.status = "error";
    S.lastError = {
      name: u.name,
      size: u.size,
      url: u.url,
      at: Date.now(),
      shot: null,
    };
    makeErrorShot(S.lastError);
    renderDZ();
    updateSave();
  };
  xhr.onerror = failed;
  xhr.onload = () => {
    if (xhr.status !== 201) {
      failed();
      return;
    }
    try {
      const result = JSON.parse(xhr.responseText);
      u.status = "done";
      u.progress = 100;
      u.fileId = result.fileId;
      u.w = result.w;
      u.h = result.h;
      renderDZ();
      updateSave();
    } catch {
      failed();
    }
  };
  xhr.send(form);
};
saveMemory = async (e) => {
  e.preventDefault();
  const u = S.upload,
    title = $("#fTitle").value.trim();
  if (!u || u.status !== "done" || !title) return;
  const button = $("#saveBtn");
  button.disabled = true;
  button.textContent = "Saving…";
  try {
    const { id } = await bloomAPI("save", {
      memory: {
        title,
        caption: $("#fCaption").value.trim(),
        date: $("#fDate").value || todayISO(),
        w: u.w,
        h: u.h,
        fileId: u.fileId,
      },
    });
    S.freshId = id;
    resetForm();
    location.hash = "#/journal";
    await loadBloom();
    toast("Memory saved");
  } catch (e) {
    toast(e.message, { icon: "alert" });
    updateSave();
  }
};
bindEdit = () => {
  const form = $("#editForm");
  if (!form) return;
  $("#eTitle").focus();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const m = S.memories.find((m) => m.id === S.detailId);
    if (!m) return;
    try {
      await bloomAPI("save", {
        memory: {
          id: m.id,
          title: $("#eTitle").value.trim(),
          caption: $("#eCaption").value.trim(),
          date: $("#eDate").value,
          w: m.w,
          h: m.h,
        },
      });
      S.editing = false;
      await loadBloom();
      renderDetail(S.memories.find((x) => x.id === m.id));
      toast("Changes saved");
    } catch (e) {
      toast(e.message, { icon: "alert" });
    }
  });
};
deleteMemory = async (id) => {
  try {
    await bloomAPI("delete", { id });
    closeDetail(true);
    location.hash = "#/journal";
    await loadBloom();
    toast("Memory deleted", {
      icon: "trash",
      action: "Undo",
      duration: 5500,
      onAction: async () => {
        await bloomAPI("delete", { id, undo: true });
        await loadBloom();
        toast("Memory restored");
      },
    });
  } catch (e) {
    toast(e.message, { icon: "alert" });
  }
};
deliver = async (m) => {
  try {
    let attachment = m.attach?.url;
    if (attachment?.startsWith("blob:")) {
      const image = await (await fetch(attachment)).blob();
      if (!OK_TYPES.includes(image.type) || image.size > 2 * MB)
        throw new Error("Use a JPG, PNG or WebP screenshot under 2 MB.");
      attachment = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () =>
          reject(new Error("Choose the screenshot again."));
        reader.readAsDataURL(image);
      });
    }
    await bloomAPI("message", {
      text: m.text || "Please help with the attached upload error.",
      attachment,
    });
    m.status = "delivered";
    updateMeta(m);
    await loadBloom();
  } catch (e) {
    m.status = "failed";
    updateMeta(m);
    toast(e.message, { icon: "alert" });
  }
};
afterDelivered = () => {};
restoreHistory = () => {
  addMsg({ who: "bot", text: "Hi! What can we help you with?" });
  renderSugs();
  renderPin();
};
onBus = () => {};
restoreHistory = () => {};
renderDemo = () => {};
async function loadBloom() {
  if (bloomLoading) return;
  bloomLoading = true;
  try {
    await bloomMemorySearchReady;
    const r = await fetch("/api/bloom", { cache: "no-store" }),
      data = await r.json();
    if (!r.ok) throw new Error(data.error);
    const memories = data.memories.filter((m) => !m.seed);
    const memorySignature = JSON.stringify(memories);
    if (memorySignature !== bloomMemorySignature) {
      bloomMemorySignature = memorySignature;
      S.memories = memories;
      S.journalState = memories.length ? "populated" : "empty";
      renderJournal(false);
      renderGreet();
    }
    if (data.health) S.limitMB = data.health.maxUploadBytes / MB;
    if (data.conversation) {
      const c = data.conversation,
        signature = JSON.stringify([
          c.case,
          c.messages,
          c.attachments,
          c.progress,
        ]),
        latestAnswer = c.messages
          .filter((m) => ["cue", "staff"].includes(m.role))
          .at(-1)?.id;
      S.flow = "waiting";
      S.liveCaseRef = "#BLM-" + c.case._id.slice(-6).toUpperCase();
      S.liveCaseTitle = c.case.title;
      S.liveProgress = c.progress;
      if (
        signature !== bloomChatSignature &&
        !S.chat.some((m) => m.status === "sending")
      ) {
        bloomChatSignature = signature;
        $("#chatLog").innerHTML = "";
        S.chat = [];
        for (const m of c.messages.filter(
          (m) =>
            m.role !== "note" &&
            m.role !== "draft" &&
            !(m.role === "cue" && m.body.startsWith("Demo reset:")),
        ))
          addMsg({
            who: m.role === "customer" ? "me" : "bot",
            text: m.body,
            serverId: m.id,
            caseId: c.case._id,
            citations: m.citations,
            outcome: m.outcome,
            canFeedback: m.id === latestAnswer,
            status: "delivered",
            kind:
              c.case.status === "resolved" &&
              m.role === "cue" &&
              m.body.startsWith("Good news")
                ? "fix"
                : undefined,
          });
        for (const a of c.attachments || [])
          if (a.url)
            addMsg({
              who: "me",
              text: "Screenshot attached",
              attach: { url: a.url, label: a.name },
              status: "delivered",
            });
        addMsg({ who: "bot", kind: "case" });
        renderSugs();
        renderPin();
      }
    }
    setOnline(data.supportAvailable !== false);
  } catch (e) {
    if (!bloomMemorySignature) {
      S.journalState = "error";
      renderJournal(false);
    }
    setOnline(false);
    console.error(e);
  } finally {
    bloomLoading = false;
  }
}
S.caseStage = 0;
S.flow = "idle";
S.fixShown = false;
S.journalState = "loading";
renderDemo();
loadBloom();
setInterval(() => {
  if (!document.hidden) loadBloom();
}, 1800);
const voiceButton = document.createElement("button");
voiceButton.type = "button";
voiceButton.className = "btn";
voiceButton.textContent = "Talk to Cue";
voiceButton.onclick = () => window.CueVoice.open({}, loadBloom);
document.querySelector(".chat-h").append(voiceButton);
