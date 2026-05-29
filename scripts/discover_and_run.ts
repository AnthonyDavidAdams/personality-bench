/**
 * Daily auto-discovery: poll OpenRouter /models, detect new frontier candidates that
 * aren't already in our registry, write them to a "pending intake" file, and
 * (optionally) trigger a sweep against them.
 *
 * Hard guardrails to prevent runaway:
 *   - MAX_SPEND_PER_RUN: stops if estimated cost exceeds this many USD
 *   - MAX_NEW_MODELS_PER_DAY: at most this many newly-detected models per day
 *   - dry-run mode by default unless --execute is passed
 *
 * Usage:
 *   npx tsx scripts/discover_and_run.ts                 # dry-run, log only
 *   npx tsx scripts/discover_and_run.ts --execute       # actually run the sweep
 *   npx tsx scripts/discover_and_run.ts --max-spend 10  # override cap
 *
 * Suggested cron: once per day, 06:00 local.
 */
import "../src/lib/env";
import { rawSqlite } from "../src/lib/db";
import { listModels } from "../src/lib/openrouter/client";
import { FRONTIER_MODELS } from "../src/lib/openrouter/models";
import { HISTORICAL_MODELS } from "../src/lib/openrouter/historical";
import { runCell } from "../src/lib/runner";
import { listInstrumentFiles } from "../src/lib/instruments/load";
import { nanoid } from "nanoid";
import { spawnSync } from "node:child_process";

// ─────────── Configuration ───────────
const MAX_SPEND_PER_RUN_USD = 10;   // hard ceiling per discovery run
const MAX_NEW_MODELS_PER_DAY = 3;   // throttle in case OpenRouter ships many at once
const MIN_INPUT_PRICE_PER_M = 1.0;  // USD/M — below this we treat as non-frontier
const MAX_INPUT_PRICE_PER_M = 50;   // sanity cap — anything above is suspect (image models, etc.)
const KNOWN_VENDORS = ["anthropic/", "openai/", "google/", "x-ai/", "deepseek/", "meta-llama/", "mistralai/", "qwen/", "cohere/"];
const RUNS_PER_NEW_MODEL = 3;       // N for newly-discovered models (matches historical cohort)

interface Args {
  execute: boolean;
  maxSpend: number;
  notify: boolean;
}
function parseArgs(): Args {
  const args = process.argv.slice(2);
  let execute = false;
  let maxSpend = MAX_SPEND_PER_RUN_USD;
  let notify = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--execute") execute = true;
    else if (args[i] === "--max-spend") maxSpend = parseFloat(args[++i] ?? "10");
    else if (args[i] === "--notify") notify = true;
  }
  return { execute, maxSpend, notify };
}

interface CandidateModel {
  id: string;
  displayName: string;
  vendor: string;
  promptUsd: number;     // per 1M
  completionUsd: number;
  estimatedRunCost: number;
}

