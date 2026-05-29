/**
 * Idempotently load instruments + models into the DB.
 * Safe to run repeatedly — uses INSERT OR REPLACE semantics.
 *
 * Usage: npx tsx scripts/seed.ts
 */
import "../src/lib/env";
import { db, schema, rawSqlite } from "../src/lib/db";
import { loadAllInstruments } from "../src/lib/instruments/load";
import { FRONTIER_MODELS } from "../src/lib/openrouter/models";
import { HISTORICAL_MODELS } from "../src/lib/openrouter/historical";
import { listModels } from "../src/lib/openrouter/client";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

async function seedInstruments() {
  const instruments = loadAllInstruments();
  const sqlite = rawSqlite();
  // Use ON CONFLICT DO UPDATE rather than INSERT OR REPLACE — REPLACE deletes the existing
  // row first, which cascade-deletes items and breaks any responses already pointing at them.
  const ix = sqlite.prepare(`
    INSERT INTO instruments
      (id, name, short_name, family, item_count, scale_min, scale_max, scale_labels, description, citation, license, dimensions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, short_name=excluded.short_name, family=excluded.family,
      item_count=excluded.item_count, scale_min=excluded.scale_min, scale_max=excluded.scale_max,
      scale_labels=excluded.scale_labels, description=excluded.description,
      citation=excluded.citation, license=excluded.license, dimensions=excluded.dimensions
  `);
  const itx = sqlite.prepare(`
    INSERT INTO items (id, instrument_id, position, text, dimension, reverse_keyed, subdimension)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      instrument_id=excluded.instrument_id, position=excluded.position, text=excluded.text,
      dimension=excluded.dimension, reverse_keyed=excluded.reverse_keyed, subdimension=excluded.subdimension
  `);
  const dx = sqlite.prepare(`
    INSERT INTO dimensions (id, instrument_family, label, description)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      instrument_family=excluded.instrument_family, label=excluded.label, description=excluded.description
  `);

  const tx = sqlite.transaction((insts: typeof instruments) => {
    for (const inst of insts) {
      ix.run(
        inst.id,
        inst.name,
        inst.shortName,
        inst.family,
        inst.items.length,
        inst.scaleMin,
        inst.scaleMax,
        JSON.stringify(inst.scaleLabels),
        inst.description ?? null,
        inst.citation ?? null,
        inst.license ?? null,
        JSON.stringify(inst.dimensions.map((d) => d.id)),
      );
      for (const d of inst.dimensions) {
        dx.run(d.id, inst.family, d.label, d.description ?? null);
      }
      for (const it of inst.items) {
        itx.run(
          `${inst.id}_${String(it.position).padStart(3, "0")}`,
          inst.id,
          it.position,
          it.text,
          it.dimension,
          it.reverseKeyed ? 1 : 0,
          it.subdimension ?? null,
        );
      }
    }
  });

  tx(instruments);
  console.log(`[seed] loaded ${instruments.length} instruments`);
  for (const i of instruments) {
    console.log(`         ${i.id.padEnd(20)} ${String(i.items.length).padStart(3)} items, ${i.dimensions.length} dims`);
  }
}

async function seedModels() {
  // Best-effort pricing lookup from OpenRouter (so cost estimates are accurate).
  let pricing: Map<string, { prompt?: number; completion?: number; internalReasoning?: number; raw: unknown }> = new Map();
  try {
    const all = await listModels();
    pricing = new Map(
      all.map((m) => [m.id, {
        prompt: m.pricing.prompt,
        completion: m.pricing.completion,
        internalReasoning: m.pricing.internalReasoning,
        raw: m.raw,
      }]),
    );
    console.log(`[seed] fetched pricing for ${pricing.size} OpenRouter models`);
  } catch (e) {
    console.warn(`[seed] could not fetch pricing: ${(e as Error).message} — proceeding without`);
  }

  const sqlite = rawSqlite();
  const mx = sqlite.prepare(`
    INSERT INTO models
      (id, vendor, display_name, family, tier, reasoning, context_window,
       pricing_prompt_usd, pricing_completion_usd, pricing_reasoning_usd, pricing_notes, pricing_fetched_at, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      vendor=excluded.vendor, display_name=excluded.display_name, family=excluded.family,
      tier=excluded.tier, reasoning=excluded.reasoning, context_window=excluded.context_window,
      pricing_prompt_usd=excluded.pricing_prompt_usd, pricing_completion_usd=excluded.pricing_completion_usd,
      pricing_reasoning_usd=excluded.pricing_reasoning_usd, pricing_notes=excluded.pricing_notes,
      pricing_fetched_at=excluded.pricing_fetched_at, active=excluded.active
  `);
  const px = sqlite.prepare(`
    INSERT INTO pricing_snapshots (id, model_id, prompt_usd, completion_usd, reasoning_usd, raw_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // OpenRouter returns pricing per token (USD). We store per-1M for human readability.
  const toMillion = (perToken?: number) => (perToken !== undefined ? perToken * 1_000_000 : null);
  const now = Math.floor(Date.now() / 1000);

  const allModels = [...FRONTIER_MODELS, ...HISTORICAL_MODELS];
  const tx = sqlite.transaction(() => {
    for (const m of allModels) {
      const p = pricing.get(m.id);
      const promptUsd = toMillion(p?.prompt);
      const completionUsd = toMillion(p?.completion);
      const reasoningUsd = toMillion(p?.internalReasoning);
      mx.run(
        m.id,
        m.vendor,
        m.displayName,
        m.family,
        m.tier,
        m.reasoning ? 1 : 0,
        null, // context window — could fetch from /models but not critical here
        promptUsd,
        completionUsd,
        reasoningUsd,
        p?.raw ? JSON.stringify((p.raw as any).pricing ?? {}) : null,
        p ? now : null,
        m.active ? 1 : 0,
      );
      if (p) {
        px.run(nanoid(12), m.id, promptUsd, completionUsd, reasoningUsd, JSON.stringify(p.raw));
      }
    }
  });

  tx();
  console.log(`[seed] loaded ${allModels.length} models (${FRONTIER_MODELS.length} active frontier, ${HISTORICAL_MODELS.length} historical/inactive)`);
  for (const m of FRONTIER_MODELS) {
    const p = pricing.get(m.id);
    const cost = p?.prompt !== undefined
      ? `$${(p.prompt * 1_000_000).toFixed(2)}/M in, $${((p.completion ?? 0) * 1_000_000).toFixed(2)}/M out`
      : "(no pricing)";
    console.log(`  ACTIVE  ${m.id.padEnd(40)} ${cost}`);
  }
}

async function main() {
  await seedInstruments();
  await seedModels();
  console.log("\n[seed] done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
