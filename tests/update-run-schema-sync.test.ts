import { describe, expect, test } from "vitest";
import schema from "../convex/schema";
import { updateRunFields } from "../convex/cue";

// The updateRun "fields" validator is a hand-maintained projection of the runs
// table schema. When the two drift, a pipeline writing a legitimate field is
// rejected server-side and every pull-request run fails — exactly the
// reproductionStatus incident. This guard fails CI the moment the two drift.

const runsSchemaFields = Object.keys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (schema.tables.runs as any).validator.fields,
).sort();

const updateRunPatchable = Object.keys(updateRunFields.fields).sort();

// Fields the pipeline legitimately reads on a run but which are intentionally
// not patchable through updateRun. Add here only with a comment saying why.
const NOT_PATCHABLE = new Set([
  "issueId", // set where the run is born
  "createdAt", // immutable
  "updatedAt", // stamped by updateRun itself
  "targetId", // decided by the pack at start
  "repository", // decided by the pack at start
  "reproduction", // set where the run is born
  "approvedSpec", // bound by startFeature
  "kind", // fixed where the run is born
  "deploymentMode", // fixed where the run is born
  "provider", // fixed where the run is born
  "codingPolicy", // frozen from the application binding where the run is born
  "releaseCommit", // release-verifier only
  "releaseEvidence", // release-verifier only
]);

describe("updateRun fields validator stays in sync with the runs schema", () => {
  test("every runs field is either patchable or explicitly excluded", () => {
    const missing = runsSchemaFields.filter(
      (f) => !updateRunPatchable.includes(f) && !NOT_PATCHABLE.has(f),
    );
    expect(
      missing,
      "fields the runs table has but updateRun cannot patch",
    ).toEqual([]);
  });

  test("updateRun patches no phantom fields", () => {
    const phantom = updateRunPatchable.filter(
      (f) => !runsSchemaFields.includes(f),
    );
    expect(
      phantom,
      "fields updateRun accepts that the runs table lacks",
    ).toEqual([]);
  });

  test("reproductionStatus remains patchable (regression guard)", () => {
    expect(updateRunPatchable).toContain("reproductionStatus");
  });
});
