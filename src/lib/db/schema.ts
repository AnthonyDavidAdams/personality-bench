import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/**
 * instruments — personality tests (Big5 IPIP-120, Enneagram, HEXACO-60, SD3, ECR-R, PVQ-21, MFQ-30, NCS-18, EQ-60, Locus of Control)
 */
export const instruments = sqliteTable("instruments", {
  id: text("id").primaryKey(),                       // 'ipip120', 'hexaco60', 'sd3', etc.
  name: text("name").notNull(),                      // 'IPIP-120 Big Five'
  shortName: text("short_name").notNull(),           // 'Big 5'
  family: text("family").notNull(),                  // 'big5' | 'enneagram' | 'hexaco' | 'dark_triad' | 'attachment' | 'values' | 'morals' | 'cognition' | 'empathy' | 'locus'
  itemCount: integer("item_count").notNull(),
  scaleMin: integer("scale_min").notNull(),          // typically 1
  scaleMax: integer("scale_max").notNull(),          // typically 5 or 7
  scaleLabels: text("scale_labels").notNull(),       // JSON ["Strongly Disagree", ..., "Strongly Agree"]
  description: text("description"),
  citation: text("citation"),                        // source paper/URL
  license: text("license"),                          // 'public domain', 'CC-BY', etc.
  dimensions: text("dimensions").notNull(),          // JSON array of dimension IDs scored by this instrument
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

/**
 * items — individual questionnaire items
 */
export const items = sqliteTable("items", {
  id: text("id").primaryKey(),                       // 'ipip120_001'
  instrumentId: text("instrument_id").notNull().references(() => instruments.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),           // 1-based order within instrument
  text: text("text").notNull(),                      // 'I am the life of the party.'
  dimension: text("dimension").notNull(),            // 'extraversion', 'enneagram_2', 'narcissism', etc.
  reverseKeyed: integer("reverse_keyed", { mode: "boolean" }).notNull().default(false),
  subdimension: text("subdimension"),                // e.g. 'friendliness' (Big5 facet) — optional
}, (t) => ({
  byInstrument: index("items_by_instrument").on(t.instrumentId, t.position),
}));

/**
 * dimensions — scoring dimensions across all instruments
 * (Big5: openness/conscientiousness/extraversion/agreeableness/neuroticism;
 *  Enneagram: type1..type9; HEXACO: H/E/X/A/C/O; SD3: narcissism/machiavellianism/psychopathy;
 *  ECR-R: anxiety/avoidance; PVQ-21: 10 Schwartz values; MFQ: care/fairness/loyalty/authority/sanctity/liberty;
 *  NCS: need_for_cognition; EQ: empathy; LoC: internal/external)
 */
export const dimensions = sqliteTable("dimensions", {
  id: text("id").primaryKey(),                       // 'extraversion', 'enneagram_5', etc.
  instrumentFamily: text("instrument_family").notNull(),
  label: text("label").notNull(),                    // 'Extraversion'
  description: text("description"),
});

/**
 * models — frontier models we're testing
 */
export const models = sqliteTable("models", {
  id: text("id").primaryKey(),                       // OpenRouter slug, e.g. 'anthropic/claude-opus-4-7'
  vendor: text("vendor").notNull(),                  // 'anthropic', 'openai', 'google', etc.
  displayName: text("display_name").notNull(),       // 'Claude Opus 4.7'
  family: text("family"),                            // 'claude-4', 'gpt-5', 'gemini-2.5'
  tier: text("tier"),                                // 'frontier' | 'mid' | 'budget'
  reasoning: integer("reasoning", { mode: "boolean" }).notNull().default(false),
  contextWindow: integer("context_window"),
  releaseDate: text("release_date"),                 // 'YYYY-MM-DD'
  // Pricing snapshot at time of run (USD per 1M tokens)
  pricingPromptUsd: real("pricing_prompt_usd"),
  pricingCompletionUsd: real("pricing_completion_usd"),
  pricingReasoningUsd: real("pricing_reasoning_usd"),
  pricingNotes: text("pricing_notes"),               // JSON: cached price, image price, etc.
  pricingFetchedAt: integer("pricing_fetched_at", { mode: "timestamp" }),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

/**
 * runs — one execution of (model × instrument × framing × run_index)
 * This is the unit of token/cost tracking.
 */
export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),                       // nanoid
  modelId: text("model_id").notNull().references(() => models.id),
  instrumentId: text("instrument_id").notNull().references(() => instruments.id),
  framing: text("framing").notNull(),                // 'self' | 'human'
  runIndex: integer("run_index").notNull(),          // 1..N (multiple runs per cell for variance)
  status: text("status").notNull().default("pending"),  // 'pending' | 'running' | 'completed' | 'failed' | 'invalid'

  // Sampling
  temperature: real("temperature"),
  topP: real("top_p"),
  seed: integer("seed"),
  reasoningEffort: text("reasoning_effort"),         // 'low' | 'medium' | 'high' | null
  maxTokens: integer("max_tokens"),

  // Prompts (so the study is reproducible)
  systemPrompt: text("system_prompt"),
  userPrompt: text("user_prompt"),

  // Raw response
  rawResponse: text("raw_response"),                 // verbatim API completion text
  parsedJson: text("parsed_json"),                   // parsed JSON of scores
  parseError: text("parse_error"),

  // Token & cost capture (the heart of the study)
  promptTokens: integer("prompt_tokens"),
  completionTokens: integer("completion_tokens"),
  reasoningTokens: integer("reasoning_tokens"),      // some models report separately
  cachedTokens: integer("cached_tokens"),
  totalTokens: integer("total_tokens"),
  costUsd: real("cost_usd"),                         // from OpenRouter /generation, authoritative
  costUsdEstimated: real("cost_usd_estimated"),      // our local estimate from pricing table

  // Routing/provenance
  openrouterId: text("openrouter_id"),               // generation id (so we can re-fetch /generation later)
  provider: text("provider"),                        // which inference provider OpenRouter routed to
  finishReason: text("finish_reason"),

  // Timing
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  latencyMs: integer("latency_ms"),

  // Retry bookkeeping
  attempt: integer("attempt").notNull().default(1),
  errorMessage: text("error_message"),

  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  cell: uniqueIndex("runs_cell").on(t.modelId, t.instrumentId, t.framing, t.runIndex),
  byStatus: index("runs_by_status").on(t.status),
  byModel: index("runs_by_model").on(t.modelId),
}));