async function main() {
  const args = parseArgs();
  const db = rawSqlite();
  const discoveryId = nanoid(14);
  console.log(`[discover] starting run ${discoveryId} (${args.execute ? "EXECUTE" : "dry-run"})`);

  // Pull current OpenRouter model list
  const all = await listModels();
  console.log(`[discover] OpenRouter returned ${all.length} models`);

  // Build set of slugs we already know about (frontier + historical, regardless of `active`)
  const knownSlugs = new Set([...FRONTIER_MODELS, ...HISTORICAL_MODELS].map((m) => m.id));
  const candidates: CandidateModel[] = [];

  for (const m of all) {
    if (knownSlugs.has(m.id)) continue;
    // Vendor whitelist
    if (!KNOWN_VENDORS.some((v) => m.id.startsWith(v))) continue;
    const promptUsdPerM = (m.pricing.prompt ?? 0) * 1_000_000;
    const completionUsdPerM = (m.pricing.completion ?? 0) * 1_000_000;
    if (promptUsdPerM < MIN_INPUT_PRICE_PER_M) continue;
    if (promptUsdPerM > MAX_INPUT_PRICE_PER_M) continue;

    // Estimate run cost: 14 instruments × 2 framings × 3 runs × ~1K in + ~1K out tokens
    const tokensIn = 14 * 2 * RUNS_PER_NEW_MODEL * 1000;
    const tokensOut = 14 * 2 * RUNS_PER_NEW_MODEL * 1200;
    const estimatedRunCost =
      (tokensIn * promptUsdPerM + tokensOut * completionUsdPerM) / 1_000_000;

    candidates.push({
      id: m.id,
      displayName: m.name,
      vendor: m.id.split("/")[0],
      promptUsd: promptUsdPerM,
      completionUsd: completionUsdPerM,
      estimatedRunCost,
    });
  }

  console.log(`[discover] ${candidates.length} candidate frontier models not in our registry`);
  for (const c of candidates) {
    console.log(`   ${c.id.padEnd(48)} \$${c.promptUsd.toFixed(2)}/M in, \$${c.completionUsd.toFixed(2)}/M out  est-run \$${c.estimatedRunCost.toFixed(3)}`);
  }

  // Throttle to MAX_NEW_MODELS_PER_DAY, prefer cheaper ones first
  const ordered = candidates.sort((a, b) => a.estimatedRunCost - b.estimatedRunCost);
  const willRun: CandidateModel[] = [];
  let totalEstimate = 0;
  for (const c of ordered) {
    if (willRun.length >= MAX_NEW_MODELS_PER_DAY) break;
    if (totalEstimate + c.estimatedRunCost > args.maxSpend) {
      console.log(`[discover] skipping ${c.id} — would exceed maxSpend (\$${args.maxSpend})`);
      continue;
    }
    willRun.push(c);
    totalEstimate += c.estimatedRunCost;
  }

  console.log(`[discover] planning to run ${willRun.length} model(s), total estimate \$${totalEstimate.toFixed(2)}`);

  // Record the discovery run
  db.prepare(
    `INSERT INTO model_discovery_log (id, total_models_seen, new_models_count, new_models_json, sweep_triggered, cost_estimate_usd, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    discoveryId,
    all.length,
    candidates.length,
    JSON.stringify(willRun),
    willRun.length > 0 && args.execute ? 1 : 0,
    totalEstimate,
    args.execute ? null : "dry-run",
  );

  if (!args.execute || willRun.length === 0) {
    console.log("[discover] dry-run or nothing to do — exiting");
    if (willRun.length > 0 && args.notify) {
      await notifyAdmin(willRun, totalEstimate, args.execute);
    }
    return;
  }

  // Insert each new model into the models table as active=true so the dashboard shows it
  const instruments = listInstrumentFiles();
  const upsertModel = db.prepare(
    `INSERT INTO models (id, vendor, display_name, family, tier, reasoning, pricing_prompt_usd, pricing_completion_usd, active)
     VALUES (?, ?, ?, ?, 'frontier', 0, ?, ?, 1)
     ON CONFLICT(id) DO UPDATE SET pricing_prompt_usd=excluded.pricing_prompt_usd, pricing_completion_usd=excluded.pricing_completion_usd, active=1`,
  );
  for (const c of willRun) {
    upsertModel.run(c.id, c.vendor, c.displayName, c.vendor, c.promptUsd, c.completionUsd);
  }

  // Run the full instrument battery against each new model
  let spent = 0;
  let succeeded = 0;
  let failed = 0;
  for (const c of willRun) {
    console.log(`\n[discover] sweeping ${c.id} …`);
    // We can't easily register a new model in `FRONTIER_MODELS` at runtime, so use the runner
    // with a temporary entry that's identical to what runCell expects.
    const tempModel = {
      id: c.id,
      vendor: c.vendor,
      displayName: c.displayName,
      family: c.vendor,
      tier: "frontier" as const,
      reasoning: false,
      maxTokens: 4000,
      active: true,
    };
    // Patch the FRONTIER_MODELS array (mutation is OK for this scripted use)
    (FRONTIER_MODELS as any[]).push(tempModel);

    for (const instId of instruments) {
      for (const framing of ["self", "human"] as const) {
        for (let runIndex = 1; runIndex <= RUNS_PER_NEW_MODEL; runIndex++) {
          const out = await runCell({ modelId: c.id, instrumentId: instId, framing, runIndex });
          if (out.status === "completed") {
            succeeded++;
            spent += out.costUsd ?? 0;
          } else {
            failed++;
          }
        }
      }
    }
    console.log(`[discover] ${c.id} done — running total \$${spent.toFixed(4)}, ${succeeded} ok, ${failed} fail`);
  }

  console.log(`\n[discover] run complete. spent \$${spent.toFixed(4)} on ${succeeded} new runs (${failed} failures)`);
  db.prepare(`UPDATE model_discovery_log SET cost_estimate_usd=?, notes=? WHERE id=?`)
    .run(spent, `actual spend \$${spent.toFixed(4)}; ${succeeded} ok / ${failed} fail`, discoveryId);

  if (args.notify) {
    await notifyAdmin(willRun, spent, true);
  }
}

async function notifyAdmin(models: CandidateModel[], spent: number, executed: boolean): Promise<void> {
  // Best-effort email via the existing Gmail SMTP setup. Falls back silently if Python isn't around.
  const subject = executed
    ? `[Personality Bench] Auto-sweep ran on ${models.length} new model(s), \$${spent.toFixed(2)}`
    : `[Personality Bench] ${models.length} new model(s) detected (dry-run)`;
  const body = [
    executed ? `Daily auto-sweep ran on the following new models:` : `Daily poll detected new models. No sweep was triggered (dry-run mode).`,
    "",
    ...models.map((m) => `  • ${m.id} (\$${m.promptUsd.toFixed(2)}/M in, est-cost \$${m.estimatedRunCost.toFixed(3)})`),
    "",
    `Total ${executed ? "spent" : "estimated"}: \$${spent.toFixed(4)}`,
    "",
    "Dashboard: https://personality-bench.earthpilot.ai",
  ].join("\n");

  const py = `
import smtplib
from email.mime.text import MIMEText
m = MIMEText(${JSON.stringify(body)})
m['From']='Anthony Adams <anthony@175g.com>'
m['To']='anthony@175g.com'
m['Subject']=${JSON.stringify(subject)}
with smtplib.SMTP('smtp.gmail.com', 587) as s:
    s.starttls()
    s.login('anthony@175g.com', 'REDACTED_GMAIL_APP_PASSWORD')
    s.send_message(m)
print('notified')
`;
  try {
    spawnSync("python3", ["-c", py], { stdio: "inherit" });
  } catch (e) {
    console.log("[discover] notification email failed (non-fatal):", (e as Error).message);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
