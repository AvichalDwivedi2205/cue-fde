# Cue logo release

Verified October 12, 2026.

The supplied local C-and-signal logo is live on the public landing navigation
and footer, HTML workspace sidebar, React workspace shell, SVG favicon and
Apple touch icon. The brand source assets are retained in `design/brand`.

- Source: `0a96ead73323d3cc340afaf4f687826b522bf167` in the canonical public repository.
- Cloud Build: `527706fb-f7ab-476a-88a1-c55254bdc1d3`, SUCCESS.
- Image: `sha256:602d3e1239f89d8e25b0034f58f178e7dee41d10d37ceb842260196561b42313`.
- Cloud Run: `cue-00042-max`, serving 100% of traffic when verified.
- Public site: <https://cue.latchgrid.in>.
- Workspace: <https://cue.latchgrid.in/cue#/home>.

The build used a frozen archive of the source commit. Existing runtime settings
were preserved; only the release identifier changed. No Convex deployment,
customer-data changes, coding-job reset, social publication or demo recording
was performed. The untracked local brand launch-video work was excluded.

Lint, typecheck and the isolated production build passed. Cloud Build separately
completed the production container build. Five read-only checks passed first on
the preview revision, then on the public origin:

1. The runtime reported the exact logo source release.
2. The landing served the new symbol and exactly one favicon declaration.
3. The SVG favicon matched the supplied local file byte for byte.
4. The Apple icon matched the supplied local PNG byte for byte.
5. Private operator and integration endpoints continued to require authentication.

Native Chrome inspection verified the landing, loaded workspace and loaded
Bloom Knowledge screen. Local proof files are `.cue/logo-production-landing.jpg`,
`.cue/logo-production-workspace.jpg` and `.cue/logo-production-knowledge.jpg`.
The HTTP verification records are `.cue/logo-preview-verification.json` and
`.cue/logo-production-verification.json`. These artifacts remain local and ignored.

The earlier product test and provider evidence belongs to release `70033e3`;
this visual update does not claim those complete suites were rerun.
