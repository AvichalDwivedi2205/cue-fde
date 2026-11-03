import { packContext } from "./app-pack";

export async function requireNativeChannelApp(appId: string | undefined) {
  if (!appId) throw new Error("Choose the application for this channel");
  const pack = await packContext(appId);
  if (!pack || pack.status !== "active")
    throw new Error("Choose an active registered application for this channel");
  return pack;
}
