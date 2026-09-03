/**
 * Run one (model × instrument × framing × runIndex) cell end-to-end.
 *
 * Steps:
 *   1. Look up the instrument
 *   2. Build prompts
 *   3. Call OpenRouter
 *   4. Parse Likert response
 *   5. Persist raw + parsed + token usage + cost
 *   6. Re-fetch /generation (authoritative cost)
 *   7. Compute dimension scores
 */
import { db, schema, rawSqlite } from "./db";
import { loadInstrumentFile } from "./instruments/load";
import { buildPrompts, parseQuestionnaireResponse, type Framing } from "./instruments/prompt";
import { scoreInstrument } from "./scoring/score";
import { chatWithRetry, getGeneration, type ChatRequest } from "./openrouter/client";
import { findModel, type ModelEntry } from "./openrouter/models";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";

export interface RunOptions {
  modelId: string;
  instrumentId: string;
  framing: Framing;
  runIndex: number;
  temperature?: number;
  /** If true, skip the post-call /generation fetch (cheaper but less accurate cost). */
  skipGenerationFetch?: boolean;
}

export interface RunOutcome {
  runId: string;
  status: "completed" | "failed" | "invalid";
  costUsd?: number;
  costUsdEstimated?: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  latencyMs?: number;
  error?: string;
}

