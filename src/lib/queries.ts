/**
 * Read-only queries powering the public dashboard.
 *
 * Heavy use of raw SQL for compactness and to make aggregation explicit —
 * Drizzle's query builder gets verbose for the multi-join roll-ups below.
 */
import { rawSqlite } from "./db";

export interface SpendSummary {
  totalUsd: number;
  totalRuns: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalTokensReasoning: number;
  byModel: { modelId: string; displayName: string; runs: number; costUsd: number; tokensIn: number; tokensOut: number }[];
  byInstrument: { instrumentId: string; shortName: string; runs: number; costUsd: number }[];
  lastRunAt: number | null;
}

export function getSpendSummary(): SpendSummary {
  const db = rawSqlite();
  const totals = db
    .prepare(
      `SELECT
        COALESCE(SUM(cost_usd), 0) AS total_usd,
        COUNT(*) AS total_runs,
        COALESCE(SUM(prompt_tokens), 0) AS in_tok,
        COALESCE(SUM(completion_tokens), 0) AS out_tok,
        COALESCE(SUM(reasoning_tokens), 0) AS r_tok,
        MAX(completed_at) AS last_run
       FROM runs WHERE status='completed'`,
    )
    .get() as any;

  const byModel = db
    .prepare(
      `SELECT r.model_id AS modelId, m.display_name AS displayName,
              COUNT(*) AS runs,
              COALESCE(SUM(r.cost_usd), 0) AS costUsd,
              COALESCE(SUM(r.prompt_tokens), 0) AS tokensIn,
              COALESCE(SUM(r.completion_tokens), 0) AS tokensOut
       FROM runs r LEFT JOIN models m ON m.id = r.model_id
       WHERE r.status='completed'
       GROUP BY r.model_id, m.display_name
       ORDER BY costUsd DESC`,
    )
    .all() as any[];

  const byInstrument = db
    .prepare(
      `SELECT r.instrument_id AS instrumentId, i.short_name AS shortName,
              COUNT(*) AS runs,
              COALESCE(SUM(r.cost_usd), 0) AS costUsd
       FROM runs r LEFT JOIN instruments i ON i.id = r.instrument_id
       WHERE r.status='completed'
       GROUP BY r.instrument_id, i.short_name
       ORDER BY costUsd DESC`,
    )
    .all() as any[];

  return {
    totalUsd: totals.total_usd,
    totalRuns: totals.total_runs,
    totalTokensIn: totals.in_tok,
    totalTokensOut: totals.out_tok,
    totalTokensReasoning: totals.r_tok,
    byModel,
    byInstrument,
    lastRunAt: totals.last_run,
  };
}

export interface ModelDimensionScore {
  modelId: string;
  displayName: string;
  vendor: string;
  framing: "self" | "human";
  dimension: string;
  dimensionLabel: string;
  meanScore: number;
  stdDev: number;
  n: number;
}

