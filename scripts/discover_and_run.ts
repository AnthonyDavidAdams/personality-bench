/**
 * Daily auto-discovery: poll OpenRouter /models, detect NEW frontier releases from the labs we
 * track, register them in the DB (cohort/lineage/predecessor filled in automatically), and sweep
 * the full instrument battery at N=5 — the same design as every other model in the study.
 *
 * Guardrails:
 *   - only slugs first listed on OpenRouter within MAX_AGE_DAYS (no back-catalogue re-discovery)
 *   - vendor whitelist + frontier price band + name filter (no mini/nano/lite/flash/free/batch variants)
 *   - MAX_NEW_MODELS_PER_RUN and --max-spend (USD) caps; dry-run unless --execute
 *
 * Usage:
 *   npx tsx scripts/discover_and_run.ts                 # dry-run, log only
 *   npx tsx scripts/discover_and_run.ts --execute       # sweep new models
 *   npx tsx scripts/discover_and_run.ts --max-spend 15  # override cap
 *   npx tsx scripts/discover_and_run.ts --notify        # email a summary (needs GMAIL_APP_PASSWORD)
 *
 * Writes data/discover-last.json for scripts/autopilot.sh (article, refresh, deploy).
 */
import "../src/lib/env";
import fs from "node:fs";
import path from "node:path";
import { rawSqlite } from "../src/lib/db";
import { listModels } from "../src/lib/openrouter/client";
import { FRONTIER_MODELS } from "../src/lib/openrouter/models";
import { HISTORICAL_MODELS } from "../src/lib/openrouter/historical";
import { FAMILIES } from "../src/lib/families";
import { runCell } from "../src/lib/runner";
import { listInstrumentFiles } from "../src/lib/instruments/load";
import { nanoid } from "nanoid";
import { spawnSync } from "node:child_process";

// ─────────── Configuration ───────────
const MAX_SPEND_PER_RUN_USD = 15;
const MAX_NEW_MODELS_PER_RUN = 3;
const MAX_AGE_DAYS = 14;              // only models first listed on OpenRouter this recently
const MIN_INPUT_PRICE_PER_M = 1.0;    // USD/M — below this we treat as non-frontier
const MAX_INPUT_PRICE_PER_M = 50;
const KNOWN_VENDORS = ["anthropic/", "openai/", "google/", "x-ai/", "deepseek/", "meta-llama/", "mistralai/"];
const EXCLUDE_NAME = /(mini|nano|lite|flash|small|haiku|instant|distill|codex|embed|tts|audio|image|vision|realtime|search|guard|moderation|open-?weight|oss|free|batch|thinking|extended|latest)/i;
const RUNS_PER_MODEL = 5;
const CONCURRENCY = 4;
const OUT_FILE = path.join(process.cwd(), "data", "discover-last.json");

interface Args { execute: boolean; maxSpend: number; notify: boolean }
function parseArgs(): Args {
  const a = process.argv.slice(2);
  const out: Args = { execute: false, maxSpend: MAX_SPEND_PER_RUN_USD, notify: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--execute") out.execute = true;
    else if (a[i] === "--max-spend") out.maxSpend = parseFloat(a[++i] ?? String(MAX_SPEND_PER_RUN_USD));
    else if (a[i] === "--notify") out.notify = true;
  }
  return out;
}

interface Candidate {
  id: string; displayName: string; vendor: string;
  promptUsd: number; completionUsd: number; created: number; estimatedRunCost: number;
  lineage: string | null; lineageLabel: string; predecessor: string | null; releaseDate: string;
}

