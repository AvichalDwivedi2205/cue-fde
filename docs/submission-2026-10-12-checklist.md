# Cue submission checklist and form answers

**Completed October 12, 2026.** The public X quote-post includes the final 179.9-second narrated video and the exact official launch post. The official form displayed **SUBMISSION RECEIVED** and confirmed that Cue's project is submitted for every teammate. Receipt: `3e7e1dc9-fbfd-44d9-a778-b745d110e46d`. See [the submission receipt](submission-2026-10-12-receipt.md).

## Required actions

1. **Done:** Published the public [X quote-post](https://x.com/Avichal2205/status/2109699331062366279) with the final narrated demo attached, quoting <https://x.com/bettersayAJ/status/2109639214723932495>. The quote text includes `@neatlogs`, `@EntireHQ` and `@arithecfo`. The published prose is saved in [the post text](submission-2026-10-12-x-post.md).
2. **Done:** Completed the three-step form at <https://neatlogs.com/submission> using the actual quote-post URL, public repository and team/tool details.
3. **Done:** Reviewed and submitted. The official confirmation says **SUBMISSION RECEIVED**, **You built it. You shipped it.**, and **Cue's project is submitted for every teammate. No one else needs to submit.**

The single video explains the problem Cue solves, how the product works, how cfo.ai and Entire contributed, and how neatlogs helped identify and resolve an agent incident. The final 179.9-second narrated export is attached to the published quote-post.

## Form fields

| Field | Prepared value or outstanding item |
| --- | --- |
| Checked-in team | Cue. The official receipt confirms submission for every teammate. The four role-test accounts in the product are not automatically hackathon teammates. |
| Project name | Cue |
| Quote-post link | https://x.com/Avichal2205/status/2109699331062366279 |
| Public GitHub repository | https://github.com/AvichalDwivedi2205/cue-b2c |
| Location | Pilani, India. Confirmed by Avichal. |
| Founder status | No. Confirmed by Avichal. |
| If founder: company name and stage | Not applicable. |
| If not founder: work and role | Student at BITS Pilani, building Cue as a hackathon project and also as a future startup. The user edited this field in the form. |
| Call opt-in | Yes. Selected by the user. |
| cfo.ai usage | Prepared answer below. |
| Entire usage | Prepared answer below. |
| neatlogs usage | Prepared answer below. |

## cfo.ai answer

We used cfo.ai to create an editable pilot business plan covering pricing, support and coding allowances, infrastructure costs, revenue scenarios and hypothetical runway. The proposed pilot is $99 per customer per month. At 20 hypothetical paying customers, a $3 allowance per coding investigation produces a modeled margin of 77.0%. Raising that allowance to $12 reduces the modeled margin to 31.6%, before salaries and payment fees. This exposed coding cost as the key unmeasured expense, so the plan calls for measuring real investigations and separating expensive runs from the included quota. These are planning scenarios, not achieved revenue or margins. The plan also includes founder-pilot success and stop criteria.

Public plan: https://cfo.ai/s/IfzpWk2LZv2xR34C

Supporting write-up: https://github.com/AvichalDwivedi2205/cue-b2c/blob/main/docs/neathack-business-plan.md

## Entire answer

We used the official Entire CLI and the repository-restricted GitHub App to capture the genuine Codex build conversation and its code checkpoint. The public checkpoint preserves the context and decisions behind the changes, letting a reviewer inspect how Cue was built alongside the repository. The latest published capture contains 152 genuine root build turns through its recorded snapshot. It is an explicit official CLI capture, not a claim that every later commit was captured automatically. We did not use entire-graph and are not claiming that bonus.

Checkpoint ID: 01M4RAVQZBH96V76R2QHD6GKZR

Public session: https://entire.io/gh/AvichalDwivedi2205/cue-b2c/session/01a129c7-7f3e-7e00-80a5-dbdbea47cf3c

Published checkpoint record: https://github.com/AvichalDwivedi2205/cue-b2c/commit/1eb9e9722c6cce153c2e47c436b771e2b137ca4b

Build provenance: https://github.com/AvichalDwivedi2205/cue-b2c/blob/main/docs/repository-and-build-provenance.md

## neatlogs answer

We instrumented Cue's support, triage, specification, Growth and coding workflows with neatlogs. Actual model calls, tool activity, usage and failures are retained as traces. During building, neatlogs helped identify an agent incident where a generated specification weakened Bloom's caption-search rule from requiring every query word to accepting any word. We inspected the incident evidence and investigation, corrected the prompt, then inspected later specification outputs that preserved the all-word requirement. Those later parent workflows still recorded other errors; we are claiming the observed specification correction, not error-free completion of every workflow.

We also retained before-and-after upload regression traces: three HTTP acceptance failures before the correction and eight independent checks passing after it. This replay is separate from the fresh, actual Codex investigation shown in the demo. The new demo follows a controlled upload failure through a real Codex draft PR, independent checks, exact-commit Slack approval, verified scoped release and the original photo's successful retry, save and reload.

Trace and verification index: https://github.com/AvichalDwivedi2205/cue-b2c/blob/main/docs/neathack-verification.md

Before upload replay: https://app.neatlogs.com/traces/a7a8ec6c20758403387c477f8c06b328

After upload replay: https://app.neatlogs.com/traces/f2e68c85961368df8b7e2bdf86ad4f37

Actual completed Sonnet Growth draft: https://app.neatlogs.com/traces/fbe293110243b9b1caaffe666d8d394a

The neatlogs dashboard requires project access. Public screenshots and retained verification details in the repository complement the dashboard links.

## Evidence boundaries

- The recorded engineering scenario is an owned isolated deployment with a deliberate 3 MiB upload regression. The healthy public Bloom stays separate.
- Growth shows an actual reviewed public reply and a controlled same-browser save/search journey. Internal traffic is excluded from organic results. It does not prove organic acquisition, social-author identity, retention or revenue.
- Company context supports reviewed FAQ/text/file/public-web/public-GitHub imports. Private Notion, Drive and GitHub OAuth synchronization is not part of this release.
- Reddit notification intake and manual capture are available. Native Reddit API access and verified public Reddit reply delivery are not claimed.
- Crustdata is optional and separate from Bloom's consumer Growth flow. LiteLLM/Sonnet usage is real and is shown in the demo; Gemini remains the widget default.

## Primary requirements sources

- [Official submission portal](https://neatlogs.com/submission), including its linked quote target and required tags.
- [Official hackathon guide](https://neatlogs.com/hackathon), including sponsor evidence, public code, judging weights and the submission window.
- [Official launch post](https://x.com/bettersayAJ/status/2109639214723932495), directly read from X and linked by the portal.
- Organizer instructions supplied by the user from the neatHack Discord announcements.

Claude consultation: `claude -p --model opus --effort high` completed successfully and reported actual model `claude-opus-5-5`. The draft was then reviewed against the documentation and recorded evidence, revised to the user's approved prose, published with the final video, and submitted through the official form. The root agent verified the live post and official confirmation; this document update used no browser actions.
