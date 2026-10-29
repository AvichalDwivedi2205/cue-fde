import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { expect, test } from "vitest";

test("a direct signed-in workspace visit opens Home without prototype landing state", async () => {
  const source = await readFile("lib/browser/navigation.js", "utf8");
  const redirects: string[] = [];
  let rendered = 0;
  const location = {
    hash: "",
    replace: (target: string) => redirects.push(target),
  };
  const context = vm.createContext({
    location,
    route: () => rendered++,
    renderTop: () => {},
    S: { ag: {} },
    addEventListener: () => {},
    removeEventListener: () => {},
    Intl,
    Date,
  });
  vm.runInContext(source + "\nroute();", context);
  expect(redirects).toEqual(["#/home"]);
  expect(rendered).toBe(0);
  location.hash = "#/";
  vm.runInContext("route();", context);
  expect(redirects).toEqual(["#/home", "#/home"]);
  location.hash = "#/inbox/customer-conversation";
  vm.runInContext("route();", context);
  expect(rendered).toBe(1);
  expect(redirects).toHaveLength(2);
});
