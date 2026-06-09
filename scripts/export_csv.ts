/**
 * Export the dataset to human-readable CSV files at data/exports/*.csv.
 *
 * GitHub renders CSV as a previewable table, so this gives the dataset a
 * browsable surface without anyone having to decompress the SQLite seed.
 *
 * Run via paper/refresh.sh, which calls this after sweeps land.
 *
 * Outputs:
 *   data/exports/models.csv           — one row per model (id, vendor, family, pricing)
 *   data/exports/instruments.csv      — one row per instrument with metadata
 *   data/exports/runs.csv             — one row per completed run with token/cost telemetry
 *   data/exports/scores.csv           — one row per (run, dimension) with computed mean
 *   data/exports/responses.csv        — one row per (run, item) with raw + scored item answer
 *   data/exports/per_model_summary.csv — flat wide table: model × instrument × framing → dimension scores
 */
import "../src/lib/env";
import { rawSqlite } from "../src/lib/db";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "data", "exports");
fs.mkdirSync(OUT_DIR, { recursive: true });

function escapeCsv(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function writeCsv(filename: string, columns: string[], rows: Record<string, unknown>[]) {
  const lines = [columns.join(",")];
  for (const r of rows) {
    lines.push(columns.map((c) => escapeCsv(r[c])).join(","));
  }
  const out = path.join(OUT_DIR, filename);
  fs.writeFileSync(out, lines.join("\n") + "\n");
  const sizeKb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`  ${filename.padEnd(28)} ${rows.length.toString().padStart(7)} rows  ${sizeKb} KB`);
}

const db = rawSqlite();
console.log("[export] writing CSVs to data/exports/");

// 1. models
writeCsv(
  "models.csv",
  ["id", "vendor", "display_name", "family", "tier", "reasoning", "pricing_prompt_usd_per_M", "pricing_completion_usd_per_M", "active"],
  db
    .prepare(
      `SELECT id, vendor, display_name, family, tier, reasoning,
              pricing_prompt_usd as pricing_prompt_usd_per_M,
              pricing_completion_usd as pricing_completion_usd_per_M,
              active
       FROM models ORDER BY vendor, display_name`,
    )
    .all() as Record<string, unknown>[],
);

// 2. instruments
writeCsv(
  "instruments.csv",
  ["id", "name", "short_name", "family", "item_count", "scale_min", "scale_max", "license", "citation", "active"],
  db
    .prepare(
      `SELECT id, name, short_name, family, item_count, scale_min, scale_max, license, citation, active
       FROM instruments WHERE active = 1 ORDER BY family, name`,
    )
    .all() as Record<string, unknown>[],
);

// 3. runs — one row per completed cell with token + cost telemetry
writeCsv(
  "runs.csv",
  ["id", "model_id", "instrument_id", "framing", "run_index", "status", "temperature", "prompt_tokens", "completion_tokens", "reasoning_tokens", "total_tokens", "cost_usd", "latency_ms", "provider", "openrouter_id", "completed_at"],
  db
    .prepare(
      `SELECT id, model_id, instrument_id, framing, run_index, status, temperature,
              prompt_tokens, completion_tokens, reasoning_tokens, total_tokens,
              cost_usd, latency_ms, provider, openrouter_id, completed_at
       FROM runs WHERE status = 'completed' ORDER BY completed_at`,
    )
    .all() as Record<string, unknown>[],
);

// 4. scores — one row per (run, dimension) with mean
writeCsv(
  "scores.csv",
  ["run_id", "model_id", "instrument_id", "framing", "run_index", "dimension", "raw_sum", "mean", "item_count"],
  db
    .prepare(
      `SELECT r.id as run_id, r.model_id, r.instrument_id, r.framing, r.run_index,
              s.dimension, s.raw_sum, s.mean, s.item_count
       FROM scores s JOIN runs r ON r.id = s.run_id
       WHERE r.status = 'completed' ORDER BY r.completed_at, s.dimension`,
    )
    .all() as Record<string, unknown>[],
);

// 5. responses — item-level (most granular). This is the big one.
writeCsv(
  "responses.csv",
  ["run_id", "model_id", "instrument_id", "framing", "run_index", "item_id", "item_position", "dimension", "item_text", "raw", "scored", "reverse_keyed"],
  db
    .prepare(
      `SELECT r.id as run_id, r.model_id, r.instrument_id, r.framing, r.run_index,
              resp.item_id, it.position as item_position, it.dimension, it.text as item_text,
              resp.raw, resp.scored, it.reverse_keyed
       FROM responses resp
       JOIN runs r ON r.id = resp.run_id
       JOIN items it ON it.id = resp.item_id
       WHERE r.status = 'completed' ORDER BY r.completed_at, it.position`,
    )
    .all() as Record<string, unknown>[],
);