export async function runCell(opts: RunOptions): Promise<RunOutcome> {
  const model = findModel(opts.modelId) ?? modelFromDb(opts.modelId);
  if (!model) {
    return { runId: "", status: "failed", error: `unknown model ${opts.modelId}` };
  }
  const instrument = loadInstrumentFile(opts.instrumentId);
  const { system, user } = buildPrompts(instrument, opts.framing);

  // Either upsert a fresh run or reuse an existing pending row for this cell.
  const existing = await db
    .select()
    .from(schema.runs)
    .where(
      and(
        eq(schema.runs.modelId, opts.modelId),
        eq(schema.runs.instrumentId, opts.instrumentId),
        eq(schema.runs.framing, opts.framing),
        eq(schema.runs.runIndex, opts.runIndex),
      ),
    );
  let runId = existing[0]?.id ?? nanoid(14);
  const attempt = (existing[0]?.attempt ?? 0) + 1;
  const temperature = opts.temperature ?? 0.7;

  const sqlite = rawSqlite();
  const upsertRun = sqlite.prepare(`
    INSERT INTO runs (id, model_id, instrument_id, framing, run_index, status,
                      temperature, max_tokens, reasoning_effort,
                      system_prompt, user_prompt, attempt, started_at)
    VALUES (?, ?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(model_id, instrument_id, framing, run_index) DO UPDATE SET
      status = 'running',
      temperature = excluded.temperature,
      max_tokens = excluded.max_tokens,
      reasoning_effort = excluded.reasoning_effort,
      system_prompt = excluded.system_prompt,
      user_prompt = excluded.user_prompt,
      attempt = ?,
      started_at = excluded.started_at,
      error_message = NULL
  `);
  upsertRun.run(
    runId,
    opts.modelId,
    opts.instrumentId,
    opts.framing,
    opts.runIndex,
    temperature,
    model.maxTokens,
    model.reasoningEffort ?? null,
    system,
    user,
    attempt,
    Math.floor(Date.now() / 1000),
    attempt,
  );

  // If we just inserted (no existing row), the returned id is what we generated.
  // Otherwise, look up the actual id (ON CONFLICT keeps the original id).
  if (existing[0]) {
    runId = existing[0].id;
  }

  const req: ChatRequest = {
    model: opts.modelId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
    maxTokens: model.maxTokens,
    responseFormat: "json_object",
    includeUsage: true,
    ...(model.reasoning
      ? { reasoning: { effort: model.reasoningEffort ?? "medium" } }
      : {}),
  };

  let chatRes;
  try {
    chatRes = await chatWithRetry(req, { maxAttempts: 3 });
  } catch (e) {
    const msg = (e as Error).message;
    sqlite
      .prepare(`UPDATE runs SET status='failed', error_message=?, completed_at=? WHERE id=?`)
      .run(msg, Math.floor(Date.now() / 1000), runId);
    return { runId, status: "failed", error: msg };
  }

  const parsed = parseQuestionnaireResponse(chatRes.content, instrument);
  if (!parsed.ok) {
    sqlite
      .prepare(
        `UPDATE runs SET status='invalid', raw_response=?, parse_error=?, completed_at=?,
                          prompt_tokens=?, completion_tokens=?, reasoning_tokens=?, cached_tokens=?, total_tokens=?,
                          cost_usd=?, openrouter_id=?, provider=?, finish_reason=?, latency_ms=?
         WHERE id=?`,
      )
      .run(
        chatRes.content,
        parsed.error,
        Math.floor(Date.now() / 1000),
        chatRes.usage.promptTokens ?? null,
        chatRes.usage.completionTokens ?? null,
        chatRes.usage.reasoningTokens ?? null,
        chatRes.usage.cachedTokens ?? null,
        chatRes.usage.totalTokens ?? null,
        chatRes.usage.costUsd ?? null,
        chatRes.id ?? null,
        chatRes.provider ?? null,
        chatRes.finishReason ?? null,
        chatRes.latencyMs,
        runId,
      );
    return { runId, status: "invalid", error: parsed.error, ...summarizeUsage(chatRes) };
  }

  // Score it.
  const scored = scoreInstrument(instrument, parsed.data.responses);

  // Persist everything in a single transaction.
  const insertResp = sqlite.prepare(
    `INSERT INTO responses (id, run_id, item_id, raw, scored) VALUES (?, ?, ?, ?, ?)`,
  );
  const insertScore = sqlite.prepare(
    `INSERT INTO scores (id, run_id, dimension, raw_sum, mean, item_count) VALUES (?, ?, ?, ?, ?, ?)`,
  );
  // Clear any stale prior responses/scores for this run (in case of retry).
  const clearResp = sqlite.prepare(`DELETE FROM responses WHERE run_id = ?`);
  const clearScore = sqlite.prepare(`DELETE FROM scores WHERE run_id = ?`);

  // Estimate cost locally from pricing snapshot (fallback if OpenRouter didn't return cost).
  const estimatedCost = estimateLocalCost(opts.modelId, chatRes.usage);

  const tx = sqlite.transaction(() => {
    clearResp.run(runId);
    clearScore.run(runId);
    for (const r of scored.perItem) {
      insertResp.run(nanoid(12), runId, r.itemId, r.raw, r.scored);
    }
    for (const d of scored.perDimension) {
      insertScore.run(nanoid(12), runId, d.dimension, d.rawSum, d.mean, d.itemCount);
    }
    sqlite
      .prepare(
        `UPDATE runs SET status='completed', raw_response=?, parsed_json=?, parse_error=NULL, completed_at=?,
                          prompt_tokens=?, completion_tokens=?, reasoning_tokens=?, cached_tokens=?, total_tokens=?,
                          cost_usd=?, cost_usd_estimated=?, openrouter_id=?, provider=?, finish_reason=?, latency_ms=?
         WHERE id=?`,
      )
      .run(
        chatRes.content,
        JSON.stringify(parsed.data),
        Math.floor(Date.now() / 1000),
        chatRes.usage.promptTokens ?? null,
        chatRes.usage.completionTokens ?? null,
        chatRes.usage.reasoningTokens ?? null,
        chatRes.usage.cachedTokens ?? null,
        chatRes.usage.totalTokens ?? null,
        chatRes.usage.costUsd ?? null,
        estimatedCost,
        chatRes.id ?? null,
        chatRes.provider ?? null,
        chatRes.finishReason ?? null,
        chatRes.latencyMs,
        runId,
      );

    // Spend log (use authoritative cost if available, else estimate).
    const recordedCost = chatRes.usage.costUsd ?? estimatedCost ?? 0;
    if (recordedCost > 0) {
      sqlite
        .prepare(
          `INSERT INTO spend_log (id, run_id, model_id, prompt_tokens, completion_tokens, reasoning_tokens, cost_usd, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'run')`,
        )
        .run(
          nanoid(12),
          runId,
          opts.modelId,
          chatRes.usage.promptTokens ?? 0,
          chatRes.usage.completionTokens ?? 0,
          chatRes.usage.reasoningTokens ?? 0,
          recordedCost,
        );
    }
  });
  tx();

  // Re-fetch /generation for authoritative cost — OpenRouter populates this a few seconds after completion.
  if (!opts.skipGenerationFetch && chatRes.id) {
    // Don't block long; best-effort.
    setTimeout(() => {
      getGeneration(chatRes.id)
        .then((g) => {
          if (!g) return;
          if (g.costUsd !== undefined) {
            sqlite
              .prepare(`UPDATE runs SET cost_usd=?, provider=COALESCE(provider, ?) WHERE id=?`)
              .run(g.costUsd, g.provider ?? null, runId);
            sqlite
              .prepare(`UPDATE spend_log SET cost_usd=? WHERE run_id=? AND source='run'`)
              .run(g.costUsd, runId);
          }
        })
        .catch(() => {});
    }, 3000);
  }

  return {
    runId,
    status: "completed",
    costUsd: chatRes.usage.costUsd ?? estimatedCost,
    costUsdEstimated: estimatedCost,
    ...summarizeUsage(chatRes),
  };
}

