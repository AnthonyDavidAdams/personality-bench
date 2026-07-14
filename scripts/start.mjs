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

// Volume seeding: restore the baked-in snapshot if either
//   (a) no volume DB exists / it's schema-only (< 2 MB), or
//   (b) the seed file shipped in this deploy is newer than the volume DB.
// (b) lets us push fresh data by just bumping seed/personality-bench-seed.db.gz
// in git and redeploying — no manual volume cleanup needed.
const seedPath = path.join(process.cwd(), "seed", "personality-bench-seed.db.gz");
try {
  const dbExists = fs.existsSync(dbPath);
  const dbStat = dbExists ? fs.statSync(dbPath) : null;
  const seedStat = fs.existsSync(seedPath) ? fs.statSync(seedPath) : null;

  let shouldSeed = false;
  let reason = "";
  if (!dbExists) {
    shouldSeed = !!seedStat;
    reason = "no volume DB yet";
  } else if (dbStat.size < 2_000_000) {
    shouldSeed = !!seedStat;
    reason = `volume DB is only ${(dbStat.size / 1024 / 1024).toFixed(1)} MB (schema-only)`;
  } else if (seedStat && seedStat.mtimeMs > dbStat.mtimeMs) {
    shouldSeed = true;
    const ageHours = (seedStat.mtimeMs - dbStat.mtimeMs) / 1000 / 3600;
    reason = `seed is ${ageHours.toFixed(1)}h newer than volume DB`;
  }

  if (shouldSeed) {
    console.log(`[start] seeding ${dbPath} from ${seedPath} (${reason}; ${(seedStat.size / 1024 / 1024).toFixed(1)} MB compressed)`);
    // Stage to a temp file then rename atomically so a crash mid-extract doesn't leave a half DB.
    const tmp = `${dbPath}.seed-tmp`;
    await pipeline(createReadStream(seedPath), createGunzip(), createWriteStream(tmp));
    fs.renameSync(tmp, dbPath);
    console.log(`[start] seed restored — ${(fs.statSync(dbPath).size / 1024 / 1024).toFixed(1)} MB on disk`);
  } else if (!seedStat) {
    console.log(`[start] no seed file at ${seedPath} — starting with empty DB`);
  } else {
    console.log(`[start] existing volume DB at ${dbPath} (${(dbStat.size / 1024 / 1024).toFixed(1)} MB, ${(seedStat ? (dbStat.mtimeMs - seedStat.mtimeMs) / 1000 / 3600 : 0).toFixed(1)}h newer than seed) — keeping it`);
  }
} catch (e) {
  console.error(`[start] seed restoration failed (non-fatal):`, e.message);
}

const push = spawnSync("npx", ["drizzle-kit", "push", "--force"], {
  stdio: "inherit",
  env: process.env,
});
if (push.status !== 0) {
  console.warn(`[start] drizzle-kit push exited with status ${push.status} — continuing anyway; schema is probably already in sync`);
} else {
  console.log("[start] schema up to date");
}

const next = spawn("npx", ["next", "start", "-p", process.env.PORT || "3000"], {
  stdio: "inherit",
  env: process.env,
});
next.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => next.kill("SIGTERM"));
process.on("SIGINT", () => next.kill("SIGINT"));
