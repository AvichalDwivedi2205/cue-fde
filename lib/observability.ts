import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

type TraceKind = "WORKFLOW" | "AGENT" | "TOOL";
export type LocalTrace = {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: TraceKind;
  startedAt: number;
  durationMs: number;
  attributes: Record<string, string | number>;
  status:
    | { kind: "running" }
    | { kind: "completed" }
    | { kind: "failed"; message: string };
  input?: unknown;
  output?: unknown;
};
const active = new AsyncLocalStorage<{
  record: LocalTrace;
  failure?: string;
}>();
const localRecords: LocalTrace[] = [];
const maxRecords = 128;

// Mask at the final export boundary, including JSON embedded in span attributes.
// Keep the numeric usage fields intact so cost and latency remain inspectable.
export function redactTelemetry(value: unknown, key = ""): unknown {
  if (
    /^((api|private)[_-]?key|authorization|secret|password|cookie|(access|refresh|bearer|api)[_-]?token|audioContent|inlineData|fileData|image_url|images|groundingDocuments|knowledgeContext)$/i.test(
      key,
    )
  )
    return "[redacted]";
  if (Buffer.isBuffer(value)) return { bytes: value.length };
  if (typeof value === "string") {
    if (/^[\s]*[\[{]/.test(value)) {
      try {
        return JSON.stringify(redactTelemetry(JSON.parse(value)));
      } catch {
        /* Ordinary text, not serialized JSON. */
      }
    }
    let text = value
      .replace(
        /data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+/gi,
        "[image redacted]",
      )
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
      .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]");
    for (const [name, secret] of Object.entries(process.env))
      if (
        /(KEY|SECRET|TOKEN|PASSWORD|COOKIE|CREDENTIAL)/i.test(name) &&
        secret &&
        secret.length >= 8
      )
        text = text.split(secret).join("[redacted]");
    // Raw recordings and other binary payloads have no debugging value here.
    if (/^[A-Za-z0-9+/]{256,}={0,2}$/.test(text)) return "[binary redacted]";
    return text;
  }
  if (Array.isArray(value)) return value.map((item) => redactTelemetry(item));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([name, item]) => [
        name,
        redactTelemetry(item, name),
      ]),
    );
  return value;
}

// Metadata stays in this process. Detailed payload capture is an explicit local diagnostic mode.
export async function initializeObservability() {
  return true;
}

export function readLocalTelemetry(): LocalTrace[] {
  return structuredClone(localRecords);
}

export function instrumentModel<T extends object>(
  client: T,
  _vertex: boolean,
): T {
  return client;
}

function capture(project: () => unknown) {
  try {
    return structuredClone(redactTelemetry(project()));
  } catch {
    return { unavailable: true };
  }
}

export function observed<Args extends unknown[], Result>(
  name: string,
  operation: (...args: Args) => Promise<Result>,
  options: {
    kind?: TraceKind;
    input?: (...args: Args) => unknown;
    output?: (result: Result) => unknown;
  } = {},
) {
  return async (...args: Args): Promise<Result> => {
    const parent = active.getStore();
    const detailed = process.env.CUE_TELEMETRY_LOCAL === "1";
    const record: LocalTrace = {
      traceId: parent?.record.traceId || randomBytes(16).toString("hex"),
      spanId: randomBytes(8).toString("hex"),
      ...(parent ? { parentSpanId: parent.record.spanId } : {}),
      name,
      kind: options.kind || (parent ? "AGENT" : "WORKFLOW"),
      startedAt: Date.now(),
      durationMs: 0,
      attributes: {},
      status: { kind: "running" },
      ...(detailed
        ? {
            input: capture(() =>
              options.input ? options.input(...args) : args,
            ),
          }
        : {}),
    };
    localRecords.push(record);
    if (localRecords.length > maxRecords) localRecords.shift();
    return active.run({ record }, async () => {
      try {
        const result = await operation(...args);
        const failure = active.getStore()?.failure;
        record.status = failure
          ? { kind: "failed", message: failure }
          : { kind: "completed" };
        if (detailed)
          record.output = capture(() =>
            failure
              ? { status: "failed", error: failure }
              : options.output
                ? options.output(result)
                : (result ?? { completed: true }),
          );
        return result;
      } catch (error) {
        const message = String(
          redactTelemetry(
            error instanceof Error ? error.message : String(error),
          ),
        );
        record.status = { kind: "failed", message };
        if (detailed) record.output = { status: "failed", error: message };
        throw error;
      } finally {
        record.durationMs = Date.now() - record.startedAt;
      }
    });
  };
}

export function recordWorkflowFailure(error: unknown) {
  const state = active.getStore();
  if (state)
    state.failure = String(
      redactTelemetry(error instanceof Error ? error.message : String(error)),
    );
}

export function annotateTelemetry(attributes: Record<string, string | number>) {
  const state = active.getStore();
  if (!state) return;
  for (const [name, value] of Object.entries(attributes)) {
    const redacted = redactTelemetry(value, name);
    state.record.attributes[name] =
      typeof redacted === "string" || typeof redacted === "number"
        ? redacted
        : "[redacted]";
  }
}

export function currentTraceId() {
  return active.getStore()?.record.traceId;
}

export async function flushObservability() {
  return true;
}

export async function shutdownObservability() {
  localRecords.length = 0;
}
