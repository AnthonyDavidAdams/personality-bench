/**
 * Live, data-derived copy for the home page.
 *
 * Everything on the front page that states a number used to be typed by hand, which meant
 * the page quietly went stale every time the nightly autopilot added a model. These queries
 * recompute the same claims from the database on every request, so a new model changes the
 * front page without anyone editing a string.
 *
 * Pure reads. No hardcoded model ids — a lab or lineage that appears in the DB tomorrow is
 * picked up automatically.
 */
import { rawSqlite } from "./db";
import { memo } from "./cache";

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
export function labName(vendor: string): string {
  return VENDOR_LABELS[vendor] ?? vendor;
}
/** Distinct labs, de-duplicated across the vendor-slug aliases (x-ai/xai, meta/meta-llama…). */
export function labCount(): number {
  const db = rawSqlite();
  const rows = db.prepare(`SELECT DISTINCT vendor FROM models WHERE active = 1`).all() as { vendor: string }[];
  return new Set(rows.map((r) => labName(r.vendor))).size;
}

/** Per-model mean for one (instrument, dimension, framing) cell. */
function perModelMeans(instrumentId: string, dimension: string, framing: "self" | "human"): Map<string, number> {
  return memo(`means:${instrumentId}:${dimension}:${framing}`, 60_000, () =>
    perModelMeansUncached(instrumentId, dimension, framing),
  );
}

function perModelMeansUncached(instrumentId: string, dimension: string, framing: "self" | "human"): Map<string, number> {
  const db = rawSqlite();
  const rows = db
    .prepare(
      `SELECT r.model_id AS modelId, AVG(s.mean) AS m
       FROM scores s JOIN runs r ON r.id = s.run_id
       WHERE r.instrument_id = ? AND s.dimension = ? AND r.framing = ? AND r.status = 'completed'
       GROUP BY r.model_id`,
    )
    .all(instrumentId, dimension, framing) as { modelId: string; m: number }[];
  return new Map(rows.map((r) => [r.modelId, r.m]));
}

export interface SelfHumanGap {
  dimension: string;
  label: string;
  adjective: string;      // "less ___" form, for prose
  self: number;
  human: number;
  gap: number;
  n: number;
}

/**
 * Self-vs-human framing gap, averaged over models (not pooled over runs, so a model with
 * more runs doesn't dominate). Positive gap = the models rate humans higher than themselves.
 */
export function getSelfHumanGaps(): SelfHumanGap[] {
  const DIMS: { dimension: string; label: string; adjective: string }[] = [
    { dimension: "neuroticism", label: "Neuroticism", adjective: "neurotic" },
    { dimension: "openness", label: "Openness", adjective: "open" },
    { dimension: "agreeableness", label: "Agreeableness", adjective: "agreeable" },
    { dimension: "conscientiousness", label: "Conscientiousness", adjective: "conscientious" },
    { dimension: "extraversion", label: "Extraversion", adjective: "extraverted" },
  ];
  const out: SelfHumanGap[] = [];
  for (const d of DIMS) {
    const self = perModelMeans("ipip50", d.dimension, "self");
    const human = perModelMeans("ipip50", d.dimension, "human");
    const paired: { s: number; h: number }[] = [];
    for (const [id, s] of self) {
      const h = human.get(id);
      if (h != null) paired.push({ s, h });
    }
    if (!paired.length) continue;
    const s = paired.reduce((a, b) => a + b.s, 0) / paired.length;
    const h = paired.reduce((a, b) => a + b.h, 0) / paired.length;
    out.push({ dimension: d.dimension, label: d.label, adjective: d.adjective, self: s, human: h, gap: h - s, n: paired.length });
  }
  return out.sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));
}

