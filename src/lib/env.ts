/**
 * Load environment variables from .env.local first, then .env (Next.js convention).
 * Import this BEFORE any code that reads process.env.
 */
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";

const cwd = process.cwd();
const candidates = [".env.local", ".env"];
for (const f of candidates) {
  const p = path.join(cwd, f);
  if (fs.existsSync(p)) {
    dotenv.config({ path: p, override: false });
  }
}