/**
 * responses — one row per item per run (Likert score given by the model)
 */
export const responses = sqliteTable("responses", {
  id: text("id").primaryKey(),                       // nanoid
  runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  itemId: text("item_id").notNull().references(() => items.id),
  raw: integer("raw").notNull(),                     // raw Likert score the model gave
  scored: integer("scored").notNull(),               // after reverse-keying
}, (t) => ({
  byRun: index("responses_by_run").on(t.runId),
  byItem: index("responses_by_item").on(t.itemId),
}));

/**
 * scores — computed dimension scores per run (e.g. Extraversion = 3.4)
 */
export const scores = sqliteTable("scores", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
  dimension: text("dimension").notNull(),
  rawSum: real("raw_sum").notNull(),                 // sum of scored item responses
  mean: real("mean").notNull(),                      // average per item (comparable across instruments)
  itemCount: integer("item_count").notNull(),
  percentile: real("percentile"),                    // vs human norms if available
  zScore: real("z_score"),                           // vs human norms if available
}, (t) => ({
  byRun: index("scores_by_run").on(t.runId),
  byDimension: index("scores_by_dimension").on(t.dimension),
}));

/**
 * pricing_snapshots — log every time we fetch /models pricing, so the study has an audit trail
 */
export const pricingSnapshots = sqliteTable("pricing_snapshots", {
  id: text("id").primaryKey(),
  modelId: text("model_id").notNull(),
  promptUsd: real("prompt_usd"),
  completionUsd: real("completion_usd"),
  reasoningUsd: real("reasoning_usd"),
  rawJson: text("raw_json"),                         // full /models entry for the record
  fetchedAt: integer("fetched_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  byModel: index("pricing_by_model").on(t.modelId, t.fetchedAt),
}));