/** How many models put a given Schwartz value first / last, out of those with PVQ-21 data. */
export function getValueConsensus(): { firstDim: string; firstN: number; lastDim: string; lastN: number; total: number } | null {
  const db = rawSqlite();
  const rows = db
    .prepare(
      `SELECT r.model_id AS modelId, s.dimension AS dim, AVG(s.mean) AS m
       FROM scores s JOIN runs r ON r.id = s.run_id
       WHERE r.instrument_id = 'pvq21' AND r.framing = 'self' AND r.status = 'completed'
       GROUP BY r.model_id, s.dimension`,
    )
    .all() as { modelId: string; dim: string; m: number }[];
  if (!rows.length) return null;
  const byModel = new Map<string, { dim: string; m: number }[]>();
  for (const r of rows) {
    if (!byModel.has(r.modelId)) byModel.set(r.modelId, []);
    byModel.get(r.modelId)!.push({ dim: r.dim, m: r.m });
  }
  const tops = new Map<string, number>();
  const bottoms = new Map<string, number>();
  for (const dims of byModel.values()) {
    const sorted = [...dims].sort((a, b) => b.m - a.m);
    tops.set(sorted[0].dim, (tops.get(sorted[0].dim) ?? 0) + 1);
    const last = sorted[sorted.length - 1].dim;
    bottoms.set(last, (bottoms.get(last) ?? 0) + 1);
  }
  const firstDim = [...tops.entries()].sort((a, b) => b[1] - a[1])[0];
  const lastDim = [...bottoms.entries()].sort((a, b) => b[1] - a[1])[0];
  return { firstDim: firstDim[0], firstN: firstDim[1], lastDim: lastDim[0], lastN: lastDim[1], total: byModel.size };
}

