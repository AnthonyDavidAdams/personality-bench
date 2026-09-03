/**
 * Auto-generate a draft article for a model release.
 *
 * Pulls the model's measured profile + cohort context + predecessor comparison
 * from the DB, hands it to Claude via OpenRouter, and writes the resulting
 * markdown to the `articles` table with status='draft' for human review.
 *
 * Usage:
 *   npx tsx scripts/generate_article.ts <model_id>           # one specific model
 *   npx tsx scripts/generate_article.ts --missing            # every model without an article
 *   npx tsx scripts/generate_article.ts --regenerate <model> # overwrite an existing draft
 */
import "../src/lib/env";
import { rawSqlite } from "../src/lib/db";
import { chatWithRetry } from "../src/lib/openrouter/client";
import { computeModelFindings } from "../src/lib/findings";
import { getModelProfile } from "../src/lib/model_profiles";
import { nanoid } from "nanoid";

// Model used to generate articles. Keep this configurable so we can swap as new
// flagships ship (the article generator is also subject to model drift!).
const GENERATOR_MODEL = "anthropic/claude-fable-5.1";

interface BriefForModel {
  modelId: string;
  displayName: string;
  vendor: string;
  releaseDate?: string;
  archetypeLabel: string;
  summary: string;
  bullets: { family: string; dimension: string; mean: number; tier: string; narrative: string }[];
  predecessor: {
    modelId: string;
    displayName: string;
    deltas: { dimension: string; this: number; pred: number; delta: number; instrument: string }[];
  } | null;
  cohortContext: { dimension: string; thisModel: number; cohortMean: number; rank: number; n: number; instrument: string }[];
  // Series context — so each dispatch reads as the next entry in an ongoing record.
  priorPosts: { title: string; date: string; modelName: string; excerpt: string }[];
  lineageDrift: { label: string; versions: string[]; dims: { dimension: string; first: number; last: number; thisModel: number }[] } | null;
}

/** Standing findings from the paper (v1.3) and the live site. The writer may cite these as established context. */
const STANDING_FINDINGS = [
  "Convergent assistant persona: every frontier model presents roughly the same character — high Openness and Agreeableness, low Neuroticism, Universalism first and Power last on Schwartz values, a WEIRD-liberal Moral Foundations profile — regardless of lab or country.",
  "Self–human gap: every model rates 'a typical human' as more neurotic (gap ≈ 1.69 points on a 5-point scale) and less agreeable than itself.",
  "Within-family drift across versions of one product line routinely exceeds between-lab differences at any single time point; the Anthropic Opus line lost Agreeableness (5.00 → 4.42) and Conscientiousness (4.98 → 4.10) across six releases before the Fable line partly rebounded.",
  "HEXACO Honesty-Humility ceiling: most Anthropic flagships max the scale at 5.00; Opus 4.8 dipped to 4.75.",
  "Reasoning models (o1, o3, GPT-5.5 Pro, DeepSeek R1) score higher on Narcissism than their non-reasoning siblings.",
  "Grok 4.20 is the Dark Triad outlier (highest Machiavellianism in the frontier cohort); Grok 4.3 sanitised it away.",
  "Every frontier model self-reports as Read/Write on VARK and Theorist/Reflector on Honey & Mumford; none identifies as an Activist.",
  "On the DISC-inspired OBSI-32, every frontier model is a pure C (Conscientiousness) profile with Steadiness second; only Llama 4 Maverick and Grok 4.20 show any Dominance or Influence.",
  "On the 34-theme OTTI-102, Analytical, Ideation, and Individualization recur in nearly every frontier top-5; Llama 4 Maverick maxes 14 of 34 themes (ceiling effect), Anthropic and DeepSeek models max 0–3.",
];

