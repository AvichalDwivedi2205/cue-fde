import { getMetaConnection } from "./meta";
import {
  readSourceSnapshot,
  withModalCoding,
  applySourceEdits,
  type ExecutionEvent,
} from "./coding-workspace";
import {
  codingModel,
  runMetaCodingAgent,
  type CodingReceipt,
} from "./meta-coding-agent";
import type { CodingConfig } from "./integration-config";

export async function implementInModal(input: {
  repo: string;
  policy: CodingConfig;
  runId: string;
  prompt: string;
  baseline: "must_pass" | "record_only";
  signal: AbortSignal;
  event: ExecutionEvent;
  receipt: (receipt: CodingReceipt) => Promise<void>;
  baselineRecorded: (output: string) => Promise<void>;
  selected: (model: string) => Promise<void>;
  sandboxCreated: (id: string) => Promise<void>;
}) {
  getMetaConnection();
  const model = codingModel();
  await input.selected(model);
  const source = await readSourceSnapshot(input.repo, input.signal);
  return await withModalCoding({ ...input, source }, async (execution) => {
    const baseline = await execution.open("baseline");
    const before = await baseline.check();
    await execution.close(baseline);
    await input.baselineRecorded(before.output);
    if (
      !before.passed &&
      (input.baseline === "must_pass" ||
        /command not found|Cannot find module|ERR_MODULE_NOT_FOUND|ENOENT|No test files found|not configured|out of memory|ENOTFOUND|ECONNREFUSED/i.test(
          before.output,
        ))
    )
      throw new Error(
        "Repository baseline is not ready for implementation\n" + before.output,
      );
    await input.event(
      before.passed
        ? "Repository baseline passed"
        : "Repository baseline checks failed",
      before.passed
        ? before.output
        : "The base checks failed. This exit status alone does not establish reproduction of the customer report.\n" +
            before.output,
      before.passed ? "success" : "reproduction",
    );
    const coding = await execution.open("implementation");
    const result = await runMetaCodingAgent({
      ...input,
      model,
      source,
      workspace: coding,
      baselineEvidence: before,
    });
    await execution.close(coding);
    input.signal.throwIfAborted();
    const verifier = await execution.open("verification", result.edits);
    const after = await verifier.check();
    await execution.close(verifier);
    if (!after.passed)
      throw new Error("Independent repository checks failed\n" + after.output);
    input.signal.throwIfAborted();
    await applySourceEdits(input.repo, result.edits, source, input.policy);
    return {
      before: before.output,
      after: after.output,
      summary: result.summary,
    };
  });
}