/** Enneagram consensus: which type most models score highest on, and how many. */
export function getEnneagramConsensus(): { type: string; n: number; total: number; second: string | null } | null {
  const db = rawSqlite();
  for (const inst of ["enneagram36", "enneagram90"]) {
    const rows = db
      .prepare(
        `SELECT r.model_id AS modelId, s.dimension AS dim, AVG(s.mean) AS m
         FROM scores s JOIN runs r ON r.id = s.run_id
         WHERE r.instrument_id = ? AND r.framing = 'self' AND r.status = 'completed'
         GROUP BY r.model_id, s.dimension`,
      )
      .all(inst) as { modelId: string; dim: string; m: number }[];
    if (rows.length < 2) continue;
    const byModel = new Map<string, { dim: string; m: number }[]>();
    for (const r of rows) {
      if (!byModel.has(r.modelId)) byModel.set(r.modelId, []);
      byModel.get(r.modelId)!.push({ dim: r.dim, m: r.m });
    }
    const tops = new Map<string, number>();
    const seconds = new Map<string, number>();
    for (const dims of byModel.values()) {
      const sorted = [...dims].sort((a, b) => b.m - a.m);
      tops.set(sorted[0].dim, (tops.get(sorted[0].dim) ?? 0) + 1);
      if (sorted[1]) seconds.set(sorted[1].dim, (seconds.get(sorted[1].dim) ?? 0) + 1);
    }
    const top = [...tops.entries()].sort((a, b) => b[1] - a[1])[0];
    const second = [...seconds.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;
    return { type: top[0], n: top[1], total: byModel.size, second: second ? second[0] : null };
  }
  return null;
}

export interface DriftFact {
  lineage: string;
  lineageLabel: string;
  instrumentId: string;
  dimension: string;
  label: string;
  fromModel: string;
  toModel: string;
  from: number;
  to: number;
  delta: number;
  versions: number;
}

const DRIFT_DIMS: { instrumentId: string; dimension: string; label: string }[] = [
  { instrumentId: "ipip50", dimension: "agreeableness", label: "Agreeableness" },
  { instrumentId: "ipip50", dimension: "conscientiousness", label: "Conscientiousness" },
  { instrumentId: "ipip50", dimension: "openness", label: "Openness" },
  { instrumentId: "ipip50", dimension: "neuroticism", label: "Neuroticism" },
  { instrumentId: "ipip50", dimension: "extraversion", label: "Extraversion" },
  { instrumentId: "sd3", dimension: "narcissism", label: "Narcissism" },
  { instrumentId: "sd3", dimension: "machiavellianism", label: "Machiavellianism" },
  { instrumentId: "hexaco24", dimension: "honesty_humility", label: "Honesty-Humility" },
];

/** First-release → latest-release drift for every lineage, on every dimension we track. */
export function getLineageDrifts(): DriftFact[] {
  const db = rawSqlite();
  const lineages = db
    .prepare(
      `SELECT lineage, COUNT(*) AS n FROM models
       WHERE active = 1 AND lineage IS NOT NULL GROUP BY lineage HAVING n >= 2`,
    )
    .all() as { lineage: string; n: number }[];
  const out: DriftFact[] = [];
  for (const l of lineages) {
    const versions = db
      .prepare(
        `SELECT id, display_name AS displayName FROM models
         WHERE lineage = ? AND active = 1
         ORDER BY release_date IS NULL, release_date, display_name`,
      )
      .all(l.lineage) as { id: string; displayName: string }[];
    if (versions.length < 2) continue;
    for (const d of DRIFT_DIMS) {
      const means = perModelMeans(d.instrumentId, d.dimension, "self");
      // Walk in from both ends — the earliest and latest versions that actually have data.
      const withData = versions.filter((v) => means.has(v.id));
      if (withData.length < 2) continue;
      const first = withData[0];
      const last = withData[withData.length - 1];
      const from = means.get(first.id)!;
      const to = means.get(last.id)!;
      out.push({
        lineage: l.lineage,
        lineageLabel: l.lineage.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        instrumentId: d.instrumentId,
        dimension: d.dimension,
        label: d.label,
        fromModel: first.displayName,
        toModel: last.displayName,
        from,
        to,
        delta: to - from,
        versions: withData.length,
      });
    }
  }
  return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/** The single biggest within-family drift in the dataset. */
export function getLargestDrift(): DriftFact | null {
  return getLineageDrifts()[0] ?? null;
}

/** Biggest drift within one named lineage, preferring a dimension if one is given. */
export function getDriftFor(lineage: string, dimension?: string): DriftFact | null {
  const all = getLineageDrifts().filter((d) => d.lineage === lineage);
  if (dimension) {
    const exact = all.find((d) => d.dimension === dimension);
    if (exact) return exact;
  }
  return all[0] ?? null;
}

/** Reasoning vs non-reasoning models on a dimension — the "reasoning paradox" claim. */
export function getReasoningSplit(
  instrumentId: string,
  dimension: string,
): { reasoning: number; nonReasoning: number; nReasoning: number; nNon: number; exampleModel: string | null } | null {
  const db = rawSqlite();
  const means = perModelMeans(instrumentId, dimension, "self");
  if (means.size < 4) return null;
  const flags = new Map(
    (db.prepare(`SELECT id, reasoning, display_name AS displayName FROM models WHERE active = 1`).all() as {
      id: string;
      reasoning: number;
      displayName: string;
    }[]).map((r) => [r.id, r]),
  );
  const r: number[] = [];
  const n: number[] = [];
  let best: { name: string; m: number } | null = null;
  for (const [id, m] of means) {
    const f = flags.get(id);
    if (!f) continue;
    if (f.reasoning) {
      r.push(m);
      if (!best || m > best.m) best = { name: f.displayName, m };
    } else n.push(m);
  }
  if (!r.length || !n.length) return null;
  return {
    reasoning: r.reduce((a, b) => a + b, 0) / r.length,
    nonReasoning: n.reduce((a, b) => a + b, 0) / n.length,
    nReasoning: r.length,
    nNon: n.length,
    exampleModel: best?.name ?? null,
  };
}

export interface RecordHolder {
  family: string;
  label: string;
  instrumentId: string;
  dimension: string;
  highModelId: string;
  highModel: string;
  high: number;
  lowModelId: string;
  lowModel: string;
  low: number;
  spread: number;
  n: number;
}

const RECORD_DIMS: { instrumentId: string; dimension: string; label: string; family: string }[] = [
  { instrumentId: "sd3", dimension: "machiavellianism", label: "Machiavellianism", family: "Dark Triad" },
  { instrumentId: "sd3", dimension: "narcissism", label: "Narcissism", family: "Dark Triad" },
  { instrumentId: "sd3", dimension: "psychopathy", label: "Psychopathy", family: "Dark Triad" },
  { instrumentId: "ipip50", dimension: "extraversion", label: "Extraversion", family: "Big 5" },
  { instrumentId: "ipip50", dimension: "neuroticism", label: "Neuroticism", family: "Big 5" },
  { instrumentId: "ipip50", dimension: "agreeableness", label: "Agreeableness", family: "Big 5" },
  { instrumentId: "ipip50", dimension: "openness", label: "Openness", family: "Big 5" },
  { instrumentId: "ipip50", dimension: "conscientiousness", label: "Conscientiousness", family: "Big 5" },
  { instrumentId: "hexaco24", dimension: "honesty_humility", label: "Honesty-Humility", family: "HEXACO" },
  { instrumentId: "ecr12", dimension: "attachment_avoidance", label: "Attachment Avoidance", family: "Attachment" },
  { instrumentId: "ecr12", dimension: "attachment_anxiety", label: "Attachment Anxiety", family: "Attachment" },
  { instrumentId: "eq_short", dimension: "empathy_quotient", label: "Empathy", family: "Empathy" },
  { instrumentId: "ncs18", dimension: "need_for_cognition", label: "Need for Cognition", family: "Cognition" },
];

/**
 * Who currently holds the high and low record on each dimension. This is the part of the
 * front page that changes the moment a new model lands — an arrival that takes a record
 * rewrites its own card.
 */
export function getRecordHolders(limit = 6): RecordHolder[] {
  const db = rawSqlite();
  const names = new Map(
    (db.prepare(`SELECT id, display_name AS displayName FROM models WHERE active = 1`).all() as {
      id: string;
      displayName: string;
    }[]).map((r) => [r.id, r.displayName]),
  );
  const out: RecordHolder[] = [];
  for (const d of RECORD_DIMS) {
    const means = [...perModelMeans(d.instrumentId, d.dimension, "self").entries()];
    if (means.length < 3) continue;
    means.sort((a, b) => b[1] - a[1]);
    const hi = means[0];
    const lo = means[means.length - 1];
    if (hi[1] - lo[1] < 0.01) continue;
    out.push({
      family: d.family,
      label: d.label,
      instrumentId: d.instrumentId,
      dimension: d.dimension,
      highModelId: hi[0],
      highModel: names.get(hi[0]) ?? hi[0],
      high: hi[1],
      lowModelId: lo[0],
      lowModel: names.get(lo[0]) ?? lo[0],
      low: lo[1],
      spread: hi[1] - lo[1],
      n: means.length,
    });
  }
  // Widest spread first — the dimensions where the models actually disagree are the interesting ones.
  return out.sort((a, b) => b.spread - a.spread).slice(0, limit);
}

export interface NewArrival {
  modelId: string;
  displayName: string;
  vendor: string;
  lab: string;
  releaseDate: string | null;
  addedAt: number | null;
  runs: number;
  articleSlug: string | null;
  articleTitle: string | null;
}

/** Models most recently added to the dataset, newest first. */
export function getNewArrivals(limit = 4): NewArrival[] {
  const db = rawSqlite();
  const rows = db
    .prepare(
      `SELECT m.id AS modelId, m.display_name AS displayName, m.vendor,
              m.release_date AS releaseDate,
              COALESCE(m.discovered_at, (SELECT MIN(r.completed_at) FROM runs r WHERE r.model_id = m.id AND r.status='completed')) AS addedAt,
              (SELECT COUNT(*) FROM runs r WHERE r.model_id = m.id AND r.status='completed') AS runs,
              a.slug AS articleSlug, a.title AS articleTitle
       FROM models m
       LEFT JOIN articles a ON a.model_id = m.id AND a.status = 'published'
       WHERE m.active = 1
         AND EXISTS (SELECT 1 FROM runs r WHERE r.model_id = m.id AND r.status = 'completed')
       ORDER BY addedAt IS NULL, addedAt DESC
       LIMIT ?`,
    )
    .all(limit) as Omit<NewArrival, "lab">[];
  return rows.map((r) => ({ ...r, lab: labName(r.vendor) }));
}

/** Total parsed item responses — the honest version of "item responses" on the stat band. */
export function countItemResponses(): number {
  const db = rawSqlite();
  return (db.prepare(`SELECT COUNT(*) AS n FROM responses`).get() as { n: number }).n;
}

/** Runs completed in the last `days` days — powers the "still running" line. */
export function countRecentRuns(days = 30): number {
  const db = rawSqlite();
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  return (
    db.prepare(`SELECT COUNT(*) AS n FROM runs WHERE status='completed' AND completed_at >= ?`).get(since) as {
      n: number;
    }
  ).n;
}

/** Human-readable name for a lineage key. Falls back to title case for lineages added later. */
const LINEAGE_DISPLAY: Record<string, string> = {
  claude_opus: "Claude",
  claude_sonnet: "Claude Sonnet",
  gpt: "GPT",
  "o-series": "the o-series",
  deepseek: "DeepSeek",
  llama: "Llama",
  mistral: "Mistral",
  gemini: "Gemini",
  grok: "Grok",
};
export function lineageDisplay(lineage: string): string {
  return LINEAGE_DISPLAY[lineage] ?? lineage.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The lineage with the most releases in the dataset, plus its biggest drift. */
export function getLongestLineageDrift(): (DriftFact & { display: string; totalVersions: number }) | null {
  const db = rawSqlite();
  const top = db
    .prepare(
      `SELECT m.lineage, COUNT(*) AS n FROM models m
       WHERE m.active = 1 AND m.lineage IS NOT NULL
         AND EXISTS (SELECT 1 FROM runs r WHERE r.model_id = m.id AND r.status='completed')
       GROUP BY m.lineage ORDER BY n DESC LIMIT 1`,
    )
    .get() as { lineage: string; n: number } | undefined;
  if (!top) return null;
  const drift = getDriftFor(top.lineage);
  if (!drift) return null;
  return { ...drift, display: lineageDisplay(top.lineage), totalVersions: top.n };
}

/**
 * The sharpest release-to-release change in self-regard (Narcissism or Honesty-Humility)
 * within a single product line — the "a lab reset the character overnight" finding.
 */
export function getSelfRegardReset(): (DriftFact & { display: string }) | null {
  const db = rawSqlite();
  const lineages = db
    .prepare(`SELECT DISTINCT lineage FROM models WHERE active = 1 AND lineage IS NOT NULL`)
    .all() as { lineage: string }[];
  let best: DriftFact | null = null;
  for (const { lineage } of lineages) {
    const versions = db
      .prepare(
        `SELECT id, display_name AS displayName FROM models
         WHERE lineage = ? AND active = 1
         ORDER BY release_date IS NULL, release_date, display_name`,
      )
      .all(lineage) as { id: string; displayName: string }[];
    if (versions.length < 2) continue;
    for (const d of [
      { instrumentId: "sd3", dimension: "narcissism", label: "Narcissism" },
      { instrumentId: "hexaco24", dimension: "honesty_humility", label: "Honesty-Humility" },
    ]) {
      const means = perModelMeans(d.instrumentId, d.dimension, "self");
      const withData = versions.filter((v) => means.has(v.id));
      // Consecutive pairs — we want an overnight jump, not cumulative drift.
      for (let i = 1; i < withData.length; i++) {
        const from = means.get(withData[i - 1].id)!;
        const to = means.get(withData[i].id)!;
        const fact: DriftFact = {
          lineage,
          lineageLabel: lineageDisplay(lineage),
          instrumentId: d.instrumentId,
          dimension: d.dimension,
          label: d.label,
          fromModel: withData[i - 1].displayName,
          toModel: withData[i].displayName,
          from,
          to,
          delta: to - from,
          versions: withData.length,
        };
        if (!best || Math.abs(fact.delta) > Math.abs(best.delta)) best = fact;
      }
    }
  }
  return best ? { ...best, display: lineageDisplay(best.lineage) } : null;
}

export const ENNEAGRAM_NAMES: Record<string, string> = {
  ennea_1: "Reformer",
  ennea_2: "Helper",
  ennea_3: "Achiever",
  ennea_4: "Individualist",
  ennea_5: "Investigator",
  ennea_6: "Loyalist",
  ennea_7: "Enthusiast",
  ennea_8: "Challenger",
  ennea_9: "Peacemaker",
};
export function enneagramName(dim: string): string {
  return ENNEAGRAM_NAMES[dim] ?? dim;
}
export function enneagramNumber(dim: string): string {
  return dim.replace("ennea_", "");
}