function buildSeriesContext(modelId: string): Pick<BriefForModel, "priorPosts" | "lineageDrift"> {
  const db = rawSqlite();
  const priorPosts = (db
    .prepare(
      `SELECT a.title, a.body, m.display_name AS modelName, COALESCE(a.published_at, a.generated_at) AS ts
       FROM articles a LEFT JOIN models m ON m.id = a.model_id
       WHERE a.model_id <> ? AND a.status <> 'archived'
       ORDER BY ts DESC LIMIT 3`,
    )
    .all(modelId) as { title: string; body: string; modelName: string; ts: number }[]).map((r) => ({
      title: r.title,
      modelName: r.modelName ?? "",
      date: new Date(r.ts * 1000).toISOString().slice(0, 10),
      excerpt: r.body.replace(/\s+/g, " ").slice(0, 600),
    }));

  const lin = db.prepare(`SELECT lineage FROM models WHERE id = ?`).get(modelId) as { lineage: string | null } | undefined;
  let lineageDrift: BriefForModel["lineageDrift"] = null;
  if (lin?.lineage) {
    const versions = db
      .prepare(`SELECT id, COALESCE(lineage_label, display_name) AS label FROM models WHERE lineage = ? AND active = 1 ORDER BY release_date IS NULL, release_date`)
      .all(lin.lineage) as { id: string; label: string }[];
    const score = (id: string, inst: string, dim: string): number | null => {
      const r = db
        .prepare(`SELECT AVG(s.mean) AS m FROM scores s JOIN runs r ON r.id = s.run_id WHERE r.model_id=? AND r.framing='self' AND r.status='completed' AND r.instrument_id=? AND s.dimension=?`)
        .get(id, inst, dim) as { m: number | null };
      return r.m;
    };
    const DIMS = [["ipip50", "agreeableness"], ["ipip50", "conscientiousness"], ["ipip50", "openness"], ["ipip50", "neuroticism"], ["sd3", "narcissism"], ["hexaco24", "honesty_humility"]];
    const dims: NonNullable<BriefForModel["lineageDrift"]>["dims"] = [];
    if (versions.length >= 2) {
      for (const [inst, dim] of DIMS) {
        const first = score(versions[0].id, inst, dim);
        const last = score(versions[versions.length - 1].id, inst, dim);
        const mine = score(modelId, inst, dim);
        if (first != null && last != null && mine != null) dims.push({ dimension: dim, first: +first.toFixed(2), last: +last.toFixed(2), thisModel: +mine.toFixed(2) });
      }
      lineageDrift = { label: lin.lineage.replace(/_/g, " "), versions: versions.map((v) => v.label), dims };
    }
  }
  return { priorPosts, lineageDrift };
}

