import { expect, test } from "vitest";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { GET } from "../app/route";
function elements(
  node: DefaultTreeAdapterTypes.Node,
): DefaultTreeAdapterTypes.Element[] {
  return [
    ...("tagName" in node ? [node] : []),
    ...("childNodes" in node ? node.childNodes.flatMap(elements) : []),
  ];
}
test("public root offers email early access without exposing the product workspace", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const html = await response.text();
  const nodes = elements(parse(html));
  const attr = (node: DefaultTreeAdapterTypes.Element, name: string) =>
    node.attrs.find((a) => a.name === name)?.value;
  expect(html).toContain("Your customers already told you.");
  for (const id of ["story", "how", "principles", "workspace", "faq"])
    expect(nodes.some((n) => attr(n, "id") === id)).toBe(true);
  expect(html).toContain("Join the waitlist");
  expect(
    nodes.some(
      (n) =>
        n.tagName === "input" &&
        attr(n, "type") === "email" &&
        attr(n, "required") === "",
    ),
  ).toBe(true);
  expect(
    nodes.some(
      (n) => n.tagName === "form" && attr(n, "action") === "/api/waitlist",
    ),
  ).toBe(true);
  expect(
    nodes.filter((n) => n.tagName === "script").map((n) => attr(n, "src")),
  ).toEqual(["/cue-landing.js", "/cue-waitlist.js"]);
  expect(nodes.some((n) => attr(n, "id") === "app")).toBe(false);
  expect(
    nodes
      .filter((n) => n.tagName === "a")
      .some((n) => attr(n, "href")?.startsWith("/cue")),
  ).toBe(false);
  expect(html).not.toMatch(/loadCue|S\.cases|Open (the )?workspace/);
  expect(nodes.some((n) => attr(n, "aria-label") === "Cue home")).toBe(true);
});
