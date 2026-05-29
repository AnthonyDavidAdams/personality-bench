/**
 * Sweep runner. Iterates the full matrix (or a slice of it) and runs each cell.
 *
 * Usage examples:
 *   npx tsx scripts/run.ts --smoke                                 # 1 model × 1 instrument × 1 run × 1 framing
 *   npx tsx scripts/run.ts --models anthropic/claude-opus-4.8      # only this model
 *   npx tsx scripts/run.ts --instruments ipip50,sd3                # only these tests
 *   npx tsx scripts/run.ts --runs 5 --framings self,human          # full design
 *   npx tsx scripts/run.ts --resume                                # only re-run failed/pending cells
 *   npx tsx scripts/run.ts --dry-run                               # print plan + cost estimate, do nothing
 */
import "../src/lib/env";
import { db, schema, rawSqlite } from "../src/lib/db";
import { runCell } from "../src/lib/runner";
import { activeModels, FRONTIER_MODELS } from "../src/lib/openrouter/models";
import { listInstrumentFiles, loadInstrumentFile } from "../src/lib/instruments/load";
import type { Framing } from "../src/lib/instruments/prompt";

interface CliArgs {
  smoke: boolean;
  resume: boolean;
  dryRun: boolean;
  models?: string[];
  instruments?: string[];
  framings?: Framing[];
  runs: number;
  concurrency: number;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const out: CliArgs = {
    smoke: false,
    resume: false,
    dryRun: false,
    runs: 5,
    concurrency: 2,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "--smoke":
        out.smoke = true;
        break;
      case "--resume":
        out.resume = true;
        break;
      case "--dry-run":
        out.dryRun = true;
        break;
      case "--models":
        out.models = args[++i]?.split(",").map((s) => s.trim());
        break;
      case "--instruments":
        out.instruments = args[++i]?.split(",").map((s) => s.trim());
        break;
      case "--framings":
        out.framings = args[++i]?.split(",").map((s) => s.trim()) as Framing[];
        break;
      case "--runs":
        out.runs = parseInt(args[++i] ?? "5", 10);
        break;
      case "--concurrency":
        out.concurrency = parseInt(args[++i] ?? "2", 10);
        break;
      default:
        console.error(`unknown arg: ${a}`);
        process.exit(1);
    }
  }
  return out;
}

interface Cell {
  modelId: string;
  instrumentId: string;
  framing: Framing;
  runIndex: number;
}

function buildMatrix(args: CliArgs): Cell[] {
  if (args.smoke) {
    return [
      {
        modelId: args.models?.[0] ?? "anthropic/claude-opus-4.8",
        instrumentId: args.instruments?.[0] ?? "ipip50",
        framing: (args.framings?.[0] as Framing) ?? "self",
        runIndex: 1,
      },
    ];
  }
  const models = args.models ?? activeModels().map((m) => m.id);
  const instruments = args.instruments ?? listInstrumentFiles();
  const framings: Framing[] = args.framings ?? ["self", "human"];
  const cells: Cell[] = [];
  for (const modelId of models) {
    for (const instrumentId of instruments) {
      for (const framing of framings) {
        for (let r = 1; r <= args.runs; r++) {
          cells.push({ modelId, instrumentId, framing, runIndex: r });
        }
      }
    }
  }
  return cells;
}

async function filterToPending(cells: Cell[]): Promise<Cell[]> {
  const sqlite = rawSqlite();
  const stmt = sqlite.prepare(
    `SELECT status FROM runs WHERE model_id=? AND instrument_id=? AND framing=? AND run_index=?`,
  );
  // --resume re-runs anything that is not 'completed' — including 'invalid' (parse error / empty
  // response). Previously-failed cells should get another chance with the current code.
  return cells.filter((c) => {
    const row = stmt.get(c.modelId, c.instrumentId, c.framing, c.runIndex) as { status?: string } | undefined;
    return !row || row.status !== "completed";
  });
}

