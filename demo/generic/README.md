# Generic Notes fixture

A second app fixture for exercising the multi-app workflow. `lib/notes.mjs`
drops the note title (the seeded bug); `node test.mjs` fails on the baseline
with `title missing (expected saved)` and passes after a fix confined to
`lib/` (the manifest's allowed paths). `page/index.html` hosts the widget
install snippet for the live rehearsal.