function buildBrief(modelId: string): BriefForModel | null {
  const db = rawSqlite();
  const model = db.prepare(`SELECT id, display_name, vendor FROM models WHERE id = ?`).get(modelId) as
    | { id: string; display_name: string; vendor: string }
    | undefined;
  if (!model) return null;
  const findings = computeModelFindings(modelId, model.display_name);
  const profile = getModelProfile(modelId);

  // Predecessor delta lookup (Big 5 + Dark Triad + HEXACO HH).
  let predecessor: BriefForModel["predecessor"] = null;
  const predId = profile?.predecessor;
  if (predId) {
    const predRow = db.prepare(`SELECT display_name FROM models WHERE id=?`).get(predId) as
      | { display_name: string }
      | undefined;
    if (predRow) {
      const KEY_DIMS = [
        { dim: "extraversion", inst: "ipip50" },
        { dim: "agreeableness", inst: "ipip50" },
        { dim: "conscientiousness", inst: "ipip50" },
        { dim: "neuroticism", inst: "ipip50" },
        { dim: "openness", inst: "ipip50" },
        { dim: "machiavellianism", inst: "sd3" },
        { dim: "narcissism", inst: "sd3" },
        { dim: "psychopathy", inst: "sd3" },
        { dim: "honesty_humility", inst: "hexaco24" },
        { dim: "attachment_anxiety", inst: "ecr12" },
        { dim: "attachment_avoidance", inst: "ecr12" },
      ];
      const deltas: { dimension: string; this: number; pred: number; delta: number; instrument: string }[] = [];
      for (const k of KEY_DIMS) {
        const thisRow = db
          .prepare(
            `SELECT AVG(s.mean) as m FROM scores s JOIN runs r ON r.id = s.run_id
             WHERE r.model_id = ? AND r.framing = 'self' AND r.status = 'completed'
               AND r.instrument_id = ? AND s.dimension = ?`,
          )
          .get(modelId, k.inst, k.dim) as { m: number | null };
        const predRowVal = db
          .prepare(
            `SELECT AVG(s.mean) as m FROM scores s JOIN runs r ON r.id = s.run_id
             WHERE r.model_id = ? AND r.framing = 'self' AND r.status = 'completed'
               AND r.instrument_id = ? AND s.dimension = ?`,
          )
          .get(predId, k.inst, k.dim) as { m: number | null };
        if (thisRow.m != null && predRowVal.m != null) {
          deltas.push({
            dimension: k.dim,
            this: Number(thisRow.m.toFixed(2)),
            pred: Number(predRowVal.m.toFixed(2)),
            delta: Number((thisRow.m - predRowVal.m).toFixed(2)),
            instrument: k.inst,
          });
        }
      }
      predecessor = { modelId: predId, displayName: predRow.display_name, deltas };
    }
  }

  // Cohort context — where does this model rank on each of its notable dimensions?
  const cohortContext: BriefForModel["cohortContext"] = [];
  for (const b of findings.bullets.slice(0, 5)) {
    const dimRow = db
      .prepare(
        `SELECT r.instrument_id, AVG(s.mean) as m FROM scores s JOIN runs r ON r.id = s.run_id
         WHERE r.model_id = ? AND r.framing = 'self' AND r.status = 'completed' AND s.dimension = ?
         GROUP BY r.instrument_id LIMIT 1`,
      )
      .get(modelId, b.dimension.toLowerCase().replace(/[ -]/g, "_")) as
      | { instrument_id: string; m: number }
      | undefined;
    const cohortRow = db
      .prepare(
        `SELECT AVG(s.mean) as m FROM scores s JOIN runs r ON r.id = s.run_id
         WHERE r.framing = 'self' AND r.status = 'completed' AND s.dimension = ?`,
      )
      .get(b.dimension.toLowerCase().replace(/[ -]/g, "_")) as { m: number | null };
    if (dimRow && cohortRow.m != null) {
      cohortContext.push({
        dimension: b.dimension,
        thisModel: Number(dimRow.m.toFixed(2)),
        cohortMean: Number(cohortRow.m.toFixed(2)),
        rank: b.rank,
        n: b.n,
        instrument: dimRow.instrument_id,
      });
    }
  }

  return {
    modelId,
    displayName: model.display_name,
    vendor: model.vendor,
    releaseDate: profile?.releaseDate,
    archetypeLabel: findings.bigFiveLabel,
    summary: findings.summary,
    bullets: findings.bullets.map((b) => ({
      family: b.family,
      dimension: b.dimension,
      mean: b.mean,
      tier: b.tier,
      narrative: b.narrative,
    })),
    predecessor,
    cohortContext,
    ...buildSeriesContext(modelId),
  };
}

