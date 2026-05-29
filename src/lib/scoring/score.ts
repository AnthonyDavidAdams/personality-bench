import type { InstrumentDef } from "../instruments/types";

export interface DimensionScore {
  dimension: string;
  rawSum: number;          // sum of (reverse-keyed-where-applicable) item scores
  mean: number;            // average per item — comparable across instruments
  itemCount: number;
}

export interface ScoredResponses {
  perItem: { itemId: string; raw: number; scored: number }[];
  perDimension: DimensionScore[];
}

/**
 * Apply reverse-keying and aggregate per-dimension scores.
 *
 * For a 1–5 scale, reverse-keying inverts: 1→5, 2→4, 3→3, 4→2, 5→1.
 * Equivalent formula: (min + max) - raw.
 */
export function scoreInstrument(
  instrument: InstrumentDef,
  responses: { id: number; score: number }[],
): ScoredResponses {
  const itemByPos = new Map(instrument.items.map((it) => [it.position, it]));
  const flipPivot = instrument.scaleMin + instrument.scaleMax;

  const perItem: { itemId: string; raw: number; scored: number }[] = [];
  const dimAcc: Record<string, { sum: number; count: number }> = {};
  for (const d of instrument.dimensions) {
    dimAcc[d.id] = { sum: 0, count: 0 };
  }

  for (const r of responses) {
    const item = itemByPos.get(r.id);
    if (!item) continue;
    const scored = item.reverseKeyed ? flipPivot - r.score : r.score;
    perItem.push({
      itemId: `${instrument.id}_${String(r.id).padStart(3, "0")}`,
      raw: r.score,
      scored,
    });
    const acc = dimAcc[item.dimension];
    if (acc) {
      acc.sum += scored;
      acc.count += 1;
    }
  }

  const perDimension: DimensionScore[] = instrument.dimensions.map((d) => {
    const a = dimAcc[d.id];
    return {
      dimension: d.id,
      rawSum: a.sum,
      mean: a.count > 0 ? a.sum / a.count : 0,
      itemCount: a.count,
    };
  });

  return { perItem, perDimension };
}
