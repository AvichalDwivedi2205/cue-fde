/* Live adapter: actual uploads, persistent memories and customer conversations. */
let bloomLoading = false,
  bloomChatSignature = "",
  bloomMemorySignature = "";
const originalCaseCard = caseCardHTML;
caseCardHTML = (from) =>
  originalCaseCard(from)
    .replaceAll("#BLM-2041", S.liveCaseRef || "pending")
    .replace(
      "Photo upload problem",
      esc(S.liveCaseTitle || "Customer support"),
    );
const originalPin = renderPin;
renderPin = () => {
  originalPin();
  $("#casePin").innerHTML = $("#casePin").innerHTML.replaceAll(
    "#BLM-2041",
    S.liveCaseRef || "pending",
  );
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
    await bloomAPI("message", {
      text: m.text || "Please help with the attached upload error.",
      attachment: m.attach?.url,
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
        signature = JSON.stringify(c.messages);
      S.flow = "waiting";
      S.liveCaseRef = "#BLM-" + c.case._id.slice(-6).toUpperCase();
      S.liveCaseTitle = c.case.title;
      setStage(
        c.issue?.status === "resolved"
          ? 4
          : c.issue?.status === "investigating" ||
              c.issue?.status === "awaiting_approval"
            ? 2
            : 1,
      );
      if (signature !== bloomChatSignature) {
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
            status: "delivered",
            kind:
              c.issue?.status === "resolved" &&
              m.role === "cue" &&
              m.body.startsWith("Good news")
                ? "fix"
                : undefined,
          });
        addMsg({ who: "bot", kind: "case" });
        renderSugs();
        renderPin();
      }
    }
    setOnline(true);
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