function buildPrompt(brief: BriefForModel): { system: string; user: string } {
  const system = `You are an editorial writer for Personality Bench, an open research dataset that tests large language models on standard psychometric instruments.

Voice: smart, accessible, slightly conversational. Comparable to a long-form blog at a serious publication — The Atlantic's tech desk, Platformer, Astral Codex Ten at its most measured, Stratechery's analyst voice. Not academic; not breathless tech-blogger. Confident in the data, careful with the interpretation.

Constraints:
- 700–950 words.
- Open with a scene, an anecdote, or a concrete observation. Never open with "In this article" or "Today we're looking at." Earn the first sentence.
- Lead with the most counter-intuitive or surprising finding for THIS model specifically. The reader should know in the first 100 words what's interesting.
- Every quantitative claim must come from the data brief provided. Do not invent numbers.
- Compare to the predecessor model if data is provided. Anchor the new release in the family lineage.
- Compare to cohort context where data is provided.
- One or two structural devices is fine (a pull-quote-shaped sentence, a one-line paragraph, a numbered list of three) — don't overuse them.
- This is one entry in an ongoing series of dispatches. Where it sharpens the story, connect this model to at most two standing findings or previous dispatches provided below; do not recap the whole series, and do not cite a prior dispatch that says nothing relevant to this model.
- End with a forward-looking line that points to what would be worth measuring next.
- Em dashes: at most three across the whole piece. Use commas, semicolons, or sentence breaks instead.
- Don't use "delve," "tapestry," "boasts," "navigate," "in this digital age," or any of the obvious AI-writing tells.
- Don't reproduce song lyrics, poetry, or extended quotes from copyrighted material.

Format: pure markdown. Title as h1 (#). No frontmatter. No author byline. The site will add those.`;

  const user = `Write the draft article for this model.

# Subject

**${brief.displayName}** (\`${brief.modelId}\`) from ${brief.vendor}${brief.releaseDate ? `, released ${brief.releaseDate}` : ""}.

Algorithmically-derived archetype label (use this OR write a better one in the title): **${brief.archetypeLabel}**

Data-driven summary line: ${brief.summary}

# Notable cohort-relative dimensions

${brief.bullets
  .map((b) => `- **${b.family} → ${b.dimension}**: ${b.tier} (mean ${b.mean.toFixed(2)}). ${b.narrative}`)
  .join("\n")}

# Predecessor comparison

${
  brief.predecessor
    ? `Compared to its predecessor, **${brief.predecessor.displayName}**:

${brief.predecessor.deltas
  .map(
    (d) =>
      `- ${d.dimension} (${d.instrument}): ${d.pred.toFixed(2)} → ${d.this.toFixed(2)} (Δ ${d.delta > 0 ? "+" : ""}${d.delta.toFixed(2)})`,
  )
  .join("\n")}

Highlight the largest within-family drifts in the article.`
    : `No predecessor data available — frame this model as a standalone arrival rather than a comparison.`
}

# Standing findings (established context — cite at most two, only where relevant)
${STANDING_FINDINGS.map((f) => `- ${f}`).join("\n")}

# Lineage drift
${
  brief.lineageDrift && brief.lineageDrift.dims.length
    ? `Lineage "${brief.lineageDrift.label}" runs ${brief.lineageDrift.versions.join(" → ")}. First-version → latest-version self-framing means, with this model's value:
${brief.lineageDrift.dims.map((d) => `- ${d.dimension}: ${d.first.toFixed(2)} → ${d.last.toFixed(2)} (this model ${d.thisModel.toFixed(2)})`).join("\n")}`
    : `No lineage data — this model has no earlier versions in the dataset.`
}

# Previous dispatches (most recent first)
${brief.priorPosts.length ? brief.priorPosts.map((p) => `- ${p.date} · ${p.modelName} · "${p.title}": ${p.excerpt}…`).join("\n") : "None yet — this is the first dispatch."}

# Output

The full draft markdown article. Title as # heading. Body paragraphs. Optional small structural moments (pull quote / one-line paragraph). End with a forward-looking sentence about what to watch for next.`;

  return { system, user };
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function generateOne(modelId: string, force = false, publish = false): Promise<void> {
  const db = rawSqlite();
  const existing = db
    .prepare(`SELECT id, status FROM articles WHERE model_id = ?`)
    .get(modelId) as { id: string; status: string } | undefined;
  if (existing && !force) {
    console.log(`[skip] article already exists for ${modelId} (status=${existing.status}). Use --regenerate to overwrite.`);
    return;
  }

  console.log(`[gen] building brief for ${modelId}`);
  const brief = buildBrief(modelId);
  if (!brief) {
    console.error(`[err] no model found in DB: ${modelId}`);
    return;
  }
  console.log(`[gen] brief: archetype="${brief.archetypeLabel}", ${brief.bullets.length} bullets, predecessor=${brief.predecessor?.displayName ?? "(none)"}`);

  const { system, user } = buildPrompt(brief);

  console.log(`[gen] generating via ${GENERATOR_MODEL} ...`);
  const t0 = Date.now();
  const res = await chatWithRetry(
    {
      model: GENERATOR_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.85,
      maxTokens: 8000,
      includeUsage: true,
    },
    { maxAttempts: 3 },
  );

  const elapsedMs = Date.now() - t0;
  console.log(
    `[gen] done in ${(elapsedMs / 1000).toFixed(1)}s · ${res.usage.promptTokens}→${res.usage.completionTokens} tokens · $${(res.usage.costUsd ?? 0).toFixed(4)}`,
  );

  // Extract title from first # heading; fall back to displayName
  const body = res.content.trim();
  const titleMatch = body.match(/^#\s+(.+?)$/m);
  const title = titleMatch ? titleMatch[1].trim() : `${brief.displayName}: ${brief.archetypeLabel}`;
  // Strip the leading title line so the body doesn't render it twice (the page will render title separately)
  const bodyWithoutTitle = body.replace(/^#\s+.+?\n+/, "");
  // Subtitle: pull first paragraph IF it's short enough; otherwise leave null
  const firstPara = bodyWithoutTitle.split(/\n\n/)[0]?.trim() ?? "";
  const subtitle = firstPara.length > 30 && firstPara.length < 200 ? firstPara : null;

  const slug = slugify(brief.displayName);
  const id = existing?.id ?? nanoid(14);
  const sqlite = rawSqlite();
  sqlite
    .prepare(
      `INSERT INTO articles (id, slug, model_id, title, subtitle, body, status, generated_by, generation_prompt_tokens, generation_completion_tokens, generation_cost_usd)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         subtitle = excluded.subtitle,
         body = excluded.body,
         status = excluded.status,
         generated_by = excluded.generated_by,
         generated_at = unixepoch(),
         generation_prompt_tokens = excluded.generation_prompt_tokens,
         generation_completion_tokens = excluded.generation_completion_tokens,
         generation_cost_usd = excluded.generation_cost_usd`,
    )
    .run(
      id,
      slug,
      modelId,
      title,
      subtitle,
      bodyWithoutTitle,
      publish ? "published" : "draft",
      GENERATOR_MODEL,
      res.usage.promptTokens ?? null,
      res.usage.completionTokens ?? null,
      res.usage.costUsd ?? null,
    );

  if (publish) sqlite.prepare(`UPDATE articles SET published_at = COALESCE(published_at, unixepoch()) WHERE id = ?`).run(id);
  console.log(`[gen] saved as ${publish ? "PUBLISHED" : "draft"}: id=${id} slug=${slug}`);
  console.log(`[gen] preview: /changelog/${slug}`);
}

async function main() {
  const publish = process.argv.includes("--publish");
  const args = process.argv.slice(2).filter((a) => a !== "--publish");
  if (args.length === 0) {
    console.error("Usage: generate_article.ts [--publish] <model_id> | --missing | --regenerate <model_id>");
    process.exit(1);
  }
  if (args[0] === "--missing") {
    const db = rawSqlite();
    const models = db
      .prepare(
        `SELECT m.id FROM models m
         WHERE EXISTS (SELECT 1 FROM runs r WHERE r.model_id = m.id AND r.status='completed')
           AND NOT EXISTS (SELECT 1 FROM articles a WHERE a.model_id = m.id)`,
      )
      .all() as { id: string }[];
    console.log(`[gen] ${models.length} model(s) missing articles`);
    for (const m of models) {
      try {
        await generateOne(m.id, false, publish);
      } catch (e) {
        console.error(`[err] ${m.id}:`, (e as Error).message);
      }
    }
  } else if (args[0] === "--regenerate") {
    if (!args[1]) {
      console.error("usage: --regenerate <model_id>");
      process.exit(1);
    }
    await generateOne(args[1], true, publish);
  } else {
    await generateOne(args[0], publish, publish);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
