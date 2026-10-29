import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

// Keep the supplied reference independently editable and compile its styles
// through the same Tailwind pipeline as the React screens.
const source = await readFile("design/cue.html", "utf8");
const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if (!css) throw new Error("The Cue design stylesheet is missing");
await mkdir(".cue", { recursive: true });
await writeFile(".cue/reference.css", css);
await writeFile(
  ".cue/workspace.css",
  `@import "tailwindcss";
@import "./reference.css" layer(components);
@import "../styles/workspace.css";
@source "../design/cue.html";
@source "../lib/browser";
@source "../app";
`,
);
for (const [input, output] of [
  [".cue/workspace.css", "public/cue-workspace.css"],
  ["styles/widget.css", "public/widget-frame.css"],
]) {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/@tailwindcss/cli/dist/index.mjs",
      "-i",
      input,
      "-o",
      output,
      "--minify",
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
