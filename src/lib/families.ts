/**
 * Family lineage definitions — chronological ordering of model versions
 * for the cross-version drift analysis.
 */

export interface FamilyLineage {
  id: string;                       // 'claude-4', 'gpt-5', etc.
  label: string;                    // human-readable family name
  vendor: string;
  versions: { modelId: string; label: string; releaseDate?: string }[];
}

export const FAMILIES: FamilyLineage[] = [
  {
    id: "claude_opus",
    label: "Anthropic Claude Opus",
    vendor: "anthropic",
    versions: [
      { modelId: "anthropic/claude-opus-4",   label: "Opus 4",   releaseDate: "2025-05-22" },
      { modelId: "anthropic/claude-opus-4.1", label: "Opus 4.1", releaseDate: "2025-08-05" },
      { modelId: "anthropic/claude-opus-4.5", label: "Opus 4.5", releaseDate: "2025-11-24" },
      { modelId: "anthropic/claude-opus-4.6", label: "Opus 4.6", releaseDate: "2026-01-15" },
      { modelId: "anthropic/claude-opus-4.7", label: "Opus 4.7", releaseDate: "2026-03-15" },
      { modelId: "anthropic/claude-opus-4.8", label: "Opus 4.8", releaseDate: "2026-05-15" },
      { modelId: "anthropic/claude-fable-5",  label: "Fable 5",  releaseDate: "2026-06-09" },
      { modelId: "anthropic/claude-fable-5.1", label: "Fable 5.1", releaseDate: "2026-09-01" },
    ],
  },
  {
    id: "claude_sonnet",
    label: "Anthropic Claude Sonnet",
    vendor: "anthropic",
    versions: [
      { modelId: "anthropic/claude-sonnet-4",   label: "Sonnet 4",   releaseDate: "2025-05-22" },
      { modelId: "anthropic/claude-sonnet-4.5", label: "Sonnet 4.5", releaseDate: "2025-11-24" },
      { modelId: "anthropic/claude-sonnet-4.6", label: "Sonnet 4.6", releaseDate: "2026-03-15" },
    ],
  },
  {
    id: "gpt",
    label: "OpenAI GPT (base)",
    vendor: "openai",
    versions: [
      { modelId: "openai/gpt-4-turbo", label: "GPT-4 Turbo", releaseDate: "2024-04-09" },
      { modelId: "openai/gpt-4o",      label: "GPT-4o",      releaseDate: "2024-05-13" },
      { modelId: "openai/gpt-5",       label: "GPT-5",       releaseDate: "2025-08-07" },
      { modelId: "openai/gpt-5.1",     label: "GPT-5.1",     releaseDate: "2025-11-12" },
      { modelId: "openai/gpt-5.2",     label: "GPT-5.2",     releaseDate: "2025-12-18" },
      { modelId: "openai/gpt-5.4",     label: "GPT-5.4",     releaseDate: "2026-03-10" },
      { modelId: "openai/gpt-5.5",     label: "GPT-5.5",     releaseDate: "2026-05-01" },
    ],
  },
  {
    id: "o-series",
    label: "OpenAI o-series (reasoning)",
    vendor: "openai",
    versions: [
      { modelId: "openai/o1", label: "o1", releaseDate: "2024-12-05" },
      { modelId: "openai/o3", label: "o3", releaseDate: "2025-04-16" },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    vendor: "deepseek",
    versions: [
      { modelId: "deepseek/deepseek-chat",     label: "Chat V3",   releaseDate: "2024-12-26" },
      { modelId: "deepseek/deepseek-r1",       label: "R1",        releaseDate: "2025-01-20" },
      { modelId: "deepseek/deepseek-r1-0528",  label: "R1 (0528)", releaseDate: "2025-05-28" },
    ],
  },
  {
    id: "llama",
    label: "Meta Llama",
    vendor: "meta",
    versions: [
      { modelId: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", releaseDate: "2024-12-06" },
      { modelId: "meta-llama/llama-4-maverick",       label: "Llama 4 Maverick", releaseDate: "2025-04-05" },
    ],
  },
  {
    id: "mistral",
    label: "Mistral Large",
    vendor: "mistral",
    versions: [
      { modelId: "mistralai/mistral-large-2411", label: "Large 2411", releaseDate: "2024-11-18" },
      { modelId: "mistralai/mistral-large-2512", label: "Large 2512", releaseDate: "2025-12-09" },
    ],
  },
];

export function getFamilyForModel(modelId: string): FamilyLineage | undefined {
  return FAMILIES.find((f) => f.versions.some((v) => v.modelId === modelId));
}
