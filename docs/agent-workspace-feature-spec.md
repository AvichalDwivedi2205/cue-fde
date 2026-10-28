# Cue Agent Workspace Feature Specification

Date: October 11, 2026  
Status: Approved product direction; configured-workspace implementation deployed and functional acceptance recorded in [the verification report](verification-agent-growth-2026-10-11.md)<br>
Audience: Product designer and implementation engineers  
Related plans: [Growth](growth-plan.md), [platform boundaries](platform-boundaries.md)

## Product decision

Make named, addressable agents the primary way to manage Cue. Operators select an agent, discuss its work, issue instructions and inspect the resulting tasks and evidence. Home highlights decisions requiring attention. Agent Activity provides the shared execution history.

Defer the infinite canvas. A later canvas can visualize the same task records and agent handoffs after the conversation and task workflow works. No canvas or editable workflow builder is required for the first release.

The user owns visual design. This specification defines behavior, information, permissions and implementation contracts rather than colors, typography or screen geometry.

## Objective and initial scope

Help the team operating a connected consumer app understand and direct its support, engineering and growth work through Cue and Slack.

The first release serves the existing configured workspace and registered Bloom app. Reuse the current authentication, connections, case/issue records, approvals and local coding companion. Adding new agent records does not establish multi-company isolation; self-service company onboarding remains separate work described in the platform boundaries plan.

The primary hypothesis is that an agent directory, contextual conversation and visible next actions let operators find blockers and direct work more quickly than navigating a canvas. This is a product hypothesis to test, not an established usability result.

## Core concepts

| Concept      | Meaning                                                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent        | A stable role with a name, purpose, permitted tools and contextual conversation. It can process multiple independent tasks within configured limits. |
| Collector    | A channel adapter that receives notifications or performs authorized reads. Routine collection does not require an LLM call for every event.         |
| Task         | One bounded unit of work with an owner, state, stage, inputs, evidence and completion condition.                                                     |
| Case         | A customer's conversation or report. Several cases can point to the same issue.                                                                      |
| Issue        | A grouped problem or feature need, shared across channels.                                                                                           |
| Opportunity  | A possible growth fit with an original source and explicit need. It is distinct from a support case and from an acquired customer.                   |
| Conversation | A persisted exchange between an operator and an agent, with explicit app and optional task context.                                                  |
| Handoff      | A recorded transfer or child-task creation with the relevant context and a named receiving role.                                                     |
| Coordinator  | Server-controlled assignment, dependency, deduplication, scheduling and authorization logic shared by all agents.                                    |
| Evidence     | A reference to an actual source, receipt, specification, code commit, test result, release check or product event.                                   |

Agent identity must remain separate from the model generating a reply. The same Gemini service can power several roles with different context and tool permissions. Agents execute on incoming events, scheduled work or operator instructions.

## Addressable agents

Use descriptive role names in the first release. Human reviewers retain their existing identities and approval roles.

| Agent       | Owns                                                                                                    | Example instructions                                                               | Boundary                                                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| X           | Authorized collection, source provenance, collection health and routing of X reports or inquiries       | Show recent mentions; explain why a post was missed; run bounded collection        | Respect connection access, budget and checkpoints. Collection does not authorize public posting.                             |
| Reddit      | Permitted notification intake, assisted capture, source context and routing                             | Show incoming reports; explain an unavailable comment; capture a supplied source   | Show the actual collection mode. An account or notification inbox does not establish approved general API discovery.         |
| Growth      | Qualification, verified-capability matching, drafts, review requests and outcome tracking               | Find caption-search opportunities; revise this draft; explain activation results   | Match only current verified capabilities. Preserve contact eligibility, content review and publication requirements.         |
| Engineering | Scoped investigation, existing implementation delegation, tests, PR evidence and release follow-through | Investigate this issue; delegate the approved specification; show the PR and tests | Use the registered repository policy and existing supported execution paths. Arbitrary bug-fixing capability is not implied. |

X and Reddit use independent collectors but share channel-independent classification and issue grouping. The same complaint appearing on both channels must not create two implementations.

Existing customer support and product-specification services remain part of Cue. The four roles are the initial operator-facing agents, not a requirement to turn every service or tool into another agent.

## Operator journeys

### Find and unblock work

1. An operator opens Home and sees a task awaiting their role's decision.
2. They open the task and inspect the exact draft, specification or commit and its evidence.
3. They ask the responsible agent why work is waiting.
4. The agent answers from the recorded state and identifies the next authorized action.
5. The decision is recorded through the version-bound approval flow.
6. The task resumes or records a rejection, with the actor and outcome visible in Activity.

### Direct an agent

