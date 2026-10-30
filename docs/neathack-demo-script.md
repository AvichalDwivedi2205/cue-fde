# Cue demo narration with timestamps

Target length: **2:50**. Record your own audio only. No camera or AI voice is required. The 392-word narration follows the final edit; you can record each scene separately. Screen notes are not spoken.

Scene 1: 0:00–0:23 | Support and product overview

Consumer apps hear from users everywhere, but whoever reads the complaint usually can't fix it. Cue is bringing FDE to B2C and it connects support, company knowledge, engineering and growth.

Here are our widget, email, Slack and X reports. Anyone on your team can tag bugs, check evidence and talk to agents. Requests keeps track of features people want.

Scene 2: 0:23–0:45 | Company knowledge and customer answer

This is Bloom, a photo journal connected to Cue. We give Cue its guides and FAQs so it can answer users with sources. Users tell us if the answer helped. If the answer didn’t help, the team can turn that conversation into an FAQ draft for review.

Scene 3: 0:45–1:13 | Fresh failure and Codex investigation

Now something breaks. A user’s three-megabyte photo fails, even though Bloom allows five. They report it through the widget.

Cue groups the report, verifies the bug and sends it to Codex. Codex opens a draft pull request. Cue runs eight independent checks to verify the fix before I approve it.All of this from being reported the bug to isloating it and sending it to codex agent to fix was done by Cue.


Scene 4: 1:13–1:30 | Exact review, release and customer retry
Cue then sends the review to Slack. I check the exact commit and approve it. After the deployment is verified, Cue updates the same customer conversation. The original photo now uploads, saves and survives a reload.

## Scene 5: 1:30–2:04 | Growth and feature requests

*Screen: Show the X request, model routing and actual Sonnet reply, the approved public reply, the tracked save and caption search. End on Requests with PDF export marked Planned.*

Here’s an X request for a photo journal with caption search. Cue checks that Bloom can do what they’re asking for, then uses Claude through LiteLLM to write a reply in Bloom’s voice. I review it before posting. After clicking the reply, the visitor saved a photo in Bloom and found it using caption search. Cue tracked both actions. Requests keeps track of features people want, like PDF export, which is planned here.

## Scene 6: 2:04–2:19 | Neatlogs investigation

*Screen: Show the failed all-to-any specification trace, the actual investigation and two later specification traces retaining all. This demonstrates the constraint correction, not error-free completion of their parent workflows.*

While building, Neatlogs helped us catch bugs in Cue.  For example, Our agent wrote the wrong rules for Bloom’s photo search: matching one word instead of requiring every word. We fixed the prompt and checked the corrected output.

## Scene 7: 2:19–2:28 | Entire checkpoint

*Screen: Show the actual public captured Codex session, its repository checkpoint and product code diff.*

Entire links our code to the Codex conversations behind it, so we can understand why a change was made.

## Scene 8: 2:28–2:50 | Economics and closing

*Screen: Show the actual cfo.ai model changing the coding allowance from three to twelve dollars, modeled margin moving from 77.0% to 31.6%, then Cue Home with the verified fix.*

 Last, the money. In cfo.ai, we modeled twenty hypothetical customers paying ninety-nine dollars a month. Raising coding costs from three to twelve dollars per investigation cuts modeled margin from seventy-seven to about thirty-two percent, before salaries and payment fees.

That's Cue. Customer problems in. Verified fixes out.
