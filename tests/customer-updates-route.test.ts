import { beforeEach, expect, test, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({
  operator: vi.fn(), sameOrigin: vi.fn(), query: vi.fn(), mutation: vi.fn(),
  prepare: vi.fn(), approve: vi.fn(), send: vi.fn(), reconcile: vi.fn(), external: vi.fn(),
}));
vi.mock("../lib/access", () => ({ operator: m.operator, sameOrigin: m.sameOrigin, workosReady: () => true }));
vi.mock("../lib/server-store", async () => ({ api: (await import("../convex/_generated/api")).api, db: () => ({ query: m.query, mutation: m.mutation }), secret: () => "deterministic-session-secret" }));
vi.mock("../lib/customer-updates", () => ({ prepareCustomerUpdate: m.prepare, approveCustomerUpdate: m.approve, sendCustomerUpdate: m.send, reconcileCustomerUpdate: m.reconcile }));
vi.mock("../lib/gemini", () => ({ geminiReady: () => false, generateSpec: m.external }));
vi.mock("../lib/support-reply", () => ({ prepareSupportReply: m.external }));
vi.mock("../lib/engineering-slack", () => ({ openEngineeringHandoff: m.external }));
vi.mock("../lib/attachment", () => ({ saveAttachment: m.external, parseScreenshot: m.external }));
vi.mock("../lib/triage", () => ({ triage: m.external }));
vi.mock("../lib/delivery", () => ({ sendApproval: m.external, sendEmail: m.external, sendSlackReply: m.external, sendSpecApproval: m.external }));
vi.mock("../lib/integration-config", () => ({ emailConfig: m.external, slackConfig: m.external, readIntegrations: m.external }));
vi.mock("../lib/integration-checks", () => ({ slackRuntimeStatus: m.external, notificationRuntimeStatus: m.external, xRuntimeStatus: m.external }));
vi.mock("../lib/model-config", () => ({ configuredRoute: m.external, routeReadiness: m.external }));
vi.mock("../lib/knowledge-answer", () => ({ answerKnowledge: m.external }));
vi.mock("../lib/app-pack", () => ({
  listPacks: m.external,
  requireSessionPack: async (id: string) => { if (id !== "app-a") throw new Error("Unknown app"); return { appId: id, name: "App A", status: "active", origins: ["https://app-a.test"] }; },
  asWidgetApp: (pack: { appId: string; name: string; origins: string[] }) => ({ id: pack.appId, name: pack.name, origins: pack.origins, createdAt: 1 }),
}));
vi.mock("../lib/widget-preview", () => ({ widgetOriginAllowed: async (_: Request, origins: string[], origin: string) => origins.includes(origin) }));
import { POST } from "../app/api/demo/route";
import { POST as widgetPOST } from "../app/api/widget/route";
import { api } from "../convex/_generated/api";
import { issueWidgetSession, verifyWidgetSession } from "../lib/widget-session";

beforeEach(() => {
  vi.resetAllMocks();
  m.operator.mockResolvedValue({ id: "operator-server", name: "Server Support", role: "support" });
  m.prepare.mockResolvedValue({ id: "delivery-a" });
  m.query.mockResolvedValue({ _id: "delivery-a" });
});
const request = (body: object, path = "demo") => new NextRequest("https://cue.test/api/" + path, { method: "POST", headers: { "content-type": "application/json", origin: "https://cue.test", host: "cue.test" }, body: JSON.stringify(body) });
const review = { id: "delivery-a", reviewHash: "a".repeat(64) };
const forged = { actor: "Forged Owner", owner: "Forged Owner", role: "owner", body: "Injected body", recipient: "attacker@example.test" };

test("prepare derives actor from authenticated operator; saved review only reads storage", async () => {
  expect((await POST(request({ action: "customerUpdatePrepare", caseId: "case-a", runId: "run-a", ...forged }))).status).toBe(200);
  expect(m.prepare).toHaveBeenCalledExactlyOnceWith({ caseId: "case-a", runId: "run-a", actor: "Server Support" });
  expect(m.query).toHaveBeenCalledWith(api.supportDeliveries.get, { secret: "deterministic-session-secret", id: "delivery-a" });
  expect((await POST(request({ action: "customerUpdateReview", id: "delivery-a", ...forged }))).status).toBe(200);
  expect(m.query).toHaveBeenCalledTimes(2);
  expect(m.approve).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled(); expect(m.reconcile).not.toHaveBeenCalled();
});

test("explicit send approves exact review hash with server actor before sending; no caller text/destination leaks", async () => {
  expect((await POST(request({ action: "customerUpdateSend", ...review, ...forged }))).status).toBe(200);
  expect(m.approve).toHaveBeenCalledExactlyOnceWith({ ...review, actor: "Server Support" });
  expect(m.send).toHaveBeenCalledExactlyOnceWith(review);
  expect(m.approve.mock.invocationCallOrder[0]).toBeLessThan(m.send.mock.invocationCallOrder[0]);
  expect(m.external).not.toHaveBeenCalled();
});

