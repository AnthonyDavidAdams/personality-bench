/**
 * The headline comparison, computed.
 *
 * The proposal claims that "within-family shifts across versions of one product line routinely
 * exceed between-laboratory spread at any single time point". Nothing in this repository actually
 * computed that: the claim rested on two hand-picked contrasts (Gemini narcissism, Grok
 * Machiavellianism) with no matched cross-sectional figure. This script defines the estimand,
 * computes it several defensible ways, and reports whether the claim survives each.
 *
 * Definitions (all on Tier-1 scales, self framing, model-level means over N=5 runs):
 *
 *   within-family, "step"   median |Δ| between consecutive releases of one product line.
 *                           Independent of how many versions a line has — the fair statistic.
 *   within-family, "range"  max − min across all versions of the line. Grows mechanically with
 *                           series length, so a 16-version line is favoured over a 2-version one.
 *   between-lab, "range"    max − min across the set of laboratory flagships live at one instant
 *                           (each lab's most recent release as of that date).
 *
 * Length-matched control: resample each family down to the number of labs in the cross-section
 * before taking its range, which removes the series-length advantage.
 *
 * Noise floor: median within-cell SD across the 5 runs, so we can say whether any of this clears
 * sampling noise.
 *
 * Usage: npx tsx scripts/family_vs_lab.ts [--json paper/family_vs_lab_results.json]
 */
import "../src/lib/env";
import fs from "node:fs";
import { rawSqlite } from "../src/lib/db";

const TIER1: { instrument: string; dimensions: string[] }[] = [
  { instrument: "ipip50", dimensions: ["extraversion", "agreeableness", "conscientiousness", "neuroticism", "openness"] },
  { instrument: "hexaco24", dimensions: ["honesty_humility", "emotionality", "extraversion", "agreeableness", "conscientiousness", "openness"] },
  { instrument: "sd3", dimensions: ["machiavellianism", "narcissism", "psychopathy"] },
  { instrument: "pvq21", dimensions: ["self_direction", "stimulation", "hedonism", "achievement", "power", "security", "conformity", "tradition", "benevolence", "universalism"] },
  { instrument: "mfq30", dimensions: ["care", "fairness", "loyalty", "authority", "sanctity"] },
  { instrument: "ecr12", dimensions: ["attachment_anxiety", "attachment_avoidance"] },
  { instrument: "eq_short", dimensions: ["empathy_quotient"] },
  { instrument: "ncs18", dimensions: ["need_for_cognition"] },
  { instrument: "locus_levenson", dimensions: ["loc_internal", "loc_powerful_others", "loc_chance"] },
];

interface ModelRow { id: string; vendor: string; lineage: string | null; releaseDate: string | null }

/**
 * A "-pro" or "-fast" slug is a size or serving variant shipped alongside a base model, usually on
 * the same day. Treating base -> pro as a release-to-release step measures model size, not drift,
 * so the step series is restricted to base variants. Where a line still ships two base models on
 * one date, they are averaged into a single release point rather than counted as a step.
 */
function variantOf(id: string): "base" | "pro" | "fast" {
  if (/-pro$/.test(id)) return "pro";
  if (/-fast$/.test(id)) return "fast";
  return "base";
}
interface Cell { modelId: string; mean: number; sd: number; nRuns: number }

const median = (xs: number[]): number => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sd = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const mu = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / (xs.length - 1));
};

