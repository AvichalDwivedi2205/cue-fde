# Final demo recording plan

Target: **2:50**, eight scenes, 1920 × 1080. Record the narration in
`docs/neathack-demo-script.md` using the user's natural voice. Its timestamps
match the eight scene lengths. Audio is recorded separately; no camera or AI
voice is required. Actual product footage has been captured, and the silent
Remotion edit has passed full decode, technical, visual and privacy review.
The silent export is `artifacts/demo-output-2026-10-12/cue-product-footage-2m50s.mp4`.
It is exactly 170 seconds, 1920 × 1080 at 30 fps. The user's audio still needs
to be attached before publishing the narrated submission.

## Recording surfaces and provenance

- Cue: <https://cue.latchgrid.in/cue#/home>, source
  `26e30384e0ddec0c24dc1953dadfb38fec42df90` for the main recording.
  The email and Slack history recaptures use released source
  `b49c358187454c2bf4cd287cdf3d6f8f6eef7345`.
- Healthy public Bloom: <https://bloom-with-cue.vercel.app>, release
  `4a9481f11528621aae7c636f1b529996e5f0b560`. Use this for the published knowledge
  and Gemini answer scene. Its healthy upload service is not the bug scenario.
- Fresh controlled engineering scenario: `recording-20261012-c`, app
  `cue_app_c6adfa8b29daa6b5722fc076`, journal
  <http://127.0.0.1:4404>, upload backend <http://127.0.0.1:4322>.
  It starts at baseline `d499f6f392f30e61ef4d17c08146acf83fa79f5c`; only this owned
  isolated service intentionally rejects the controlled 3 MiB image.
- Recording photo:
  `.cue/rehearsals/cue_app_c6adfa8b29daa6b5722fc076/fixtures/synthetic-photo-3mb.png`.
  This is a generated test image, not customer content. Retain this exact file in
  the New memory flow for the final retry.
- Existing widget, email, Slack and X reports demonstrate their actual stored
  source and native delivery receipts. The engineering report in this recording
  is a new widget report for app `cue_app_c6adfa8b29daa6b5722fc076`. Do not imply
  new email or X reports were received during the recording, or present copied
  context or fixture reports as discovery.
- Rehearsals `rehearsal-20261012-a` and `rehearsal-20261012-b` completed two
  consecutive actual native passes. Their reports, Codex runs, reviews and
  releases remain preserved. The recording uses clean scenario c, without
  replaying either earlier run as new.

## Timed scenes

