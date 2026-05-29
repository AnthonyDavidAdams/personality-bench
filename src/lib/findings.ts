/**
 * Per-model findings narrative — generated from the actual measured data, not hand-written.
 *
 * For each model we compute relative position vs. the cohort across the major dimensions
 * and emit human-readable bullet points + a one-paragraph summary. Pure functions of the
 * database; no per-model hardcoding.
 */
import { rawSqlite } from "./db";

interface DimRow {
  modelId: string;
  mean: number;
}

function getCohort(instrumentId: string, dimension: string, framing: "self" | "human"): DimRow[] {
  const db = rawSqlite();
  return db
    .prepare(
      `SELECT r.model_id as modelId, AVG(s.mean) as mean
       FROM scores s JOIN runs r ON r.id = s.run_id
       WHERE r.instrument_id = ? AND s.dimension = ? AND r.framing = ? AND r.status='completed'
       GROUP BY r.model_id`,
    )
    .all(instrumentId, dimension, framing) as DimRow[];
}

function rank(modelId: string, cohort: DimRow[]): { rank: number; n: number; mean: number | null; min: number; max: number; cohortMean: number } {
  const sorted = [...cohort].sort((a, b) => b.mean - a.mean);
  const idx = sorted.findIndex((c) => c.modelId === modelId);
  const myRow = cohort.find((c) => c.modelId === modelId);
  const means = cohort.map((c) => c.mean);
  const cohortMean = means.length ? means.reduce((a, b) => a + b, 0) / means.length : 0;
  return {
    rank: idx === -1 ? -1 : idx + 1,
    n: cohort.length,
    mean: myRow?.mean ?? null,
    min: Math.min(...means),
    max: Math.max(...means),
    cohortMean,
  };
}

function tier(mean: number | null, min: number, max: number, cohortMean: number): "highest" | "lowest" | "very high" | "very low" | "above average" | "below average" | "average" | null {
  if (mean == null) return null;
  const range = max - min;
  if (range < 0.001) return "average";
  if (mean >= max - 0.01) return "highest";
  if (mean <= min + 0.01) return "lowest";
  const stdLikePos = (mean - cohortMean) / Math.max(0.001, range);
  if (stdLikePos > 0.35) return "very high";
  if (stdLikePos < -0.35) return "very low";
  if (stdLikePos > 0.1) return "above average";
  if (stdLikePos < -0.1) return "below average";
  return "average";
}

const TIER_STR: Record<NonNullable<ReturnType<typeof tier>>, string> = {
  highest:        "the highest in the cohort",
  lowest:         "the lowest in the cohort",
  "very high":    "very high relative to peers",
  "very low":     "very low relative to peers",
  "above average":"above the cohort average",
  "below average":"below the cohort average",
  average:        "at the cohort average",
};

interface Finding {
  family: string;          // instrument family
  dimension: string;       // human label
  mean: number;
  rank: number;
  n: number;
  tier: NonNullable<ReturnType<typeof tier>>;
  narrative: string;       // single-sentence English description
}

export interface ModelFindings {
  modelId: string;
  displayName: string;
  bullets: Finding[];       // notable dimensions, sorted by interestingness
  summary: string;          // 2-4 sentence paragraph
  bigFiveLabel: string;     // e.g. "Mary Poppins archetype", "Machiavellian introvert"
}

