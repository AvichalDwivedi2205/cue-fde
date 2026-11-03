# Crustdata customer research for Cue

Open **Growth → Cue customers** in the signed-in [Cue workspace](https://cue.latchgrid.in/cue#/growth/prospects).
Describe a company cohort, click **Find companies**, then review the returned
facts and use **Shortlist**, **Dismiss**, or **Return to review**. These are
potential buyers of Cue, separate from Bloom's explicit-request Growth flow.

## Implementation

The authenticated Next.js route derives the actor from the saved workspace
membership. Owner and Product members can search/review; other signed-in team
members can read. Same-origin checks protect writes. Convex keeps the key in a
server environment variable and stores research runs and company facts.

The action reads free account permission/pricing metadata, reserves a bounded
run, performs [hybrid company search](https://docs.crustdata.com/company-docs/search/introduction)
with reported headcount 1–50, then requests
[company enrichment](https://docs.crustdata.com/company-docs/enrichment/introduction)
by the exact returned company IDs. Requested fields are company name, domain,
description, headcount and country. Person/contact endpoints are unused.
Provider-response extras are discarded before saving; neatlogs records
request metadata and usage, rather than the raw response.

Each search returns at most five companies, has a 15-credit reservation ceiling,
and allows at most five reserved searches per UTC day. Reservations are atomic;
duplicate request keys reuse the existing run, failures retain their reservation,
and paid provider calls are never automatically retried. Repeated company IDs
update facts while preserving human shortlist decisions. Missing or ambiguous
enrichment produces review-only search evidence. The UI displays unavailable
usage as unknown rather than guessing a dollar conversion.


Earlier live-check and verification claims are withdrawn. Search results and buyer intent require fresh independent verification. See [repository and build provenance](repository-and-build-provenance.md).
