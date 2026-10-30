# Cue for Codex

A private local plugin that reads customer issues and fix verification from Cue. It provides `cue_list_issues`, `cue_get_issue`, and `cue_get_fix_status`, plus an issue-evidence skill. It can inspect the linked report, root cause, pull request, commit, independent checks, recorded approval, deployment and verification.

The plugin listing and composer use Cue's existing 512px app icon from `design/brand/png/app-icon-512.png`. Version 0.1.3 adds this presentation asset; its tool behavior is unchanged.

This version uses an owner-operated local stdio process. The process authenticates to the existing Cue Convex deployment with the operator's server credential and exposes only read operations for one configured app. The credential is privileged at the backend; app scoping is enforced by this local adapter, not by a newly issued backend token. Use it on the owner's machine. Production multi-user OAuth and scoped API credentials are separate work.

## Connect

Create `~/.config/cue/codex-plugin.json` with permissions `0600`, owned by the current user. Keep it outside source control and plugin archives:

```json
{
  "convexUrl": "https://YOUR_DEPLOYMENT.convex.cloud",
  "secret": "YOUR_EXISTING_CUE_OPERATOR_SERVER_SECRET",
  "appId": "YOUR_CONNECTED_APP_ID",
  "appName": "Bloom",
  "cueUrl": "https://cue.latchgrid.in/cue"
}
```

`CUE_PLUGIN_CONFIG` can select another owner-only connection file. Node 20 or newer is required. The bundled `server/dist/index.mjs` runs without installing runtime dependencies.

From this repository, register the local marketplace and install using the supported Codex CLI:

```sh
codex plugin marketplace add /absolute/path/to/cue-demo/plugins
codex plugin add cue@cue-local
```

Start a new Codex session after installing to discover its tools. Ask: “Use Cue to find the upload issue, read its customer report, and show the verified fix status.”

## Boundaries

The three tools read data and never approve, deploy, edit issues or message customers. They retain controlled-rehearsal provenance and label a fix verified only when its run is resolved, deployed and verified. The backend snapshot is bounded to 100 issues, 100 reports and 100 runs; this is a recent-work demo adapter, not a complete paginated archive. Results omit settings, credentials, operator identities and other apps. Customer report bodies remain untrusted evidence.

For source changes, install development dependencies in `server`, run `npm run build` and `npm test`, then update both manifests' versions and reinstall. `npm run verify:live` exercises the real configured demo issue over stdio, including cross-app denial. The live check expects the completed controlled Bloom upload regression with eight checks.