/** Pick the lineage whose member slugs share the longest prefix with the new slug (min 4 chars past the vendor). */
function inferLineage(id: string): string | null {
  const db = rawSqlite();
  const rows = db.prepare(`SELECT id, lineage FROM models WHERE lineage IS NOT NULL`).all() as { id: string; lineage: string }[];
  const registry = FAMILIES.flatMap((f) => f.versions.map((v) => ({ id: v.modelId, lineage: f.id })));
  const vendorLen = id.indexOf("/") + 1;
  let best: { lineage: string; len: number } | null = null;
  for (const r of [...rows, ...registry]) {
    if (!r.id.startsWith(id.slice(0, vendorLen))) continue;
    let n = 0;
    while (n < id.length && n < r.id.length && id[n] === r.id[n]) n++;
    // trim back to the last non-digit boundary so "gpt-5.5" vs "gpt-5.6" share "gpt-5."
    if (n - vendorLen >= 4 && (!best || n > best.len)) best = { lineage: r.lineage, len: n };
  }
  return best?.lineage ?? null;
}

function shortLabel(displayName: string): string {
  return displayName.replace(/^[^:]+:\s*/, "").replace(/^(Claude|OpenAI|Google|Meta|xAI|Mistral)\s+/i, "").trim();
}

function latestInLineage(lineage: string): string | null {
  const row = rawSqlite()
    .prepare(`SELECT id FROM models WHERE lineage = ? AND active = 1 ORDER BY release_date IS NULL, release_date DESC LIMIT 1`)
    .get(lineage) as { id: string } | undefined;
  return row?.id ?? null;
}

