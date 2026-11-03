import { afterEach, beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../lib/server-store", async () => ({
  api: (await import("../convex/_generated/api")).api,
  db: () => ({ query: state.query }),
  secret: () => "worker-status-fixture",
}));
import { sharedWorkerStatus } from "../lib/integration-checks";

const legacy = {
  slack: { connected: true, detail: "Live channel worker", updatedAt: 1000 },
  notifications: {
    connected: true,
    lastPollAt: 1000,
    imported: 5,
    needsReview: 2,
    backlog: true,
  },
  codex: { loggedIn: true, workerOnline: true, github: true },
  busy: false,
  x: {
    connected: true,
    detail: "Live X worker",
    imported: 8,
    lastPollAt: 1000,
    retryAt: null,
    backlog: false,
  },
};
const coding = {
  coding: {
    provider: "meta",
    model: "muse-wonder-1.0",
    backend: "local",
    configured: true,
    workerOnline: true,
  },
  busy: true,
  slack: { connected: false },
  codex: { loggedIn: false, workerOnline: false, github: false },
};
function rows(
  values: Record<string, { updatedAt: number; value: string } | null>,
) {
  state.query.mockImplementation(
    async (_ref: unknown, args: { key: string }) => values[args.key] || null,
  );
}
const fresh = (value: unknown) => ({
  updatedAt: 1_000_000,
  value: JSON.stringify(value),
});
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(1_000_000);
});
afterEach(() => vi.restoreAllMocks());

test("fresh coding status merges without taking over live channels or legacy Codex", async () => {
  rows({ worker: fresh(legacy), "coding-worker": fresh(coding) });
  const result = await sharedWorkerStatus();
  expect(result).toMatchObject({
    ...legacy,
    busy: true,
    coding: coding.coding,
  });
  expect(state.query.mock.calls.map((call) => call[1].key).sort()).toEqual([
    "coding-worker",
    "worker",
  ]);
});

test("fresh coding alone supplies truthful disabled legacy fields", async () => {
  rows({ worker: null, "coding-worker": fresh(coding) });
  expect(await sharedWorkerStatus()).toMatchObject({
    coding: coding.coding,
    busy: true,
    slack: { connected: false },
    notifications: { connected: false },
    codex: { loggedIn: false, workerOnline: false, github: false },
    x: { connected: false },
  });
});

test("fresh legacy alone retains its backward-compatible status", async () => {
  rows({ worker: fresh(legacy), "coding-worker": null });
  expect(await sharedWorkerStatus()).toEqual(legacy);
});

test("retired Modal status cannot advertise coding availability or hide legacy channels", async () => {
  rows({
    worker: fresh({ ...legacy, coding: { ...coding.coding, backend: "modal" } }),
    "coding-worker": fresh({ ...coding, coding: { ...coding.coding, backend: "modal" } }),
  });
  expect(await sharedWorkerStatus()).toMatchObject({
    slack: legacy.slack,
    codex: legacy.codex,
    coding: { backend: "modal", configured: false, workerOnline: false },
  });
});

test("stale channel status cannot overwrite fresh coding status", async () => {
  rows({
    worker: { ...fresh(legacy), updatedAt: 969_999 },
    "coding-worker": fresh(coding),
  });
  expect(await sharedWorkerStatus()).toMatchObject({
    slack: { connected: false },
    coding: coding.coding,
  });
});

test("stale coding status cannot replace fresh channel status", async () => {
  rows({
    worker: fresh(legacy),
    "coding-worker": { ...fresh(coding), updatedAt: 969_999 },
  });
  expect(await sharedWorkerStatus()).toEqual(legacy);
});

test("malformed JSON and invalid remote fields are isolated to their publisher", async () => {
  rows({
    worker: { updatedAt: 1_000_000, value: "not JSON" },
    "coding-worker": fresh(coding),
  });
  expect(await sharedWorkerStatus()).toMatchObject({
    coding: coding.coding,
    codex: { loggedIn: false },
  });
  rows({
    worker: fresh(legacy),
    "coding-worker": fresh({
      ...coding,
      coding: { ...coding.coding, configured: "yes" },
    }),
  });
  expect(await sharedWorkerStatus()).toEqual(legacy);
  rows({
    worker: fresh({
      ...legacy,
      codex: { loggedIn: "yes", workerOnline: true, github: true },
    }),
    "coding-worker": null,
  });
  await expect(sharedWorkerStatus()).rejects.toThrow("Worker offline");
});

test("one publisher read failure does not hide another fresh publisher", async () => {
  state.query.mockImplementation(
    async (_ref: unknown, args: { key: string }) => {
      if (args.key === "worker") throw new Error("Publisher unavailable");
      return fresh(coding);
    },
  );
  expect(await sharedWorkerStatus()).toMatchObject({ coding: coding.coding });
});

test("both missing or stale publishers are offline", async () => {
  rows({});
  await expect(sharedWorkerStatus()).rejects.toThrow("Worker offline");
  rows({
    worker: { ...fresh(legacy), updatedAt: 969_999 },
    "coding-worker": { ...fresh(coding), updatedAt: 969_999 },
  });
  await expect(sharedWorkerStatus()).rejects.toThrow("Worker offline");
});

test("a stopped coding worker retains configured identity and reports offline", async () => {
  rows({
    "coding-worker": fresh({
      ...coding,
      busy: false,
      coding: { ...coding.coding, workerOnline: false },
    }),
  });
  expect(await sharedWorkerStatus()).toMatchObject({
    busy: false,
    coding: { configured: true, workerOnline: false },
  });
});
