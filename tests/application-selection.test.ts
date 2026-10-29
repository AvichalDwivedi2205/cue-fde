import { expect, test } from "vitest";
import { selectedApplicationId } from "../lib/application-selection";

const apps = [
  { id: "app-a", name: "A" },
  { id: "app-b", name: "B" },
];
test("one application selection validates query, restored state and the server default", () => {
  expect(selectedApplicationId(apps, "app-b", "app-a", "app-a")).toBe("app-b");
  expect(selectedApplicationId(apps, "removed", "app-b", "app-a")).toBe(
    "app-b",
  );
  expect(selectedApplicationId(apps, null, "all", "app-b")).toBe("app-b");
  expect(selectedApplicationId([], "app-a", "app-b", "app-a")).toBe("");
});
