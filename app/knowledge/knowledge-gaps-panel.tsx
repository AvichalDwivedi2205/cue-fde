"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, EmptyState, Notice } from "../components/ui";

type Gap = {
  gap: {
    _id: string;
    question: string;
    state: "open" | "drafted" | "ignored";
    reportCount: number;
    reviewedThrough?: number;
    draftSourceId?: string;
    draftRevision?: number;
  };
  reports: {
    _id: string;
    caseId: string;
    question: string;
    customer: string;
    reason: string;
  }[];
  publication: string;
};
export function KnowledgeGapsPanel({
  appId,
  onDirty,
}: {
  appId: string;
  onDirty: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Gap[] | null>(null),
    [canEdit, setCanEdit] = useState(false),
    [selected, setSelected] = useState<Gap | null>(null);
  const [question, setQuestion] = useState(""),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [showIgnored, setShowIgnored] = useState(false);
  const serial = useRef(0);
  const invalidate = useCallback(() => {
    serial.current++;
  }, []);
  const load = useCallback(async () => {
    const token = ++serial.current;
    const response = await fetch(
        `/api/knowledge-gaps?app=${encodeURIComponent(appId)}`,
        { cache: "no-store" },
      ),
      data = await response.json();
    if (!response.ok) throw new Error(data.error);
    if (token !== serial.current) return;
    setRows(data.gaps);
    setCanEdit(data.canEdit);
  }, [appId]);
  useEffect(() => {
    void load().catch((e) => setNotice(e.message));
    const timer = setInterval(() => void load().catch(() => {}), 5000);
    return () => {
      invalidate();
      clearInterval(timer);
    };
  }, [load, invalidate]);
  async function act(body: unknown) {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/knowledge-gaps", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
        data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setSelected(null);
      setAnswer("");
      onDirty(false);
      await load();
      if (data.sourceId) {
        setNotice(
          "FAQ draft saved. Review it and publish from Sources; it becomes active after indexing.",
        );
        router.push(`#source/${encodeURIComponent(data.sourceId)}`);
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }
  const visible = (rows || []).filter(
    (r) => showIgnored || r.gap.state !== "ignored",
  );
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold">
            What Cue still needs to learn
          </h2>
          <p className="mt-1 text-xs text-cue-muted">
            Questions Cue couldn’t answer and customer requests for more help.
            Review the original conversation before teaching an answer.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-xs text-cue-muted">
          <input
            type="checkbox"
            checked={showIgnored}
            onChange={(e) => setShowIgnored(e.target.checked)}
          />
          Show ignored
        </label>
      </div>
      {notice && <Notice>{notice}</Notice>}
      {rows === null ? (
        <EmptyState title="Loading knowledge gaps…">
          Questions stay linked to their customer conversations.
        </EmptyState>
      ) : !visible.length ? (
        <div className="ui-card">
          <EmptyState title="No open knowledge gaps">
            Unanswered questions and “Still need help” feedback will appear here
            when customers send them.
          </EmptyState>
        </div>
      ) : (
        visible.map((row) => {
          const resolved =
              row.publication === "published" &&
              row.gap.reportCount <= (row.gap.reviewedThrough || 0),
            newReports = row.gap.reportCount > (row.gap.reviewedThrough || 0);
          const label =
            row.gap.state === "ignored"
              ? "Ignored"
              : resolved
                ? "Published answer"
                : row.gap.draftSourceId
                  ? newReports
                    ? "New reports to review"
                    : row.publication === "indexing"
                      ? "Indexing FAQ"
                      : row.publication === "failed"
                        ? "Indexing failed"
                        : row.publication === "withdrawn"
                          ? "FAQ withdrawn"
                          : row.publication === "changed"
                            ? "FAQ changed · review needed"
                            : "FAQ draft"
                  : "Needs an answer";
          return (
            <article className="ui-card p-4" key={row.gap._id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold">{row.gap.question}</h3>
                  <p className="mt-1 text-xs text-cue-muted">
                    {row.gap.reportCount} answer
                    {row.gap.reportCount === 1 ? "" : "s"} flagged · identical
                    questions grouped within this app
                  </p>
                </div>
                <Badge tone={resolved ? "green" : "amber"}>{label}</Badge>
              </div>
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-cue-muted">
                  Original conversations · {row.reports.length} most recent
                </summary>
                <ul className="mt-3 space-y-3">
                  {row.reports.map((report) => (
                    <li
                      key={report._id}
                      className="rounded-lg bg-cue-sunken p-3"
                    >
                      <div className="flex justify-between gap-3">
                        <strong>{report.customer}</strong>
                        <a
                          className="text-cue-green underline"
                          href={`/cue#/inbox/${encodeURIComponent(report.caseId)}`}
                        >
                          Open conversation
                        </a>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-cue-muted">
                        {report.question}
                      </p>
                      <p className="mt-1 text-[11px] text-cue-subtle">
                        {report.reason === "needs_help"
                          ? "Customer selected Still need help"
                          : "Cue could not answer reliably"}
                      </p>
                    </li>
                  ))}
                </ul>
              </details>
              <div className="mt-4 flex flex-wrap gap-2">
                {row.gap.draftSourceId ? (
                  <a
                    className="ui-button"
                    href={`#source/${encodeURIComponent(row.gap.draftSourceId)}`}
                  >
                    Review FAQ · v{row.gap.draftRevision}
                  </a>
                ) : (
                  canEdit &&
                  row.gap.state !== "ignored" && (
                    <Button
                      disabled={busy}
                      onClick={() => {
                        if (
                          selected &&
                          answer &&
                          !confirm("Leave this unsaved answer?")
                        )
                          return;
                        setSelected(row);
                        setQuestion(row.gap.question.slice(0, 500));
                        setAnswer("");
                        onDirty(false);
                      }}
                    >
                      Teach Cue
                    </Button>
                  )
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() =>
                      void act({
                        action:
                          row.gap.state === "ignored" ? "reopen" : "ignore",
                        appId,
                        gapId: row.gap._id,
                      })
                    }
                  >
                    {row.gap.state === "ignored" ? "Reopen" : "Ignore"}
                  </Button>
                )}
              </div>
              {selected?.gap._id === row.gap._id && (
                <form
                  className="mt-4 space-y-3 border-t border-cue-line pt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act({
                      action: "teach",
                      appId,
                      gapId: selected.gap._id,
                      expectedReportCount: selected.gap.reportCount,
                      question,
                      answer,
                    });
                  }}
                >
                  <label className="ui-field">
                    FAQ question
                    <input
                      className="ui-input"
                      value={question}
                      required
                      maxLength={500}
                      disabled={busy}
                      onChange={(e) => {
                        setQuestion(e.target.value);
                        onDirty(true);
                      }}
                    />
                  </label>
                  <label className="ui-field">
                    Verified answer
                    <textarea
                      className="ui-input min-h-28"
                      value={answer}
                      required
                      maxLength={5000}
                      disabled={busy}
                      placeholder="Write the answer the team has checked. This saves a draft for review."
                      onChange={(e) => {
                        setAnswer(e.target.value);
                        onDirty(true);
                      }}
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      disabled={busy || !answer.trim()}
                      type="submit"
                    >
                      Save FAQ draft
                    </Button>
                    <Button
                      disabled={busy}
                      type="button"
                      onClick={() => {
                        if (answer && !confirm("Discard this unsaved answer?"))
                          return;
                        setSelected(null);
                        onDirty(false);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </article>
          );
        })
      )}
    </div>
  );
}
