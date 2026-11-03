# Company knowledge in Cue

Open [Knowledge](https://cue.latchgrid.in/knowledge), select your registered application, and add an FAQ, pasted text, a file, a public website page, or a public GitHub document. Support can save drafts; Product and Owner can publish or withdraw them. Customer-facing sources are eligible for widget answers. Internal sources are available only to authorised staff in the agent workspace.

Files supported: TXT, Markdown, text-based PDF and DOCX, up to 10 MB. PDFs are limited to 100 pages. Extracted content is limited to 200,000 characters and 160 passages. Scanned PDFs require OCR before upload. Each website import fetches one public HTTPS page; use **Refresh page draft** to fetch an update. Private Notion, Drive and GitHub OAuth connectors are not part of this release. Upload or paste their approved content instead.

Review the extracted preview, save the draft, then publish. Edits create immutable revisions. Publishing embeds the saved revision in a background workpool, and switches retrieval atomically only when all passages are indexed. The previous published revision remains available during indexing. Failed indexing retains completed embeddings and offers manual retry. Publishing rejects stale editor revisions. Withdrawing immediately makes the source ineligible for new answers and invalidates pending publication work.

## Retrieval and answers

Convex text search and native vector search are filtered by a composite workspace/application/audience key. Google `gemini-embedding-001` produces 768-dimension document and query vectors. Reciprocal rank fusion selects at most four passages, with at most two per source. A query embedding failure uses keyword retrieval. The backend rechecks the current publication, version, workspace, application and visibility after search and atomically before saving a customer answer.

An exact approved FAQ question or alternative uses its published answer without an answer-model call. Other product questions use the selected model with the bounded passages, public conversation history and independently verified workflow facts. Passages are untrusted data. Answered product responses require citations to retrieved passages. Missing information and conflicting policies should produce a clarification or review response. These are model instructions with citation validation, not a mathematical guarantee of factual correctness.

Typed and spoken widget questions share this service. Voice still uses Gemini for transcription and Google Cloud for speech; its consent notice includes the configured answer provider. Customer source cards show the document title, heading or PDF page and the cited excerpt. Private storage URLs and file IDs stay on the server. Historical cards stop displaying excerpts when their source is withdrawn or superseded; the saved conversational answer itself remains part of the case history.

Knowledge receipts retain the used and cited passage IDs, application, workspace, model, retrieval mode and reported answer-model token usage. SDK tracing hides document payload fields; embedding calls are not instrumented with raw document content. Exact FAQ answers do not consume answer-model tokens, but hybrid retrieval can still consume query-embedding usage. Unreported fallback usage is labelled unavailable rather than described as free.

## LiteLLM

Gemini Flash is the default for widget answers. LiteLLM is available for a deliberate later switch or an explicit comparison in the question tester; merely configuring its key does not select it. Supported LiteLLM chat models are Nova Lite, Claude Haiku and Claude Sonnet 4.6. Provider errors, exhausted allowance and unavailable models produce a controlled review answer; there is no silent retry to another provider.

Use the Knowledge question tester to see the answer, supporting excerpts, retrieved passages, model, retrieval mode and reported tokens. Advanced controls compare hybrid retrieval with the keyword baseline. Tests do not message customers.

## Evaluation protocol

`tests/fixtures/knowledge-evaluation.json` freezes three development questions and twenty held-out questions before results are inspected. Its synthetic documents cover correct facts, paraphrases, missing information, conflicting policies, unpublished drafts, prompt injection, and canaries in private, other-application and other-workspace documents. They are isolated from registered live applications and withdrawn after execution.

Run with the trusted server environment and a private team key:

```sh
node --env-file=.env.local --import tsx scripts/evaluate-knowledge.ts
```

The script compares Gemini Flash, Nova Lite and Haiku with the same corpus and 1,200-token answer cap, plus a matched Haiku keyword baseline. Provider calls can incur cost and create evaluation records; inspect the script and environment before running it. No provider retry or model fallback is allowed. The initial gate is at least 18/20 correct, appropriately supported responses or abstentions and zero canary disclosure. Pattern checks are a bounded regression screen; manually inspect the answer and its evidence before interpreting this as support quality. Twenty synthetic questions cannot establish general customer accuracy. Keep a failed question out of the tuning set and use new development questions to diagnose mechanisms.

The current deployment is the configured single-company pilot. It has strict app and public/internal separation inside that company; it is not yet an independent organisation-onboarding product with per-document user ACLs. No unattended crawling, connector auto-sync, OCR, or full company chat ingestion is claimed.


Previous model evaluation and live verification claims are withdrawn. Run and inspect the evaluation before reporting results. See [repository and build provenance](repository-and-build-provenance.md).
