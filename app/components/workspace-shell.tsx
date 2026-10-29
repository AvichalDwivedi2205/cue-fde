import type { ReactNode } from "react";
import { CueSymbol, CueWordmark, Icon } from "./ui";
import { readIntegrations } from "@/lib/integration-config";
import { WorkspacePreferences } from "./workspace-preferences";
import { WorkspaceApplication } from "./workspace-application";

const groups = [
  {
    label: "",
    links: [
      ["home", "Home", "home", "/cue#/home"],
      ["inbox", "Inbox", "inbox", "/cue#/inbox"],
    ],
  },
  {
    label: "",
    links: [
      ["issues", "Issues", "bug", "/cue#/issues"],
      ["features", "Requests", "bulb", "/cue#/features"],
      ["growth", "Growth", "trend", "/cue#/growth"],
      ["knowledge", "Knowledge", "book", "/knowledge"],
    ],
  },
  {
    label: "",
    links: [
      ["agents", "Agents", "bot", "/cue#/agents"],
      ["settings", "Settings", "settings", "/settings"],
    ],
  },
] as const;

export async function WorkspaceShell({
  active,
  title,
  user,
  children,
}: {
  active: string;
  title: string;
  user?: { name: string; role: string };
  children: ReactNode;
}) {
  const integrations = user ? await readIntegrations() : undefined;
  const preferences = integrations?.workspace;
  const activeSection = ["integrations", "setup", "connections"].includes(
    active,
  )
    ? "settings"
    : active === "agent"
      ? "agents"
      : active;
  const workspaceName = preferences?.name || "Cue workspace";
  const initials = (user?.name || "Cue")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <WorkspacePreferences timezone={preferences?.timezone || "Asia/Kolkata"}>
      <div className="grid h-dvh grid-cols-[64px_minmax(0,1fr)] grid-rows-[52px_minmax(0,1fr)] min-[961px]:grid-cols-[232px_minmax(0,1fr)]">
        <a
          href="#workspace-content"
          className="fixed -top-16 left-20 z-50 rounded-lg bg-white px-4 py-2 focus:top-2"
        >
          Skip to content
        </a>
        <aside
          className="row-span-2 flex min-w-0 flex-col overflow-y-auto bg-cue-sidebar px-2 py-3 text-cue-nav min-[961px]:px-2.5"
          aria-label="Sidebar"
        >
          <a
            href="/cue#/home"
            className="mb-3 flex items-center justify-center gap-1.5 px-2 pb-1 min-[961px]:justify-start"
            aria-label="Cue home"
          >
            <CueSymbol size={22} />
            <span className="hidden min-[961px]:flex">
              <CueWordmark height={15} />
            </span>
          </a>
          <nav aria-label="Workspace navigation">
            {groups.map((group) => (
              <div className="mb-2" key={group.links[0][0]}>
                {group.label && (
                  <div className="hidden px-2.5 pt-3 pb-1.5 font-mono text-[10.5px] tracking-wider text-cue-nav-muted uppercase min-[961px]:block">
                    {group.label}
                  </div>
                )}
                {group.links.map(([key, label, symbol, href]) => (
                  <a
                    key={key}
                    href={href}
                    title={label}
                    aria-label={label}
                    aria-current={activeSection === key ? "page" : undefined}
                    className={`relative my-0.5 flex min-h-9 items-center justify-center gap-2.5 rounded-[7px] px-2.5 text-xs font-medium hover:bg-cue-nav-active hover:text-white min-[961px]:min-h-8 min-[961px]:justify-start ${activeSection === key ? "bg-cue-nav-active text-white before:absolute before:top-2 before:bottom-2 before:-left-2 before:w-0.5 before:bg-cue-green" : ""}`}
                  >
                    <Icon name={symbol} />
                    <span className="hidden min-[961px]:inline">{label}</span>
                  </a>
                ))}
              </div>
            ))}
          </nav>
          <div className="mt-auto flex items-center justify-center gap-2 px-2 pt-6 pb-2 text-xs text-cue-nav-muted min-[961px]:justify-start">
            <Icon name="leaf" size={14} className="text-cue-green" />
            <span className="hidden truncate min-[961px]:inline">
              {workspaceName}
            </span>
          </div>
        </aside>
        <header className="col-start-2 flex min-w-0 items-center gap-3 border-b border-cue-line bg-cue-panel px-3 md:px-[18px]">
          <WorkspaceApplication
            apps={(integrations?.apps || []).map(({ id, name }) => ({
              id,
              name,
            }))}
            workspaceName={workspaceName}
          />
          <span className="hidden text-cue-subtle sm:inline">/</span>
          <span className="hidden truncate text-cue-subtle sm:inline">
            {title}
          </span>
          <div className="ml-auto flex items-center gap-4">
            <a
              href="/cue#/home"
              className="flex items-center gap-1.5 text-xs"
              title="Review pending decisions"
            >
              <Icon name="hourglass" size={15} />
              <span className="hidden md:inline">Your turn</span>
            </a>
            <a
              href="/settings"
              className="grid size-7 place-items-center rounded-full bg-cue-green text-[11px] font-semibold text-white"
              title={user ? `${user.name} · ${user.role}` : "Account settings"}
            >
              {initials}
            </a>
          </div>
        </header>
        <div
          id="workspace-content"
          className="col-start-2 min-h-0 min-w-0 overflow-y-auto"
        >
          {children}
        </div>
      </div>
    </WorkspacePreferences>
  );
}
