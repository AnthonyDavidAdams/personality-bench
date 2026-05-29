#!/usr/bin/env node
import { spawnSync, spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import fs from "node:fs";
import path from "node:path";

const dbPath =
  process.env.DATABASE_PATH ||
  (process.env.NODE_ENV === "production"
    ? "/data/personality-bench.db"
    : path.join(process.cwd(), "data", "personality-bench.db"));

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
console.log(`[start] ensured directory ${path.dirname(dbPath)}`);

// First-boot seeding: if the volume's DB doesn't exist (or is suspiciously empty),
// decompress the baked-in seed snapshot. This lets a fresh Railway volume come up
// pre-populated with the dataset shipped in the repo.
const seedPath = path.join(process.cwd(), "seed", "personality-bench-seed.db.gz");
try {
  const dbExists = fs.existsSync(dbPath);
  const dbSize = dbExists ? fs.statSync(dbPath).size : 0;
  // Threshold tuned for our schema: an empty (schema-only) DB lands around 200-400 KB,
  // a real DB with run data is 5+ MB. Use 2 MB as the boundary.
  if (!dbExists || dbSize < 2_000_000) {
    if (fs.existsSync(seedPath)) {
      console.log(`[start] seeding ${dbPath} from ${seedPath} (${(fs.statSync(seedPath).size / 1024 / 1024).toFixed(1)} MB compressed)`);
      await pipeline(createReadStream(seedPath), createGunzip(), createWriteStream(dbPath));
      console.log(`[start] seed restored — ${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(1)} MB on disk`);
    } else {
      console.log(`[start] no seed file at ${seedPath} — starting with empty DB`);
    }
  } else {
    console.log(`[start] existing DB at ${dbPath} (${(dbSize / 1024 / 1024).toFixed(1)} MB) — skipping seed`);
  }
} catch (e) {
  console.error(`[start] seed restoration failed (non-fatal):`, e.message);
}

const push = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
  stdio: "inherit",
  env: process.env,
});
if (push.status !== 0) {
  console.error(`[start] drizzle-kit push exited with status ${push.status}`);
  process.exit(push.status ?? 1);
}
console.log("[start] schema up to date");

const next = spawn("npx", ["next", "start", "-p", process.env.PORT || "3000"], {
  stdio: "inherit",
  env: process.env,
});
next.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => next.kill("SIGTERM"));
process.on("SIGINT", () => next.kill("SIGINT"));
