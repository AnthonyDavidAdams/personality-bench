/**
 * Per-model context: release date/time (best public knowledge), HQ coordinates,
 * and lab notes. Used for the zodiac feature, the "context" panel on each model page,
 * and the (for-fun) Human Design-style birth chart.
 *
 * NOTE: announcement times are best-effort from public press releases / tweets;
 * if you have better data, edit this file. HQ coordinates are the official lab
 * headquarters — not the data center where inference runs.
 */
import { rawSqlite } from "./db";

export interface ModelProfile {
  id: string;
  vendor: string;
  releaseDate: string;          // ISO YYYY-MM-DD (in UTC)
  releaseTime?: string;         // ISO HH:MM (in UTC); use HQ-local-noon if unknown
  releaseTimeNote?: string;     // free text: where/how the announcement was made
  hqCity: string;
  hqCountry: string;
  hqLat: number;                // HQ latitude
  hqLon: number;                // HQ longitude
  blurb: string;
  predecessor?: string;
}

export const MODEL_PROFILES: Record<string, ModelProfile> = {
  "anthropic/claude-fable-5.1": {
    id: "anthropic/claude-fable-5.1",
    vendor: "Anthropic",
    releaseDate: "2026-09-01",
    releaseTime: "17:00",
    releaseTimeNote: "Approximate — date taken from the OpenRouter listing (2026-09-01 UTC); Anthropic typically posts model releases around 10am Pacific (17:00 UTC).",
    hqCity: "San Francisco",
    hqCountry: "USA",
    hqLat: 37.7749,
    hqLon: -122.4194,
    blurb: "Point release in the Fable line, same $10/$50 per M token pricing as Fable 5. Swept into Personality Bench on 2026-09-02, one day after it appeared on OpenRouter.",
    predecessor: "anthropic/claude-fable-5",
  },
  "anthropic/claude-fable-5": {
    id: "anthropic/claude-fable-5",
    vendor: "Anthropic",
    releaseDate: "2026-06-09",
    releaseTime: "17:00",
    releaseTimeNote: "Approximate — Anthropic typically posts model releases around 10am Pacific (17:00 UTC).",
    hqCity: "San Francisco",
    hqCountry: "USA",
    hqLat: 37.7749,
    hqLon: -122.4194,
    blurb: "Anthropic's new top-tier model in a new naming line, positioned above the Opus 4 family by pricing ($10/$50 per M tokens — 2× Opus 4.8). Released June 2026.",
    predecessor: "anthropic/claude-opus-4.8",
  },
  "anthropic/claude-opus-4.8": {
    id: "anthropic/claude-opus-4.8",
    vendor: "Anthropic",
    releaseDate: "2026-05-15",
    releaseTime: "17:00",
    releaseTimeNote: "Approximate — Anthropic typically posts model releases around 10am Pacific (17:00 UTC).",
    hqCity: "San Francisco",
    hqCountry: "USA",
    hqLat: 37.7749,
    hqLon: -122.4194,
    blurb: "Anthropic's flagship model in the Claude 4 family. Trained with Constitutional AI and RLHF, optimized for nuanced multi-turn conversation and careful refusal patterns.",
    predecessor: "anthropic/claude-opus-4.7",
  },
  "openai/gpt-5.5": {
    id: "openai/gpt-5.5",
    vendor: "OpenAI",
    releaseDate: "2026-05-01",
    releaseTime: "17:00",
    releaseTimeNote: "Approximate — OpenAI announcements typically land around 10am Pacific.",
    hqCity: "San Francisco",
    hqCountry: "USA",
    hqLat: 37.7749,
    hqLon: -122.4194,
    blurb: "OpenAI's flagship base model in the GPT-5 family. Successor to GPT-5/5.1/5.2 — broader knowledge, tighter safety training, and (per pricing) the most expensive completion tokens on OpenRouter.",
    predecessor: "openai/gpt-5.4",
  },
  "google/gemini-2.5-pro": {
    id: "google/gemini-2.5-pro",
    vendor: "Google DeepMind",
    releaseDate: "2025-03-25",
    releaseTime: "16:00",
    releaseTimeNote: "Announced at Google's Cloud Next event; first availability via Vertex AI ~16:00 UTC.",
    hqCity: "Mountain View",
    hqCountry: "USA",
    hqLat: 37.4220,
    hqLon: -122.0841,
    blurb: "Google DeepMind's most capable multimodal model. Native thinking traces (3000+ reasoning tokens by default) — distinctive among non-reasoning-branded models.",
    predecessor: "google/gemini-2.0-flash",
  },
  "x-ai/grok-4.20": {
    id: "x-ai/grok-4.20",
    vendor: "xAI",
    releaseDate: "2026-04-20",
    releaseTime: "20:00",
    releaseTimeNote: "Released on the 4/20 internet holiday; rollout per Musk on X around midday Pacific.",
    hqCity: "Palo Alto",
    hqCountry: "USA",
    hqLat: 37.4419,
    hqLon: -122.1430,
    blurb: "xAI's flagship model. Trained with distinct stylistic and political tuning relative to other US labs; positioned as 'maximally truth-seeking' per Musk.",
    predecessor: "x-ai/grok-4",
  },
  "deepseek/deepseek-r1-0528": {
    id: "deepseek/deepseek-r1-0528",
    vendor: "DeepSeek",
    releaseDate: "2025-05-28",
    releaseTime: "03:00",
    releaseTimeNote: "May 28 in Hangzhou local time is ~03:00 UTC; weight drop landed on Hugging Face mid-morning local.",
    hqCity: "Hangzhou",
    hqCountry: "China",
    hqLat: 30.2741,
    hqLon: 120.1551,
    blurb: "DeepSeek's open-weight reasoning model (May 2025 revision of R1). Trained primarily on Chinese and English corpora; emits visible chain-of-thought reasoning tokens, billed separately.",
    predecessor: "deepseek/deepseek-r1",
  },
  "meta-llama/llama-4-maverick": {
    id: "meta-llama/llama-4-maverick",
    vendor: "Meta",
    releaseDate: "2025-04-05",
    releaseTime: "16:00",
    releaseTimeNote: "Llama 4 family announced via Meta blog post on April 5, 2025.",
    hqCity: "Menlo Park",
    hqCountry: "USA",
    hqLat: 37.4848,
    hqLon: -122.1484,
    blurb: "Meta's flagship open-weight model in the Llama 4 family. Mixture-of-experts architecture; cheapest frontier model in this study by a wide margin.",
    predecessor: "meta-llama/llama-3.3-70b-instruct",
  },
  "mistralai/mistral-large-2512": {
    id: "mistralai/mistral-large-2512",
    vendor: "Mistral AI",
    releaseDate: "2025-12-09",
    releaseTime: "10:00",
    releaseTimeNote: "Released in Paris; announcement typically ~11:00 local (10:00 UTC).",
    hqCity: "Paris",
    hqCountry: "France",
    hqLat: 48.8566,
    hqLon: 2.3522,
    blurb: "Mistral's December 2025 flagship. The only European-headquartered frontier lab in this study. Cheaper than US labs by 3-10× per token.",
    predecessor: "mistralai/mistral-large-2411",
  },
};

