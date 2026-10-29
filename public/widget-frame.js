(() => {
  const query = new URLSearchParams(location.search),
    app = query.get("app"),
    origin = query.get("origin"),
    preview = query.get("preview") === "1";
  const messages = document.getElementById("messages"),
    form = document.getElementById("composer"),
    input = document.getElementById("message"),
    status = document.getElementById("status"),
    submit = document.getElementById("send"),
    file = document.getElementById("attachment");
  let session,
    context = {},
    busy = false,
    initializing = false;
  async function call(action, extra = {}) {
    const response = await fetch("/api/widget", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action,
        app,
        origin,
        token: session,
        preview,
        ...extra,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      const e = new Error(data.error || "Request failed");
      e.code = response.status;
      throw e;
    }
    return data;
  }
  async function read() {
    if (!session || busy) return;
    const data = await call("read");
    document.getElementById("brand").textContent = data.name + " support";
    document.getElementById("voice").hidden = data.settings?.voice === false;
    file.closest("label").hidden = data.settings?.screenshots === false;
    const nearBottom =
      messages.scrollHeight - messages.scrollTop - messages.clientHeight < 80;
    messages.replaceChildren();
    const latestAnswer = data.messages
      .filter((m) => m.role !== "customer")
      .at(-1)?.id;
    for (const m of data.messages) {
      const box = document.createElement("div"),
        author = document.createElement("small"),
        body = document.createElement("p");
      box.className = m.role === "customer" ? "bubble customer" : "bubble";
      author.textContent = m.author;
      body.textContent = m.body;
      box.append(author, body);
      for (const source of m.citations || []) {
        const detail = document.createElement("details"),
          label = document.createElement("summary"),
          excerpt = document.createElement("p");
        detail.className = "source-card";
        label.textContent =
          source.title +
          (source.page ? " · page " + source.page : " · " + source.heading);
        excerpt.textContent = source.excerpt;
        detail.append(label, excerpt);
        box.append(detail);
      }
      if (
        m.role !== "customer" &&
        data.case &&
        (m.outcome || m.id === latestAnswer)
      ) {
        const feedback = document.createElement("div");
        feedback.className = "answer-feedback";
        if (m.outcome) {
          feedback.textContent =
            m.outcome === "solved"
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
              if (busy || !session) return;
              busy = true;
              submit.disabled = true;
              feedback
                .querySelectorAll("button")
                .forEach((b) => (b.disabled = true));
              try {
                await call("feedback", {
                  caseId: data.case.id,
                  messageId: m.id,
                  outcome,
                });
                busy = false;
                await read();
                status.textContent =
                  outcome === "solved"
                    ? "Thanks. Your answer feedback is saved."
                    : "The team can review your original question and reply here.";
              } catch (e) {
                status.textContent = e.message;
                feedback
                  .querySelectorAll("button")
                  .forEach((b) => (b.disabled = false));
              } finally {
                busy = false;
                submit.disabled = !session;
              }
            };
            feedback.append(button);
          }
        }
        box.append(feedback);
      }
      messages.append(box);
    }
    if (!data.messages.length) {
      const p = document.createElement("p");
      p.className = "welcome";
      p.textContent = "Tell us what happened. Add a screenshot if it helps.";
      messages.append(p);
    }
    status.textContent = data.case
      ? data.case.status === "resolved"
        ? "Resolved · reply here if you still need help"
        : "Your conversation is saved"
      : "Support powered by Cue";
    if (nearBottom) messages.scrollTop = messages.scrollHeight;
  }
  async function init(data) {
    if (initializing) return;
    initializing = true;
    context = data;
    session = data.token || undefined;
    try {
      if (session)
        try {
          await read();
          return;
        } catch (e) {
          if (e.code !== 401) throw e;
        }
      const response = await call("session");
      session = response.token;
      document.getElementById("brand").textContent = response.name + " support";
      parent.postMessage({ type: "cue:session", token: session }, origin);
      await read();
    } catch (e) {
      status.textContent = e.message;
    } finally {
      initializing = false;
      submit.disabled = !session;
    }
  }
  window.addEventListener("message", (e) => {
    if (
      e.source !== parent ||
      e.origin !== origin ||
      e.data?.type !== "cue:init" ||
      e.data.app !== app ||
      e.data.origin !== origin
    )
      return;
    if (!session) void init(e.data);
  });
  document.getElementById("close").onclick = () =>
    parent.postMessage({ type: "cue:close" }, origin);
  document.getElementById("voice").onclick = () => {
    if (!session) return;
    window.CueVoice.open(
      { app, origin, token: session, name: context.name, preview },
      () => void read(),
    );
  };
  document.getElementById("handoff").onclick = async () => {
    if (busy || !session) return;
    busy = true;
    submit.disabled = true;
    try {
      await call("message", {
        text: "I’d like to talk to a person.",
        name: context.name,
        page: context.page,
        handoff: true,
      });
      busy = false;
      await read();
      messages.scrollTop = messages.scrollHeight;
    } catch (e) {
      status.textContent = e.message;
    } finally {
      busy = false;
      submit.disabled = !session;
    }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (busy || !session || !input.value.trim()) return;
    busy = true;
    submit.disabled = true;
    status.textContent = "Saving…";
    try {
      let attachment;
      if (file.files[0]) {
        if (file.files[0].size > 3 * 1024 * 1024)
          throw new Error("Screenshot must be under 3 MB");
        attachment = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error("Could not read screenshot"));
          reader.readAsDataURL(file.files[0]);
        });
      }
      await call("message", {
        text: input.value,
        name: context.name,
        page: context.page,
        attachment,
      });
      input.value = "";
      file.value = "";
      busy = false;
      await read();
      messages.scrollTop = messages.scrollHeight;
    } catch (err) {
      status.textContent = err.message;
    } finally {
      busy = false;
      submit.disabled = !session;
    }
  };
  setInterval(() => {
    if (!document.hidden && session)
      void read().catch((e) => {
        status.textContent = e.message;
      });
  }, 5000);
  parent.postMessage({ type: "cue:ready" }, origin);
})();
