"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, EmptyState, Icon, Notice } from "../components/ui";
import { WidgetPreview } from "./widget-preview";
import { CompanyContextPanel } from "./company-context-panel";
import { KnowledgeGapsPanel } from "./knowledge-gaps-panel";
import { TeachCue } from "./teach-cue";
type Source = {
  _id: string;
  title: string;
  kind: string;
  status: string;
  visibility: string;
  revision: number;
  activeVersionId?: string;
  latestVersionId?: string;
  indexStatus: string;
  error?: string;
};
type Version = {
  title: string;
  text: string;
  question?: string;
  answer?: string;
  alternatives?: string[];
  visibility: string;
  url?: string;
  fileName?: string;
};
type Passage = { text: string; heading: string; page?: number };
type Snapshot = {
  apps: { id: string; name: string }[];
  sources: Source[];
  canEdit: boolean;
  canPublish: boolean;
  model: string;
  litellm: boolean;
};
type TestResult = {
  text: string;
  status: string;
  provider: string;
  model: string;
  retrieval: string;
  brandVersion?: number;
  inputTokens: number;
  outputTokens: number;
  citations: {
    title: string;
    heading: string;
    page?: number;
    excerpt: string;
  }[];
  passages: {
    title: string;
    heading: string;
    page?: number;
    excerpt: string;
  }[];
};
const empty = {
  title: "",
  text: "",
  question: "",
  answer: "",
  alternatives: "",
  visibility: "customer",
  url: "",
};
export function KnowledgeClient() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [app, setApp] = useState(""),
    [selected, setSelected] = useState(""),
    [kind, setKind] = useState("faq");
  const [form, setForm] = useState(empty),
    [editorRevision, setEditorRevision] = useState(0),
    [dirty, setDirty] = useState(false),
    [passages, setPassages] = useState<Passage[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const [file, setFile] = useState<File | null>(null),
    [question, setQuestion] = useState(""),
    [testModel, setTestModel] = useState(""),
    [testMode, setTestMode] = useState("hybrid"),
    [answer, setAnswer] = useState<TestResult | null>(null);
  const serial = useRef(0),
    detailSerial = useRef(0),
    questionSeed = useRef("");
  const invalidateLoad = useCallback(() => {
    serial.current++;
  }, []);
  const load = useCallback(async (id: string) => {
    const current = ++serial.current;
    const response = await fetch(
      "/api/knowledge" + (id ? "?app=" + encodeURIComponent(id) : ""),
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (current === serial.current) {
      setSnapshot(data);
      if (!id && data.apps[0]) {
        let preferred = "";
        try {
          preferred =
            new URLSearchParams(location.search).get("app") ||
            sessionStorage.getItem("cue-agent-app") ||
            "";
        } catch {}
        setApp(
          data.apps.find((a: { id: string }) => a.id === preferred)?.id ||
            data.apps[0].id,
        );
      }
    }
  }, []);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) void load(app).catch((e) => setNotice(e.message));
    });
    const timer = setInterval(() => void load(app).catch(() => {}), 5000);
    return () => {
      active = false;
      invalidateLoad();
      clearInterval(timer);
    };
  }, [app, load, invalidateLoad]);
  const source = snapshot?.sources.find((s) => s._id === selected);
  async function select(id: string) {
    const current = ++detailSerial.current;
    setNotice("");
    setSelected(id);
    setPassages([]);
    setForm(empty);
    setEditorRevision(0);
    const response = await fetch(
      `/api/knowledge?app=${encodeURIComponent(app)}&source=${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (current !== detailSerial.current) return;
    const v = data.version as Version;
    setEditorRevision(data.source.revision);
    setDirty(false);
    setKind(data.source.kind);
    setForm({
      title: v.title,
      text: v.text,
      question: v.question || "",
      answer: v.answer || "",
      alternatives: (v.alternatives || []).join("\n"),
      visibility: v.visibility,
      url: v.url || "",
    });
    setPassages(data.passages);
  }
  function add(type: string) {
    detailSerial.current++;
    setSelected("");
    setKind(type);
    setForm({ ...empty, visibility: type === "faq" ? "customer" : "internal" });
    setPassages([]);
    setFile(null);
    setDirty(false);
    setNotice("");
  }
  async function call(body: unknown) {
    const response = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    return data;
  }
  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await operation();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (kind === "file" && !selected) {
      if (!file) throw new Error("Choose a document first");
      const body = new FormData();
      body.set("file", file);
      body.set("appId", app);
      body.set("visibility", form.visibility);
      body.set("title", form.title || file.name);
      const response = await fetch("/api/knowledge", { method: "POST", body }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      await load(app);
      await select(data.sourceId);
      history.replaceState(null, "", "#source/" + data.sourceId);
      setNotice("Document extracted. Review the draft before publishing.");
      return;
    }
    const data = await call({
      action: "save",
      appId: app,
      ...(selected
        ? { sourceId: selected, expectedRevision: editorRevision }
        : {}),
      kind,
      title: form.title || form.question.slice(0, 160),
      visibility: form.visibility,
      ...(kind === "faq"
        ? {
            question: form.question,
            answer: form.answer,
            alternatives: form.alternatives
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : { text: form.text }),
      ...(["url", "github"].includes(kind) && !selected
        ? { url: form.url }
        : {}),
    });
    await load(app);
    await select(data.sourceId);
    history.replaceState(null, "", "#source/" + data.sourceId);
    setNotice("Draft saved. Publish when the extracted content is ready.");
  }
  async function publish() {
    await call({
      action: "publish",
      appId: app,
      sourceId: selected,
      expectedRevision: editorRevision,
    });
    await load(app);
    setNotice(
      "Publishing queued. The previous published revision stays active until indexing finishes.",
    );
  }
  const field = (name: keyof typeof empty) => ({
    value: form[name],
    onChange: (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) => {
      setDirty(true);
      setForm((old) => ({ ...old, [name]: e.target.value }));
    },
  });
  const [view, setView] = useState("sources"),
    [query, setQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState("all"),
    [visibilityFilter, setVisibilityFilter] = useState("all"),
    [menu, setMenu] = useState(false),
    [withdrawConfirm, setWithdrawConfirm] = useState(false),
    [audience, setAudience] = useState("customer"),
    [compare, setCompare] = useState(false),
    [comparisonModel, setComparisonModel] = useState(""),
    [baseline, setBaseline] = useState<TestResult | null>(null),
    [comparisonError, setComparisonError] = useState("");
  useEffect(() => {
    const sync = () => {
      const parts = location.hash.slice(1).split("/");
      if (parts[0] === "source" && parts[1] && app) {
        setView("editor");
        void run(() => select(decodeURIComponent(parts[1])));
      } else if (parts[0] === "new") {
        add(parts[1] || "faq");
        if (questionSeed.current) {
          setForm({ ...empty, question: questionSeed.current });
          setDirty(true);
          questionSeed.current = "";
        }
        setView("editor");
      } else
        setView(
          ["test", "widget", "coverage", "brand", "gaps"].includes(parts[0])
            ? parts[0]
            : "sources",
        );
    };
    queueMicrotask(sync);
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
    // Draft state changes must not re-run navigation and discard edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app]);
  useEffect(() => {
    const protect = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  function navigate(hash: string) {
    if (dirty && !window.confirm("Leave without saving your changes?")) return;
    setDirty(false);
    setWithdrawConfirm(false);
    setMenu(false);
    location.hash = hash;
  }
  const kinds: Record<string, [string, string, string]> = {
    faq: ["FAQ", "help", "A question and its approved answer."],
    text: [
      "Write or paste",
      "note",
      "Policies, docs or product context as plain text.",
    ],
    file: ["Upload document", "file", "TXT, Markdown, PDF or DOCX."],
    url: ["Website", "globe", "Import a public help page."],
    github: [
      "GitHub document",
      "github",
      "Import a public repository document.",
    ],
  };
  const filtered =
    snapshot?.sources.filter(
      (s) =>
        (statusFilter === "all" || s.status === statusFilter) &&
        (visibilityFilter === "all" || s.visibility === visibilityFilter) &&
        `${s.title} ${s.kind}`.toLowerCase().includes(query.toLowerCase()),
    ) || [];
  const canEdit = !!snapshot?.canEdit && !busy;
  const input = (
    name: keyof typeof empty,
    label: string,
    placeholder = "",
    maxLength = 200000,
  ) => (
    <label className="ui-field">
      {label}
      <input
        className="ui-input"
        {...field(name)}
        placeholder={placeholder}
        disabled={!canEdit}
        maxLength={maxLength}
      />
    </label>
  );
  const textarea = (
    name: keyof typeof empty,
    label: string,
    placeholder = "",
    rows = 5,
    maxLength = 200000,
  ) => (
    <label className="ui-field">
      {label}
      <textarea
        className="ui-input resize-y font-normal"
        {...field(name)}
        rows={rows}
        placeholder={placeholder}
        disabled={!canEdit}
        maxLength={maxLength}
      />
    </label>
  );
  const preview =
    dirty || !selected
      ? kind === "faq"
        ? [{ heading: form.question || "Question", text: form.answer }]
        : kind === "text"
          ? form.text
              .split(/\n\s*\n/)
              .filter(Boolean)
              .map((text) => ({ heading: form.title || "Content", text }))
          : []
      : passages;
  const renderAnswer = (answer: TestResult, label: string) => (
    <div className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{label}</h2>
        <Badge tone={answer.status === "answered" ? "green" : "amber"}>
          {answer.status.replaceAll("_", " ")}
        </Badge>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed">{answer.text}</p>
      <div className="mt-4 border-t border-cue-line pt-3 font-mono text-[10px] text-cue-subtle">
        {answer.provider === "approved-faq"
          ? "Approved FAQ"
          : answer.model === "none"
            ? "Rule-based reply"
            : answer.model}{" "}
        · {answer.retrieval} · {answer.inputTokens + answer.outputTokens} tokens
        {answer.brandVersion !== undefined
          ? ` · brand v${answer.brandVersion}`
          : ""}
      </div>
      {answer.status !== "answered" && (
        <Button
          className="mt-4"
          onClick={() => {
            questionSeed.current = question;
            navigate("new/faq");
          }}
          disabled={!canEdit}
        >
          <Icon name="plus" size={14} />
          Add an FAQ for this question
        </Button>
      )}
      <h3 className="mt-6 mb-3 flex items-center gap-2 text-xs font-semibold">
        <Icon name="book" size={14} />
        Retrieved passages <Badge>{answer.passages.length}</Badge>
      </h3>
      {answer.passages.length ? (
        answer.passages.map((p, i) => (
          <article
            key={i}
            className={`mb-3 rounded-lg border p-3 ${answer.citations.some((c) => c.excerpt === p.excerpt && c.title === p.title) ? "border-cue-green/30 bg-cue-green-soft/20" : "border-cue-line"}`}
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <b className="text-xs font-medium">{p.title}</b>
              <span className="text-[10px] text-cue-subtle">
                {p.heading}
                {p.page ? ` · page ${p.page}` : ""}
              </span>
              <Badge
                tone={
                  answer.citations.some(
                    (c) => c.excerpt === p.excerpt && c.title === p.title,
                  )
                    ? "green"
                    : "neutral"
                }
              >
                {answer.citations.some(
                  (c) => c.excerpt === p.excerpt && c.title === p.title,
                )
                  ? "Cited"
                  : "Retrieved"}
              </Badge>
            </div>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-cue-muted">
              {p.excerpt}
            </p>
          </article>
        ))
      ) : (
        <p className="text-xs text-cue-subtle">
          No supporting published passages were found.
        </p>
      )}
    </div>
  );
  return (
    <main className="ui-page">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">
            Knowledge
          </h1>
          <p className="mt-1 text-cue-muted">
            Give Cue the facts it needs. Published sources ground answers for
            your customers and team.
          </p>
        </div>
        <label className="ui-field">
          Application
          <select
            aria-label="Application"
            value={app}
            className="ui-input min-w-40"
            disabled={busy}
            onChange={(e) => {
              if (
                dirty &&
                !window.confirm("Leave without saving your changes?")
              )
                return;
              setDirty(false);
              setSnapshot(null);
              setApp(e.target.value);
              try {
                sessionStorage.setItem("cue-agent-app", e.target.value);
              } catch {}
              add("faq");
              setAnswer(null);
              setBaseline(null);
              setComparisonError("");
              location.hash = "sources";
            }}
          >
            {snapshot?.apps.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <nav className="ui-tabs" aria-label="Knowledge views">
        {[
          ["sources", "Sources", "book"],
          ["gaps", "Knowledge gaps", "chat"],
          ["coverage", "Coverage", "gauge"],
          ["brand", "Brand voice", "sparkle"],
          ["test", "Test answers", "sparkle"],
          ["widget", "Customer widget", "chat"],
        ].map(([k, label, icon]) => (
          <a
            key={k}
            href={`#${k}`}
            className={`flex items-center gap-1.5 ${(view === "editor" ? "sources" : view) === k ? "active" : ""}`}
            onClick={(e) => {
              e.preventDefault();
              navigate(k);
            }}
          >
            <Icon name={icon} size={14} />
            {label}
            {k === "sources" && snapshot && (
              <Badge>{snapshot.sources.length}</Badge>
            )}
          </a>
        ))}
      </nav>
      {notice && <Notice>{notice}</Notice>}
      {snapshot && app && view === "gaps" && <KnowledgeGapsPanel key={app} appId={app} onDirty={setDirty} />}
      {snapshot && ["coverage", "brand"].includes(view) && (
        <CompanyContextPanel
          key={app + view}
          kind={view === "brand" ? "brand" : "coverage"}
          appId={app}
          onDirty={setDirty}
        />
      )}
      {!snapshot && (
        <div className="ui-card">
          <EmptyState
            title={
              notice ? "Couldn’t load knowledge" : "Loading company knowledge…"
            }
            action={
              notice && (
                <Button onClick={() => void run(() => load(app))}>Retry</Button>
              )
            }
          >
            Your sources are scoped to the selected application.
          </EmptyState>
        </div>
      )}
      {snapshot && !snapshot.apps.length && (
        <div className="ui-card">
          <EmptyState
            title="Connect your application first"
            action={
              <a className="ui-button ui-primary" href="/setup#widget">
                Register an application
              </a>
            }
          >
            Register its name and allowed website origins, then add its
            knowledge.
          </EmptyState>
        </div>
      )}
      {snapshot && app && view === "sources" && (
        <>
          <TeachCue
            key={app}
            appId={app}
            disabled={!canEdit}
            onCreated={async (sourceId) => {
              await load(app);
              await select(sourceId);
              history.replaceState(null, "", "#source/" + sourceId);
              setView("editor");
              setNotice(
                "Draft saved. Review its audience and content, then publish.",
              );
            }}
          />
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <label className="relative min-w-44 flex-1">
              <Icon
                name="search"
                className="absolute top-2.5 left-3 text-cue-subtle"
                size={14}
              />
              <input
                className="ui-input pl-9"
                aria-label="Search sources"
                placeholder="Search sources…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              className="ui-input w-auto"
              aria-label="Source status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {["all", "published", "draft", "withdrawn"].map((v) => (
                <option key={v} value={v}>
                  {v === "all"
                    ? "All statuses"
                    : v[0].toUpperCase() + v.slice(1)}
                </option>
              ))}
            </select>
            <select
              className="ui-input w-auto"
              aria-label="Source visibility"
              value={visibilityFilter}
              onChange={(e) => setVisibilityFilter(e.target.value)}
            >
              <option value="all">All visibility</option>
              <option value="customer">Customer-facing</option>
              <option value="internal">Internal team</option>
            </select>
            <div className="relative">
              <Button
                variant="primary"
                disabled={!canEdit}
                aria-expanded={menu}
                onClick={() => setMenu(!menu)}
              >
                <Icon name="plus" size={14} />
                Add source
              </Button>
              {menu && (
                <div className="absolute top-10 right-0 z-20 w-64 rounded-lg border border-cue-line bg-cue-panel p-1.5 shadow-lg">
                  {Object.entries(kinds).map(
                    ([k, [label, icon, description]]) => (
                      <button
                        key={k}
                        className="flex w-full gap-3 rounded-md p-2.5 text-left hover:bg-cue-hover"
                        onClick={() => navigate(`new/${k}`)}
                      >
                        <Icon name={icon} className="mt-0.5 text-cue-muted" />
                        <span>
                          <b className="text-xs font-medium">{label}</b>
                          <small className="mt-0.5 block text-[11px] text-cue-subtle">
                            {description}
                          </small>
                        </span>
                      </button>
                    ),
                  )}
                </div>
              )}
            </div>
          </div>
          {!snapshot.canEdit && (
            <Notice>
              Your role can read knowledge. Owner, Product or Support can draft
              sources.
            </Notice>
          )}
          <div className="ui-card">
            {!filtered.length ? (
              <EmptyState
                title={
                  snapshot.sources.length
                    ? "No sources match"
                    : "No company knowledge yet"
                }
                action={
                  canEdit && (
                    <Button
                      variant="primary"
                      onClick={() => navigate("new/faq")}
                    >
                      <Icon name="plus" size={14} />
                      Add an FAQ
                    </Button>
                  )
                }
              >
                {snapshot.sources.length
                  ? "Try another search or filter."
                  : "Start with the questions your customers ask most."}
              </EmptyState>
            ) : (
              <>
                <div className="hidden grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_70px] gap-3 border-b border-cue-line bg-cue-sunken/50 px-5 py-2 font-mono text-[10px] tracking-wide text-cue-subtle uppercase md:grid">
                  <span>Source</span>
                  <span>Type</span>
                  <span>Visibility</span>
                  <span>Status</span>
                  <span>Revision</span>
                </div>
                {filtered.map((s) => (
                  <a
                    key={s._id}
                    href={`#source/${s._id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(`source/${s._id}`);
                    }}
                    className="grid gap-2 border-b border-cue-line px-5 py-4 last:border-0 hover:bg-cue-hover md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr_70px] md:items-center md:gap-3"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="rounded-md bg-cue-sunken p-2 text-cue-muted">
                        <Icon name={kinds[s.kind]?.[1] || "file"} />
                      </span>
                      <span className="truncate font-medium">{s.title}</span>
                    </span>
                    <span className="text-xs text-cue-muted">
                      {kinds[s.kind]?.[0] || s.kind}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-cue-muted">
                      <Icon
                        name={s.visibility === "customer" ? "eye" : "lock"}
                        size={12}
                      />
                      {s.visibility === "customer"
                        ? "Customer-facing"
                        : "Internal"}
                    </span>
                    <span>
                      <Badge
                        tone={
                          s.indexStatus === "failed"
                            ? "red"
                            : s.indexStatus !== "idle" ||
                                (s.status === "published" &&
                                  s.latestVersionId !== s.activeVersionId)
                              ? "amber"
                              : s.status === "published"
                                ? "green"
                                : "neutral"
                        }
                      >
                        {s.indexStatus !== "idle"
                          ? s.indexStatus
                          : s.status === "published" &&
                              s.latestVersionId !== s.activeVersionId
                            ? "Unpublished changes"
                            : s.status}
                      </Badge>
                    </span>
                    <span className="font-mono text-[11px] text-cue-subtle">
                      r{s.revision}
                    </span>
                  </a>
                ))}
              </>
            )}
          </div>
          <p className="mt-4 flex items-start gap-2 text-xs text-cue-subtle">
            <Icon name="shield" size={14} />
            Only published, customer-facing sources are used in widget answers.
            Internal content is available to authorised staff.
          </p>
        </>
      )}
      {snapshot && app && view === "editor" && (
        <>
          <button
            className="mb-4 flex items-center gap-1 text-xs text-cue-muted hover:text-cue-green"
            onClick={() => navigate("sources")}
          >
            <Icon name="arrowL" size={14} />
            Knowledge
          </button>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {selected
                  ? "Review source"
                  : `Add ${kinds[kind]?.[0] || "context"}`}
              </h2>
              <p className="mt-1 text-xs text-cue-subtle">
                {source
                  ? `Revision ${source.revision} · ${source.status}. ${source.status === "published" ? "The published revision stays live while you edit." : "Not used in answers until published."}`
                  : "Save a draft, review the content, then publish."}
              </p>
            </div>
            {source && (
              <Badge tone={source.status === "published" ? "green" : "neutral"}>
                {source.status}
              </Badge>
            )}
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <section className="ui-card p-5">
              <div className="space-y-5">
                {input(
                  "title",
                  kind === "faq" ? "Title (optional)" : "Title",
                  kind === "faq"
                    ? "Uses the question if left blank"
                    : "e.g. Product guide",
                  160,
                )}
                <fieldset>
                  <legend className="mb-2 text-xs font-medium">
                    Visibility
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      [
                        "customer",
                        "Customer-facing",
                        "Published content can be used in widget answers.",
                        "eye",
                      ],
                      [
                        "internal",
                        "Internal team only",
                        "Available to staff. Excluded from customer answers.",
                        "lock",
                      ],
                    ].map(([key, label, description, icon]) => (
                      <label
                        key={key}
                        className={`flex cursor-pointer gap-2 rounded-lg border p-3 ${form.visibility === key ? "border-cue-green bg-cue-green-soft/40" : "border-cue-line"}`}
                      >
                        <input
                          type="radio"
                          name="visibility"
                          value={key}
                          checked={form.visibility === key}
                          disabled={!canEdit}
                          onChange={field("visibility").onChange}
                          className="mt-1 accent-cue-green"
                        />
                        <span>
                          <b className="flex items-center gap-1 text-xs font-medium">
                            <Icon name={icon} size={12} />
                            {label}
                          </b>
                          <small className="mt-1 block text-[11px] text-cue-muted">
                            {description}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {kind === "faq" ? (
                  <>
                    {input(
                      "question",
                      "Question",
                      "How do I upload a photo?",
                      500,
                    )}
                    {textarea(
                      "answer",
                      "Approved answer",
                      "Write the answer your support team would give.",
                      6,
                      5000,
                    )}
                    {textarea(
                      "alternatives",
                      "Alternative questions (optional)",
                      "One per line",
                      3,
                    )}
                  </>
                ) : kind === "file" && !selected ? (
                  <label className="ui-field">
                    Document
                    <span className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-cue-line bg-cue-sunken/40 px-4 py-8 text-center">
                      <Icon name="upload" size={24} />
                      <span>
                        {file?.name || "Choose a document to extract"}
                      </span>
                      <input
                        className="ui-input"
                        type="file"
                        accept=".txt,.md,.markdown,.pdf,.docx"
                        disabled={!canEdit}
                        onChange={(e) => {
                          setFile(e.target.files?.[0] || null);
                          setDirty(true);
                        }}
                      />
                      <small>
                        TXT, Markdown, text-based PDF or DOCX · up to 10 MB and
                        100 PDF pages
                      </small>
                    </span>
                  </label>
                ) : ["url", "github"].includes(kind) && !selected ? (
                  <>
                    {input(
                      "url",
                      kind === "github"
                        ? "Public GitHub file URL"
                        : "Public document URL",
                      kind === "github"
                        ? "https://github.com/company/repo/blob/main/docs/guide.md"
                        : "https://example.com/help",
                      2000,
                    )}
                    <p className="text-xs text-cue-subtle">
                      Imports one public page into a draft. Private content can
                      be uploaded or pasted.
                    </p>
                  </>
                ) : (
                  <>
                    {textarea(
                      "text",
                      "Content",
                      "Paste your documentation, policies or product context…",
                      13,
                    )}
                    <small className="text-cue-subtle">
                      {form.text.length.toLocaleString()} / 200,000 characters
                    </small>
                  </>
                )}
                {source?.error && <Notice error>{source.error}</Notice>}
                {selected && ["url", "github"].includes(kind) && form.url && (
                  <Button
                    disabled={!canEdit}
                    onClick={() => {
                      if (
                        dirty &&
                        !window.confirm(
                          "Replace unsaved changes with the fresh page?",
                        )
                      )
                        return;
                      void run(async () => {
                        const data = await call({
                          action: "save",
                          appId: app,
                          sourceId: selected,
                          expectedRevision: editorRevision,
                          kind,
                          title: form.title,
                          visibility: form.visibility,
                          url: form.url,
                        });
                        await load(app);
                        await select(data.sourceId);
                        setNotice(
                          "Fresh page imported as a draft. Review and publish the update.",
                        );
                      });
                    }}
                  >
                    <Icon name="refresh" size={14} />
                    Refresh page draft
                  </Button>
                )}
              </div>
            </section>
            <aside className="ui-card">
              <div className="flex items-center justify-between border-b border-cue-line px-4 py-3">
                <h3 className="flex items-center gap-2 text-xs font-semibold">
                  <Icon name="eye" size={14} />
                  {dirty ? "Draft preview" : "Extracted preview"}
                </h3>
                <span className="font-mono text-[10px] text-cue-subtle">
                  {preview.length} passages
                </span>
              </div>
              <div className="max-h-[650px] overflow-y-auto p-4">
                {preview.length ? (
                  preview.map((p, i) => (
                    <article
                      key={i}
                      className="mb-3 rounded-md border border-cue-line p-3 last:mb-0"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-mono text-[10px] text-cue-subtle">
                          {i + 1}
                        </span>
                        <b className="text-xs font-medium">
                          {p.heading}
                          {"page" in p && p.page ? ` · page ${p.page}` : ""}
                        </b>
                      </div>
                      <p className="whitespace-pre-wrap text-xs leading-relaxed text-cue-muted">
                        {p.text || "Write an answer to preview this passage."}
                      </p>
                    </article>
                  ))
                ) : (
                  <EmptyState icon="file" title="Nothing extracted yet">
                    {kind === "file" || ["url", "github"].includes(kind)
                      ? "Import the source to review extracted content before publishing."
                      : "Write content to preview the passages Cue can search."}
                  </EmptyState>
                )}
              </div>
              <div className="flex gap-2 border-t border-cue-line bg-cue-sunken/30 px-4 py-3 text-[11px] text-cue-muted">
                <Icon
                  name={form.visibility === "customer" ? "eye" : "lock"}
                  size={13}
                />
                {form.visibility === "customer"
                  ? "Once published, the widget can use these passages."
                  : "Internal content is excluded from customer answers."}
              </div>
            </aside>
          </div>
          <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-cue-line bg-cue-panel/95 p-4 backdrop-blur">
            <span className="text-xs text-cue-muted">
              {dirty
                ? "Unsaved changes. Save before publishing."
                : !selected
                  ? "Save a draft first."
                  : !snapshot.canPublish
                    ? "Owner or Product can publish this draft."
                    : "Publishing uses this saved revision."}
            </span>
            <div className="flex flex-wrap gap-2">
              {source?.status === "published" && (
                <Button
                  variant="danger"
                  disabled={busy || !snapshot.canPublish}
                  onClick={() => setWithdrawConfirm(true)}
                >
                  Withdraw
                </Button>
              )}
              {selected && kind === "file" && (
                <a
                  className="ui-button"
                  href={`/api/knowledge?app=${encodeURIComponent(app)}&source=${encodeURIComponent(selected)}&download=1`}
                >
                  Download original
                </a>
              )}
              <Button
                disabled={!canEdit || (!!selected && !editorRevision)}
                onClick={() =>
                  void run(async () => {
                    await save();
                    setDirty(false);
                    setView("editor");
                  })
                }
              >
                {busy
                  ? "Working…"
                  : !selected && ["file", "url", "github"].includes(kind)
                    ? "Import and save draft"
                    : "Save draft"}
              </Button>
              <Button
                variant="primary"
                disabled={
                  !selected ||
                  !editorRevision ||
                  dirty ||
                  busy ||
                  !snapshot.canPublish ||
                  ["queued", "indexing"].includes(source?.indexStatus || "") ||
                  (source?.status === "published" &&
                    source?.latestVersionId === source?.activeVersionId)
                }
                onClick={() => void run(publish)}
              >
                <Icon name="check" size={14} />
                {["queued", "indexing"].includes(source?.indexStatus || "")
                  ? "Publishing…"
                  : source?.status === "published"
                    ? "Publish update"
                    : "Publish"}
              </Button>
            </div>
          </div>
          {withdrawConfirm && (
            <div
              role="alertdialog"
              aria-label="Withdraw source"
              className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs"
            >
              <p className="flex-1">
                Withdraw “{source?.title}”? It will be excluded from new
                answers.
              </p>
              <Button onClick={() => setWithdrawConfirm(false)}>Cancel</Button>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await call({
                      action: "withdraw",
                      appId: app,
                      sourceId: selected,
                    });
                    await load(app);
                    setWithdrawConfirm(false);
                    setNotice(
                      "Source withdrawn. It is excluded from new answers.",
                    );
                  })
                }
              >
                Withdraw source
              </Button>
            </div>
          )}
        </>
      )}
      {snapshot && app && view === "test" && (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <section className="ui-card space-y-5 p-5">
            <label className="ui-field">
              Question
              <textarea
                className="ui-input resize-y font-normal"
                value={question}
                disabled={busy}
                onChange={(e) => setQuestion(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="Ask what your customers would ask…"
              />
            </label>
            <fieldset>
              <legend className="mb-2 text-xs font-medium">Answer as</legend>
              <div className="flex rounded-md border border-cue-line p-0.5">
                {[
                  ["customer", "Customer widget"],
                  ["staff", "Staff"],
                ].map(([k, l]) => (
                  <Button
                    key={k}
                    disabled={busy}
                    variant="ghost"
                    className={`flex-1 ${audience === k ? "bg-cue-sunken" : ""}`}
                    onClick={() => {
                      setAudience(k);
                      setAnswer(null);
                      setBaseline(null);
                    }}
                  >
                    {l}
                  </Button>
                ))}
              </div>
            </fieldset>
            <details className="rounded-lg border border-cue-line p-3">
              <summary className="cursor-pointer text-xs font-medium text-cue-muted">
                Advanced · models and retrieval
              </summary>
              <div className="mt-4 space-y-4">
                <label className="ui-field">
                  Model
                  <select
                    className="ui-input"
                    value={testModel}
                    disabled={busy}
                    onChange={(e) => setTestModel(e.target.value)}
                  >
                    <option value="">Widget model · {snapshot.model}</option>
                    <option value="gemini-2.5-flash">Gemini Flash</option>
                    {snapshot.litellm && (
                      <>
                        <option value="nova-lite">Nova Lite · LiteLLM</option>
                        <option value="claude-haiku">
                          Claude Haiku · LiteLLM
                        </option>
                        <option value="claude-sonnet-4.6">
                          Claude Sonnet · LiteLLM
                        </option>
                      </>
                    )}
                  </select>
                </label>
                <label className="ui-field">
                  Retrieval
                  <select
                    className="ui-input"
                    value={testMode}
                    disabled={busy}
                    onChange={(e) => setTestMode(e.target.value)}
                  >
                    <option value="hybrid">Keyword + semantic</option>
                    <option value="keyword">Keyword baseline</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-3 text-xs">
                  Compare retrieval and models
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Compare retrieval and models"
                    checked={compare}
                    disabled={busy}
                    className="size-4 accent-cue-green"
                    onChange={(e) => {
                      setCompare(e.target.checked);
                      setBaseline(null);
                      setComparisonError("");
                    }}
                  />
                </label>
                {compare && (
                  <label className="ui-field">
                    Comparison model
                    <select
                      className="ui-input"
                      value={comparisonModel}
                      disabled={busy}
                      onChange={(e) => setComparisonModel(e.target.value)}
                    >
                      <option value="">Same model</option>
                      <option value="gemini-2.5-flash">Gemini Flash</option>
                      {snapshot.litellm && (
                        <>
                          <option value="nova-lite">Nova Lite · LiteLLM</option>
                          <option value="claude-haiku">
                            Claude Haiku · LiteLLM
                          </option>
                          <option value="claude-sonnet-4.6">
                            Claude Sonnet · LiteLLM
                          </option>
                        </>
                      )}
                    </select>
                    <small>
                      Same question and audience; the comparison uses{" "}
                      {testMode === "hybrid" ? "keyword" : "hybrid"} retrieval.
                      Runs two answer requests.
                    </small>
                  </label>
                )}
              </div>
            </details>
            <p className="flex gap-2 text-[11px] text-cue-muted">
              <Icon name={audience === "customer" ? "eye" : "lock"} size={14} />
              {audience === "customer"
                ? "Uses only published, customer-facing sources, exactly like the widget."
                : "Includes published internal sources. Staff results are never sent to customers."}
            </p>
            <Button
              variant="primary"
              className="w-full"
              disabled={busy || !question.trim() || !snapshot.canEdit}
              onClick={() =>
                void run(async () => {
                  setAnswer(null);
                  setBaseline(null);
                  setComparisonError("");
                  const input = {
                    action: "test",
                    appId: app,
                    question,
                    audience,
                  };
                  const tasks = [
                    call({
                      ...input,
                      ...(testModel ? { model: testModel } : {}),
                      mode: testMode,
                    }),
                  ];
                  if (compare)
                    tasks.push(
                      call({
                        ...input,
                        ...(comparisonModel || testModel
                          ? { model: comparisonModel || testModel }
                          : {}),
                        mode: testMode === "hybrid" ? "keyword" : "hybrid",
                      }),
                    );
                  const [current, other] = await Promise.allSettled(tasks);
                  if (current.status === "fulfilled") setAnswer(current.value);
                  if (other?.status === "fulfilled") setBaseline(other.value);
                  if (other?.status === "rejected")
                    setComparisonError(
                      "Comparison failed: " +
                        (other.reason instanceof Error
                          ? other.reason.message
                          : "Try again"),
                    );
                  if (current.status === "rejected") throw current.reason;
                })
              }
            >
              <Icon name="send" size={14} />
              {busy ? "Answering…" : "Ask Cue"}
            </Button>
            <p className="text-[11px] text-cue-subtle">
              Test questions aren’t sent to customers. Gemini is the default;
              other models use LiteLLM only when selected.
            </p>
          </section>
          <div
            className={`grid min-w-0 items-start gap-4 ${compare && baseline && !busy ? "xl:grid-cols-2" : ""}`}
          >
            <section className="ui-card">
              {busy ? (
                <EmptyState
                  icon="sparkle"
                  title="Retrieving passages and checking the answer…"
                >
                  Published sources are searched within this app and audience.
                </EmptyState>
              ) : !answer ? (
                <EmptyState
                  icon="sparkle"
                  title="Ask a question to see Cue’s answer"
                >
                  Inspect its citations and retrieved passages, or try the
                  keyword baseline.
                </EmptyState>
              ) : (
                renderAnswer(
                  answer,
                  compare ? "Current settings" : "Cue’s answer",
                )
              )}
            </section>
            {compare && !busy && comparisonError && (
              <Notice error>{comparisonError}</Notice>
            )}
            {compare && !busy && baseline && (
              <section className="ui-card">
                {renderAnswer(baseline, "Comparison settings")}
              </section>
            )}
          </div>
        </div>
      )}
      {snapshot && app && view === "widget" && (
        <WidgetPreview
          app={app}
          name={snapshot.apps.find((a) => a.id === app)?.name || "App"}
          model={snapshot.model}
          sources={
            snapshot.sources.filter(
              (s) => s.status === "published" && s.visibility === "customer",
            ).length
          }
        />
      )}
    </main>
  );
}
