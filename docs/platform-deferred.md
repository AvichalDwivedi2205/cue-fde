# Deferred platform work

This backlog is separate from the approved configured-workspace Agent and Bloom Growth release. Its presence does not close any pending acceptance check in [implementation progress](implementation-progress.md).

The inspected boundaries and migration order remain in [platform boundaries](platform-boundaries.md).

| Work                                                | Required outcome before release                                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Company workspaces and authenticated membership     | Server-derived company scope on every read, action, approval, execution and model context; no client-assigned authority                                   |
| Tenant data migration                               | Widen, backfill current records, validate ownership, then enforce compound indexes and scoped access without exposing unscoped snapshots                  |
| Company-owned provider connections                  | Encrypted connections per company; verified provider identities route webhooks; independent cursors, leases, deduplication and receipts                   |
| Self-service onboarding and invitations             | A real second company joins, registers an app, connects its own accounts and receives widget intake without manual database/environment edits             |
| Scoped repository installation and coding execution | Company-owned installation/worker credentials, repository/path policy, exact specification and commit validation, independent credentials and budgets     |
| General investigation and release adapters          | Real supported execution, tests, review and deployed acceptance for each adapter; the existing Bloom upload fixture is not a generic runner               |
| Consumer account, sync and migration                | Explicit ownership model and cross-host migration; current anonymous journals and legacy memories remain separate                                         |
| Lifecycle, referrals and Cue-buyer campaigns        | Separate opt-in policy, participants, measurement and delivery permissions; no implied authorization to contact strangers                                 |
| Voice and agent extensions                          | Real-time consumer voice, operator-agent voice, custom agents, separate Slack identities/DMs and canvas require independent scope and acceptance          |
| Additional providers                                | Reddit discovery remains unavailable pending official access. Claude Code is not connected. Listening vendors require an evaluated need and approved cost |

The platform release gate is **two independently owned test companies**, each with its own operators, apps and provider accounts. Company B must fail to read, alter, approve or execute Company A's records, files, jobs and secrets even when IDs are known. Include model grouping, Slack decisions, email routing, widget tokens and background retries. Each provider event must reach its owning company once.

The activation experiment is also deferred validation: at least 20 eligible opt-in visitors per arm, matched distribution budgets and seven-day observation. Compare a fixed supported answer with the grounded answer and proof. Exclude internal/controlled/returning browsers; report publication, visit, first save, caption match and return separately. Stop increasing distribution if visitors fail to activate; improve onboarding first. This is not a revenue claim or recruitment authorization.

Resource estimates for this backlog require separate planning after the configured-workspace release. The historical 7.5–11-hour estimate covered Growth alone and is not an estimate for multi-company SaaS.
