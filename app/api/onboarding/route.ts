import { z } from "zod";
import { sameOrigin, operator } from "@/lib/access";
import { can, requirePermission } from "@/lib/roles";
import { slackConfig } from "@/lib/integration-config";
import { listPacks, packContext, requireActivePack } from "@/lib/app-pack";
import { db, api, secret } from "@/lib/server-store";
import { engineeringInput } from "@/lib/app-pack-schema";

// Application lifecycle for the multi-app workspace. Owner (manage) only:
// registration is deliberately not self-serve while Cue is a single-company
// workspace (docs/platform-boundaries.md). The pack in Convex is canonical;
// the vault keeps Bloom's frozen entry for backward compatibility.

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await operator(request);
    const packs = await listPacks();
    return Response.json(
      { packs },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Operator access required" },
      { status: 401 },
    );
  }
}

async function mutate(action: string, args: Record<string, unknown>) {
  switch (action) {
    case "activate":
      await db().mutation(api.appPacks.activate, {
        secret: secret(),
        appId: String(args.appId),
      });
      return "Application activated. Its widget, knowledge and coding loop are live.";
    case "reactivate":
      await db().mutation(api.appPacks.reactivate, {
        secret: secret(),
        appId: String(args.appId),
      });
      return "Application reactivated.";
    case "suspend":
      await db().mutation(api.appPacks.suspend, {
        secret: secret(),
        appId: String(args.appId),
      });
      return "Application suspended. New sessions and coding runs are refused; history is kept.";
    case "recordInstallCheck":
      await db().mutation(api.appPacks.recordInstallCheck, {
        secret: secret(),
        appId: String(args.appId),
      });
      return "Install verified — a case has been delivered through this widget.";
    case "bindEngineering": {
      const binding = engineeringInput.parse(args.binding);
      await db().mutation(api.appPacks.bindEngineering, {
        secret: secret(),
        appId: String(args.appId),
        repository: binding.repository,
        baseBranch: binding.baseBranch,
        allowedPaths: binding.allowedPaths,
        testCommands: binding.testCommands,
        packageDirectory: binding.packageDirectory,
        packageManager: binding.packageManager,
      });
      return "Repository binding saved. Bug reports on this app can now be investigated.";
    }
    case "unbindEngineering":
      await db().mutation(api.appPacks.unbindEngineering, {
        secret: secret(),
        appId: String(args.appId),
      });
      return "Repository binding removed.";
    case "setRouting": {
      const memberId = typeof args.engineeringMemberId === "string"
        ? args.engineeringMemberId.trim() : undefined;
      if (memberId) {
        const config = await slackConfig();
        const member = config?.members?.find((m) => m.slackId === memberId);
        if (!member || !can(member.role, "investigate") || !can(member.role, "deploy"))
          throw new Error("Assign a connected Engineering or Owner member");
      }
      await db().mutation(api.appPacks.setRouting, {
        secret: secret(),
        appId: String(args.appId),
        label:
          typeof args.label === "string" && args.label.trim()
            ? args.label.trim().slice(0, 60)
            : undefined,
        engineeringChannel:
          typeof args.engineeringChannel === "string"
            ? args.engineeringChannel.trim()
            : undefined,
        engineeringMemberId: memberId,
      });
      return "Slack routing saved.";
    }
    case "checkEngineering": {
      const pack = await requireActivePack(String(args.appId));
      if (!pack.engineering)
        throw new Error("Bind a repository first");
      const { execFile } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const exec = promisify(execFile);
      const view = await exec(
        "gh",
        [
          "repo",
          "view",
          pack.engineering.repository,
          "--json",
          "name,defaultBranchRef",
        ],
        { timeout: 30_000, maxBuffer: 1024 * 1024 },
      ).catch((e) => {
        throw new Error(
          `GitHub check failed for ${pack.engineering?.repository}: ${e.message}`,
        );
      });
      const repo = JSON.parse(view.stdout) as {
        name: string;
        defaultBranchRef?: { name?: string };
      };
      return `GitHub check passed for ${repo.name}${
        repo.defaultBranchRef?.name
          ? ` (default branch ${repo.defaultBranchRef.name})`
          : ""
      }. The full baseline check runs when the first bug is investigated.`;
    }
    default:
      throw new Error("Unknown application action");
  }
}

export async function POST(request: Request) {
  let actor;
  try {
    sameOrigin(request);
    actor = await operator(request);
    requirePermission(actor, "manage");
  } catch {
    return Response.json(
      { error: "Operator access required" },
      { status: 401 },
    );
  }
  try {
    const b = (await request.json()) as {
      action: string;
      appId?: string;
      label?: string;
      engineeringChannel?: string;
      engineeringMemberId?: string;
      binding?: Record<string, unknown>;
    };
    z.string().min(1).max(100).parse(b.appId);
    if (!(await packContext(String(b.appId))))
      throw new Error("Application not found");
    const message = await mutate(b.action, b as Record<string, unknown>);
    return Response.json({ ok: true, message });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Request failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
