import { expect, test } from "vitest";
import {
  brandStyle,
  DEFAULT_BRAND,
  requirementCoverage,
  type CoverageSource,
} from "../lib/company-context-policy";
const now = 200 * 86400000;
const source: CoverageSource = {
  _id: "source",
  title: "Support",
  status: "published",
  visibility: "customer",
  activeVersionId: "v1",
  latestVersionId: "v1",
  indexStatus: "idle",
  publishedAt: now - 86400000,
};
const requirement = {
  id: "policy",
  label: "Support policy",
  audience: "customer" as const,
  sourceIds: [source._id],
  maxAgeDays: 30,
};
test("coverage measures only declared current, published and fresh context", () => {
  expect(requirementCoverage(requirement, [source], now).status).toBe("ready");
  expect(
    requirementCoverage({ ...requirement, sourceIds: [] }, [source], now)
      .status,
  ).toBe("missing");
  expect(requirementCoverage(requirement, [], now).status).toBe("missing");
  for (const status of ["draft", "withdrawn"])
    expect(
      requirementCoverage(requirement, [{ ...source, status }], now).status,
    ).not.toBe("ready");
  expect(
    requirementCoverage(
      requirement,
      [{ ...source, latestVersionId: "v2" }],
      now,
    ).status,
  ).toBe("draft");
  expect(
    requirementCoverage(
      requirement,
      [{ ...source, publishedAt: now - 31 * 86400000 }],
      now,
    ).status,
  ).toBe("stale");
  expect(
    requirementCoverage(
      requirement,
      [{ ...source, publishedAt: undefined }],
      now,
    ).status,
  ).toBe("stale");
});
test("private, failed or incomplete sources cannot satisfy public coverage", () => {
  expect(
    requirementCoverage(
      requirement,
      [{ ...source, visibility: "internal" }],
      now,
    ).status,
  ).toBe("private");
  expect(
    requirementCoverage(
      { ...requirement, audience: "staff" },
      [{ ...source, visibility: "internal" }],
      now,
    ).status,
  ).toBe("ready");
  for (const indexStatus of ["queued", "indexing", "failed"])
    expect(
      requirementCoverage(requirement, [{ ...source, indexStatus }], now)
        .status,
    ).toBe(indexStatus === "failed" ? "failed" : "indexing");
  expect(
    requirementCoverage(
      { ...requirement, sourceIds: ["source", "missing"] },
      [source],
      now,
    ).status,
  ).toBe("missing");
});
test("brand payload is bounded style data and disabled voices leave the baseline intact", () => {
  expect(brandStyle(DEFAULT_BRAND)).toBeUndefined();
  const style = brandStyle({
    ...DEFAULT_BRAND,
    enabled: true,
    guidelines: "x".repeat(2000),
    examples: Array(5).fill("y".repeat(2000)),
  })!;
  expect(style.guidelines).toHaveLength(1000);
  expect(style.examples).toHaveLength(3);
  expect(style.examples[0]).toHaveLength(1200);
  expect(style).not.toHaveProperty("claims");
});
