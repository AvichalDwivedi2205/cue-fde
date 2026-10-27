import { headers } from "next/headers";
import { operator } from "@/lib/access";
import { SetupClient } from "./setup-client";
import "./setup.css";
export const dynamic = "force-dynamic";
export default async function Setup() {
  try {
    await operator(
      new Request("http://127.0.0.1", { headers: await headers() }),
    );
  } catch {
    return (
      <main className="setup">
        <h1>Sign in to Cue</h1>
        <p>Only the configured operator can change integrations.</p>
        <a href="/auth/login">Continue to sign in</a>
      </main>
    );
  }
  const h = await headers();
  const origin =
    process.env.CUE_PUBLIC_URL ||
    new URL("http://" + (h.get("host") || "127.0.0.1:3000")).origin;
  return <SetupClient origin={origin} />;
}
