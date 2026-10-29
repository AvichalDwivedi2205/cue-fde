import { headers } from "next/headers";
import { operator } from "@/lib/access";
import { WorkspaceShell } from "../components/workspace-shell";
import { CustomersClient } from "./customers-client";
export const dynamic = "force-dynamic";
export default async function CustomersPage() {
  let actor;
  try {
    actor = await operator(
      new Request("http://127.0.0.1", { headers: await headers() }),
    );
  } catch {
    return (
      <WorkspaceShell active="prospects" title="Cue customers">
        <main className="ui-page">
          <h1 className="text-xl font-semibold">Sign in to Cue</h1>
          <a className="ui-button mt-4" href="/auth/login">
            Continue to sign in
          </a>
        </main>
      </WorkspaceShell>
    );
  }
  return (
    <WorkspaceShell active="prospects" title="Cue customers" user={actor}>
      <CustomersClient />
    </WorkspaceShell>
  );
}
