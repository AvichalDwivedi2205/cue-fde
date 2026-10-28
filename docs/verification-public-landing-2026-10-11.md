# Public Cue landing verification — October 11, 2026

The public root previously returned `307 → /cue`; the protected workspace then sent anonymous visitors to WorkOS. `npx tsx scripts/verify-landing.ts` reproduced the user's missing-landing symptom against the deployed domain before the fix.

`/` now renders the landing portion of the supplied `design/cue.html`, with its typography, hero, sections and integrations. The original design remains byte-identical to commit `453f6c6`. The public response omits the workspace markup and application scripts, displays illustrative reports explicitly as examples, and routes all three workspace buttons to `/cue#/home`. `/cue` and operator APIs keep their existing authentication checks. No backend, approval, integration credential or Bloom behavior changed.

Application release: `4bf279ff80530913d45f6cab6a1bd71984113375`. Frozen-source Cloud Build `10dd3b93-9d5b-487e-b0fa-aac2f85a5d7b` succeeded; image digest `sha256:deea85012f94bad77824078566f406908db6dd7d996647df3f167a17dc03949c`. Cloud Run `cue-00022-2bf` receives 100% of traffic. Runtime configuration preserves all twenty keys; only the application release identifier changed. Subsequent documentation commits are not application deployments.

Validation completed:

- 288 tests across 41 files, lint, typecheck and production build passed. Stale generated route types were regenerated after replacing the redirecting root page with a route handler.
- The original anonymous-root reproduction passed locally. The public-render regression verifies the landing, workspace links, SVG icons, labeled examples and absence of workspace markup/application scripts.
- Five live verifier checks passed at `https://cue.latchgrid.in` against the exact release above: anonymous root returns HTML 200; section/workspace links are present; workspace and four operator APIs remain authenticated; WorkOS starts PKCE with the existing public callback; public health reports the expected release.
- Native Chrome opened the deployed root directly and displayed the landing. Its workspace button opened `Home · Cue` at `/cue#/home`; real saved owner context, inbox and integration health loaded. Browser back returned to the public landing. No write action was taken.
- Local desktop and 393-pixel mobile views were inspected. All section links navigated to their targets; mobile had no horizontal overflow and all workspace actions remained visible. Temporary viewport override was reset.

Private deployment metadata remains ignored under `.cue/`. The deployed landing screenshot is `artifacts/cue-public-landing-4bf279f.png`. These checks cover this routing fix; existing quality limits and deferred platform work remain in their separate reports.
