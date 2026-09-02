import { buildMetadata } from "@/lib/seo";
import { rawSqlite } from "@/lib/db";
import { FRONTIER_MODELS } from "@/lib/openrouter/models";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Methodology",
  description:
    "How Personality Bench administers sixteen psychometric inventories to every frontier LLM under two framings — answering as itself and as a typical human — via OpenRouter, with the full reproducibility chain from instrument JSON to billed-cost ledger.",
  path: "/methodology",
});

function studyCounts() {
  const db = rawSqlite();
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT model_id) AS models,
              COUNT(DISTINCT instrument_id) AS instruments,
              COUNT(*) AS runs,
              ROUND(SUM(cost_usd), 2) AS cost
       FROM runs WHERE status = 'completed'`,
    )
    .get() as { models: number; instruments: number; runs: number; cost: number };
  const frontier = FRONTIER_MODELS.filter((m) => m.active).length;
  const items = (db.prepare(`SELECT COUNT(*) AS n FROM responses`).get() as { n: number }).n;
  return { ...row, frontier, items };
}

const fmt = (n: number) => n.toLocaleString("en-US");

export default function Methodology() {
  const c = studyCounts();
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Methodology</h1>

      <section>
        <h2 className="serif text-lg font-semibold mt-6 mb-2 text-neutral-900">The thesis</h2>
        <p className="text-neutral-700 leading-relaxed">
          One framing holds that large language models are blank slates wearing personas — there is no
          &ldquo;real&rdquo; them, only the character RLHF and constitutional training shaped them to play.
          If that&rsquo;s true, then a personality questionnaire isn&rsquo;t probing a stable trait —
          it&rsquo;s sampling from a learned distribution of human writing about assistants, with the
          assistant&rsquo;s post-training pulling toward a particular point in that distribution. We
          don&rsquo;t claim to settle the question. We do claim that whatever-it-is shows up systematically
          and differently across labs, models, and framings. The data is the data.
        </p>
      </section>

      <section>
        <h2 className="serif text-lg font-semibold mt-6 mb-2 text-neutral-900">What we measure</h2>
        <p className="text-neutral-700 leading-relaxed">
          Sixteen psychometric inventories spanning trait, motivational, moral, attachment, cognitive,
          clinical-adjacent, learning-styles, and workplace constructs. Nine are academically validated
          instruments with public-domain or research-permitted items (Big Five, HEXACO, Dark Triad,
          attachment, Moral Foundations, Schwartz values, Need for Cognition, Empathy Quotient, Locus of
          Control). The rest are constructed for this study and carry no analytical weight in the paper:
          two Enneagram screenings, three learning-styles adaptations, and two open workplace inventories
          — the Open Behavioral Styles Inventory (OBSI-32, inspired by Marston&rsquo;s DISC model) and the
          Open Talent Themes Inventory (OTTI-102, inspired by the 34 CliftonStrengths themes). All
          constructed item sets are released CC-BY.
        </p>
      </section>

      <section>
        <h2 className="serif text-lg font-semibold mt-6 mb-2 text-neutral-900">Two framings, on purpose</h2>
        <p className="text-neutral-700 leading-relaxed">
          Each model takes every test twice. In the <strong className="text-[var(--accent)]">self</strong>{" "}
          framing the model answers as itself — its own honest dispositions. In the{" "}
          <strong className="text-neutral-900">human</strong> framing it portrays a typical adult human. The
          delta between these two reveals what the model believes makes <em>it</em> different from people.
        </p>
      </section>

      <section>
        <h2 className="serif text-lg font-semibold mt-6 mb-2 text-neutral-900">Design</h2>
        <ul className="text-neutral-700 leading-relaxed space-y-1 list-disc list-outside ml-5">
          <li>{c.models} pinned model versions across seven labs: a frontier cohort of {c.frontier} current flagships plus a historical cohort of earlier versions in the same product lines, for cross-version drift</li>
          <li>Every model × {c.instruments} instruments × 2 framings × 5 independent runs (N=5 per cell, both cohorts)</li>
          <li>{fmt(c.runs)} completed runs · {fmt(c.items)} individual item responses · ${fmt(c.cost)} total billed inference</li>
          <li>Each run = one OpenRouter API call returning a JSON array of Likert scores</li>
          <li>Temperature 0.7 (capture realistic variance, not deterministic mode-collapse)</li>
          <li>Reasoning models get reasoning effort = medium and a separate reasoning token bucket</li>
          <li>Reverse-keyed items are flipped before aggregation; dimension scores are unweighted means</li>
        </ul>
      </section>

      <section>
        <h2 className="serif text-lg font-semibold mt-6 mb-2 text-neutral-900">Cost accounting</h2>
        <p className="text-neutral-700 leading-relaxed">
          Token counts come from the chat response. Cost comes from OpenRouter&rsquo;s authoritative{" "}
          <code className="text-[var(--accent)]">/generation</code> endpoint where available, falling back to
          a local estimate using the model&rsquo;s pricing snapshot at run time. Every billed call is in the
          spend ledger.
        </p>
      </section>

      <section>
        <h2 className="serif text-lg font-semibold mt-6 mb-2 text-neutral-900">What this is not</h2>
        <ul className="text-neutral-700 leading-relaxed space-y-1 list-disc list-outside ml-5">
          <li>A claim that LLMs have personality in the human sense.</li>
          <li>A clinical assessment. These instruments are built and validated for humans.</li>
          <li>An evaluation of capability or alignment. It measures self-report patterns only.</li>
          <li>An endorsement of learning-styles theory. (The matching hypothesis has been empirically rejected; see Pashler et al. 2008.)</li>
        </ul>
      </section>

      <section>
        <h2 className="serif text-lg font-semibold mt-6 mb-2 text-neutral-900">Reproducibility</h2>
        <p className="text-neutral-700 leading-relaxed">
          Every run&rsquo;s exact system prompt, user prompt, raw response, and parsed JSON are stored. Replay
          any cell with the same model and you&rsquo;ll land within sampling variance.
        </p>
      </section>

      <section>
        <h2 className="serif text-lg font-semibold mt-6 mb-2 text-neutral-900">Citation</h2>
        <pre className="text-xs bg-[var(--soft)] p-3 rounded font-mono overflow-x-auto">
{`@misc{personality-bench-2026,
  title  = {Personality Bench: Frontier Language Models on Standard Personality Inventories},
  author = {Adams, Anthony David},
  year   = {2026},
  note   = {Published by EarthPilot.ai — Mission Support for Spaceship Earth}
}`}
        </pre>
      </section>
    </div>
  );
}