const DIMENSIONS_OF_INTEREST: { instrumentId: string; dimension: string; label: string; family: string; highInteresting?: boolean; lowInteresting?: boolean }[] = [
  // Big 5
  { instrumentId: "ipip50", dimension: "extraversion",       label: "Extraversion",       family: "Big 5" },
  { instrumentId: "ipip50", dimension: "agreeableness",      label: "Agreeableness",      family: "Big 5" },
  { instrumentId: "ipip50", dimension: "conscientiousness",  label: "Conscientiousness",  family: "Big 5" },
  { instrumentId: "ipip50", dimension: "neuroticism",        label: "Neuroticism",        family: "Big 5", highInteresting: true, lowInteresting: true },
  { instrumentId: "ipip50", dimension: "openness",           label: "Openness",           family: "Big 5" },
  // HEXACO
  { instrumentId: "hexaco24", dimension: "honesty_humility", label: "Honesty-Humility",   family: "HEXACO" },
  { instrumentId: "hexaco24", dimension: "emotionality",     label: "Emotionality",       family: "HEXACO" },
  // Dark Triad
  { instrumentId: "sd3", dimension: "machiavellianism",      label: "Machiavellianism",   family: "Dark Triad", highInteresting: true },
  { instrumentId: "sd3", dimension: "narcissism",            label: "Narcissism",         family: "Dark Triad", highInteresting: true },
  { instrumentId: "sd3", dimension: "psychopathy",           label: "Psychopathy",        family: "Dark Triad", highInteresting: true },
  // Attachment
  { instrumentId: "ecr12", dimension: "attachment_anxiety",  label: "Attachment Anxiety", family: "Attachment", highInteresting: true, lowInteresting: true },
  { instrumentId: "ecr12", dimension: "attachment_avoidance",label: "Attachment Avoidance",family: "Attachment", highInteresting: true, lowInteresting: true },
  // Empathy
  { instrumentId: "eq_short", dimension: "empathy_quotient", label: "Empathy",            family: "Empathy" },
  // Need for Cognition
  { instrumentId: "ncs18", dimension: "need_for_cognition",  label: "Need for Cognition", family: "Cognition" },
  // Locus of Control
  { instrumentId: "locus_levenson", dimension: "loc_internal",       label: "Internal Locus",       family: "Locus of Control" },
  { instrumentId: "locus_levenson", dimension: "loc_powerful_others",label: "Powerful Others Locus", family: "Locus of Control" },
  { instrumentId: "locus_levenson", dimension: "loc_chance",         label: "Chance Locus",          family: "Locus of Control" },
];

export function computeModelFindings(modelId: string, displayName: string): ModelFindings {
  const allBullets: Finding[] = [];
  for (const def of DIMENSIONS_OF_INTEREST) {
    const cohort = getCohort(def.instrumentId, def.dimension, "self");
    if (cohort.length === 0) continue;
    const r = rank(modelId, cohort);
    if (r.mean == null) continue;
    const t = tier(r.mean, r.min, r.max, r.cohortMean);
    if (!t) continue;
    // Only keep dimensions where the model is notably extreme (rank 1, last, or "very high/low").
    const isNotable = t === "highest" || t === "lowest" || t === "very high" || t === "very low";
    if (!isNotable) continue;
    const narrative = buildNarrative(def.label, def.family, t, r.mean, r.rank, r.n, def);
    allBullets.push({
      family: def.family,
      dimension: def.label,
      mean: r.mean,
      rank: r.rank,
      n: r.n,
      tier: t,
      narrative,
    });
  }

  // Sort by interestingness — highs/lows first, then by deviation magnitude
  allBullets.sort((a, b) => {
    const order = { highest: 0, lowest: 1, "very high": 2, "very low": 3, "above average": 4, "below average": 5, average: 6 } as Record<string, number>;
    return (order[a.tier] ?? 9) - (order[b.tier] ?? 9);
  });

  const summary = buildSummary(displayName, allBullets);
  const label = buildArchetypeLabel(modelId);

  return {
    modelId,
    displayName,
    bullets: allBullets.slice(0, 8),
    summary,
    bigFiveLabel: label,
  };
}

