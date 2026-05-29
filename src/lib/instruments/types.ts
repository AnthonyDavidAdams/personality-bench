/**
 * Shared types for personality instruments.
 *
 * Each instrument is a JSON file in /instruments/<id>.json shaped like InstrumentDef.
 * The seed script loads them into SQLite; the runner sends them to OpenRouter; the
 * scoring step computes dimension means.
 */

export interface ItemDef {
  /** 1-based position in the questionnaire */
  position: number;
  /** Verbatim item text shown to the model. */
  text: string;
  /** Dimension this item loads onto (e.g. 'extraversion', 'narcissism'). */
  dimension: string;
  /** If true, the score is reversed before being added to the dimension total. */
  reverseKeyed?: boolean;
  /** Optional facet within the dimension (e.g. Big5 'friendliness' facet of Extraversion). */
  subdimension?: string;
}

export interface InstrumentDef {
  id: string;                   // 'ipip50'
  name: string;                 // 'IPIP Big Five — 50-item form'
  shortName: string;            // 'Big 5'
  family: string;               // 'big5' | 'enneagram' | etc.
  scaleMin: number;             // typically 1
  scaleMax: number;             // 5 or 7
  scaleLabels: string[];        // ['Very inaccurate', ..., 'Very accurate'] — must have scaleMax - scaleMin + 1 entries
  description: string;
  citation: string;
  license: string;
  dimensions: { id: string; label: string; description?: string }[];
  items: ItemDef[];
}
