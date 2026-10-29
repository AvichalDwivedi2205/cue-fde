import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const source = readFileSync("lib/browser/growth.js", "utf8"),
  helper = source.slice(
    source.indexOf("function growthContextHtml("),
    source.indexOf("\nconst suppliedGrowthFoot"),
  );
const escape = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
function render(status: string, current: boolean) {
  return vm.runInNewContext(helper + "\ngrowthContextHtml(opportunity)", {
    esc: escape,
    opportunity: {
      status,
      appId: "bloom",
      draft: {
        contextEvidence: {
          current,
          brandVersion: 2,
          retrieval: "hybrid",
          passages: [
            {
              title: "Caption guide",
              revision: 3,
              sourceId: "source",
              excerpt: "<script>untrusted()</script>",
            },
          ],
        },
      },
    },
  });
}
test("review shows immutable public context and gives stale unpublished drafts a regeneration action", () => {
  const current = render("awaiting", true);
  expect(current).toContain("Brand voice v2");
  expect(current).toContain("/knowledge?app=bloom#source/source");
  expect(current).toContain("Caption guide · r3");
  expect(current).toContain("&lt;script>");
  expect(current).not.toContain("<script>");
  expect(render("awaiting", false)).toContain('data-act="gDraft"');
  expect(render("approved", false)).toContain(
    "Approval and publication are blocked",
  );
});
test("a later context change preserves already-published evidence without offering an impossible rewrite", () => {
  const html = render("published", false);
  expect(html).toContain("original publication evidence is retained");
  expect(html).not.toContain('data-act="gDraft"');
});
