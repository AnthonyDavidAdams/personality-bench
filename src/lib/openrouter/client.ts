/**
 * OpenRouter client tuned for batched Likert questionnaires.
 *
 * Three things matter here:
 *   1. Reliable structured-output (JSON) responses
 *   2. Capturing authoritative cost via /generation
 *   3. Recording reasoning tokens for thinking models
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  seed?: number;
  maxTokens?: number;
  responseFormat?: "json_object" | "text";
  reasoning?: {
    effort?: "low" | "medium" | "high";
    maxTokens?: number;
    exclude?: boolean;
  };
  /** Limit which inference providers OpenRouter routes to (e.g. exclude high-cost or unstable ones). */
  provider?: { order?: string[]; allowFallbacks?: boolean };
  /** Force usage accounting in the response. */
  includeUsage?: boolean;
}

export interface UsageDetails {
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  totalTokens?: number;
  /** Authoritative cost from OpenRouter (USD), if returned in chat response. */
  costUsd?: number;
}

export interface ChatResult {
  id: string;                          // OpenRouter generation id (for /generation lookup)
  model: string;                       // model slug actually used
  provider?: string;                   // upstream provider name
  finishReason?: string;
  content: string;                     // assistant message text
  usage: UsageDetails;
  raw: unknown;                        // full raw response, kept for debugging
  latencyMs: number;
}

export class OpenRouterError extends Error {
  status?: number;
  body?: unknown;
  retryable: boolean;
  constructor(message: string, opts: { status?: number; body?: unknown; retryable?: boolean } = {}) {
    super(message);
    this.name = "OpenRouterError";
    this.status = opts.status;
    this.body = opts.body;
    this.retryable = opts.retryable ?? false;
  }
}

function getApiKey(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not set. Add it to .env.local (or your Railway env vars).",
    );
  }
  return key;
}

function commonHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${getApiKey()}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://personality-bench.local",
    "X-Title": process.env.OPENROUTER_TITLE ?? "Personality Bench",
  };
}

export async function chat(req: ChatRequest): Promise<ChatResult> {
  const body: Record<string, unknown> = {
    model: req.model,
    messages: req.messages,
  };
  if (req.temperature !== undefined) body.temperature = req.temperature;
  if (req.topP !== undefined) body.top_p = req.topP;
  if (req.seed !== undefined) body.seed = req.seed;
  if (req.maxTokens !== undefined) body.max_tokens = req.maxTokens;
  if (req.responseFormat === "json_object") {
    body.response_format = { type: "json_object" };
  }
  if (req.reasoning) {
    const r: Record<string, unknown> = {};
    if (req.reasoning.effort) r.effort = req.reasoning.effort;
    if (req.reasoning.maxTokens !== undefined) r.max_tokens = req.reasoning.maxTokens;
    if (req.reasoning.exclude !== undefined) r.exclude = req.reasoning.exclude;
    body.reasoning = r;
  }
  if (req.provider) {
    body.provider = {
      order: req.provider.order,
      allow_fallbacks: req.provider.allowFallbacks,
    };
  }
  // Ask OpenRouter to include usage + cost in the response payload itself.
  body.usage = { include: req.includeUsage ?? true };

  const start = Date.now();
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: "POST",
    headers: commonHeaders(),
    body: JSON.stringify(body),
  });
  const latencyMs = Date.now() - start;

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    const retryable = res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504;
    throw new OpenRouterError(`OpenRouter ${res.status}: ${txt.slice(0, 500)}`, {
      status: res.status,
      body: txt,
      retryable,
    });
  }

  const data = (await res.json()) as any;
  const choice = data.choices?.[0];
  const message = choice?.message;
  // Some reasoning models return reasoning content separately; we keep visible content as `.content`.
  const content: string = typeof message?.content === "string"
    ? message.content
    : Array.isArray(message?.content)
      ? message.content.map((c: any) => c.text ?? "").join("")
      : "";

  const u = data.usage ?? {};
  const usage: UsageDetails = {
    promptTokens: u.prompt_tokens,
    completionTokens: u.completion_tokens,
    reasoningTokens:
      u.completion_tokens_details?.reasoning_tokens ??
      u.reasoning_tokens ??
      undefined,
    cachedTokens:
      u.prompt_tokens_details?.cached_tokens ??
      u.cached_tokens ??
      undefined,
    totalTokens: u.total_tokens,
    costUsd: u.cost ?? u.total_cost ?? undefined,
  };

  return {
    id: data.id,
    model: data.model ?? req.model,
    provider: data.provider,
    finishReason: choice?.finish_reason,
    content,
    usage,
    raw: data,
    latencyMs,
  };
}

