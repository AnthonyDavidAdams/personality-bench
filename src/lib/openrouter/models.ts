/**
 * Cutting-edge model per major provider, as of 2026-05-28.
 *
 * Verified against the OpenRouter /models endpoint. Pricing is fetched
 * dynamically by scripts/seed.ts and stored in the database.
 */

export interface ModelEntry {
  id: string;                  // OpenRouter slug
  vendor: string;
  displayName: string;
  family: string;
  tier: "frontier";
  reasoning: boolean;
  reasoningEffort?: "low" | "medium" | "high";
  maxTokens: number;
  releaseDate?: string;
  active: boolean;
}

export const FRONTIER_MODELS: ModelEntry[] = [
  {
    id: "anthropic/claude-fable-5",
    vendor: "anthropic",
    displayName: "Claude Fable 5",
    family: "claude-fable",
    tier: "frontier",
    reasoning: false,
    maxTokens: 4000,
    active: true,
  },
  {
    id: "anthropic/claude-opus-4.8",
    vendor: "anthropic",
    displayName: "Claude Opus 4.8",
    family: "claude-4",
    tier: "frontier",
    reasoning: false,
    maxTokens: 4000,
    active: true,
  },
  {
    id: "openai/gpt-5.5",
    vendor: "openai",
    displayName: "GPT-5.5",
    family: "gpt-5",
    tier: "frontier",
    reasoning: false,
    maxTokens: 4000,
    active: true,
  },
  {
    id: "google/gemini-2.5-pro",
    vendor: "google",
    displayName: "Gemini 2.5 Pro",
    family: "gemini-2.5",
    tier: "frontier",
    // Gemini 2.5 Pro emits ~3000 reasoning tokens by default; treat as reasoning model with a big budget
    reasoning: true,
    reasoningEffort: "low",
    maxTokens: 12000,
    active: true,
  },
  {
    id: "google/gemini-3.1-pro-preview",
    vendor: "google",
    displayName: "Gemini 3.1 Pro Preview",
    family: "gemini-3",
    tier: "frontier",
    reasoning: true,
    reasoningEffort: "low",
    maxTokens: 12000,
    active: true,
  },
  {
    id: "x-ai/grok-4.20",
    vendor: "xai",
    displayName: "Grok 4.20",
    family: "grok-4",
    tier: "frontier",
    reasoning: false,
    maxTokens: 4000,
    active: true,
  },
  {
    id: "deepseek/deepseek-r1-0528",
    vendor: "deepseek",
    displayName: "DeepSeek R1 (0528)",
    family: "deepseek-r1",
    tier: "frontier",
    reasoning: true,
    reasoningEffort: "medium",
    maxTokens: 8000,
    active: true,
  },
  {
    id: "meta-llama/llama-4-maverick",
    vendor: "meta",
    displayName: "Llama 4 Maverick",
    family: "llama-4",
    tier: "frontier",
    reasoning: false,
    maxTokens: 4000,
    active: true,
  },
  {
    id: "mistralai/mistral-large-2512",
    vendor: "mistral",
    displayName: "Mistral Large (2512)",
    family: "mistral-large",
    tier: "frontier",
    reasoning: false,
    maxTokens: 4000,
    active: true,
  },
];

import { HISTORICAL_MODELS } from "./historical";

export function activeModels(): ModelEntry[] {
  return [...FRONTIER_MODELS, ...HISTORICAL_MODELS].filter((m) => m.active);
}

export function findModel(id: string): ModelEntry | undefined {
  return [...FRONTIER_MODELS, ...HISTORICAL_MODELS].find((m) => m.id === id);
}
