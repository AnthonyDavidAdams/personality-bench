/**
 * Render every model's bodygraph (SVG + chart JSON) into public/bodygraph/ with the Bodygraph
 * API library. Only models whose inputs changed are re-rendered.
 *
 * One-time setup:
 *   python3 -m venv .venv-hd
 *   .venv-hd/bin/pip install "git+https://github.com/AnthonyDavidAdams/bodygraph-api" qrcode
 *
 * Usage:
 *   npx tsx scripts/render_bodygraphs.ts            # all models with completed runs
 *   npx tsx scripts/render_bodygraphs.ts --force    # re-render everything
 */
import "../src/lib/env";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { rawSqlite } from "../src/lib/db";
import { getModelProfile } from "../src/lib/model_profiles";

const PY = path.join(process.cwd(), ".venv-hd", "bin", "python");
if (!fs.existsSync(PY)) {
  console.error(`[bodygraph] no ${PY}. Set it up:\n  python3 -m venv .venv-hd\n  .venv-hd/bin/pip install "git+https://github.com/AnthonyDavidAdams/bodygraph-api" qrcode`);
  process.exit(1);
}

const ids = (
  rawSqlite()
    .prepare(`SELECT DISTINCT model_id AS id FROM runs WHERE status = 'completed' ORDER BY model_id`)
    .all() as { id: string }[]
).map((r) => r.id);

type ChartInput = { id: string; name: string } & ({ utc: string } | { date: string; time: string; lat: number; lon: number });
const names = new Map(
  (rawSqlite().prepare(`SELECT id, display_name AS name FROM models`).all() as { id: string; name: string }[]).map((r) => [r.id, r.name]),
);
const inputs = ids.flatMap((id): ChartInput[] => {
  const p = getModelProfile(id);
  if (!p?.releaseDate) return [];
  // releaseTime is UTC (see model_profiles.ts); without one, use noon local time at the lab's HQ.
  const name = names.get(id) ?? id;
  return p.releaseTime
    ? [{ id, name, utc: `${p.releaseDate}T${p.releaseTime}:00Z` }]
    : [{ id, name, date: p.releaseDate, time: "12:00", lat: p.hqLat, lon: p.hqLon }];
});

const res = spawnSync(PY, [path.join("scripts", "bodygraph_render.py"), ...process.argv.slice(2)], {
  input: JSON.stringify(inputs),
  stdio: ["pipe", "inherit", "inherit"],
});
process.exit(res.status ?? 1);