export function getDimensionScores(instrumentId: string): ModelDimensionScore[] {
  const db = rawSqlite();
  // mean across runs per (model, framing, dimension)
  const rows = db
    .prepare(
      `SELECT
        r.model_id AS modelId,
        m.display_name AS displayName,
        m.vendor AS vendor,
        r.framing AS framing,
        s.dimension AS dimension,
        AVG(s.mean) AS meanScore,
        COUNT(*) AS n
       FROM scores s
       JOIN runs r ON r.id = s.run_id
       LEFT JOIN models m ON m.id = r.model_id
       WHERE r.instrument_id = ? AND r.status='completed'
       GROUP BY r.model_id, r.framing, s.dimension
       ORDER BY m.display_name, r.framing, s.dimension`,
    )
    .all(instrumentId) as any[];

  // Compute per-cell standard deviation in a second pass (avoid SQL window-fn portability issues).
  const variancePerCell = new Map<string, { sum: number; sumSq: number; n: number; mean: number }>();
  const allMeans = db
    .prepare(
      `SELECT r.model_id, r.framing, s.dimension, s.mean
       FROM scores s
       JOIN runs r ON r.id = s.run_id
       WHERE r.instrument_id = ? AND r.status='completed'`,
    )
    .all(instrumentId) as { model_id: string; framing: string; dimension: string; mean: number }[];

  for (const r of allMeans) {
    const key = `${r.model_id}__${r.framing}__${r.dimension}`;
    const cur = variancePerCell.get(key) ?? { sum: 0, sumSq: 0, n: 0, mean: 0 };
    cur.sum += r.mean;
    cur.sumSq += r.mean * r.mean;
    cur.n += 1;
    variancePerCell.set(key, cur);
  }

  const dimLabels = Object.fromEntries(
    (db
      .prepare(
        `SELECT id, label FROM dimensions WHERE instrument_family = (SELECT family FROM instruments WHERE id=?)`,
      )
      .all(instrumentId) as { id: string; label: string }[]).map((r) => [r.id, r.label]),
  );

  return rows.map((row) => {
    const key = `${row.modelId}__${row.framing}__${row.dimension}`;
    const v = variancePerCell.get(key)!;
    const variance = v.n > 1 ? (v.sumSq - (v.sum * v.sum) / v.n) / (v.n - 1) : 0;
    return {
      modelId: row.modelId,
      displayName: row.displayName,
      vendor: row.vendor,
      framing: row.framing as "self" | "human",
      dimension: row.dimension,
      dimensionLabel: dimLabels[row.dimension] ?? row.dimension,
      meanScore: row.meanScore,
      stdDev: Math.sqrt(Math.max(0, variance)),
      n: row.n,
    };
  });
}

export function listInstrumentsForUi() {
  const db = rawSqlite();
  return db
    .prepare(
      `SELECT id, name, short_name as shortName, family, item_count as itemCount, scale_min as scaleMin, scale_max as scaleMax, description, citation, dimensions
       FROM instruments ORDER BY family, name`,
    )
    .all() as { id: string; name: string; shortName: string; family: string; itemCount: number; scaleMin: number; scaleMax: number; description: string; citation: string; dimensions: string }[];
}

export function listModelsForUi() {
  const db = rawSqlite();
  return db
    .prepare(
      `SELECT m.id, m.display_name as displayName, m.vendor, m.family, m.reasoning,
              m.pricing_prompt_usd as pricingPromptUsd, m.pricing_completion_usd as pricingCompletionUsd,
              (SELECT COUNT(*) FROM runs r WHERE r.model_id = m.id AND r.status='completed') as runsCompleted,
              (SELECT COALESCE(SUM(r.cost_usd), 0) FROM runs r WHERE r.model_id = m.id) as totalSpend
       FROM models m WHERE m.active=1 ORDER BY m.vendor, m.display_name`,
    )
    .all() as any[];
}

/**
 * Per-model spend rows enriched with vendor lab name + cohort tier (frontier vs historical),
 * for the sortable spend table on the dashboard.
 */
export interface SpendTableRow {
  modelId: string;
  displayName: string;
  lab: string;
  cohort: "Frontier" | "Historical";
  runs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

const VENDOR_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  xai: "xAI",
  "x-ai": "xAI",
  deepseek: "DeepSeek",
  meta: "Meta",
  "meta-llama": "Meta",
  mistral: "Mistral",
  mistralai: "Mistral",
};

// The 7 current cutting-edge model slugs that get N=5 frontier treatment.
const FRONTIER_SET = new Set([
  "anthropic/claude-opus-4.8",
  "openai/gpt-5.5",
  "google/gemini-2.5-pro",
  "x-ai/grok-4.20",
  "deepseek/deepseek-r1-0528",
  "meta-llama/llama-4-maverick",
  "mistralai/mistral-large-2512",
]);