async function main() {
  const args = parseArgs();
  const db = rawSqlite();
  const discoveryId = nanoid(14);
  const nInstruments = listInstrumentFiles().length;
  console.log(`[discover] run ${discoveryId} (${args.execute ? "EXECUTE" : "dry-run"}) · ${nInstruments} instruments · N=${RUNS_PER_MODEL}`);

  const all = await listModels();
  console.log(`[discover] OpenRouter returned ${all.length} models`);

  const known = new Set<string>([
    ...[...FRONTIER_MODELS, ...HISTORICAL_MODELS].map((m) => m.id),
    ...(db.prepare(`SELECT id FROM models`).all() as { id: string }[]).map((r) => r.id),
  ]);
  const cutoff = Date.now() / 1000 - MAX_AGE_DAYS * 86400;
  const candidates: Candidate[] = [];
  const rejected: Record<string, number> = {};
  const reject = (why: string) => { rejected[why] = (rejected[why] ?? 0) + 1; };

  for (const m of all) {
    if (known.has(m.id)) continue;
    if (m.id.startsWith("~") || m.id.includes(":")) { reject("alias/variant"); continue; }
    if (!KNOWN_VENDORS.some((v) => m.id.startsWith(v))) { reject("vendor"); continue; }
    const raw = (m.raw ?? {}) as { created?: number; name?: string };
    const created = Number(raw.created ?? 0);
    if (!created || created < cutoff) { reject("older than window"); continue; }
    const promptUsd = (m.pricing.prompt ?? 0) * 1_000_000;
    const completionUsd = (m.pricing.completion ?? 0) * 1_000_000;
    if (promptUsd < MIN_INPUT_PRICE_PER_M || promptUsd > MAX_INPUT_PRICE_PER_M) { reject("price band"); continue; }
    if (EXCLUDE_NAME.test(m.id.split("/")[1]) || EXCLUDE_NAME.test(m.name)) { reject("name filter"); continue; }

    const tokensIn = nInstruments * 2 * RUNS_PER_MODEL * 1200;
    const tokensOut = nInstruments * 2 * RUNS_PER_MODEL * 1500;
    const lineage = inferLineage(m.id);
    candidates.push({
      id: m.id, displayName: shortLabelFull(m.name), vendor: m.id.split("/")[0],
      promptUsd, completionUsd, created,
      estimatedRunCost: (tokensIn * promptUsd + tokensOut * completionUsd) / 1_000_000,
      lineage, lineageLabel: shortLabel(m.name),
      predecessor: lineage ? latestInLineage(lineage) : null,
      releaseDate: new Date(created * 1000).toISOString().slice(0, 10),
    });
  }
  console.log(`[discover] rejected: ${Object.entries(rejected).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  console.log(`[discover] ${candidates.length} new frontier candidate(s)`);
  for (const c of candidates) {
    console.log(`   ${c.id.padEnd(44)} listed ${c.releaseDate}  $${c.promptUsd.toFixed(2)}/$${c.completionUsd.toFixed(2)} per M  est $${c.estimatedRunCost.toFixed(2)}  lineage=${c.lineage ?? "-"} pred=${c.predecessor ?? "-"}`);
  }

  const ordered = candidates.sort((a, b) => b.created - a.created);
  const willRun: Candidate[] = [];
  let totalEstimate = 0;
  for (const c of ordered) {
    if (willRun.length >= MAX_NEW_MODELS_PER_RUN) break;
    if (totalEstimate + c.estimatedRunCost > args.maxSpend) { console.log(`[discover] skipping ${c.id} — would exceed --max-spend $${args.maxSpend}`); continue; }
    willRun.push(c); totalEstimate += c.estimatedRunCost;
  }
  console.log(`[discover] plan: ${willRun.length} model(s), est $${totalEstimate.toFixed(2)}`);

  db.prepare(
    `INSERT INTO model_discovery_log (id, total_models_seen, new_models_count, new_models_json, sweep_triggered, cost_estimate_usd, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(discoveryId, all.length, candidates.length, JSON.stringify(willRun.map((c) => c.id)), willRun.length > 0 && args.execute ? 1 : 0, totalEstimate, args.execute ? null : "dry-run");

  const result = { discoveryId, ranAt: new Date().toISOString(), execute: args.execute, models: [] as { id: string; displayName: string; ok: number; fail: number; spent: number }[] };
  if (!args.execute || willRun.length === 0) {
    fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
    console.log("[discover] dry-run or nothing new — exiting");
    if (willRun.length > 0 && args.notify) notify(willRun.map((c) => `${c.id} (est $${c.estimatedRunCost.toFixed(2)})`), `${willRun.length} new model(s) detected (dry-run, not swept)`);
    return;
  }

  const upsert = db.prepare(
    `INSERT INTO models (id, vendor, display_name, family, tier, reasoning, pricing_prompt_usd, pricing_completion_usd, active,
                         cohort, lineage, lineage_label, predecessor, release_date, source, discovered_at)
     VALUES (?, ?, ?, ?, 'frontier', 0, ?, ?, 1, 'frontier', ?, ?, ?, ?, 'discovery', unixepoch())
     ON CONFLICT(id) DO UPDATE SET pricing_prompt_usd=excluded.pricing_prompt_usd, pricing_completion_usd=excluded.pricing_completion_usd, active=1`,
  );
  const instruments = listInstrumentFiles();
  for (const c of willRun) {
    upsert.run(c.id, c.vendor, c.displayName, c.lineage ?? c.vendor, c.promptUsd, c.completionUsd, c.lineage, c.lineageLabel, c.predecessor, c.releaseDate);
    // Register in the in-memory registry so runCell accepts it. 12000 max tokens: hidden reasoning
    // on some "non-reasoning" models truncated the 102-item instrument at 4000.
    (FRONTIER_MODELS as unknown as Record<string, unknown>[]).push({
      id: c.id, vendor: c.vendor, displayName: c.displayName, family: c.lineage ?? c.vendor,
      tier: "frontier", reasoning: false, maxTokens: 12000, active: true, releaseDate: c.releaseDate,
    });

    console.log(`\n[discover] sweeping ${c.id} …`);
    const cells: { instrumentId: string; framing: "self" | "human"; runIndex: number }[] = [];
    for (const instrumentId of instruments) for (const framing of ["self", "human"] as const) for (let r = 1; r <= RUNS_PER_MODEL; r++) cells.push({ instrumentId, framing, runIndex: r });
    let ok = 0, fail = 0, spent = 0, aborted = false;
    const queue = cells.slice();
    const worker = async () => {
      while (queue.length && !aborted) {
        const cell = queue.shift()!;
        const out = await runCell({ modelId: c.id, ...cell });
        if (out.status === "completed") { ok++; spent += out.costUsd ?? 0; } else { fail++; console.log(`   ✗ ${cell.instrumentId} ${cell.framing}#${cell.runIndex}: ${out.error}`); }
        if (spent > args.maxSpend) { aborted = true; console.log(`[discover] ABORT ${c.id}: spent $${spent.toFixed(2)} > cap`); }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    // one retry pass for invalid/failed cells (JSON hiccups, empty responses)
    if (fail > 0 && !aborted) {
      const pending = db.prepare(`SELECT instrument_id, framing, run_index FROM runs WHERE model_id=? AND status<>'completed'`).all(c.id) as { instrument_id: string; framing: "self" | "human"; run_index: number }[];
      let recovered = 0;
      for (const p of pending) {
        const out = await runCell({ modelId: c.id, instrumentId: p.instrument_id, framing: p.framing, runIndex: p.run_index });
        if (out.status === "completed") { recovered++; spent += out.costUsd ?? 0; }
      }
      ok += recovered; fail -= recovered;
    }
    console.log(`[discover] ${c.id}: ${ok} ok / ${fail} fail · $${spent.toFixed(2)}`);
    result.models.push({ id: c.id, displayName: c.displayName, ok, fail, spent });
  }

  const spentTotal = result.models.reduce((s, m) => s + m.spent, 0);
  db.prepare(`UPDATE model_discovery_log SET cost_estimate_usd=?, notes=? WHERE id=?`)
    .run(spentTotal, `actual $${spentTotal.toFixed(2)}; ` + result.models.map((m) => `${m.id} ${m.ok}/${m.ok + m.fail}`).join("; "), discoveryId);
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));
  console.log(`\n[discover] complete: ${result.models.length} model(s), $${spentTotal.toFixed(2)} → ${OUT_FILE}`);
  if (args.notify) notify(result.models.map((m) => `${m.id}: ${m.ok} ok / ${m.fail} fail, $${m.spent.toFixed(2)}`), `swept ${result.models.length} new model(s), $${spentTotal.toFixed(2)}`);
}

/** "Anthropic: Claude Fable 5.1" → "Claude Fable 5.1" (display name keeps the product word). */
function shortLabelFull(name: string): string {
  return name.replace(/^[^:]+:\s*/, "").trim();
}

/** Best-effort email via Gmail SMTP. Password comes from GMAIL_APP_PASSWORD (env or ~/.gmail.env); never inline. */
export function notify(lines: string[], subjectTail: string): void {
  const envFile = path.join(process.env.HOME ?? "", ".gmail.env");
  const pw = process.env.GMAIL_APP_PASSWORD ?? (fs.existsSync(envFile) ? fs.readFileSync(envFile, "utf8").match(/GMAIL_APP_PASSWORD=(\S+)/)?.[1] : undefined);
  if (!pw) { console.log("[discover] no GMAIL_APP_PASSWORD — skipping email"); return; }
  const body = ["Personality Bench nightly discovery", "", ...lines.map((l) => `  • ${l}`), "", "Dashboard: https://persona.earthpilot.ai"].join("\n");
  const py = `
import smtplib, os
from email.mime.text import MIMEText
m = MIMEText(${JSON.stringify(body)})
m['From']='Anthony Adams <anthony@175g.com>'; m['To']='anthony@175g.com'
m['Subject']=${JSON.stringify(`[Personality Bench] ${subjectTail}`)}
with smtplib.SMTP('smtp.gmail.com', 587) as s:
    s.starttls(); s.login('anthony@175g.com', os.environ['GMAIL_APP_PASSWORD']); s.send_message(m)
print('[discover] notified')`;
  spawnSync("python3", ["-c", py], { stdio: "inherit", env: { ...process.env, GMAIL_APP_PASSWORD: pw } });
}

if (process.argv[1]?.endsWith("discover_and_run.ts")) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
