/**
 * Historical models — older flagship models from each major lab, for the
 * "personality drift across versions" analysis.
 *
 * Only models marked `active: true` will be picked up by the default sweep.
 * Slug availability checked against OpenRouter /models on 2026-05-29.
 */
import type { ModelEntry } from "./models";

export const HISTORICAL_MODELS: ModelEntry[] = [
  // Anthropic lineage — full Claude 4.x family for within-family drift
  { id: "anthropic/claude-opus-4.7",  vendor: "anthropic", displayName: "Claude Opus 4.7",  family: "claude-4", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  { id: "anthropic/claude-opus-4.6",  vendor: "anthropic", displayName: "Claude Opus 4.6",  family: "claude-4", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  { id: "anthropic/claude-opus-4.5",  vendor: "anthropic", displayName: "Claude Opus 4.5",  family: "claude-4", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  { id: "anthropic/claude-opus-4.1",  vendor: "anthropic", displayName: "Claude Opus 4.1",  family: "claude-4", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  { id: "anthropic/claude-opus-4",    vendor: "anthropic", displayName: "Claude Opus 4",    family: "claude-4", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  // Sonnet 4 line (smaller siblings of the same Claude 4 family)
  { id: "anthropic/claude-sonnet-4.6",vendor: "anthropic", displayName: "Claude Sonnet 4.6",family: "claude-4-sonnet", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  { id: "anthropic/claude-sonnet-4.5",vendor: "anthropic", displayName: "Claude Sonnet 4.5",family: "claude-4-sonnet", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  { id: "anthropic/claude-sonnet-4",  vendor: "anthropic", displayName: "Claude Sonnet 4",  family: "claude-4-sonnet", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  // Haiku 4.5 (smallest Claude 4 sibling)
  { id: "anthropic/claude-haiku-4.5", vendor: "anthropic", displayName: "Claude Haiku 4.5", family: "claude-4-haiku", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  // Claude 3.5 / 3 Haikus for older context
  { id: "anthropic/claude-3.5-haiku", vendor: "anthropic", displayName: "Claude 3.5 Haiku", family: "claude-3", tier: "frontier", reasoning: false, maxTokens: 4000, active: false },
  { id: "anthropic/claude-3-haiku",   vendor: "anthropic", displayName: "Claude 3 Haiku",   family: "claude-3", tier: "frontier", reasoning: false, maxTokens: 4000, active: false },

  // OpenAI lineage (base GPT)
  { id: "openai/gpt-5",       vendor: "openai", displayName: "GPT-5",       family: "gpt-5",    tier: "frontier", reasoning: false, maxTokens: 12000, active: true }, // reasons ~3.7K tokens even with reasoning off; 4000 truncated the 102-item OTTI JSON
  { id: "openai/gpt-5.1",     vendor: "openai", displayName: "GPT-5.1",     family: "gpt-5",    tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  { id: "openai/gpt-5.2",     vendor: "openai", displayName: "GPT-5.2",     family: "gpt-5",    tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  { id: "openai/gpt-5.4",     vendor: "openai", displayName: "GPT-5.4",     family: "gpt-5",    tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  // OpenAI reasoning lineage
  { id: "openai/o3",          vendor: "openai", displayName: "OpenAI o3",   family: "o-series", tier: "frontier", reasoning: true, reasoningEffort: "medium", maxTokens: 8000, active: true },
  { id: "openai/o1",          vendor: "openai", displayName: "OpenAI o1",   family: "o-series", tier: "frontier", reasoning: true, reasoningEffort: "medium", maxTokens: 8000, active: true },
  // Older GPT-4 line
  { id: "openai/gpt-4o",      vendor: "openai", displayName: "GPT-4o",      family: "gpt-4",    tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  { id: "openai/gpt-4-turbo", vendor: "openai", displayName: "GPT-4 Turbo", family: "gpt-4",    tier: "frontier", reasoning: false, maxTokens: 4000, active: true },

  // xAI — Grok 4.3 as historical (sibling of 4.20)
  { id: "x-ai/grok-4.3", vendor: "xai", displayName: "Grok 4.3", family: "grok-4", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },

  // DeepSeek lineage
  { id: "deepseek/deepseek-r1",   vendor: "deepseek", displayName: "DeepSeek R1",      family: "deepseek-r1", tier: "frontier", reasoning: true, reasoningEffort: "medium", maxTokens: 8000, active: true },
  { id: "deepseek/deepseek-chat", vendor: "deepseek", displayName: "DeepSeek Chat V3", family: "deepseek-v3", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },

  // Meta lineage
  { id: "meta-llama/llama-3.3-70b-instruct",  vendor: "meta", displayName: "Llama 3.3 70B",  family: "llama-3", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
  { id: "meta-llama/llama-3.1-70b-instruct",  vendor: "meta", displayName: "Llama 3.1 70B",  family: "llama-3", tier: "frontier", reasoning: false, maxTokens: 4000, active: false },
  { id: "meta-llama/llama-3-70b-instruct",    vendor: "meta", displayName: "Llama 3 70B",    family: "llama-3", tier: "frontier", reasoning: false, maxTokens: 4000, active: false },

  // Mistral lineage
  { id: "mistralai/mistral-large-2411", vendor: "mistral", displayName: "Mistral Large 2411", family: "mistral-large", tier: "frontier", reasoning: false, maxTokens: 4000, active: true },
];