function estimateMatrixCost(cells: Cell[]): { lowUsd: number; highUsd: number } {
  const sqlite = rawSqlite();
  let low = 0;
  let high = 0;
  // Average tokens per call (rough): 1000 input + 1000 output (more for long instruments / reasoning).
  for (const c of cells) {
    const row = sqlite
      .prepare(`SELECT pricing_prompt_usd, pricing_completion_usd FROM models WHERE id=?`)
      .get(c.modelId) as { pricing_prompt_usd?: number; pricing_completion_usd?: number } | undefined;
    const inst = loadInstrumentFile(c.instrumentId);
    // Token estimates per call
    const inputTokens = 200 + inst.items.length * 12;        // system + scale + items
    const outputTokens = inst.items.length * 12;             // JSON entries
    const promptUsd = (row?.pricing_prompt_usd ?? 5) / 1_000_000;
    const compUsd = (row?.pricing_completion_usd ?? 15) / 1_000_000;
    const base = inputTokens * promptUsd + outputTokens * compUsd;
    low += base;
    high += base * 3; // reasoning models can balloon output 3-5x
  }
  return { lowUsd: low, highUsd: high };
}

async function main() {
  const args = parseArgs();
  let cells = buildMatrix(args);

  if (args.resume) {
    cells = await filterToPending(cells);
  }

  const cost = estimateMatrixCost(cells);
  console.log(`\n[run] matrix size: ${cells.length} cells`);
  console.log(`[run] estimated cost: $${cost.lowUsd.toFixed(2)} – $${cost.highUsd.toFixed(2)}`);
  console.log(
    `[run] models: ${[...new Set(cells.map((c) => c.modelId))].length}, ` +
      `instruments: ${[...new Set(cells.map((c) => c.instrumentId))].length}, ` +
      `framings: ${[...new Set(cells.map((c) => c.framing))].length}, ` +
      `runs/cell: ${args.runs}, concurrency: ${args.concurrency}`,
  );

  if (args.dryRun) {
    console.log(`[run] dry-run, exiting`);
    return;
  }

  if (!process.env.OPENROUTER_API_KEY) {
    console.error(`[run] OPENROUTER_API_KEY not set — add it to .env.local`);
    process.exit(1);
  }

  let totalCost = 0;
  let succeeded = 0;
  let failed = 0;
  let invalid = 0;

  // Simple worker pool over cells.
  const queue = cells.slice();
  async function worker(id: number) {
    while (queue.length > 0) {
      const cell = queue.shift();
      if (!cell) return;
      const idx = cells.length - queue.length;
      const label = `[${idx}/${cells.length}]`;
      const t0 = Date.now();
      try {
        const out = await runCell(cell);
        if (out.status === "completed") {
          succeeded++;
          totalCost += out.costUsd ?? 0;
          console.log(
            `${label} ✓ ${cell.modelId.padEnd(38)} ${cell.instrumentId.padEnd(18)} ${cell.framing}#${cell.runIndex}  ` +
              `${out.promptTokens ?? "?"}→${out.completionTokens ?? "?"}${out.reasoningTokens ? `+${out.reasoningTokens}r` : ""} ` +
              `$${(out.costUsd ?? 0).toFixed(5)}  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
          );
        } else if (out.status === "invalid") {
          invalid++;
          console.log(`${label} ✗ ${cell.modelId} ${cell.instrumentId} ${cell.framing}#${cell.runIndex}  INVALID: ${out.error}`);
        } else {
          failed++;
          console.log(`${label} ✗ ${cell.modelId} ${cell.instrumentId} ${cell.framing}#${cell.runIndex}  FAIL: ${out.error}`);
        }
      } catch (e) {
        failed++;
        console.log(`${label} ✗ ${cell.modelId} ${cell.instrumentId} ${cell.framing}#${cell.runIndex}  EXCEPTION: ${(e as Error).message}`);
      }
    }
  }

  const workers = Array.from({ length: args.concurrency }, (_, i) => worker(i));
  await Promise.all(workers);

  console.log(
    `\n[run] done — ${succeeded} completed, ${invalid} invalid, ${failed} failed. Total spent: $${totalCost.toFixed(4)}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
