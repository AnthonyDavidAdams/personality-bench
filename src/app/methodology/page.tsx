import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Methodology",
  description:
    "How Personality Bench administered 14 standard psychometric inventories to 31 frontier LLMs under two framings — answering as itself and as a typical human — via OpenRouter, with the full reproducibility chain from instrument JSON to billed-cost ledger.",
  path: "/methodology",
});

export default function Methodology() {
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
          Thirteen standard psychometric inventories spanning trait, motivational, moral, attachment,
          cognitive, clinical-adjacent, and learning-styles constructs. We use public-domain or
          research-permitted item sets exclusively. The Enneagram screening inventory was constructed for
          this study; all others use published items adapted to a Likert format where needed.
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
          <li>7 cutting-edge models (one per major lab) × 14 instruments × 2 framings × 5 runs = 980 frontier cells (N=5)</li>
          <li>14 historical models × 14 instruments × 2 framings × 3 runs = 1,176 historical cells (N=3) for cross-version drift</li>
          <li>2,145 total completed runs across the 21 models · 64,308 individual item responses</li>
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
