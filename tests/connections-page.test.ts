import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  members: vi.fn(),
  integrations: vi.fn(),
  providers: vi.fn(),
  pipes: vi.fn<(props: { accessToken: string; shared: boolean }) => string>(
    () => "Pipes controls",
  ),
  signOut: vi.fn(),
}));
vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: m.auth }));
vi.mock("@workos-inc/node", () => ({
  WorkOS: class {
    pipes = { listDataIntegrations: m.providers };
  },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "cue.test" }),
  cookies: vi.fn(),
}));
vi.mock("../lib/server-store", () => ({
  secret: () => "connections-fixture-secret",
}));
vi.mock("../lib/integration-config", () => ({
  slackConfig: m.members,
  readIntegrations: m.integrations,
}));
vi.mock("../app/connections/pipes-connections", () => ({
  PipesConnections: m.pipes,
}));
vi.mock("../app/auth/actions", () => ({ signOutAction: m.signOut }));
import Connections from "../app/connections/page";
import { WorkspaceShell } from "../app/components/workspace-shell";

function session(email: string, emailVerified = true) {
  return {
    user: {
      id: "user-" + email,
      email,
      emailVerified,
      firstName: "Session",
      lastName: "Identity",
    },
    accessToken: "fixture-access-token",
    organizationId: "fixture-org",
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("WORKOS_API_KEY", "fixture-workos-key");
  vi.stubEnv("WORKOS_CLIENT_ID", "fixture-client");
  vi.stubEnv("WORKOS_COOKIE_PASSWORD", "fixture-password");
  vi.stubEnv("CUE_OPERATOR_EMAIL", "owner@example.test");
  m.members.mockResolvedValue({
    members: [
      { email: "owner@example.test", name: "Primary Owner", role: "owner" },
      {
        email: "support@example.test",
        name: "Support Member",
        role: "support",
      },
      { email: "other-owner@example.test", name: "Other Owner", role: "owner" },
    ],
  });
  m.integrations.mockResolvedValue({
    apps: [
      {
        id: "private-app",
        name: "Private customer app",
        origins: ["https://customer.test"],
      },
    ],
  });
  m.providers.mockResolvedValue({ data: [{ enabled: true }] });
});
afterEach(() => vi.unstubAllEnvs());

test.each([
  session("nonmember@example.test"),
  session("owner@example.test", false),
])(
  "signed-in unauthorized or unverified users cannot load workspace apps or Pipes: %j",
  async (identity) => {
    m.auth.mockResolvedValue(identity);
    const page = await Connections();
    expect(page.props.user).toBeUndefined();
    await WorkspaceShell(page.props);
    expect(m.integrations).not.toHaveBeenCalled();
    expect(m.providers).not.toHaveBeenCalled();
    const html = renderToStaticMarkup(page.props.children);
    expect(html).toContain("Operator access required");
    expect(html).toContain("Sign out");
    expect(html).not.toContain("Pipes controls");
    expect(m.auth).toHaveBeenNthCalledWith(1, { ensureSignedIn: true });
  },
);

test.each(["support@example.test", "other-owner@example.test"])(
  "authorized member %s gets a verified actor but cannot manage primary-owner Pipes",
  async (email) => {
    m.auth.mockResolvedValue(session(email));
    const page = await Connections();
    expect(page.props.user).toMatchObject({
      email,
      name: email.startsWith("support") ? "Support Member" : "Other Owner",
    });
    await WorkspaceShell(page.props);
    expect(m.integrations).toHaveBeenCalledTimes(1);
    expect(m.providers).not.toHaveBeenCalled();
    expect(renderToStaticMarkup(page.props.children)).not.toContain(
      "Pipes controls",
    );
  },
);

test("the verified primary owner retains Pipes and the existing signed-in session", async () => {
  m.auth.mockResolvedValue(session("OWNER@example.test"));
  const page = await Connections();
  expect(page.props.user).toMatchObject({
    role: "owner",
    name: "Primary Owner",
    email: "OWNER@example.test",
  });
  expect(m.providers).toHaveBeenCalledTimes(1);
  const html = renderToStaticMarkup(page.props.children);
  expect(html).toContain("Pipes controls");
  expect(html).toContain("Sign out");
  expect(m.pipes.mock.calls[0][0]).toMatchObject({
    accessToken: "fixture-access-token",
    shared: true,
  });
  expect(m.signOut).not.toHaveBeenCalled();
});

test("missing WorkOS configuration retains the public setup view without local authorization fallback", async () => {
  vi.stubEnv("WORKOS_API_KEY", "");
  const page = await Connections();
  expect(page.props.user).toBeUndefined();
  await WorkspaceShell(page.props);
  expect(m.auth).not.toHaveBeenCalled();
  expect(m.integrations).not.toHaveBeenCalled();
  expect(m.providers).not.toHaveBeenCalled();
  expect(renderToStaticMarkup(page.props.children)).toContain(
    "WorkOS account setup needed",
  );
});