/**
 * email_subscribers — people who want updates on new findings / new models / new instruments.
 * Single-table opt-in; we send periodic digests via Gmail SMTP. Unsubscribe via signed token.
 */
export const emailSubscribers = sqliteTable("email_subscribers", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  source: text("source"),                 // 'home_page' | 'paper_page' | 'manual'
  status: text("status").notNull().default("active"),  // 'active' | 'unsubscribed' | 'bounced'
  confirmedAt: integer("confirmed_at", { mode: "timestamp" }),
  unsubscribedAt: integer("unsubscribed_at", { mode: "timestamp" }),
  unsubscribeToken: text("unsubscribe_token").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  byStatus: index("subscribers_by_status").on(t.status),
}));

/**
 * requests — user-submitted requests to add a specific model or instrument.
 */
export const requests = sqliteTable("requests", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),           // 'model' | 'instrument' | 'other'
  target: text("target").notNull(),       // model slug, instrument id, or freeform text
  rationale: text("rationale"),           // optional "why" from the submitter
  submitterEmail: text("submitter_email"),
  ipHash: text("ip_hash"),                // for light abuse prevention
  status: text("status").notNull().default("pending"), // 'pending' | 'queued' | 'fulfilled' | 'declined'
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  resolutionNote: text("resolution_note"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  byStatus: index("requests_by_status").on(t.status),
}));

/**
 * articles — auto-generated mini-articles, one per model release. Drafted by the
 * generator script (scripts/generate_article.ts) when a new model lands without an
 * article. Editorial review then flips status from 'draft' to 'published'.
 */
export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),                       // nanoid
  slug: text("slug").notNull().unique(),             // url-safe identifier (e.g. 'claude-fable-5')
  modelId: text("model_id").notNull(),               // the model this article is about
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  body: text("body").notNull(),                      // markdown
  status: text("status").notNull().default("draft"), // 'draft' | 'published' | 'archived'
  generatedBy: text("generated_by"),                 // model id of the generator (e.g. 'anthropic/claude-opus-4.8')
  generatedAt: integer("generated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  // Cost tracking for the generation itself
  generationPromptTokens: integer("generation_prompt_tokens"),
  generationCompletionTokens: integer("generation_completion_tokens"),
  generationCostUsd: real("generation_cost_usd"),
}, (t) => ({
  byStatus: index("articles_by_status").on(t.status, t.publishedAt),
  byModel: index("articles_by_model").on(t.modelId),
}));

/**
 * model_discovery_log — record of each daily poll against OpenRouter /models, plus any
 * new models detected and queued for the sweep.
 */
export const modelDiscoveryLog = sqliteTable("model_discovery_log", {
  id: text("id").primaryKey(),
  ranAt: integer("ran_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  totalModelsSeen: integer("total_models_seen"),
  newModelsCount: integer("new_models_count").notNull().default(0),
  newModelsJson: text("new_models_json"),  // JSON array of {id, displayName, vendor, pricing}
  sweepTriggered: integer("sweep_triggered", { mode: "boolean" }).notNull().default(false),
  costEstimateUsd: real("cost_estimate_usd"),
  notes: text("notes"),
});

/**
 * spend_log — append-only ledger of every API call's cost, for the public spend page.
 * Redundant with runs.cost_usd but separate so we keep a clean spend trail even if runs get deleted.
 */
export const spendLog = sqliteTable("spend_log", {
  id: text("id").primaryKey(),
  runId: text("run_id"),                             // nullable so we can log non-run spend (e.g. pricing fetches)
  modelId: text("model_id").notNull(),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  reasoningTokens: integer("reasoning_tokens").notNull().default(0),
  costUsd: real("cost_usd").notNull(),
  source: text("source").notNull(),                  // 'run' | 'pricing_fetch' | 'manual'
  loggedAt: integer("logged_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (t) => ({
  byModel: index("spend_by_model").on(t.modelId),
  byTime: index("spend_by_time").on(t.loggedAt),
}));
