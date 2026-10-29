"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Button, EmptyState, Icon, Notice } from "../components/ui";
import {
  DEFAULT_BRAND,
  requirementCoverage,
  type BrandVoice,
  type ContextRequirement,
  type CoverageSource,
} from "@/lib/company-context-policy";

type Source = CoverageSource & {
  kind: string;
  revision: number;
  activeIndexedPassageCount?: number;
  error?: string;
};
type Snapshot = {
  appId: string;
  apps: { id: string; name: string }[];
  canManage: boolean;
  brand: BrandVoice;
  revision: number;
  sources: Source[];
  requirements: ContextRequirement[];
  checkedAt: number;
};
export function CompanyContextPanel({
  kind,
  appId,
  onDirty,
}: {
  kind: "coverage" | "brand";
  appId?: string;
  onDirty?: (dirty: boolean) => void;
}) {
  const [data, setData] = useState<Snapshot>(),
    [app, setApp] = useState(appId || ""),
    [brand, setBrand] = useState<BrandVoice>(DEFAULT_BRAND),
    [requirements, setRequirements] = useState<ContextRequirement[]>([]),
    [busy, setBusy] = useState(false),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const serial = useRef(0);
  const invalidate = useCallback(() => {
    serial.current++;
  }, []);
  const load = useCallback(
    async (id: string) => {
      const request = ++serial.current;
      const r = await fetch(
          "/api/company-context" + (id ? "?app=" + encodeURIComponent(id) : ""),
          { cache: "no-store" },
        ),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (request !== serial.current) return;
      if (!id && !appId) {
        let preferred = "";
        try {
          preferred = sessionStorage.getItem("cue-agent-app") || "";
        } catch {}
        if (
          d.apps.some((a: { id: string }) => a.id === preferred) &&
          preferred !== d.appId
        ) {
          setApp(preferred);
          return;
        }
        if (d.appId) {
          setApp(d.appId);
          return;
        }
      }
      setData(d);
      setBrand(d.brand || DEFAULT_BRAND);
      setRequirements(d.requirements || []);
      setDirty(false);
      setError("");
      if (!id && d.appId) setApp(d.appId);
    },
    [appId],
  );
  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    queueMicrotask(
      () => void load(appId || app).catch((e) => setError(e.message)),
    );
    return invalidate;
  }, [appId, app, load, invalidate]);
  useEffect(() => {
    const protect = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    addEventListener("beforeunload", protect);
    return () => removeEventListener("beforeunload", protect);
  }, [dirty]);
  async function save() {
    if (!data) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body =
        kind === "brand"
          ? {
              action: "brand",
              appId: data.appId,
              expectedVersion: data.brand.version,
              enabled: brand.enabled,
              label: brand.label,
              tone: brand.tone,
              guidelines: brand.guidelines,
              examples: brand.examples.filter((e) => e.trim()),
            }
          : {
              action: "coverage",
              appId: data.appId,
              expectedRevision: data.revision,
              requirements: requirements.map(
                ({ id, label, audience, sourceIds, maxAgeDays }) => ({
                  id,
                  label,
                  audience,
                  sourceIds,
                  ...(maxAgeDays ? { maxAgeDays } : {}),
                }),
              ),
            };
      const r = await fetch("/api/company-context", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      await load(data.appId);
      setNotice(
        kind === "brand"
          ? "Brand voice saved. Future widget replies and Growth drafts use this version."
          : "Required context saved. Coverage reflects the latest published revisions.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }
  const editBrand = (patch: Partial<BrandVoice>) => {
    setBrand((b) => ({ ...b, ...patch }));
    setDirty(true);
    setNotice("");
  };
  const editRequirement = (id: string, patch: Partial<ContextRequirement>) => {
    setRequirements((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
    setDirty(true);
    setNotice("");
  };
  const allowed = !!data?.canManage && !busy;
  const covered = requirements.filter(
    (r) =>
      requirementCoverage(r, data?.sources || [], data?.checkedAt || 0)
        .status === "ready",
  ).length;
  return (
    <section
      className="min-w-0"
      aria-label={kind === "brand" ? "Brand voice" : "Context coverage"}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">
            {kind === "brand" ? "Brand voice" : "Context coverage"}
          </h2>
          <p className="mt-1 text-xs text-cue-muted">
            {kind === "brand"
              ? "One approved voice for customer answers and Growth replies."
              : "Define what Cue must know, then check that every required source is ready."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!appId && (
            <label className="ui-field">
              Application
              <select
                className="ui-input"
                aria-label="Brand voice application"
                value={data?.appId || app}
                disabled={busy}
                onChange={(e) => {
                  if (dirty && !confirm("Leave without saving your changes?"))
                    return;
                  setData(undefined);
                  setApp(e.target.value);
                  try {
                    sessionStorage.setItem("cue-agent-app", e.target.value);
                  } catch {}
                }}
              >
                {data?.apps.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            disabled={busy}
            onClick={() => {
              if (dirty && !confirm("Reload and discard unsaved changes?"))
                return;
              setBusy(true);
              void load(appId || app)
                .catch((e) => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            <Icon name="refresh" size={13} />
            Refresh
          </Button>
        </div>
      </div>
      {error && <Notice error>{error}</Notice>}
      {notice && <Notice>{notice}</Notice>}
      {!data ? (
        <div className="ui-card">
          <EmptyState
            title={error ? "Couldn’t load context" : "Loading context…"}
          >
            Only registered applications and signed-in staff can view this
            context.
          </EmptyState>
        </div>
      ) : !data.appId ? (
        <EmptyState
          title="Add an application first"
          action={
            <a className="ui-button" href="/setup">
              Open Setup
            </a>
          }
        >
          Context and voice are scoped to your application.
        </EmptyState>
      ) : kind === "brand" ? (
        <>
          <form
            className="ui-card p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="mb-5 flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={brand.enabled}
                  disabled={!allowed}
                  onChange={(e) => editBrand({ enabled: e.target.checked })}
                />
                Use this brand voice
              </label>
              <Badge tone={data.brand.enabled ? "green" : "neutral"}>
                {data.brand.version
                  ? `Version ${data.brand.version}`
                  : "Default voice"}
              </Badge>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="ui-field">
                Profile name
                <input
                  className="ui-input"
                  value={brand.label}
                  disabled={!allowed}
                  maxLength={80}
                  placeholder="Our customer voice"
                  onChange={(e) => editBrand({ label: e.target.value })}
                />
              </label>
              <label className="ui-field">
                Tone
                <select
                  className="ui-input"
                  value={brand.tone}
                  disabled={!allowed}
                  onChange={(e) =>
                    editBrand({ tone: e.target.value as BrandVoice["tone"] })
                  }
                >
                  {["warm", "direct", "professional", "playful"].map((t) => (
                    <option key={t} value={t}>
                      {t[0].toUpperCase() + t.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="ui-field mt-4">
              Writing guidelines
              <textarea
                className="ui-input resize-y"
                rows={3}
                value={brand.guidelines}
                disabled={!allowed}
                maxLength={1000}
                placeholder="Short sentences. Plain words. Lead with the next step. Avoid sales language."
                onChange={(e) => editBrand({ guidelines: e.target.value })}
              />
            </label>
            <h3 className="mt-6 text-xs font-semibold">
              Approved writing examples
            </h3>
            <p className="mt-1 mb-3 text-[11px] text-cue-muted">
              Paste up to three approved posts, emails or support replies. Cue
              uses their writing style; product claims still need published
              knowledge.
            </p>
            {[0, 1, 2].map((i) => (
              <label key={i} className="ui-field mb-3">
                Example {i + 1}
                <textarea
                  className="ui-input resize-y"
                  rows={3}
                  maxLength={1200}
                  value={brand.examples[i] || ""}
                  disabled={!allowed}
                  onChange={(e) => {
                    const examples = [...brand.examples];
                    examples[i] = e.target.value;
                    editBrand({ examples });
                  }}
                />
              </label>
            ))}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-cue-muted">
                {dirty
                  ? "Unsaved changes"
                  : "Approved FAQs are returned verbatim. Write their answers in your brand voice."}
              </span>
              <Button variant="primary" disabled={!allowed || !dirty}>
                {busy ? "Saving…" : "Save brand voice"}
              </Button>
            </div>
          </form>
          <Notice>
            A frustrated customer gets a calm, direct response. Published facts,
            citations and verified feature limits always take priority. Changing
            the voice requires a new review of existing Growth drafts.
          </Notice>
          <a
            className="ui-button mt-3"
            href={`/knowledge?app=${encodeURIComponent(data.appId)}#test`}
          >
            Test a customer answer
            <Icon name="arrow-right" size={12} />
          </a>
        </>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            {[
              [
                requirements.length
                  ? `${covered} / ${requirements.length}`
                  : "Not defined",
                "Declared context ready",
              ],
              [
                data.sources.filter(
                  (s) =>
                    s.status === "published" && s.visibility === "customer",
                ).length,
                "Public sources serving answers + Growth",
              ],
              [
                data.sources.filter(
                  (s) =>
                    s.status === "published" && s.visibility === "internal",
                ).length,
                "Internal sources serving staff",
              ],
            ].map(([value, label]) => (
              <div key={label} className="ui-card p-4">
                <b className="text-xl font-semibold">{value}</b>
                <p className="mt-1 text-[11px] text-cue-muted">{label}</p>
              </div>
            ))}
          </div>
          <Notice>
            Coverage applies to your declared requirements. Add company docs,
            FAQs and policies in Sources; customer-visible publications power
            both widget answers and Growth. Imported pages require manual
            refresh.
          </Notice>
          <div className="ui-card mt-4 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-xs font-semibold">
                Required company context
              </h3>
              <Button
                disabled={!allowed || requirements.length >= 20}
                onClick={() => {
                  setRequirements((rows) => [
                    ...rows,
                    {
                      id: crypto.randomUUID(),
                      label: "",
                      audience: "customer",
                      sourceIds: [],
                    },
                  ]);
                  setDirty(true);
                }}
              >
                <Icon name="plus" size={12} />
                Add requirement
              </Button>
            </div>
            {!requirements.length && (
              <EmptyState title="Define what complete means">
                Add requirements such as product capabilities, pricing or
                support policies, and choose the sources that cover each one.
              </EmptyState>
            )}
            {requirements.map((r) => {
              const state = requirementCoverage(
                r,
                data.sources,
                data.checkedAt,
              );
              return (
                <fieldset
                  key={r.id}
                  className="mb-4 rounded-lg border border-cue-line p-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <Badge tone={state.status === "ready" ? "green" : "amber"}>
                      {state.status}
                    </Badge>
                    <Button
                      disabled={!allowed}
                      aria-label={`Remove ${r.label || "requirement"}`}
                      onClick={() => {
                        setRequirements((rows) =>
                          rows.filter((row) => row.id !== r.id),
                        );
                        setDirty(true);
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr]">
                    <label className="ui-field">
                      Requirement
                      <input
                        className="ui-input"
                        value={r.label}
                        maxLength={100}
                        disabled={!allowed}
                        placeholder="Product capabilities"
                        onChange={(e) =>
                          editRequirement(r.id, { label: e.target.value })
                        }
                      />
                    </label>
                    <label className="ui-field">
                      Audience
                      <select
                        className="ui-input"
                        value={r.audience}
                        disabled={!allowed}
                        onChange={(e) =>
                          editRequirement(r.id, {
                            audience: e.target
                              .value as ContextRequirement["audience"],
                          })
                        }
                      >
                        <option value="customer">Customers + Growth</option>
                        <option value="staff">Staff</option>
                      </select>
                    </label>
                    <label className="ui-field">
                      Review after (days)
                      <input
                        className="ui-input"
                        type="number"
                        min={1}
                        max={3650}
                        placeholder="Optional"
                        value={r.maxAgeDays || ""}
                        disabled={!allowed}
                        onChange={(e) =>
                          editRequirement(r.id, {
                            maxAgeDays: e.target.value
                              ? Number(e.target.value)
                              : undefined,
                          })
                        }
                      />
                    </label>
                  </div>
                  <p className="mt-3 text-[11px] text-cue-muted">
                    {state.reason}
                  </p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {data.sources.map((s) => (
                      <label
                        key={s._id}
                        className="flex min-w-0 items-start gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={r.sourceIds.includes(s._id)}
                          disabled={
                            !allowed ||
                            (!r.sourceIds.includes(s._id) &&
                              r.sourceIds.length >= 10)
                          }
                          onChange={(e) =>
                            editRequirement(r.id, {
                              sourceIds: e.target.checked
                                ? [...r.sourceIds, s._id]
                                : r.sourceIds.filter((id) => id !== s._id),
                            })
                          }
                        />
                        <span className="min-w-0 break-words">
                          {s.title}
                          <small className="ml-1 text-cue-subtle">
                            {s.visibility} · {s.status}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                  {!data.sources.length && (
                    <a
                      className="mt-3 inline-block text-xs text-cue-green"
                      href="#new/text"
                    >
                      Add a source first
                    </a>
                  )}
                </fieldset>
              );
            })}
            <div className="flex items-center justify-between gap-3">
              <small className="text-cue-muted">
                {dirty
                  ? "Unsaved requirements"
                  : `Coverage revision ${data.revision}`}
              </small>
              <Button
                variant="primary"
                disabled={
                  !allowed ||
                  !dirty ||
                  requirements.some((r) => !r.label.trim())
                }
                onClick={() => void save()}
              >
                {busy ? "Saving…" : "Save requirements"}
              </Button>
            </div>
          </div>
          <div className="ui-card mt-4 overflow-x-auto">
            <h3 className="border-b border-cue-line p-4 text-xs font-semibold">
              Source inventory
            </h3>
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="text-cue-subtle">
                <tr>
                  {[
                    "Source",
                    "Audience",
                    "Serving revision",
                    "Passages indexed",
                    "Latest revision",
                    "Published",
                  ].map((l) => (
                    <th key={l} className="p-3 font-normal">
                      {l}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.sources.map((s) => (
                  <tr key={s._id} className="border-t border-cue-line">
                    <td className="p-3">
                      <a className="text-cue-green" href={`#source/${s._id}`}>
                        {s.title}
                      </a>
                      <small className="mt-1 block text-cue-subtle">
                        {s.kind}
                      </small>
                    </td>
                    <td className="p-3">{s.visibility}</td>
                    <td className="p-3">
                      {s.status === "published"
                        ? `r${s.activeRevision ?? "?"}`
                        : s.status}
                    </td>
                    <td className="p-3">
                      {s.activePassageCount === undefined
                        ? "—"
                        : `${s.activeIndexedPassageCount ?? "—"} / ${s.activePassageCount}`}
                    </td>
                    <td className="p-3">
                      r{s.revision}
                      <small className="mt-1 block text-cue-subtle">
                        {s.indexStatus === "idle"
                          ? s.latestVersionId === s.activeVersionId &&
                            s.status === "published"
                            ? "Published"
                            : "Draft"
                          : s.indexStatus}
                      </small>
                      {s.error && (
                        <small className="block text-red-700">{s.error}</small>
                      )}
                    </td>
                    <td className="p-3 text-cue-muted">
                      {s.publishedAt
                        ? new Date(s.publishedAt).toLocaleString()
                        : "Not recorded"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.sources.length && (
              <EmptyState title="No sources yet">
                Add and publish the information Cue should use.
              </EmptyState>
            )}
          </div>
        </>
      )}
    </section>
  );
}