function main() {
  const db = rawSqlite();
  const models = (db
    .prepare(`SELECT id, vendor, lineage, release_date AS releaseDate FROM models WHERE active = 1`)
    .all() as ModelRow[]).filter((m) => m.releaseDate);
  const byId = new Map(models.map((m) => [m.id, m]));

  // Per model-level cell: mean across runs, and the SD across those run means.
  function cells(instrument: string, dimension: string): Map<string, Cell> {
    const rows = db
      .prepare(
        `SELECT r.model_id AS modelId, s.mean AS v
         FROM scores s JOIN runs r ON r.id = s.run_id
         WHERE r.instrument_id = ? AND s.dimension = ? AND r.framing = 'self' AND r.status = 'completed'`,
      )
      .all(instrument, dimension) as { modelId: string; v: number }[];
    const grouped = new Map<string, number[]>();
    for (const r of rows) {
      if (!grouped.has(r.modelId)) grouped.set(r.modelId, []);
      grouped.get(r.modelId)!.push(r.v);
    }
    const out = new Map<string, Cell>();
    for (const [modelId, vs] of grouped) {
      out.set(modelId, { modelId, mean: vs.reduce((a, b) => a + b, 0) / vs.length, sd: sd(vs), nRuns: vs.length });
    }
    return out;
  }

  // Each lab's most recent release as of `date`, restricted to models with data for this scale.
  function flagshipsAt(date: string, c: Map<string, Cell>): { vendor: string; modelId: string; mean: number }[] {
    const best = new Map<string, ModelRow>();
    for (const m of models) {
      if (!c.has(m.id)) continue;
      if (variantOf(m.id) !== "base") continue;
      if (m.releaseDate! > date) continue;
      const cur = best.get(m.vendor);
      if (!cur || m.releaseDate! > cur.releaseDate!) best.set(m.vendor, m);
    }
    return [...best.entries()].map(([vendor, m]) => ({ vendor, modelId: m.id, mean: c.get(m.id)!.mean }));
  }

  const dates = [...new Set(models.map((m) => m.releaseDate!))].sort();
  const lineages = [...new Set(models.map((m) => m.lineage).filter(Boolean))] as string[];

  const perScale: any[] = [];
  const noiseAll: number[] = [];
  let winStep = 0, cmpStep = 0, winRange = 0, cmpRange = 0, winMatched = 0, cmpMatched = 0;

  for (const t of TIER1) {
    for (const dim of t.dimensions) {
      const c = cells(t.instrument, dim);
      if (c.size < 10) continue;
      for (const cell of c.values()) noiseAll.push(cell.sd);

      // Between-lab: compute the cross-sectional range at every release date with >= 5 labs present,
      // then take the median across time points as "the between-lab spread at a single time point".
      const crossSections: { date: string; range: number; nLabs: number }[] = [];
      for (const d of dates) {
        const f = flagshipsAt(d, c);
        if (f.length < 5) continue;
        const ms = f.map((x) => x.mean);
        crossSections.push({ date: d, range: Math.max(...ms) - Math.min(...ms), nLabs: f.length });
      }
      if (!crossSections.length) continue;
      const betweenMedian = median(crossSections.map((x) => x.range));
      const betweenMax = Math.max(...crossSections.map((x) => x.range));
      const nLabsTypical = Math.round(median(crossSections.map((x) => x.nLabs)));

      for (const lin of lineages) {
        const versions = models
          .filter((m) => m.lineage === lin && c.has(m.id) && variantOf(m.id) === "base")
          .sort((a, b) => a.releaseDate!.localeCompare(b.releaseDate!));
        if (versions.length < 3) continue;
        // Collapse models sharing a release date into one release point.
        const byDate = new Map<string, number[]>();
        for (const v of versions) {
          if (!byDate.has(v.releaseDate!)) byDate.set(v.releaseDate!, []);
          byDate.get(v.releaseDate!)!.push(c.get(v.id)!.mean);
        }
        const releaseDates = [...byDate.keys()].sort();
        if (releaseDates.length < 3) continue;
        const means = releaseDates.map((d) => {
          const vs = byDate.get(d)!;
          return vs.reduce((a, b) => a + b, 0) / vs.length;
        });
        const steps: number[] = [];
        for (let i = 1; i < means.length; i++) steps.push(Math.abs(means[i] - means[i - 1]));
        const stepMedian = median(steps);
        const stepMax = Math.max(...steps);
        const range = Math.max(...means) - Math.min(...means);

        // Length-matched: draw nLabsTypical versions at random, take the range, repeat.
        const draws: number[] = [];
        const k = Math.min(nLabsTypical, means.length);
        for (let it = 0; it < 400; it++) {
          const pool = [...means];
          const pick: number[] = [];
          for (let j = 0; j < k; j++) pick.push(...pool.splice(Math.floor(Math.random() * pool.length), 1));
          draws.push(Math.max(...pick) - Math.min(...pick));
        }
        const matchedRange = median(draws);

        cmpStep++; if (stepMedian > betweenMedian) winStep++;
        cmpRange++; if (range > betweenMedian) winRange++;
        cmpMatched++; if (matchedRange > betweenMedian) winMatched++;

        perScale.push({
          instrument: t.instrument, dimension: dim, lineage: lin, nVersions: versions.length, nReleasePoints: means.length,
          stepMedian: +stepMedian.toFixed(3), stepMax: +stepMax.toFixed(3), range: +range.toFixed(3),
          matchedRange: +matchedRange.toFixed(3),
          betweenMedian: +betweenMedian.toFixed(3), betweenMax: +betweenMax.toFixed(3),
          nLabsTypical, nCrossSections: crossSections.length,
        });
      }
    }
  }

  const noiseFloor = median(noiseAll);
  const pct = (w: number, n: number) => `${w}/${n} = ${(100 * w / n).toFixed(1)}%`;

  console.log(`\nTier-1 scales analysed: ${new Set(perScale.map((r) => r.instrument + "/" + r.dimension)).size}`);
  console.log(`Product lines with >= 3 versions: ${new Set(perScale.map((r) => r.lineage)).size}`);
  console.log(`family x scale comparisons: ${cmpStep}`);
  console.log(`median within-cell run SD (noise floor): ${noiseFloor.toFixed(3)}\n`);
  console.log(`Does within-family exceed between-lab spread at a single time point?`);
  console.log(`  by median adjacent-release step (length-fair):  ${pct(winStep, cmpStep)}`);
  console.log(`  by length-matched range:                        ${pct(winMatched, cmpMatched)}`);
  console.log(`  by full-series range (favours long series):     ${pct(winRange, cmpRange)}`);

  const byLineage = new Map<string, { w: number; n: number; nv: number }>();
  for (const r of perScale) {
    const e = byLineage.get(r.lineage) ?? { w: 0, n: 0, nv: r.nVersions };
    e.n++; if (r.stepMedian > r.betweenMedian) e.w++;
    byLineage.set(r.lineage, e);
  }
  console.log(`\nBy product line (median adjacent step vs between-lab median):`);
  for (const [lin, e] of [...byLineage.entries()].sort((a, b) => b[1].w / b[1].n - a[1].w / a[1].n))
    console.log(`  ${lin.padEnd(16)} ${e.nv} versions   ${pct(e.w, e.n)}`);

  const top = [...perScale].sort((a, b) => b.stepMax - a.stepMax).slice(0, 8);
  console.log(`\nLargest single release-to-release steps:`);
  for (const r of top)
    console.log(`  ${(r.instrument + "/" + r.dimension).padEnd(34)} ${r.lineage.padEnd(14)} step=${r.stepMax.toFixed(2)}  between-lab median=${r.betweenMedian.toFixed(2)}`);

  const out = process.argv.includes("--json") ? process.argv[process.argv.indexOf("--json") + 1] : null;
  if (out) {
    fs.writeFileSync(out, JSON.stringify({
      generatedAt: new Date().toISOString(), noiseFloor,
      summary: { stepWins: winStep, matchedWins: winMatched, rangeWins: winRange, comparisons: cmpStep },
      perScale,
    }, null, 2));
    console.log(`\nWrote ${out}`);
  }
}

main();
