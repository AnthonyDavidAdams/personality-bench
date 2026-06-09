# Personality Bench — CSV exports

Auto-generated from `data/personality-bench.db` on every refresh
via `scripts/export_csv.ts` (called by `paper/refresh.sh`).

These CSVs are committed to git so the dataset is browsable on GitHub
without unzipping the SQLite seed.

## Files

| File | Description |
|---|---|
| `models.csv` | One row per model with vendor, family, pricing, active flag |
| `instruments.csv` | One row per active instrument with metadata + license |
| `runs.csv` | One row per completed API call with full token + cost telemetry |
| `scores.csv` | One row per (run, dimension) — the dimension means we plot |
| `responses.csv` | Most granular: one row per (run, item) — every Likert score |
| `per_model_summary.csv` | Flat wide-form: (model, instrument, framing) → dimension means averaged across runs |
| `cohort_summary.csv` | (instrument, dimension, framing) → cohort mean/min/max across all models |

## Reproducibility

Every row in `runs.csv` has an `openrouter_id` field — call OpenRouter's
`/generation?id=<openrouter_id>` to fetch the authoritative billed cost
and provider routing for that specific call.

The full prompts, raw response text, and parsed JSON for each run are stored
in the SQLite database itself (`seed/personality-bench-seed.db.gz`); they
are not exported to CSV because some response bodies contain newlines that
make CSV ingestion awkward. Load the SQLite for full reproducibility.

## Schema reference

See `src/lib/db/schema.ts` in the repo for the authoritative table
definitions and column docs.