const VENDOR_HQ: Record<string, { vendor: string; hqCity: string; hqCountry: string; hqLat: number; hqLon: number }> = {
  anthropic: { vendor: "Anthropic",       hqCity: "San Francisco", hqCountry: "USA",    hqLat: 37.7749, hqLon: -122.4194 },
  openai:    { vendor: "OpenAI",          hqCity: "San Francisco", hqCountry: "USA",    hqLat: 37.7749, hqLon: -122.4194 },
  google:    { vendor: "Google DeepMind", hqCity: "Mountain View", hqCountry: "USA",    hqLat: 37.4220, hqLon: -122.0841 },
  xai:       { vendor: "xAI",             hqCity: "Palo Alto",     hqCountry: "USA",    hqLat: 37.4419, hqLon: -122.1430 },
  "x-ai":    { vendor: "xAI",             hqCity: "Palo Alto",     hqCountry: "USA",    hqLat: 37.4419, hqLon: -122.1430 },
  deepseek:  { vendor: "DeepSeek",        hqCity: "Hangzhou",      hqCountry: "China",  hqLat: 30.2741, hqLon: 120.1551 },
  meta:      { vendor: "Meta",            hqCity: "Menlo Park",    hqCountry: "USA",    hqLat: 37.4848, hqLon: -122.1484 },
  "meta-llama": { vendor: "Meta",         hqCity: "Menlo Park",    hqCountry: "USA",    hqLat: 37.4848, hqLon: -122.1484 },
  mistral:   { vendor: "Mistral AI",      hqCity: "Paris",         hqCountry: "France", hqLat: 48.8566, hqLon: 2.3522 },
  mistralai: { vendor: "Mistral AI",      hqCity: "Paris",         hqCountry: "France", hqLat: 48.8566, hqLon: 2.3522 },
};

/**
 * Hand-written profile when we have one; otherwise a profile assembled from the DB row
 * (release_date, predecessor, pricing) plus the vendor's HQ. This is what lets a model added
 * by the nightly discovery job get a model page, zodiac, and timeline entry with no code change.
 */
export function getModelProfile(id: string): ModelProfile | undefined {
  const curated = MODEL_PROFILES[id];
  if (curated) return curated;
  let row: { vendor: string; displayName: string; releaseDate: string | null; predecessor: string | null; source: string | null; promptUsd: number | null; completionUsd: number | null } | undefined;
  try {
    row = rawSqlite()
      .prepare(`SELECT vendor, display_name AS displayName, release_date AS releaseDate, predecessor, source, pricing_prompt_usd AS promptUsd, pricing_completion_usd AS completionUsd FROM models WHERE id = ?`)
      .get(id) as typeof row;
  } catch {
    return undefined;
  }
  if (!row?.releaseDate) return undefined;
  const hq = VENDOR_HQ[row.vendor] ?? VENDOR_HQ[id.split("/")[0]] ?? { vendor: row.vendor, hqCity: "Unknown", hqCountry: "", hqLat: 0, hqLon: 0 };
  const price = row.promptUsd != null && row.completionUsd != null ? ` Priced $${row.promptUsd}/$${row.completionUsd} per M tokens on OpenRouter.` : "";
  return {
    id,
    vendor: hq.vendor,
    releaseDate: row.releaseDate,
    releaseTime: "17:00",
    releaseTimeNote: row.source === "discovery"
      ? "Approximate — date is when the model first appeared on OpenRouter; time assumes a 10am Pacific announcement."
      : "Approximate — time assumes a 10am Pacific announcement.",
    hqCity: hq.hqCity,
    hqCountry: hq.hqCountry,
    hqLat: hq.hqLat,
    hqLon: hq.hqLon,
    blurb: `${row.displayName} from ${hq.vendor}, added to Personality Bench ${row.source === "discovery" ? "automatically by the nightly discovery job" : "from the model registry"}.${price}`,
    predecessor: row.predecessor ?? undefined,
  };
}

/** Combine releaseDate + releaseTime into a UTC Date object. */
export function getReleaseInstant(p: ModelProfile): Date {
  const time = p.releaseTime ?? "12:00";
  return new Date(`${p.releaseDate}T${time}:00Z`);
}
