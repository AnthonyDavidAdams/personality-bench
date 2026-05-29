/**
 * Print OpenRouter models that might be new frontier candidates we don't already test.
 *
 * Heuristics:
 *   - Pricing implies frontier tier (input > $1/M)
 *   - Released within the last ~6 months (when release date is exposed)
 *   - Slug suggests a flagship from a major lab
 *
 * Run periodically (or via cron in production) to detect models we should add to the registry.
 */
import "../src/lib/env";
import { listModels } from "../src/lib/openrouter/client";
import { FRONTIER_MODELS } from "../src/lib/openrouter/models";
import { HISTORICAL_MODELS } from "../src/lib/openrouter/historical";

const KNOWN = new Set([...FRONTIER_MODELS, ...HISTORICAL_MODELS].map((m) => m.id));
const VENDORS = ["anthropic/", "openai/", "google/", "x-ai/", "deepseek/", "meta-llama/", "mistralai/", "qwen/", "cohere/", "amazon/"];

async function main() {
  const models = await listModels();
  const candidates: { id: string; name: string; promptUsd: number; completionUsd: number }[] = [];
  for (const m of models) {
    if (KNOWN.has(m.id)) continue;
    if (!VENDORS.some((v) => m.id.startsWith(v))) continue;
    const p = m.pricing.prompt;
    const c = m.pricing.completion;
    if (p === undefined || c === undefined) continue;
    if (p < 1e-6) continue; // skip free/cheap models — not frontier
    candidates.push({
      id: m.id,
      name: m.name,
      promptUsd: p * 1_000_000,
      completionUsd: c * 1_000_000,
    });
  }
  candidates.sort((a, b) => b.completionUsd - a.completionUsd);
  console.log(`Found ${candidates.length} candidate frontier models not in our registry:\n`);
  for (const c of candidates.slice(0, 40)) {
    console.log(`  ${c.id.padEnd(50)}  $${c.promptUsd.toFixed(2)}/M in  $${c.completionUsd.toFixed(2)}/M out  ${c.name}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