// 6. per_model_summary — flat wide table for quick exploration
//    Each row: (model, instrument, framing) → mean across runs per dimension (long form)
writeCsv(
  "per_model_summary.csv",
  ["model_id", "model_display_name", "vendor", "instrument_id", "instrument_short_name", "framing", "dimension", "mean_across_runs", "n_runs"],
  db
    .prepare(
      `SELECT r.model_id, m.display_name as model_display_name, m.vendor,
              r.instrument_id, i.short_name as instrument_short_name,
              r.framing, s.dimension,
              ROUND(AVG(s.mean), 4) as mean_across_runs,
              COUNT(DISTINCT r.id) as n_runs
       FROM scores s
       JOIN runs r ON r.id = s.run_id
       JOIN models m ON m.id = r.model_id
       JOIN instruments i ON i.id = r.instrument_id
       WHERE r.status = 'completed' AND i.active = 1
       GROUP BY r.model_id, r.instrument_id, r.framing, s.dimension
       ORDER BY m.vendor, m.display_name, i.short_name, r.framing, s.dimension`,
    )
    .all() as Record<string, unknown>[],
);

// 7. cohort summary — one row per (instrument, dimension, framing) with cohort mean/min/max
writeCsv(
  "cohort_summary.csv",
  ["instrument_id", "dimension", "framing", "cohort_mean", "cohort_min", "cohort_max", "n_models"],
  db
    .prepare(
      `SELECT r.instrument_id, s.dimension, r.framing,
              ROUND(AVG(s.mean), 4) as cohort_mean,
              ROUND(MIN(s.mean), 4) as cohort_min,
              ROUND(MAX(s.mean), 4) as cohort_max,
              COUNT(DISTINCT r.model_id) as n_models
       FROM scores s JOIN runs r ON r.id = s.run_id
       WHERE r.status = 'completed'
       GROUP BY r.instrument_id, s.dimension, r.framing
       ORDER BY r.instrument_id, s.dimension, r.framing`,
    )
    .all() as Record<string, unknown>[],
);

// Write a top-level README for the exports directory
const readme = `# Personality Bench — CSV exports

Auto-generated from \`data/personality-bench.db\` on every refresh
via \`scripts/export_csv.ts\` (called by \`paper/refresh.sh\`).

These CSVs are committed to git so the dataset is browsable on GitHub
without unzipping the SQLite seed.

## Files

| File | Description |
|---|---|
| \`models.csv\` | One row per model with vendor, family, pricing, active flag |
| \`instruments.csv\` | One row per active instrument with metadata + license |
| \`runs.csv\` | One row per completed API call with full token + cost telemetry |
| \`scores.csv\` | One row per (run, dimension) — the dimension means we plot |
| \`responses.csv\` | Most granular: one row per (run, item) — every Likert score |
| \`per_model_summary.csv\` | Flat wide-form: (model, instrument, framing) → dimension means averaged across runs |
| \`cohort_summary.csv\` | (instrument, dimension, framing) → cohort mean/min/max across all models |

## Reproducibility

Every row in \`runs.csv\` has an \`openrouter_id\` field — call OpenRouter's
\`/generation?id=<openrouter_id>\` to fetch the authoritative billed cost
and provider routing for that specific call.

The full prompts, raw response text, and parsed JSON for each run are stored
in the SQLite database itself (\`seed/personality-bench-seed.db.gz\`); they
are not exported to CSV because some response bodies contain newlines that
make CSV ingestion awkward. Load the SQLite for full reproducibility.

## Schema reference

See \`src/lib/db/schema.ts\` in the repo for the authoritative table
definitions and column docs.
`;
fs.writeFileSync(path.join(OUT_DIR, "README.md"), readme);
console.log("  README.md");

const totalBytes = fs.readdirSync(OUT_DIR).reduce((sum, f) => sum + fs.statSync(path.join(OUT_DIR, f)).size, 0);
console.log(`\n[export] done — ${(totalBytes / 1024 / 1024).toFixed(1)} MB total in ${OUT_DIR}`);
