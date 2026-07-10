#!/usr/bin/env node
/**
 * Nightly discovery + sweep + snapshot.
 *
 * Designed for Railway cron. Writes straight to the mounted volume at /data.
 * Idempotent and safe to re-run. Guardrails inside discover_and_run.ts.
 *
 * Steps:
 *   1. discover_and_run --execute  → detect new frontier models, sweep them
 *   2. (if any new runs) regenerate the seed snapshot for future boots
 *   3. Report to stdout so Railway captures it in the deploy log
 *
 * Reads: OPENROUTER_API_KEY from env, DATABASE_PATH from env
 * Writes: /data/personality-bench.db, /data/seed/personality-bench-seed.db.gz
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync, copyFileSync, mkdirSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const cwd = process.cwd();
console.log(`[nightly] pwd=${cwd}  time=${new Date().toISOString()}`);
console.log(`[nightly] DATABASE_PATH=${process.env.DATABASE_PATH ?? "(unset)"}`);

// Snapshot the "before" state so we can tell whether the sweep added anything
const dbPath = process.env.DATABASE_PATH ?? "/data/personality-bench.db";
const beforeSize = existsSync(dbPath) ? statSync(dbPath).size : 0;
const beforeMtime = existsSync(dbPath) ? statSync(dbPath).mtimeMs : 0;

// 1. Discovery + sweep
console.log("[nightly] step 1: discover + sweep");
const disc = spawnSync("npx", ["tsx", "scripts/discover_and_run.ts", "--execute"], {
  stdio: "inherit",
  env: process.env,
});
if (disc.status !== 0) {
  console.error(`[nightly] discover_and_run exited ${disc.status}; aborting snapshot step.`);
  process.exit(disc.status ?? 1);
}

// 2. If DB was modified, regenerate seed snapshot
const afterMtime = existsSync(dbPath) ? statSync(dbPath).mtimeMs : 0;
if (afterMtime <= beforeMtime) {
  console.log("[nightly] no DB writes detected; skipping snapshot.");
  process.exit(0);
}

console.log("[nightly] step 2: regenerate seed snapshot");
const seedDir = "/app/seed";
if (!existsSync(seedDir)) mkdirSync(seedDir, { recursive: true });
const seedPath = `${seedDir}/personality-bench-seed.db`;
// SQLite .backup would be ideal but requires a running sqlite3 CLI; use file copy
// since our writer is offline after the sweep completes
copyFileSync(dbPath, seedPath);
const raw = readFileSync(seedPath);
const gz = gzipSync(raw, { level: 9 });
writeFileSync(`${seedPath}.gz`, gz);
console.log(`[nightly] seed: ${(gz.length / 1024 / 1024).toFixed(2)} MB compressed`);

// 3. Done
console.log(`[nightly] complete. before_size=${beforeSize} after_size=${statSync(dbPath).size}`);
