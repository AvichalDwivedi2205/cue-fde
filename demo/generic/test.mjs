// The fixture's own checks: run with `node test.mjs`. Fails on the broken
// baseline ("title missing"), passes after the fix. The supervisor reruns
// these independently before and after any agent change.
import assert from "node:assert/strict";
import { saveNote } from "./lib/notes.mjs";
const saved = saveNote({ title: "First memory", body: "Body text" });
assert.equal(saved.title, "First memory", "title missing (expected saved)");
assert.equal(saved.body, "Body text");
console.log("2 checks passed");
