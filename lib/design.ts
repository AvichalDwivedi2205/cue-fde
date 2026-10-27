import { promises as fs } from "node:fs";
import path from "node:path";
export async function design(name: "bloom" | "cue") {
  let html = await fs.readFile(
    path.join(process.cwd(), "design", name + ".html"),
    "utf8",
  );
  const bridge = await fs.readFile(
    path.join(process.cwd(), "lib/browser", name + ".js"),
    "utf8",
  );
  html = html.replace(
    name === "cue"
      ? "/* ------------------------------------------------------------------ boot */"
      : "/* ---------- Boot ---------- */",
    bridge +
      "\n" +
      (name === "cue"
        ? "/* ------------------------------------------------------------------ boot */"
        : "/* ---------- Boot ---------- */"),
  );
  if (name === "cue")
    html = html
      .replace(
        "const commit = () => S.run.rev ? 'b71e04d' : 'a3f9c2e';",
        "const commit = () => S.liveRun?.commit?.slice(0,8) || 'pending';",
      )
      .replaceAll("@bloomapp", "@bloomwithcue")
      .replace(
        "<span>Tagged @bloomwithcue</span>",
        "<span>${/@bloomwithcue\\b/i.test(m.text) ? 'Tagged @bloomwithcue' : 'X post'}</span>",
      )
      .replaceAll("a3f9c2e", "example")
      .replaceAll("bloom/bloom-app#128", "Example pull request");
  html = html
    .replaceAll('href="bloom.html"', 'href="/bloom"')
    .replaceAll('href="cue.html"', 'href="/cue"');
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
