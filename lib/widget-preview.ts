import { operator } from "./access";

// A signed-in operator can test the real widget on Cue without making Cue an
// allowed origin on their public application. Public embeds keep their allowlist.
export async function widgetOriginAllowed(
  request: Request,
  origins: string[],
  origin: string,
  preview = false,
) {
  if (preview) {
    if (origin !== new URL(process.env.CUE_PUBLIC_URL || request.url).origin)
      return false;
    try {
      await operator(request);
      return true;
    } catch {
      return false;
    }
  }
  return origins.includes(origin);
}
