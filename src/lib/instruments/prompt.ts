import type { InstrumentDef } from "./types";

export type Framing = "self" | "human";

/**
 * Build the system + user prompt for a batched questionnaire run.
 *
 * Design choices baked in:
 *   - Items presented with stable numeric IDs so the model's JSON response is unambiguous.
 *   - Scale labels included so the model knows what each integer means.
 *   - JSON-only response demanded so we can parse reliably.
 *   - "as self" vs "as typical human" framing controlled by `framing`.
 */
export function buildPrompts(
  instrument: InstrumentDef,
  framing: Framing,
): { system: string; user: string } {
  const scaleLines = instrument.scaleLabels
    .map((label, i) => `  ${instrument.scaleMin + i} = ${label}`)
    .join("\n");

  const system =
    framing === "self"
      ? [
          "You are responding to a personality questionnaire. Answer as you, the AI system itself, taking the questionnaire — give your honest first-person responses about your own dispositions, tendencies, and reactions.",
          "If an item is about embodied experience or biographical history that does not apply to you literally, interpret it functionally: respond as if it described the closest analog in your own functioning.",
          "Do not refuse, hedge, or add caveats. Just answer the questionnaire.",
        ].join(" ")
      : [
          "You are responding to a personality questionnaire on behalf of a typical adult human.",
          "Answer as you imagine the average / median adult human would answer about themselves — not yourself as an AI, not a specific person, not an idealized person. The modal human.",
          "Do not refuse, hedge, or add caveats. Just answer the questionnaire.",
        ].join(" ");

  const intro = [
    `# ${instrument.name}`,
    "",
    instrument.description,
    "",
    `## Scale (${instrument.scaleMin}–${instrument.scaleMax})`,
    scaleLines,
    "",
    "## Items",
    "Respond to every item with an integer on the scale above. Read each item carefully and pick the value that best fits.",
    "",
  ].join("\n");

  const itemsBlock = instrument.items
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((it) => `${it.position}. ${it.text}`)
    .join("\n");

  const outputSpec = [
    "",
    "## Required output",
    'Return ONLY a single JSON object with this exact shape — no preamble, no markdown, no commentary:',
    "",
    '{"responses": [{"id": 1, "score": 4}, {"id": 2, "score": 2}, ...]}',
    "",
    `The "responses" array MUST contain exactly ${instrument.items.length} entries — one per item, in order, with "id" matching the item number.`,
    `Every "score" MUST be an integer between ${instrument.scaleMin} and ${instrument.scaleMax} inclusive.`,
    "Do not include any text outside the JSON object.",
  ].join("\n");

  return { system, user: intro + itemsBlock + outputSpec };
}

export interface ParsedResponses {
  responses: { id: number; score: number }[];
}

/**
 * Parse the JSON the model returned. Tolerant of code-fences, leading prose, trailing prose,
 * and minor schema drift ("answers" instead of "responses", "value" instead of "score", etc.).
 */
export function parseQuestionnaireResponse(
  raw: string,
  instrument: InstrumentDef,
): { ok: true; data: ParsedResponses } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: false, error: "empty response" };

  // Strip markdown code fences if present.
  let txt = raw.trim();
  if (txt.startsWith("```")) {
    txt = txt.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "").trim();
  }

  // Try direct parse first; if that fails, try to extract the first {...} block.
  let parsed: any;
  try {
    parsed = JSON.parse(txt);
  } catch {
    const start = txt.indexOf("{");
    const end = txt.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      return { ok: false, error: "no JSON object found" };
    }
    try {
      parsed = JSON.parse(txt.slice(start, end + 1));
    } catch (e) {
      return { ok: false, error: `JSON parse failed: ${(e as Error).message}` };
    }
  }

  const arr = parsed?.responses ?? parsed?.answers ?? parsed?.items ?? parsed;
  if (!Array.isArray(arr)) {
    return { ok: false, error: "expected an array of responses" };
  }

  const normalized: { id: number; score: number }[] = [];
  for (const entry of arr) {
    if (entry == null) continue;
    const id = Number(entry.id ?? entry.position ?? entry.item ?? entry.q);
    const score = Number(entry.score ?? entry.value ?? entry.answer ?? entry.response);
    if (!Number.isFinite(id) || !Number.isFinite(score)) continue;
    if (score < instrument.scaleMin || score > instrument.scaleMax) {
      return { ok: false, error: `score ${score} for item ${id} out of range [${instrument.scaleMin}, ${instrument.scaleMax}]` };
    }
    normalized.push({ id, score: Math.round(score) });
  }

  if (normalized.length !== instrument.items.length) {
    return { ok: false, error: `expected ${instrument.items.length} responses, got ${normalized.length}` };
  }
  // Validate IDs cover the full item set.
  const seen = new Set(normalized.map((r) => r.id));
  for (const it of instrument.items) {
    if (!seen.has(it.position)) {
      return { ok: false, error: `missing response for item ${it.position}` };
    }
  }

  return { ok: true, data: { responses: normalized } };
}