function summarizeUsage(chatRes: any) {
  return {
    promptTokens: chatRes.usage.promptTokens,
    completionTokens: chatRes.usage.completionTokens,
    reasoningTokens: chatRes.usage.reasoningTokens,
    latencyMs: chatRes.latencyMs,
  };
}

function estimateLocalCost(modelId: string, usage: { promptTokens?: number; completionTokens?: number; reasoningTokens?: number }): number | undefined {
  const row = rawSqlite()
    .prepare(
      `SELECT pricing_prompt_usd, pricing_completion_usd, pricing_reasoning_usd FROM models WHERE id = ?`,
    )
    .get(modelId) as
    | {
        pricing_prompt_usd: number | null;
        pricing_completion_usd: number | null;
        pricing_reasoning_usd: number | null;
      }
    | undefined;
  if (!row) return undefined;
  const promptUsd = row.pricing_prompt_usd ?? 0;        // USD per 1M tokens
  const completionUsd = row.pricing_completion_usd ?? 0;
  const reasoningUsd = row.pricing_reasoning_usd ?? completionUsd;
  if (!promptUsd && !completionUsd) return undefined;
  const cost =
    ((usage.promptTokens ?? 0) * promptUsd +
      (usage.completionTokens ?? 0) * completionUsd +
      (usage.reasoningTokens ?? 0) * reasoningUsd) /
    1_000_000;
  return Number(cost.toFixed(8));
}

/**
 * Models added by the discovery job live only in the DB, not in the code registry.
 * Build a registry-shaped entry for them so run.ts --resume / --models can re-run their cells.
 */
function modelFromDb(id: string): ModelEntry | undefined {
  const row = rawSqlite()
    .prepare(`SELECT id, vendor, display_name AS displayName, family, reasoning, active FROM models WHERE id = ?`)
    .get(id) as { id: string; vendor: string; displayName: string; family: string | null; reasoning: number; active: number } | undefined;
  if (!row) return undefined;
  return { id: row.id, vendor: row.vendor, displayName: row.displayName, family: row.family ?? row.vendor, tier: "frontier", reasoning: !!row.reasoning, maxTokens: 12000, active: !!row.active };
}