1. An operator selects Engineering and the relevant Bloom issue.
2. They request investigation.
3. Cue checks authorization, repository support, the current issue and any existing run.
4. If work already exists, Cue links to it. Otherwise, it creates one eligible queued task.
5. Cue acknowledges the queued state and reports subsequent execution events.
6. Tests, PR review and deployed verification remain distinct milestones.

### Continue work from Slack

1. A configured operator mentions Cue with a role and instruction in an allowed channel.
2. Cue resolves the app and task from the message or established thread context.
3. The instruction enters the same coordinator and task records used by Q.
4. Cue replies in the thread with the agent name, current state and relevant task link.
5. Q shows the instruction, resulting actions and decision receipts.

### Handle an unsupported growth need

1. Growth receives a request for PDF export.
2. No current verified capability matches.
3. Cue records the unmet need and can propose a feature candidate through the existing product workflow.
4. Growth does not promise PDF export, invent a delivery date or publish a recommendation claiming it exists.

## Screen responsibilities

These are information and interaction requirements. The designer determines the visual arrangement.

### Home

Show role-appropriate approvals, blocked or failed tasks, important running work and the next actionable step. Link every item to its agent and underlying task.

An operator should understand what needs attention without asking every agent for a status update. Keep approvals visible even when their agent conversation is closed.

### Agents

Show the four agent names, purposes, permitted capabilities, connection or worker health, current work, queued work and any blocking condition. Selecting an agent opens its conversation and task context.

Separate service health from task state. For example, Reddit notification intake can be healthy while a particular source comment is unavailable. An idle agent must not appear to be actively working.

### Agent conversation

Support persistent, multi-turn text conversations with agent-level or selected-task context. Show the active app and context explicitly. Selecting a different task changes the active context without rewriting previous messages.

The operator can ask questions, refine instructions, inspect evidence and invoke permitted actions. Offer a task link when the exchange creates or attaches to work.

Agent replies should contain the relevant answer, factual state and next useful step. References must open the actual source or artifact. Do not show fabricated receipts or private model reasoning as execution history.

Example:

> Holly approved the exact draft. Publication is waiting for Avichal. No public reply has been sent.

If evidence is missing or stale, state that condition. A saved instruction is not a started investigation; a tested PR is not a verified deployment.

### Task details

Expose purpose, app, primary owner, current stage, state, blocker, reviewer, dependencies, child tasks, original sources and evidence. Provide the appropriate review, retry or cancellation action when the actor is authorized.

For Engineering, include repository, isolated execution reference, specification version where applicable, exact commit, tests, PR and release verification. For Growth, include original need, capability version, exact draft, publication evidence and observed product outcomes.

### Agent Activity

Organize activity around tasks, with each task's latest factual summary and an expandable ordered history. Operators must be able to filter by agent, app, task state and time, and locate a case, issue or task identifier.

Include collection, classification, delegation, tool execution, handoff, retry, failure, approval and verification events. Show the actor, timestamp, task and artifact references for each event. Keep detailed redacted logs available without allowing repetitive provider messages to dominate the overview.

Activity entries must distinguish started, completed, failed, unknown and pending actions. Intake completion must not imply customer resolution. A new event should update a task without moving a reader away from the item they are inspecting.

## Conversation and action rules

Questions read authorized state without creating execution jobs. Explicit instructions can create bounded tasks through a typed action interface.

The model may propose an action and its arguments. The server validates the actor, app, role, tool, source, budget and relevant version before creating work. Natural-language output cannot itself execute arbitrary commands or change permissions.

Use the established app, task and thread context. Ask a focused follow-up only when required information cannot be resolved reliably. If the action is already authorized within configured policy, proceed without another permission request.

If an instruction targets an existing queued or running task, attach to that task or reject an incompatible change clearly. Do not start another coding run or duplicate an external action merely because the instruction was repeated.

Changing an implementation's scope creates a recorded revision and follows the applicable review flow. It must not silently replace an approved specification or modify a running checkout.

Approval questions can surface the exact review card. In the first release, decisions use the existing explicit, version-checked controls; ambiguous remarks such as “looks good” do not approve deployment or publication.

## Slack addressing and continuity

Use the existing Cue bot as the entry point. Proposed commands:

- `@Cue x show new mentions for Bloom`
- `@Cue reddit explain the source failure for CASE-21`
- `@Cue growth find caption-search opportunities`
- `@Cue engineering investigate ISS-14`

Resolve the operator from verified Slack identity and configured membership. Role names in message text select an agent, not the sender's authority. Unauthorized or unrecognized users cannot initiate operator actions.

Store the thread-to-conversation mapping, app, agent and task context. Follow-up messages in an established authorized thread should continue that context. Require clarification when the app or task remains ambiguous.