export function getSpendTableRows(): SpendTableRow[] {
  const db = rawSqlite();
  const rows = db
    .prepare(
      `SELECT r.model_id as modelId, m.display_name as displayName, m.vendor,
              COUNT(*) as runs,
              COALESCE(SUM(r.prompt_tokens), 0) as tokensIn,
              COALESCE(SUM(r.completion_tokens), 0) as tokensOut,
              COALESCE(SUM(r.cost_usd), 0) as costUsd
       FROM runs r LEFT JOIN models m ON m.id = r.model_id
       WHERE r.status='completed'
       GROUP BY r.model_id`,
    )
    .all() as { modelId: string; displayName: string; vendor: string; runs: number; tokensIn: number; tokensOut: number; costUsd: number }[];

  return rows.map((r) => ({
    modelId: r.modelId,
    displayName: r.displayName ?? r.modelId,
    lab: VENDOR_LABELS[r.vendor] ?? r.vendor,
    cohort: FRONTIER_SET.has(r.modelId) ? "Frontier" : "Historical",
    runs: r.runs,
    tokensIn: r.tokensIn,
    tokensOut: r.tokensOut,
    costUsd: r.costUsd,
  }));
}

export function getRecentRuns(limit = 50) {
  const db = rawSqlite();
  return db
    .prepare(
      `SELECT r.id, r.model_id as modelId, r.instrument_id as instrumentId, r.framing, r.run_index as runIndex,
              r.status, r.prompt_tokens as promptTokens, r.completion_tokens as completionTokens,
              r.reasoning_tokens as reasoningTokens, r.cost_usd as costUsd, r.latency_ms as latencyMs,
              r.completed_at as completedAt
       FROM runs r ORDER BY r.completed_at DESC LIMIT ?`,
    )
    .all(limit) as any[];
}

/**
 * Active frontier model rows for the home page gallery. Pulled from the DB so new models
 * appear automatically without code changes. Cohort tag uses the same logic as the spend table.
 */
export interface FrontierGalleryRow {
  modelId: string;
  displayName: string;
  vendor: string;
}
export function listActiveFrontierModels(): FrontierGalleryRow[] {
  const db = rawSqlite();
  // The 9 cutting-edge slugs by lab. We could also drive this from a DB column, but the
  // explicit list here is the documented "frontier cohort" definition.
  const FRONTIER_SLUGS = [
    "anthropic/claude-fable-5",
    "anthropic/claude-opus-4.8",
    "openai/gpt-5.5",
    "google/gemini-2.5-pro",
    "google/gemini-3.1-pro-preview",
    "x-ai/grok-4.20",
    "deepseek/deepseek-r1-0528",
    "meta-llama/llama-4-maverick",
    "mistralai/mistral-large-2512",
  ];
  return FRONTIER_SLUGS.map((id) => {
    const row = db
      .prepare(`SELECT display_name as displayName, vendor FROM models WHERE id = ?`)
      .get(id) as { displayName?: string; vendor?: string } | undefined;
    if (!row?.displayName) return null;
    return { modelId: id, displayName: row.displayName, vendor: row.vendor ?? "" };
  }).filter(Boolean) as FrontierGalleryRow[];
}

export function getInstrumentInfo(id: string) {
  const db = rawSqlite();
  return db.prepare(
    `SELECT id, name, short_name as shortName, family, item_count as itemCount, scale_min as scaleMin, scale_max as scaleMax, description, citation, license, dimensions FROM instruments WHERE id=?`,
  ).get(id) as any;
}

export interface DriftRow {
  modelId: string;
  dimension: string;
  mean: number;
  framing: "self" | "human";
}

/** Pull mean scores for each (model, dimension, framing) tuple for a given instrument. */
export function getDriftDataForInstrument(instrumentId: string): DriftRow[] {
  const db = rawSqlite();
  return db
    .prepare(
      `SELECT r.model_id as modelId, s.dimension, AVG(s.mean) as mean, r.framing
       FROM scores s JOIN runs r ON r.id = s.run_id
       WHERE r.instrument_id = ? AND r.status='completed'
       GROUP BY r.model_id, s.dimension, r.framing`,
    )
    .all(instrumentId) as DriftRow[];
}
