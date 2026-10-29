import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";

// Keep the supplied reference independently editable and compile its styles
// through the same Tailwind pipeline as the React screens.
const source = await readFile("design/cue.html", "utf8");
const css = source.match(/<style>([\s\S]*?)<\/style>/)?.[1];
if (!css) throw new Error("The Cue design stylesheet is missing");

// Compile only the reference's landing presentation, never its workspace,
// simulated agent runs, local storage bridge or application router.
function excerpt(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Missing landing block: ${start}`);
  return source.slice(from, to);
}
const landingIcons = excerpt("const P = {", "const cueWordmark =");
const landingStory = excerpt(
  "const STORY = [",
  "function initLanding()",
).replace("  if (S.sec) return;\n", "");
await writeFile(
  "public/cue-landing.js",
  `// Generated from the supplied design by scripts/build-ui.mjs.
// Presentation only. No workspace data, API calls or product actions.
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = n => String(n).padStart(2, '0');
${landingIcons}
${landingStory}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-scroll]');
  if (!a) return;
  const target = $(a.getAttribute('href'));
  if (!target) return;
  e.preventDefault();
  target.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' });
});
initStory();
})();
`,
);
const syntax = spawnSync(
  process.execPath,
  ["--check", "public/cue-landing.js"],
  { stdio: "inherit" },
);
if (syntax.status !== 0) process.exit(syntax.status || 1);
await mkdir(".cue", { recursive: true });
await writeFile(".cue/reference.css", css);
await writeFile(
  ".cue/workspace.css",
  `@import "tailwindcss" source(none);
@import "./reference.css" layer(components);
@import "../styles/workspace.css";
@source "../design/cue.html";
@source "../lib/browser";
@source "../app";
@source "../components";
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
