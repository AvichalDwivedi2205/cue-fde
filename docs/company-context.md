# Company context, coverage and brand voice

Cue shares an app-scoped published knowledge corpus between customer widget answers and Growth drafts. Staff retrieval can additionally use published internal sources. This remains the configured single-company pilot described in `platform-boundaries.md`.

## Coverage

Knowledge → Coverage lets Owner and Product define up to 20 required context areas, each mapped to up to 10 sources. A requirement is ready only when all its sources have their latest revision published and indexed, with the appropriate audience. Missing, withdrawn, private, draft, indexing, failed and overdue sources have separate states. Coverage is against the declared requirements, rather than a claim that every company system has been imported.

Source inventory shows the revision currently serving retrieval, passage/index counts and the latest editor revision separately. Publication timestamps are captured on new publications. Earlier records have counts backfilled in batches of five; historical publication timestamps are left unknown. An optional review interval treats an unknown date as due for review. Website and GitHub imports still refresh manually.

Bloom's initial checklist covers journal/caption-search capabilities and photo formats/upload limits using its three existing public sources. The internal DOCX remains a draft and is visible in inventory. It does not contribute to customer or Growth answers.

## Brand voice

Knowledge → Brand voice and Settings → Brand voice edit the same per-app, versioned profile. Owner and Product can choose a tone, write guidelines and supply up to three approved writing examples. Examples are style references only; they are not indexed as factual knowledge. The model receives explicit rules that style cannot change product identity, facts, citations, workflow status or feature limits. Customer frustration adjusts empathy and brevity within the fixed voice.

Generated typed and spoken widget replies and Growth drafts use the profile. Exact approved FAQ matches return their approved answer verbatim and use no generation call; write those FAQ answers in the intended voice. Model-generated answers still require source citations and workflow validation. Citation membership does not establish semantic entailment; human factual review remains necessary for Growth.

Bloom starts with a warm, concise voice, plain words and calm support responses. No examples are invented or imported from external accounts. Gemini remains the default. LiteLLM use still requires explicit model selection.

## Growth grounding and approval

The trusted drafting worker derives app scope from its saved Growth job, retrieves at most four current customer-visible passages and supplies them together with verified deployed capability claims and the brand profile. Documents help explain the verified capability; they cannot expand its scope. Existing qualification, unsupported-feature, product-name, 280-character and destination checks remain in force.

Each new draft retains immutable passage/revision receipts and the voice version. Growth review displays the actual passages and whether the receipt remains current. Save, review request, approval, publication report and successful provider verification recheck source publication and brand versions transactionally. Withdrawal, supersession or a voice edit blocks approval/publication until a new draft is reviewed. A new draft needs a new review even if its text is identical but its context receipt changed. Reviewer rejection stays available for stale drafts.

Older drafts preserve their capability-only evidence and are labeled as retained drafts. Human-edited drafts receive current public-context receipts but still require exact text review. Retrieval receipts record context supplied to drafting, rather than asserting that every sentence is supported. Public posting remains manual and was not performed for this change.

## Verification

Run `npm run test:backend`, `npm run lint`, `npm run typecheck` and `npm run build`. New tests cover scope and role enforcement, stale edits, coverage states, real indexed revision counts, metadata migration, brand payload boundaries, typed/spoken persistence races, Growth job wiring and approval/publication invalidation.

`npx tsx scripts/verify-company-context.ts` checks an existing configured Bloom app and a separate synthetic corpus using Gemini. It makes eight generation calls without retries or LiteLLM, including two matched drafting comparisons with and without retrieved context and adversarial style examples. Synthetic sources are withdrawn afterward. The report is saved under ignored `.cue/`; it measures functional behavior, not preference, revenue or conversion uplift. It does not read the previously frozen held-out evaluation sets or publish outreach.
