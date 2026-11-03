import nextEnv from "@next/env";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { z } from "zod";
nextEnv.loadEnvConfig(process.cwd());

// Operator-run feasibility harness for the Quiet signals comparison
// (DEMO plan section 5). Run it only with operator-held credentials:
//
//   npx tsx scripts/evaluate-signals.ts --fixture public/quiet-signals-fixture-v1.json --route signals --out artifacts/signals-v1.json
//   npx tsx scripts/evaluate-signals.ts --fixture public/quiet-signals-fixture-v1.json --route baseline --out artifacts/baseline-v1.json
//
// The held-out fixture decides acceptance once: public/quiet-signals-fixture-v2-heldout.json
// The script keeps a fixed call budget and records real usage receipts.

const CALL_BUDGET = 10;
let calls = 0;
const budget = () => {
  if (++calls > CALL_BUDGET)
    throw new Error(
      `Call budget exhausted (${CALL_BUDGET}). Record results before more calls.`,
    );
};

const argsSchema = z.object({
  fixture: z.string().min(1),
  route: z.enum(["signals", "baseline"]),
  out: z.string().min(1),
});
const args = argsSchema.parse(
  Object.fromEntries(
    process.argv.slice(2).reduce<[string, string][]>((acc, part, index, all) => {
      if (part.startsWith("--")) acc.push([part.slice(2), all[index + 1] ?? ""]);
      return acc;
    }, []),
  ),
);

const fixture = z
  .object({
    fixture: z.string(),
    version: z.string(),
    label: z.string(),
    syntheticAuthors: z.boolean(),
    posts: z.array(
      z.object({
        id: z.string(),
        author: z.string(),
        text: z.string(),
      }),
    ),
  })
  .parse(JSON.parse(await readFile(args.fixture, "utf8")));

const appName = process.env.CUE_EVAL_APP_NAME || "the application";

if (args.route === "signals") {
  const { analyzeSignalPosts } = await import("../lib/signals");
  budget();
  try {
    const { analysis, receipt, promptVersion } = await analyzeSignalPosts({
      appName,
      provenance: {
        kind: "synthetic-fixture",
        fixture: fixture.fixture,
        version: fixture.version,
      },
      posts: fixture.posts,
    });
    await writeFile(
      args.out,
      JSON.stringify(
        {
          route: "signals",
          fixture: fixture.fixture,
          version: fixture.version,
          promptVersion,
          receipt,
          analysis,
          notes:
            "Dispositions, quotes, and counts are server-validated against the saved posts.",
        },
        null,
        2,
      ),
    );
    console.log(`OK signals · ${args.out} · ${JSON.stringify(receipt)}`);
  } catch (error) {
    await writeFile(
      args.out,
      JSON.stringify(
        {
          route: "signals",
          fixture: fixture.fixture,
          version: fixture.version,
          error: error instanceof Error ? error.message : String(error),
          note: "Failure is a recorded attempt; rerun counts against the demo retry rules.",
        },
        null,
      ),
    );
    console.error(`FAIL signals · ${error}`);
    process.exitCode = 1;
  }
} else {
  // Baseline: the same evidence to the existing specification generator.
  const { generateSpec } = await import("../lib/gemini");
  budget();
  const { spec, generation } = await generateSpec({
    issue: { title: `Customer feedback summary (${fixture.fixture})`, description: fixture.label },
    requests: fixture.posts.map((p) => ({ title: p.author, body: p.text })),
  });
  await writeFile(
    args.out,
    JSON.stringify(
      {
        route: "baseline",
        fixture: fixture.fixture,
        version: fixture.version,
        receipt: generation,
        spec,
        notes:
          "The baseline generator does not return dispositions; that schema gap is structural, not a failure. Compare supported need and specification quality only.",
      },
      null,
      2,
    ),
  );
  console.log(`OK baseline · ${args.out} · ${JSON.stringify(generation)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void 0;
