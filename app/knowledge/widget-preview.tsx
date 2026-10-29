"use client";
import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "../components/ui";
export function WidgetPreview({
  app,
  name,
  model,
  sources,
}: {
  app: string;
  name: string;
  model: string;
  sources: number;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [origin, setOrigin] = useState(""),
    [reset, setReset] = useState(0),
    [open, setOpen] = useState(true);
  useEffect(() => {
    queueMicrotask(() => setOrigin(location.origin));
  }, []);
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow || e.origin !== origin)
        return;
      if (e.data?.type === "cue:close") {
        setOpen(false);
        return;
      }
      if (e.data?.type !== "cue:ready") return;
      frame.current?.contentWindow?.postMessage(
        {
          type: "cue:init",
          app,
          origin,
          name: "Widget test",
          page: origin + "/knowledge",
          preview: true,
        },
        origin,
      );
    };
    addEventListener("message", onMessage);
    return () => removeEventListener("message", onMessage);
  }, [app, origin, reset]);
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      <section className="relative flex min-h-[690px] min-w-0 items-center justify-center overflow-hidden rounded-xl border border-cue-line bg-cue-sunken p-3 md:p-6">
        <div className="absolute inset-x-0 top-0 flex h-9 items-center gap-1.5 border-b border-cue-line bg-cue-panel px-4">
          <i className="size-1.5 rounded-full bg-cue-line" />
          <i className="size-1.5 rounded-full bg-cue-line" />
          <i className="size-1.5 rounded-full bg-cue-line" />
          <span className="ml-2 font-mono text-[10px] text-cue-subtle">
            {name} · live widget preview
          </span>
        </div>
        {origin && (
          <iframe
            key={`${app}-${reset}`}
            ref={frame}
            className={`relative mt-8 h-[600px] w-full max-w-[380px] rounded-xl border border-cue-line bg-white shadow-xl ${open ? "" : "hidden"}`}
            title={`${name} customer support preview`}
            src={`/widget?app=${encodeURIComponent(app)}&origin=${encodeURIComponent(origin)}&preview=1`}
            allow="microphone"
          />
        )}
        {!open && (
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Icon name="chat" size={16} />
            Open support
          </Button>
        )}
      </section>
      <aside className="space-y-4">
        <div className="ui-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <Icon name="chat" size={14} />
            Live customer widget
          </h2>
          <p className="text-xs leading-relaxed text-cue-muted">
            This is the installed widget, using {name}’s published knowledge.
            Messages create real support cases in your Inbox.
          </p>
          <Button
            className="mt-4 w-full"
            onClick={() => {
              setOpen(true);
              setReset((n) => n + 1);
            }}
          >
            <Icon name="refresh" size={14} />
            Start a new conversation
          </Button>
        </div>
        <div className="ui-card p-4">
          <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold">
            <Icon name="shield" size={14} />
            Answer boundaries
          </h2>
          <ul className="list-disc space-y-2 pl-4 text-xs text-cue-muted">
            <li>Published, customer-facing knowledge only</li>
            <li>Internal sources stay private</li>
            <li>Citations link answers to passages</li>
            <li>Uncertain answers stay available for staff review</li>
          </ul>
        </div>
        <div className="ui-card p-4">
          <h2 className="mb-3 text-xs font-semibold">This preview</h2>
          <p className="text-xs text-cue-muted">
            {model}
            <br />
            {sources} published customer-facing sources
          </p>
          <a className="ui-button mt-4" href="/setup#widget">
            Widget settings <Icon name="ext" size={12} />
          </a>
        </div>
      </aside>
    </div>
  );
}