Replies identify the responsible agent, provide concise state and evidence, and remain in the originating thread. Use the existing structured Slack messages and exact-version review controls. Show unavailable delivery and provider errors rather than claiming a successful send.

Operator commands must be routed before general support intake, so a Growth instruction does not become a customer complaint. Continue preserving the normal support intake path for eligible reports.

Q and Slack share task state and decision records. Q can expose authorized Slack exchanges with provenance. Mirroring all Q conversations into Slack is not required; send responses only to the thread or channel associated with that instruction or configured notification.

Independent native mentions such as `@Growth` require separate bot identities and are deferred. Direct-message support can follow when its event subscriptions and permissions are configured. Neither is required for the initial channel-mention flow.

## Ownership and concurrent execution

The coordinator assigns a primary owner and records explicit handoffs. Dependencies decide when child tasks become eligible. Growth can use a verified capability while Engineering investigates an unrelated issue.

Use durable jobs and task-scoped leases. Separate channel checkpoints and collection leases from implementation ownership. Prevent two active implementations of the same issue even when reports or instructions arrive concurrently.

Start with at most two concurrent AI reasoning jobs and one coding run on the existing companion. These are proposed limits, configurable after measuring provider limits, cost and reliability. Routine collector work is independently bounded by connection policy. Reserve capacity or scheduling priority for urgent support and engineering work.

Task states:

| State             | Meaning                                                                                                          |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| Queued            | Durable work is saved but no worker has started it.                                                              |
| Running           | A worker owns the task and has recorded execution progress.                                                      |
| Awaiting approval | A specific version requires an authorized decision.                                                              |
| Blocked           | A dependency, configuration, access or budget condition prevents progress.                                       |
| Retrying          | A failed attempt has a recorded, bounded next attempt.                                                           |
| Completed         | The task's own completion condition is satisfied and supported by evidence.                                      |
| Failed            | Attempts ended unsuccessfully; the error and available next action are retained.                                 |
| Canceled          | An authorized cancellation ended or stopped scheduling work. External effects already completed remain recorded. |

Stages explain what a running task is doing. Approval and publication are separate stages; approval does not establish delivery. Worker loss or a stale lease must become visible rather than leaving work indefinitely labelled Running.

Use idempotency keys for provider events, commands, task creation, handoffs and decisions. Retries must not inflate results or repeat side effects. An external operation with an uncertain outcome requires reconciliation before another send.

Cancellation is best effort. If a worker or provider operation cannot stop immediately, show cancellation requested and the eventual outcome honestly.

## Permissions and evidence

Retain current configured membership and role checks on every read and action. Support, Product, Engineering and Owner permissions remain separate from agent identity.

- Ganesh owns Engineering review and capability verification within the configured policy.
- Holly owns Product specification and exact Growth draft review.
- Avichal owns publication and other Owner-only decisions under company policy.
- Aria handles support follow-up within Support permissions.

Use stored user/member IDs. Display names do not grant access. Approval records bind the actor, object, version and decision. Edits, changed capability evidence or changed commits invalidate prior approval when applicable.

A release claim requires deployed verification for the registered application and release. A publication claim requires validated publication evidence. Activation requires the trusted product events defined in the Growth plan.

Source posts, customer messages, repository content and model output are untrusted inputs. They cannot override tool policy or expand data access. Redact credentials and sensitive content from conversation context and logs. Fetch only authorized task context rather than sending the complete workspace history to Gemini.

Preserve Bloom's separate journal ownership. Its photos and captions do not enter Growth telemetry or general operator-agent context through this feature.

## Backend contracts

Extend existing records where possible and link new orchestration records to cases, issues, runs, opportunities and approvals. Preserve their established sources of truth rather than creating competing run states.

Proposed new entities:

| Entity                | Required responsibility                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Agent definitions     | Stable role IDs, display name, purpose, supported tools, connection references and configured execution limits.                         |
| Agent conversations   | Trusted configured-workspace scope, app, agent, operator participants and optional selected-task context.                               |
| Agent messages        | Actor, channel provenance, message text, timestamp, structured action request and evidence references when present.                     |
| Agent tasks           | Scope, primary owner, type, state, stage, dependencies, linked domain record, lease, attempts, idempotency key and completion evidence. |
| Task events           | Ordered, append-only execution and decision events linked to actual receipts and artifacts.                                             |
| Slack thread mappings | Verified team/channel/thread identity mapped to an authorized conversation, agent, app and task.                                        |

Server operations derive scope from authenticated membership and registered app ownership. Future workspace IDs must not be accepted as authority merely because a client supplies one. This initial feature does not replace the required company-isolation migration.

Expose authenticated operations for listing agents, reading conversations and tasks, posting messages, requesting typed actions, observing activity and invoking existing review controls. Persist an accepted instruction and its queued action atomically or through a durable outbox.

