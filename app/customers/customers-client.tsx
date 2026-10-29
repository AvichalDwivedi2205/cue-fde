"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { Badge, Button, EmptyState, Icon, Notice } from "../components/ui";
import { useWorkspaceDate } from "../components/workspace-preferences";
type Company = Doc<"prospectCompanies">;
type Snapshot = {
  configured: boolean;
  canResearch: boolean;
  companies: Company[];
  runs: Doc<"prospectRuns">[];
};
export function CustomersClient() {
  const formatDate = useWorkspaceDate();
  const dialog = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [checkedAt, setCheckedAt] = useState(0);
  const [data, setData] = useState<Snapshot>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [query, setQuery] = useState(
      "Small companies building consumer mobile apps for journaling, habits, wellness or personal productivity",
    ),
    [tab, setTab] = useState("candidate"),
    [selected, setSelected] = useState<Company>(),
    [industry, setIndustry] = useState("Any"),
    [size, setSize] = useState("Any"),
    [country, setCountry] = useState("Any");
  const load = useCallback(async () => {
    const r = await fetch("/api/prospects", { cache: "no-store" }),
      d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setData(d);
    setCheckedAt(Date.now());
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load().catch((e) => setError(e.message)));
    const timer = setInterval(() => void load().catch(() => {}), 5000);
    return () => clearInterval(timer);
  }, [load]);
  useEffect(() => {
    if (!selected) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(undefined);
      if (e.key === "Tab") {
        const items = [
          ...(dialog.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ) || []),
        ];
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    addEventListener("keydown", close);
    return () => {
      removeEventListener("keydown", close);
      trigger.current?.focus();
    };
  }, [selected]);
  async function send(body: object) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/prospects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research failed");
    } finally {
      setBusy(false);
    }
  }
  const latest = data?.runs[0],
    running =
      latest?.state === "running" && checkedAt - latest.createdAt < 120000;
  const rows =
    data?.companies.filter((c) => tab === "all" || c.disposition === tab) || [];
  const review = (c: Company, disposition: string) =>
    void send({ action: "review", companyId: c._id, disposition });
  const controls = (c: Company) => (
    <div className="flex flex-wrap gap-2">
      {c.disposition !== "shortlisted" && (
        <Button
          disabled={busy || !data?.canResearch}
          onClick={() => review(c, "shortlisted")}
        >
          <Icon name="star" size={13} />
          Shortlist
        </Button>
      )}
      {c.disposition !== "dismissed" && (
        <Button
          variant="ghost"
          disabled={busy || !data?.canResearch}
          onClick={() => review(c, "dismissed")}
        >
          Dismiss
        </Button>
      )}
      {c.disposition !== "candidate" && (
        <Button
          variant="ghost"
          disabled={busy || !data?.canResearch}
          onClick={() => review(c, "candidate")}
        >
          Return to review
        </Button>
      )}
    </div>
  );
  const filter = (
    label: string,
    value: string,
    set: (v: string) => void,
    opts: string[],
  ) => (
    <label className="ui-field flex-1">
      {label}
      <select
        className="ui-input"
        value={value}
        onChange={(e) => set(e.target.value)}
        disabled={busy}
      >
        {opts.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  return (
    <main className="ui-page">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">
            Cue customers
          </h1>
          <p className="mt-1 text-cue-muted">
            Find companies that could benefit from Cue, then review the
            evidence.
          </p>
        </div>
        <Badge tone={data?.configured ? "green" : "neutral"}>
          Crustdata{" "}
          {data
            ? data.configured
              ? "connected"
              : "not configured"
            : "loading…"}
        </Badge>
      </div>
      <nav className="ui-tabs" aria-label="Growth">
        <a href="/cue#/growth">Opportunities</a>
        <a href="/cue#/growth/campaigns">Campaigns</a>
        <a href="/cue#/growth/results">Results</a>
        <a href="/customers" className="active">
          Cue customers
        </a>
      </nav>
      {error && (
        <Notice error>
          {error}
          <Button
            className="ml-3"
            onClick={() =>
              void load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Refresh
          </Button>
        </Notice>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <section className="ui-card p-4">
          <h2 className="mb-4 flex items-center gap-2 text-xs font-semibold">
            <Icon name="gauge" size={14} />
            Research credits
          </h2>
          <p className="text-xs text-cue-muted">Up to 5 companies per search</p>
          <p className="mt-1 text-lg font-semibold">15-credit ceiling</p>
          <p className="mt-2 text-[11px] leading-relaxed text-cue-subtle">
            Five searches per day (UTC). The provider balance is checked before
            research runs.
          </p>
          {latest && (
            <div className="mt-4 border-t border-cue-line pt-3">
              <span className="text-[11px] text-cue-subtle">
                Latest search · {formatDate(latest.createdAt)}
              </span>
              <p className="mt-1 text-xs">
                {latest.count} companies ·{" "}
                {latest.usedCredits === null
                  ? "Usage not reported"
                  : `${latest.usedCredits.toFixed(2)} credits reported`}
              </p>
              <Badge
                tone={
                  latest.state === "failed"
                    ? "red"
                    : latest.state === "running"
                      ? "amber"
                      : "green"
                }
              >
                {latest.state}
              </Badge>
            </div>
          )}
        </section>
        <section className="ui-card space-y-4 p-4">
          <label className="ui-field">
            Describe the companies to research
            <textarea
              className="ui-input resize-y font-normal"
              rows={2}
              minLength={10}
              maxLength={300}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={busy}
            />
          </label>
          <div className="flex flex-wrap items-end gap-3">
            {filter("Industry", industry, setIndustry, [
              "Any",
              "Mobile apps",
              "Consumer software",
              "Photo & video",
              "Productivity",
            ])}
            {filter("Headcount", size, setSize, [
              "Any",
              "1–10",
              "11–50",
              "51–200",
              "201–500",
            ])}
            {filter("Country", country, setCountry, [
              "Any",
              "United States",
              "United Kingdom",
              "Canada",
              "Germany",
              "India",
            ])}
            <Button
              variant="primary"
              disabled={
                busy ||
                running ||
                !data?.canResearch ||
                !data.configured ||
                query.trim().length < 10
              }
              onClick={() => {
                const q = [
                  query.trim(),
                  industry !== "Any" ? `Industry: ${industry}.` : "",
                  size !== "Any" ? `Headcount: ${size}.` : "",
                  country !== "Any" ? `Country: ${country}.` : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                if (q.length > 400) {
                  setError(
                    "Shorten your company description to fit the 400-character search limit.",
                  );
                  return;
                }
                void send({
                  action: "search",
                  key: crypto.randomUUID(),
                  query: q,
                  limit: 5,
                });
              }}
            >
              <Icon name="search" size={14} />
              {busy || running ? "Researching…" : "Find companies"}
            </Button>
          </div>
          {!data?.canResearch && data && (
            <p className="text-xs text-cue-muted">
              Owner or Product can search and review companies.
            </p>
          )}
          {latest?.warning && <Notice>{latest.warning}</Notice>}
        </section>
      </div>
      <p className="my-4 flex items-start gap-2 text-xs text-cue-muted">
        <Icon name="shield" size={14} />
        Research only. Product and team-size fit are signals; buying intent and
        willingness to pay need validation.
      </p>
      <nav className="ui-tabs" aria-label="Research results">
        {[
          ["candidate", "To review"],
          ["shortlisted", "Shortlist"],
          ["dismissed", "Dismissed"],
          ["all", "All"],
        ].map(([k, l]) => (
          <button
            key={k}
            className={`flex items-center gap-2 ${tab === k ? "active" : ""}`}
            onClick={() => setTab(k)}
          >
            {l}
            <Badge>
              {data?.companies.filter((c) => k === "all" || c.disposition === k)
                .length || 0}
            </Badge>
          </button>
        ))}
        <Button
          className="ml-auto self-start"
          variant="ghost"
          aria-label="Refresh research results"
          onClick={() => void load().catch((e) => setError(e.message))}
        >
          <Icon name="refresh" size={14} />
        </Button>
      </nav>
      <div className="ui-card">
        {!rows.length ? (
          <EmptyState
            icon="building"
            title={
              !data
                ? "Loading companies…"
                : tab === "shortlisted"
                  ? "No companies shortlisted"
                  : "No companies in this view"
            }
          >
            Search to build a list, then inspect the company facts.
          </EmptyState>
        ) : (
          rows.map((c) => (
            <article
              key={c._id}
              className="border-b border-cue-line p-5 last:border-0"
            >
              <div className="flex flex-wrap items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-cue-green-soft text-lg font-semibold text-cue-green">
                  {c.name[0]}
                </span>
                <div className="min-w-0 flex-1">
                  <button
                    className="text-left text-sm font-semibold hover:text-cue-green"
                    onClick={(e) => {
                      trigger.current = e.currentTarget;
                      setSelected(c);
                    }}
                  >
                    {c.name}
                  </button>
                  <p className="mt-1 text-xs text-cue-muted">
                    {c.employees === null
                      ? "Team size unavailable"
                      : `${c.employees} employees`}
                    {c.country ? ` · ${c.country}` : ""}
                  </p>
                </div>
                <Badge tone={c.fit === "potential" ? "green" : "neutral"}>
                  {c.fit === "potential"
                    ? "Potential fit"
                    : c.fit === "low"
                      ? "Outside target size"
                      : "Needs review"}
                </Badge>
              </div>
              <p className="mt-3 max-w-4xl text-xs leading-relaxed text-cue-muted">
                {c.description || "Description unavailable"}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <button
                  className="flex items-center gap-1 text-xs font-medium text-cue-green"
                  onClick={(e) => {
                    trigger.current = e.currentTarget;
                    setSelected(c);
                  }}
                >
                  View evidence
                  <Icon name="arrowR" size={12} />
                </button>
                {controls(c)}
              </div>
            </article>
          ))
        )}
      </div>
      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/25"
          onClick={() => setSelected(undefined)}
        >
          <section
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label={`${selected.name} research evidence`}
            className="flex h-full w-full max-w-lg flex-col bg-cue-panel shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-cue-line p-5">
              <h2 className="text-sm font-semibold">{selected.name}</h2>
              <Button
                autoFocus
                variant="ghost"
                aria-label="Close company details"
                onClick={() => setSelected(undefined)}
              >
                <Icon name="x" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <p className="text-xs leading-relaxed text-cue-muted">
                {selected.description}
              </p>
              {selected.domain && (
                <a
                  className="mt-3 inline-flex items-center gap-1 text-xs text-cue-green"
                  href={`https://${selected.domain}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {selected.domain}
                  <Icon name="ext" size={12} />
                </a>
              )}
              <dl className="mt-5 space-y-3 text-xs">
                {[
                  [
                    "Headcount",
                    selected.employees === null
                      ? "Unavailable"
                      : String(selected.employees),
                  ],
                  ["Country", selected.country || "Unavailable"],
                  [
                    "Source",
                    `Crustdata · ${selected.enriched ? "exact company match" : "search facts only"}`,
                  ],
                  ["Researched", formatDate(selected.lastFoundAt)],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    className="flex justify-between gap-4 border-b border-cue-line pb-2"
                  >
                    <dt className="text-cue-subtle">{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <h3 className="mt-6 mb-3 text-xs font-semibold">
                Why research this team
              </h3>
              {selected.reasons.map((r, i) => (
                <p key={i} className="mb-2 flex gap-2 text-xs text-cue-muted">
                  <Icon name="check" size={13} className="text-cue-green" />
                  {r}
                </p>
              ))}
              <h3 className="mt-6 mb-3 text-xs font-semibold">
                Still to verify
              </h3>
              {selected.gaps.map((g, i) => (
                <p key={i} className="mb-2 flex gap-2 text-xs text-cue-muted">
                  <Icon name="help" size={13} />
                  {g}
                </p>
              ))}
            </div>
            <div className="border-t border-cue-line p-4">
              {controls(
                data?.companies.find((c) => c._id === selected._id) || selected,
              )}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
