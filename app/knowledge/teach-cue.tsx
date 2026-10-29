"use client";

import { useState } from "react";
import { Button, Icon, Notice } from "../components/ui";

/** Every input becomes a reviewable draft; publication stays in the source editor. */
export function TeachCue({
  appId,
  disabled,
  onCreated,
}: {
  appId: string;
  disabled: boolean;
  onCreated: (sourceId: string) => Promise<void>;
}) {
  const [kind, setKind] = useState("text"),
    [text, setText] = useState(""),
    [title, setTitle] = useState(""),
    [answer, setAnswer] = useState(""),
    [visibility, setVisibility] = useState("internal"),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit() {
    setBusy(true);
    setError("");
    try {
      let body: BodyInit, headers: HeadersInit | undefined;
      if (kind === "file") {
        if (!file) throw new Error("Choose a document first.");
        const form = new FormData();
        form.set("file", file);
        form.set("appId", appId);
        form.set("title", title.trim() || file.name);
        form.set("visibility", visibility);
        body = form;
      } else {
        const value = text.trim();
        if (!value)
          throw new Error(
            kind === "faq"
              ? "Add a question first."
              : "Add some context first.",
          );
        const sourceKind =
          kind === "text" && /^https?:\/\/\S+$/.test(value) ? "url" : kind;
        const input = {
          action: "save",
          appId,
          kind: sourceKind,
          visibility,
          title:
            title.trim() ||
            (kind === "faq"
              ? value.slice(0, 160)
              : sourceKind === "url"
                ? "Website context"
                : "Company notes"),
          ...(kind === "faq"
            ? { question: value, answer: answer.trim(), alternatives: [] }
            : sourceKind === "url"
              ? { url: value }
              : { text: value }),
        };
        if (kind === "faq" && !answer.trim())
          throw new Error("Add the verified answer before saving this FAQ.");
        body = JSON.stringify(input);
        headers = { "content-type": "application/json" };
      }
      const r = await fetch("/api/knowledge", {
          method: "POST",
          body,
          headers,
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error || "Couldn’t save this source.");
      await onCreated(data.sourceId);
      setText("");
      setAnswer("");
      setTitle("");
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save this source.");
    } finally {
      setBusy(false);
    }
  }
  const blocked = disabled || busy;
  return (
    <section className="ui-card mb-5 p-5" aria-label="Teach Cue">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Icon name="sparkle" size={16} />
            Teach Cue
          </h2>
          <p className="mt-1 text-xs text-cue-muted">
            Add company facts, a public page, an approved answer or a document.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-cue-line p-0.5">
          {[
            ["text", "Paste or link"],
            ["faq", "FAQ"],
            ["file", "Upload"],
          ].map(([k, label]) => (
            <Button
              key={k}
              variant="ghost"
              disabled={blocked}
              className={kind === k ? "bg-cue-sunken" : ""}
              onClick={() => {
                setKind(k);
                setError("");
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {error && <Notice error>{error}</Notice>}
      <label className="ui-field mb-3">
        Title <span className="text-cue-subtle">Optional</span>
        <input
          className="ui-input"
          maxLength={160}
          value={title}
          disabled={blocked}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Upload policy or billing FAQ"
        />
      </label>
      {kind === "file" ? (
        <label className="ui-field rounded-lg border border-dashed border-cue-line p-4">
          Choose a document
          <input
            type="file"
            accept=".txt,.md,.markdown,.pdf,.docx"
            disabled={blocked}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <small>
            TXT, Markdown, text PDF or DOCX · up to 10 MB. Review the extracted
            text before publishing.
          </small>
        </label>
      ) : (
        <label className="ui-field">
          {kind === "faq" ? "Customer question" : "Context"}
          <textarea
            className="ui-input resize-y font-normal"
            rows={kind === "faq" ? 2 : 4}
            maxLength={kind === "faq" ? 500 : 200000}
            disabled={blocked}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              kind === "faq"
                ? "What do customers ask?"
                : "Paste your policies, product notes or one public URL…"
            }
          />
        </label>
      )}
      {kind === "faq" && (
        <label className="ui-field mt-3">
          Verified answer
          <textarea
            className="ui-input resize-y font-normal"
            rows={3}
            maxLength={5000}
            disabled={blocked}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Write the answer your team has verified."
          />
        </label>
      )}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <label className="ui-field">
          Audience
          <select
            className="ui-input"
            value={visibility}
            disabled={blocked}
            onChange={(e) => setVisibility(e.target.value)}
          >
            <option value="internal">Team only</option>
            <option value="customer">Customers and team</option>
          </select>
        </label>
        <div className="text-right">
          <Button
            variant="primary"
            disabled={
              blocked ||
              (kind === "file"
                ? !file
                : !text.trim() || (kind === "faq" && !answer.trim()))
            }
            onClick={() => void submit()}
          >
            <Icon name="plus" size={14} />
            {busy ? "Saving…" : "Save draft"}
          </Button>
          <p className="mt-2 text-[11px] text-cue-muted">
            Review and publish before Cue uses it.
          </p>
        </div>
      </div>
    </section>
  );
}