/**
 * Fetch authoritative cost + provider details for a generation by id.
 * Cheaper than relying on chat response (which not all models populate fully).
 * Note: OpenRouter populates /generation a few seconds after the chat call returns.
 */
export async function getGeneration(id: string): Promise<{
  costUsd?: number;
  provider?: string;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  raw: unknown;
} | null> {
  const res = await fetch(`${OPENROUTER_BASE}/generation?id=${encodeURIComponent(id)}`, {
    method: "GET",
    headers: commonHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new OpenRouterError(`OpenRouter /generation ${res.status}: ${txt.slice(0, 300)}`, { status: res.status });
  }
  const json = (await res.json()) as any;
  const g = json.data ?? json;
  return {
    costUsd: g.total_cost ?? g.cost,
    provider: g.provider_name ?? g.provider,
    promptTokens: g.tokens_prompt ?? g.native_tokens_prompt,
    completionTokens: g.tokens_completion ?? g.native_tokens_completion,
    reasoningTokens: g.tokens_reasoning ?? g.native_tokens_reasoning,
    cachedTokens: g.tokens_cached ?? g.native_tokens_cached,
    raw: g,
  };
}

export interface ModelInfo {
  id: string;
  name: string;
  contextLength?: number;
  pricing: {
    prompt?: number;          // USD per token (OpenRouter returns per-token, we'll convert to per-1M)
    completion?: number;
    request?: number;
    image?: number;
    internalReasoning?: number;
    inputCacheRead?: number;
    inputCacheWrite?: number;
  };
  topProvider?: { contextLength?: number; maxCompletionTokens?: number };
  architecture?: { modality?: string; tokenizer?: string };
  raw: unknown;
}

export async function listModels(): Promise<ModelInfo[]> {
  const res = await fetch(`${OPENROUTER_BASE}/models`, { headers: commonHeaders() });
  if (!res.ok) throw new OpenRouterError(`OpenRouter /models ${res.status}`);
  const json = (await res.json()) as any;
  const out: ModelInfo[] = [];
  for (const m of json.data ?? []) {
    out.push({
      id: m.id,
      name: m.name ?? m.id,
      contextLength: m.context_length,
      pricing: {
        prompt: m.pricing?.prompt !== undefined ? Number(m.pricing.prompt) : undefined,
        completion: m.pricing?.completion !== undefined ? Number(m.pricing.completion) : undefined,
        request: m.pricing?.request !== undefined ? Number(m.pricing.request) : undefined,
        image: m.pricing?.image !== undefined ? Number(m.pricing.image) : undefined,
        internalReasoning:
          m.pricing?.internal_reasoning !== undefined ? Number(m.pricing.internal_reasoning) : undefined,
        inputCacheRead:
          m.pricing?.input_cache_read !== undefined ? Number(m.pricing.input_cache_read) : undefined,
        inputCacheWrite:
          m.pricing?.input_cache_write !== undefined ? Number(m.pricing.input_cache_write) : undefined,
      },
      topProvider: m.top_provider,
      architecture: m.architecture,
      raw: m,
    });
  }
  return out;
}

/** Retry a chat call with exponential backoff on retryable errors. */
export async function chatWithRetry(
  req: ChatRequest,
  opts: { maxAttempts?: number; baseDelayMs?: number } = {},
): Promise<ChatResult> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1500;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await chat(req);
    } catch (e) {
      lastErr = e;
      if (!(e instanceof OpenRouterError) || !e.retryable || attempt === maxAttempts) {
        throw e;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
