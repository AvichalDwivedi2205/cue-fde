# Cue platform and Bloom customer app

Cue is the company-facing platform. Bloom is a consumer photo-journal app that uses Cue for support and engineering follow-through. A company buying Cue should connect its own application and accounts; it should not need to use Bloom.

## Current implementation

Cue is hosted at `cue.latchgrid.in`. The standalone Bloom consumer app is hosted on Vercel at `bloom-with-cue.vercel.app`, with its own Convex project `bloom` and production deployment `accurate-pony-820`. Cue uses project `cue` and production deployment `tangible-kiwi-777`.

Bloom owns journal entries and photo storage. It connects to Cue's public widget and voice gateways as a registered application, with an allowed origin and visitor-scoped support sessions. Cue owns cases, investigations and provider connections. Bloom receives none of Cue's private provider credentials. Its anonymous journal cookie is host-only and signed with a different server secret.

The old `/bloom` route and its existing journal data remain available on Cue's host as a legacy instance. Those records are preserved; no automatic journal migration or cross-host account identity is claimed. The new Bloom app does not read or write that legacy journal database.

The inspected implementation is a configured single-company workspace:

- `lib/access.ts` obtains the WorkOS user and organization ID, but admits operators through the configured owner email and team membership. Organization ID does not scope the data query.
- `lib/integration-config.ts` stores one encrypted integration configuration containing one Slack connection, one X connection and one email connection, plus registered widget applications and repository policies.
- `convex/schema.ts` has app-bound cases and issues, but no company/workspace membership table or workspace ID on support and engineering records.
- `convex/cue.ts` authenticates the trusted server through its secret. Its operator snapshot returns this workspace's records; it does not implement company-scoped authorization.
- The registered-app widget has separate visitor sessions, allowed-origin checks and app-specific grouping. These protect customer conversations within the configured workspace; they do not provide company isolation.
- Coding work uses the owner's local Codex companion and trusted repository policies. Generic bug execution beyond the scoped Bloom upload fixture is not implemented.

Consequently, arbitrary company signup and independent connection management are not ready. Opening registration alone would not create a safe multi-company platform.

## Intended addresses and ownership

| Address                               | Owner and purpose                                                                        |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `cue.latchgrid.in`                    | Cue marketing, company login, onboarding, dashboard, integrations and widget delivery    |
| `bloom-with-cue.vercel.app`           | Bloom consumer app and journal, backed by its own Convex project; Cue support connection |
| A customer's existing application URL | That company's product with the Cue widget installed                                     |

Separate application origins should use host-only cookies. Bloom consumers do not need a Cue operator login. Company staff sign in to Cue. The first implementation can share hosting infrastructure, provided host routing and cookie boundaries are enforced; separate URLs do not themselves isolate company data.

## Self-service company flow

1. Sign in to Cue and create or join a company workspace. Establish the creator as Owner through an authenticated server operation, not a submitted role field.
2. Register an application name and allowed website origins. Generate its public widget install snippet and, optionally, a server-side identity integration.
3. Connect the company's Slack workspace, X brand account and email inbox. Explain real provider permissions, access requirements and connection health. Keep Reddit notification intake and manual capture available while official API access is unavailable.
4. Connect a repository through a scoped GitHub installation. Select allowed repositories, branch/path policy, verification commands and the coding provider or companion.
5. Assign Support, Product and Engineering reviewers. Configure sensitive-action approval and spending limits.
6. Send a marked installation check through the real widget. Show its saved case, source, classification and a delivered response before marking onboarding complete.

No integration must silently inherit Bloom's accounts or the platform owner's personal credentials.

## Implementation order

**First: workspace authorization.** Introduce workspaces and authenticated memberships, mapping WorkOS identity to membership. Carry a trusted workspace ID through server operations. Add workspace ID and appropriate compound indexes to cases, issues, messages, runs, events, jobs, approvals, receipts, application registrations and credentials. Derive scope on the server; reject client-supplied workspace IDs that do not match membership. App IDs belong to one workspace.

Migrate existing records into the current owner's workspace through a widen/backfill/enforce sequence. Preserve public conversation ownership and existing provider deduplication. Do not temporarily expose unscoped snapshots to new members.

**Second: connection ownership.** Replace the singleton integration settings with encrypted per-workspace connections. Bind Slack team IDs, X brand IDs, email receiving routes and GitHub installations to the owning workspace. Webhook dispatch resolves the workspace from verified provider identity, not untrusted text or user-selected routing. Namespace cursors, leases, delivery receipts and deduplication by connection. Bound polling and retry budgets per workspace.

**Third: onboarding.** Add create/join workspace, invite acceptance, application registration and connection flows. Bloom's separate host and journal backend are deployed; company onboarding and isolation remain unimplemented. Keep all operator redirects on the configured Cue origin.

**Fourth: coding-provider execution.** Keep the local companion as an explicit option. Add scoped installation and worker credentials for companies; do not reuse the founder's Codex login. Jobs must carry workspace, application, repository policy and exact approved specification/commit. Validate these again before execution and release confirmation.

## Release gate

The smallest useful proof is two independently owned test companies with different apps, operators and provider connections. Company B must not read, change, approve or execute Company A's cases, files, jobs or secrets, even when it knows their IDs. Test cross-company API access, model grouping, Slack decisions, incoming-email routing, widget tokens, connection changes and background job retries. Same-provider events must reach only the owning company's workspace, once.

Self-service readiness requires that isolation proof plus a real company completing connection and intake without manual database or server-environment edits. If connection approval blocks onboarding, ship a clearly described operator-assisted pilot while retaining enforced workspace isolation. Do not describe a single configured workspace as unrestricted self-service SaaS.

The customer-acquisition feature remains a separate proposal in `growth-plan.md`.