test("approval failure never invokes send; reconciliation only invokes readback boundary", async () => {
  m.approve.mockRejectedValueOnce(new Error("Review superseded"));
  expect((await POST(request({ action: "customerUpdateSend", ...review }))).status).toBe(400);
  expect(m.send).not.toHaveBeenCalled(); expect(m.query).not.toHaveBeenCalled();
  expect((await POST(request({ action: "customerUpdateReconcile", ...review, providerId: "  receipt-a  ", ...forged }))).status).toBe(200);
  expect(m.reconcile).toHaveBeenCalledExactlyOnceWith({ id: "delivery-a", providerId: "receipt-a" });
  expect(m.send).not.toHaveBeenCalled(); expect(m.approve).toHaveBeenCalledTimes(1);
});

test.each(["engineering", "product"])("%s cannot call any support update action despite forged owner", async (role) => {
  m.operator.mockResolvedValue({ id: "server", name: "Server User", role });
  for (const action of ["customerUpdatePrepare", "customerUpdateReview", "customerUpdateSend", "customerUpdateReconcile"]) {
    const response = await POST(request({ action, caseId: "case-a", runId: "run-a", ...review, ...forged }));
    expect(response.status).toBe(400); expect(await response.json()).toEqual({ error: expect.stringContaining("cannot perform support") });
  }
  for (const spy of [m.prepare, m.approve, m.send, m.reconcile, m.query, m.mutation, m.external]) expect(spy).not.toHaveBeenCalled();
});

test.each(["support", "product", "engineering", "owner"])("preview acceptance enforces real deploy permission for %s and uses server actor", async (role) => {
  m.operator.mockResolvedValue({ id: "server", name: "Server Engineer", role });
  const response = await POST(request({ action: "previewAcceptance", runId: "run-a", commit: "c".repeat(40), deploymentId: "dpl_example", observations: "Verified the saved report in the approved preview and confirmed the expected behavior. ".repeat(2), ...forged }));
  if (["engineering", "owner"].includes(role)) {
    expect(response.status).toBe(200);
    expect(m.mutation).toHaveBeenCalledWith(api.previewAcceptance.record, expect.objectContaining({ actor: "Server Engineer", runId: "run-a", commit: "c".repeat(40) }));
  } else { expect(response.status).toBe(400); expect(m.mutation).not.toHaveBeenCalled(); }
  expect(m.send).not.toHaveBeenCalled();
});

test("invalid hash, authentication failure and same-origin rejection reach no provider/store boundary", async () => {
  expect((await POST(request({ action: "customerUpdateSend", ...review, reviewHash: "bad" }))).status).toBe(400);
  m.operator.mockRejectedValueOnce(new Error("Sign in first"));
  expect((await POST(request({ action: "customerUpdateSend", ...review }))).status).toBe(400);
  m.sameOrigin.mockImplementationOnce(() => { throw new Error("Request origin rejected"); });
  expect((await POST(request({ action: "customerUpdateSend", ...review }))).status).toBe(400);
  for (const spy of [m.approve, m.send, m.query, m.mutation, m.external]) expect(spy).not.toHaveBeenCalled();
});

const app = { id: "app-a", name: "App A", origins: ["https://app-a.test"], createdAt: 1 };
test("contact opt-in/revoke preserve exact email case and derive owner from actual signed session", async () => {
  const token = issueWidgetSession(app, app.origins[0]);
  const base = { action: "contact", app: app.id, origin: app.origins[0], token, caseId: "case-a", ...forged };
  for (const contact of [{ kind: "opt_in", address: "Exact.Case@Example.test" }, { kind: "revoke" }]) {
    expect((await widgetPOST(request({ ...base, contact }, "widget"))).status).toBe(200);
    expect(m.mutation).toHaveBeenLastCalledWith(api.widgetContact.set, { secret: "deterministic-session-secret", owner: verifyWidgetSession(token, app, app.origins[0]), appId: app.id, caseId: "case-a", contact });
  }
  expect(m.send).not.toHaveBeenCalled(); expect(m.external).not.toHaveBeenCalled();
});
test("invalid/wrong-app/wrong-origin signed contact and malformed opt-in cannot write", async () => {
  const token = issueWidgetSession(app, app.origins[0]);
  const base = { action: "contact", app: app.id, origin: app.origins[0], token, caseId: "case-a", contact: { kind: "opt_in", address: "Exact.Case@Example.test" } };
  for (const patch of [{ token: "forged" }, { app: "app-other" }, { origin: "https://foreign.test" }, { contact: { kind: "opt_in", address: "invalid" } }, { contact: { kind: "revoke", address: "unwanted@example.test" } }]) {
    expect((await widgetPOST(request({ ...base, ...patch }, "widget"))).ok).toBe(false);
  }
  expect(m.mutation).not.toHaveBeenCalled(); expect(m.query).not.toHaveBeenCalled(); expect(m.external).not.toHaveBeenCalled();
});
