# Cue business plan

Cue helps small consumer-app teams turn customer reports into investigated,
reviewed, and verified product changes. The first customer is a founder or a
small product team maintaining one app and receiving repeated support reports.
Bloom is our controlled demonstration app, not a paying customer.

## Offer and pricing hypothesis

Test a $99/month plan for one app: 50 support conversations and five scoped
coding investigations, with human approval before publishing or releasing.
This is a proposed pilot price, not a launched plan or willingness-to-pay result.
Start with three to five design partners. Retain manual review for uncertain
grouping and limit coding to a connected, trusted repository and approved paths.

## Cost model

All dollar amounts below are planning allowances, not measured provider bills.
Assume $0.02 per support conversation, $3 per coding investigation, $3 variable
infrastructure per customer, and $75/month fixed hosting/observability/tools.
Variable cost is therefore $19/customer/month. Cost of a coding investigation
is the biggest unmeasured expense; capture real usage before selling a quota.

| Paying customers | Revenue/month | Modeled cost/month | Surplus/month | Modeled margin |
|---:|---:|---:|---:|---:|
| 0 | $0 | $75 | -$75 | — |
| 1 | $99 | $94 | $5 | 5.1% |
| 5 | $495 | $170 | $325 | 65.7% |
| 20 | $1,980 | $455 | $1,525 | 77.0% |

Formula: revenue = customers × 99; cost = 75 + customers × 19.
Founder salary, taxes, payment fees, sales effort, and refunds are excluded;
the surplus subtracts modeled fixed and variable costs but does not estimate
net profit after these omitted expenses. Hackathon credits are excluded
from steady-state economics. With a hypothetical $1,000 cash budget and zero
revenue, infrastructure-only runway is 13.3 months at $75/month. Cash and funding
have not been supplied, so this is a scenario rather than actual runway.

Stress case: at $12 per investigation, variable cost becomes $64/customer.
At 20 customers, modeled surplus drops to $625/month and margin to 31.6%.
Fallback: charge expensive coding runs separately, reduce the included quota,
or provide investigation-only workflows until costs are predictable.

| Paying customers | Base surplus/month | Coding-cost stress surplus/month |
|---:|---:|---:|
| 0 | -$75 | -$75 |
| 1 | $5 | -$40 |
| 5 | $325 | $100 |
| 20 | $1,525 | $625 |

Modeled break-even is one paying customer in the base case and three in the
stress case. These thresholds cover only the modeled allowances and exclude
the expenses listed above.

## Smallest falsifiable pilot

Recruit three founders with a trusted app repository. Over one week, compare
ten eligible support reports per founder with their current manual workflow.
Match report complexity and record elapsed human work, coding/provider cost,
independent acceptance checks, rejected suggestions, and required edits.
Keep a separate set of unseen reports for final assessment.

Success: at least 30% less human work on eligible reports, zero cross-app data
exposure or unsupported release claims, independent checks passing before
resolution, and at least two founders agreeing to the $99 paid pilot.
Stop automatic grouping on any false merge. Stop autonomous implementation on
any protected-file change or approval bypass. Pivot to support investigation
and draft preparation if median human savings are below 20%, or if fewer than
two founders want to pay. Add complexity only after this baseline succeeds.

## Evidence and limits

Earlier claims of completed investigations, provider traces, publication, and activation are withdrawn. Organic acquisition, retention, paid customers, and revenue are unmeasured. Validate the actual workflow and current release before presenting any outcome as verified. See [repository and build provenance](repository-and-build-provenance.md).