Reuse Gemini for language understanding, Convex for persisted state and bounded job processing, existing GCP hosting, Slack and the local Codex companion. Reuse current provider connections. No new paid listening service or model provider is required for this feature.

The existing Slack mention handler and Activity foundation are integration points; general agent conversation, command routing and coordinator behavior are additions. Growth discovery and activation are specified separately in the Growth plan.

## Release acceptance criteria

| Scenario                                | Required result                                                                                                      |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Open an agent                           | Its purpose, permitted capabilities, factual health and current work are visible.                                    |
| Ask a task status question              | Response matches stored state, links to evidence and creates no execution job.                                       |
| Send a permitted instruction            | One persisted conversation message and eligible durable task are created; acknowledgment matches actual queue state. |
| Repeat the instruction from Q and Slack | Existing work is found or the compatible action is deduplicated; no duplicate implementation starts.                 |
| Continue a conversation                 | Prior authorized context is retained after reload and across worker restarts.                                        |
| Change selected app or task             | New context is explicit; earlier history and ownership remain intact.                                                |
| Mention Cue in Slack                    | Authorized command reaches the correct role and app, responds in the thread and links to the same Q task.            |
| Retry a Slack event                     | One logical command/action is retained; responses and receipts do not duplicate.                                     |
| Attempt an unauthorized action          | Server rejects it, records a useful outcome and does not invoke the protected tool.                                  |
| Edit an approved draft or specification | Its old approval cannot authorize the new version.                                                                   |
| Run independent work                    | Channel intake, eligible Growth work and one coding task can progress concurrently within limits.                    |
| Receive duplicate cross-channel reports | Cases join the same issue and implementation ownership remains singular.                                             |
| Lose a worker or provider connection    | Health and affected task state reveal the failure; bounded retry or operator recovery is available.                  |
| Cancel running work                     | Cancellation and any already-completed effects remain accurate and auditable.                                        |
| Inspect Activity                        | Events retain ordering, ownership, timestamps, actual evidence and role-appropriate actions.                         |
| Encounter an unmet feature need         | Cue records the need without inventing a capability or release commitment.                                           |
| Complete collection or PR creation      | The customer issue remains unresolved until its required outcome is verified.                                        |

Recheck existing support intake, journal behavior and approvals after integration. UI fixtures or role-played conversations cannot satisfy these live acceptance criteria.

## Controlled demonstration

1. Open Home and identify one pending review.
2. Open Growth and ask what is blocking its recommendation.
3. Review the exact draft as the configured Product reviewer.
4. Ask Engineering about an existing issue; show the actual run, tests and PR state without creating a second run.
5. Send one authorized `@Cue engineering` status request in Slack and show its thread response and Q task continuity.
6. Show independent collection and execution events in Agent Activity.
7. Continue the real publication-to-Bloom-activation journey from the Growth plan when that slice is implemented.

Use genuine sources and execution evidence. Mark controlled participant traffic separately in outcome measurements. Do not simulate a deployed fix, public send or acquisition result to complete the demonstration.

## Implementation order

1. Define stable roles, typed actions, context boundaries and links to existing domain records.
2. Add persisted conversations, tasks, events, idempotency and worker ownership.
3. Implement read-only status/evidence questions before tool-triggering instructions.
4. Connect authorized instructions to bounded jobs and existing approval flows.
5. Add Slack operator-command routing and thread continuity.
6. Supply the Home, Agents, task-detail and Activity data contracts for the user's UI.
7. Verify concurrent work, role checks, retries, stale decisions and live cross-surface behavior.
8. Integrate the separately specified Growth journey and confirm honest publication and activation states.

The previous 7.5–11-hour estimate covered the Growth slice. Persisted agent conversations, coordinator extensions and Slack command routing add scope; that estimate must not be presented as a commitment for both features together.

## Usability evaluation

Before adding a canvas, test the agent workspace with three to five target operators using the same recorded tasks. Ask them to find a blocker, locate the exact approval, inspect a test result and direct the correct agent.

Initial success criteria: each task's correct destination can be found within 30 seconds; no participant confuses approval with publication or PR creation with deployment; repeated instructions do not cause duplicate work.

If navigation is slow, improve task context, labels and attention summaries first. If cross-agent dependencies remain difficult to understand, compare a focused canvas against the same tasks with counterbalanced ordering. A small usability sample identifies problems; it does not establish a general performance advantage.

## Deferred capabilities

Infinite canvas, editable agent wiring, separate Slack bot identities, custom user-defined agents, arbitrary tool/code execution, voice conversations with operator agents, unrestricted autonomous social posting, unapproved Reddit discovery and general multi-company onboarding are outside this first release.