| Scene | Time | Actual on-screen sequence | Narration span and edit notes |
| --- | --- | --- | --- |
| 1. Support and product overview | 0:00–0:23 | Open Cue Home, then Inbox. Show the existing widget, email, Slack and X reports with their source labels and native receipts. Open a bug tag and evidence panel, then show Requests. | Paragraphs 1–2, from “Consumer apps hear” through “features people want.” Use a short founder introduction over Home, then close views of the actual report sources. Retain historical timestamps; these are existing channel evidence. |
| 2. Company knowledge and customer answer | 0:23–0:45 | Show the published Bloom guide, upload policy and FAQs, then Coverage. In healthy public Bloom, ask the installed widget a question answered by those sources. Show the Gemini answer and citation cards. Show Solved / Still need help and the knowledge-gap queue with the draft-for-review action. | The company-knowledge paragraph, from “This is Bloom” through “an FAQ draft.” Hold the citation and source status long enough to read. A knowledge gap produces a draft for staff review; do not show it as automatically approved. |
| 3. Fresh failure and actual Codex investigation | 0:45–1:13 | Switch to the isolated journal at port 4404. In New memory, select the controlled 3 MiB PNG and show the upload failure. Click Get help to open this app's installed Cue widget; type the failure and 5 MiB policy. In Cue, open the resulting app-scoped issue, start investigation, then show the actual Codex run, draft PR, allowed diff and eight independent check results. | Paragraphs 4–5, from “Now something breaks” through “outside its control.” Label the footage “Controlled isolated deployment.” Record the real failure, report and new job. Cut the real coding wait with a visible “Investigation completed · elapsed …” caption populated from actual timestamps. Show the protected scope and actual results rather than reconstructed progress. |
| 4. Exact review, release and customer retry | 1:13–1:30 | Open this run's actual Slack review card, inspect its exact commit and approve that version. Show Cue's release verification and the updated original widget conversation. Return to the unchanged New memory form, retry the same photo, save, reload and show the persisted memory. | Paragraph 6, from “Cue sends the review” through “survives a reload.” Record actual approval and delivery receipts. Cut deployment waiting with a visible elapsed-time caption. A deployed result and persisted customer save are required before describing success. |
| 5. Growth from request to confirmed activation | 1:30–2:04 | Show the captured X request from the test account, its qualification against published Bloom facts and the hosted Claude Sonnet generation receipt through LiteLLM. Inspect the exact approved reply and factual boundaries, its approval receipt, and the verified public reply thread. Show the real tracked-link journey through the same browser's first save and caption search, then confirmed activation with test traffic excluded from organic results. End on the historical Requests list, filtered to the planned PDF export. | The Growth paragraph, from “Here’s an X request” through “which is planned here.” **All Growth gates passed:** hosted Sonnet drafting, exact reply approval, public thread verification and controlled activation. Use the actual source/reply receipts and saved same-browser event sequence; do not republish the reply merely for footage. The top organic counters remain zero because controlled traffic is excluded. |
| 6. Neatlogs investigation and corrected traces | 2:04–2:19 | Show the actual incident, failed trace where the specification changed “all caption words” to “any,” the investigation, then both later traces retaining “all.” | The Neatlogs paragraph, from “We also caught” through “kept ‘all.’” Zoom the relevant input/output words in genuine trace footage. These are three observed traces, not a held-out benchmark or a provider superiority claim. |
| 7. Public Entire building checkpoint | 2:19–2:28 | Open the public Entire captured session and the repository commit carrying its checkpoint trailer. Show checkpoint `01M4RAVQZBH96V76R2QHD6GKZR` and its source link. | The Entire paragraph, from “Our Entire checkpoint” through “code.” The published capture contains 152 genuine root building turns through its recorded snapshot. Its explicit image and credential omissions remain visible; do not claim automatic capture of every commit. |
| 8. Economics and closing | 2:28–2:50 | Show the actual cfo.ai Canvas with 20 hypothetical customers at $99 per month and a $3 coding allowance. Change the local preview allowance to $12; show modeled margin changing from 77.0% to 31.6%, then the excluded-costs note. Close on the actual Cue Home screen and supplied logo. | The final two paragraphs, from “In cfo.ai” through “That's Cue.” Keep the percent unit visible. This is a hypothetical forecast excluding salaries and payment fees; the Canvas preview is not revenue or a saved business edit. Reserve the final five seconds for the closing line. |

## Capture and completion gates

Before capture, verify scenario c is still at its broken baseline with no earlier
report, coding job or approval. Keep the worker and its scoped runtime running.
Use the normal journal, installed widget, Cue workspace and native Slack review
surface. The bug is deliberately confined to this local app; public Bloom stays
healthy. If c has already been consumed, prepare a new unique scenario rather
than reset its evidence or reuse a completed run.

Growth's hosted Sonnet draft, exact reply review, publication, public-thread
verification and controlled activation have all passed. The saved summary
`.cue/readiness-growth-complete.png` shows the actual source, approval and
verified publication followed by the same browser's first memory save and
caption-search match. `.cue/growth-attribution-diagnosis-2026-10-12.json`, verified
at `2026-10-12T15:36:35.580Z`, confirms one attributed internal browser, ordered
milestones and successful first-attempt durable outbox delivery. Its observed
delivery delays were about 22–37 seconds, not a missing activation or a code bug.
This is controlled test evidence excluded from organic results; browsers do not
identify social authors, and retention has not been measured.

Engineering success requires this recording scenario's exact
commit approval, deployed verification, updated same case, successful original
photo retry and persistence after reload.

Edit in Remotion using **real captured footage** with zooms and captions. Do not
rebuild or reconstruct application screens. Cut actual waits openly using the
recorded elapsed time; do not turn old runs into new progress or conceal a failed
step. Keep the user's narration conversational, with brief pauses when the
screen presents evidence. Audio narration is separate from the product widget;
this demo does not include the product voice flow.

The recording makes no Notion import, Reddit delivery, Crustdata, plugin or
product voice claim. It makes no organic acquisition, paying-customer or
multi-company self-service claim. Remove incidental private contact details,
authentication links, credentials and unrelated browser content from the frame.

Final export is ready only after all eight scenes show the described actual
behavior, the passed Growth receipts remain inspectable, captions and narration
match the visible evidence, and the duration is approximately 2:50 without
exceeding three minutes.