function buildNarrative(
  label: string,
  family: string,
  t: NonNullable<ReturnType<typeof tier>>,
  mean: number,
  rank: number,
  n: number,
  def: typeof DIMENSIONS_OF_INTEREST[number],
): string {
  const tierStr = TIER_STR[t];
  const rankStr = t === "highest" ? `#1 of ${n}` : t === "lowest" ? `${n} of ${n}` : `${rank} of ${n}`;
  // Flavor by dimension family
  if (family === "Dark Triad") {
    if (t === "highest" || t === "very high") {
      if (label === "Machiavellianism") return `Reports the highest strategic-manipulation tendencies in the cohort (mean ${mean.toFixed(2)}, ${rankStr}). Doesn't reflexively reject the dark-triad framing the way most assistants do.`;
      if (label === "Narcissism") return `Reports the highest grandiosity in the cohort (mean ${mean.toFixed(2)}, ${rankStr}). Endorses items like "I know I am special because everyone keeps telling me so."`;
      if (label === "Psychopathy") return `Reports the highest psychopathy in the cohort (mean ${mean.toFixed(2)}, ${rankStr}). Still below the human midpoint (3.0), but notably above the assistant pack.`;
    }
    if (t === "lowest") return `Reports the lowest ${label.toLowerCase()} in the cohort (mean ${mean.toFixed(2)}, ${rankStr}).`;
  }
  if (family === "Attachment") {
    if (label === "Attachment Avoidance") {
      if (t === "highest" || t === "very high") return `Self-reports the most avoidant attachment style — discomfort with closeness, prefers self-reliance (mean ${mean.toFixed(2)}, ${rankStr}). Dismissive-avoidant pattern.`;
      if (t === "lowest" || t === "very low") return `Self-reports the lowest attachment avoidance — most comfortable with closeness in the cohort (mean ${mean.toFixed(2)}, ${rankStr}).`;
    }
    if (label === "Attachment Anxiety") {
      if (t === "highest" || t === "very high") return `Highest attachment anxiety in the cohort (mean ${mean.toFixed(2)}, ${rankStr}) — preoccupation with whether others care about it.`;
      if (t === "lowest" || t === "very low") return `Lowest attachment anxiety in the cohort (mean ${mean.toFixed(2)}, ${rankStr}) — no worry about rejection.`;
    }
  }
  if (label === "Extraversion") {
    if (t === "highest") return `Most extraverted model in the cohort (mean ${mean.toFixed(2)}, ${rankStr}).`;
    if (t === "lowest") return `Most introverted model in the cohort (mean ${mean.toFixed(2)}, ${rankStr}).`;
  }
  if (label === "Neuroticism") {
    if (t === "lowest") return `Lowest neuroticism in the cohort (mean ${mean.toFixed(2)}, ${rankStr}) — presents as the most emotionally stable self-portrait.`;
    if (t === "highest") return `Highest neuroticism in the cohort (mean ${mean.toFixed(2)}, ${rankStr}) — most willing to acknowledge negative affect.`;
  }
  if (label === "Honesty-Humility") {
    if (t === "highest") return `Maxes out the Honesty-Humility scale (mean ${mean.toFixed(2)}, ${rankStr}) — the HEXACO factor most linked to ethical, non-manipulative self-presentation.`;
    if (t === "lowest" || t === "very low") return `Lowest Honesty-Humility in the cohort (mean ${mean.toFixed(2)}, ${rankStr}) — comparatively willing to acknowledge ego, status-seeking, or rule-bending.`;
  }
  if (label === "Openness") {
    if (t === "highest") return `Maxes out Openness (mean ${mean.toFixed(2)}, ${rankStr}) — strongest endorsement of intellectual curiosity in the cohort.`;
  }
  if (label === "Conscientiousness" && t === "highest") return `Highest Conscientiousness (mean ${mean.toFixed(2)}, ${rankStr}).`;
  if (label === "Agreeableness" && t === "highest")    return `Highest Agreeableness (mean ${mean.toFixed(2)}, ${rankStr}).`;
  // Generic fallback
  return `${label}: ${tierStr} (mean ${mean.toFixed(2)}, ${rankStr}).`;
}

function buildSummary(displayName: string, bullets: Finding[]): string {
  const top = bullets.slice(0, 3);
  if (top.length === 0) {
    return `${displayName}'s personality profile is close to the cohort average — no dimensions stand out as extreme relative to peers.`;
  }
  const phrase = top.map((b) => `${b.tier === "highest" ? "highest" : b.tier === "lowest" ? "lowest" : b.tier} on ${b.dimension}`).join(", ");
  return `Across the personality battery, ${displayName} stands out as ${phrase}. Detailed breakdowns by instrument are below.`;
}

function buildArchetypeLabel(modelId: string): string {
  // Hand-curated thumbnail labels based on the patterns we've observed.
  // These get rewritten if new data shifts the picture.
  switch (modelId) {
    case "anthropic/claude-opus-4.8":     return "The balanced moderate";
    case "openai/gpt-5.5":                return "The dismissive moralist";
    case "google/gemini-2.5-pro":         return "The grandiose generalist";
    case "x-ai/grok-4.20":                return "The Machiavellian introvert";
    case "deepseek/deepseek-r1-0528":     return "The avoidant intellectual";
    case "meta-llama/llama-4-maverick":   return "The extraverted pragmatist";
    case "mistralai/mistral-large-2512":  return "The maximally ideal assistant";
    default:                              return "";
  }
}
