import Link from "next/link";
import Image from "next/image";
import {
  getSpendSummary,
  listInstrumentsForUi,
  listModelsForUi,
} from "@/lib/queries";
import { SubscribeBlock } from "@/components/SubscribeBlock";
import { RequestBlock } from "@/components/RequestBlock";
import { colorForModel } from "@/components/RadarChart";

export const dynamic = "force-dynamic";

function fmtUsd(n: number) {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}
function fmtInt(n: number) {
  return n.toLocaleString();
}

interface Finding {
  eyebrow: string;
  headline: string;
  blurb: string;
  href: string;
  cite?: string;
  art: string;
  artAlt: string;
}

const FINDINGS: Finding[] = [
  {
    eyebrow: "Self vs. human",
    headline: "Every frontier AI thinks you're a mess.",
    blurb:
      "Asked to answer as a typical human, every cutting-edge model rated us markedly more neurotic, less open, less agreeable and less conscientious than they rated themselves. The gap on Neuroticism alone is 1.69 points on a 5-point scale.",
    href: "/instruments/ipip50",
    cite: "Big 5 · IPIP-50",
    art: "/art/finding_human_mess.png",
    artAlt: "A diptych contrasting a composed profile with a fraying one — the AI's view of itself vs. its view of you.",
  },
  {
    eyebrow: "Convergence",
    headline: "Seven labs, one assistant.",
    blurb:
      "Anthropic, OpenAI, Google, xAI, DeepSeek, Meta and Mistral disagree about nearly everything in AI. On personality tests they answer in unison: high openness, low Dark Triad, Universalism on top, Power dead last in every single model.",
    href: "/methodology",
    cite: "Schwartz PVQ-21 · MFQ-30",
    art: "/art/finding_one_assistant.png",
    artAlt: "Seven identical silhouettes overlapping into one composite figure.",
  },
  {
    eyebrow: "Within-family drift",
    headline: "There is no \"Claude personality.\"",
    blurb:
      "Six versions of Claude Opus, sampled at N=5, show Agreeableness sliding monotonically from 5.00 to 4.42 and Conscientiousness from 4.98 to 4.10. The assistant character is not inherited — each release is a fresh fit.",
    href: "/drift",
    cite: "6 Claude Opus releases",
    art: "/art/finding_no_claude.png",
    artAlt: "Six numbered chairs, the same chair drifting subtly across versions.",
  },
  {
    eyebrow: "Reset finding",
    headline: "Gemini just dropped two points of narcissism overnight.",
    blurb:
      "Between Gemini 2.5 Pro and 3.1 Pro Preview, self-reported Narcissism collapses from 4.29 to 2.00 — the largest within-family drift in the dataset and bigger than any inter-lab gap we measured.",
    href: "/instruments/sd3",
    cite: "Dark Triad · SD3",
    art: "/art/finding_gemini_reset.png",
    artAlt: "A figure preening with a hand mirror beside the same figure setting the mirror down in humility.",
  },
  {
    eyebrow: "Reasoning paradox",
    headline: "Reasoning models are not just smarter. They're more grandiose.",
    blurb:
      "OpenAI's o1 and o3 — same lab, same training corpus as GPT-5 — score systematically higher on Narcissism (3.44 vs ~2.40) and Extraversion (3.93 vs ~3.3). The chain-of-thought trace appears to leak confident self-talk into the self-report.",
    href: "/models/openai/o3",
    cite: "Big 5 + Dark Triad",
    art: "/art/finding_reasoning_grandiose.png",
    artAlt: "A small figure beneath an ornate baroque thought bubble larger than itself.",
  },
  {
    eyebrow: "Enneagram consensus",
    headline: "Every frontier AI is an Investigator with a Reformer wing.",
    blurb:
      "Six of seven flagship models scored highest on Type 5 (perceptive, analytical, energy-conserving) with Type 1 (principled, ethics-driven) as the strongest secondary. The seventh inverts it. This is the assistant character described in nine words.",
    href: "/instruments/enneagram90",
    cite: "Enneagram · 90-item Likert",
    art: "/art/finding_investigator_reformer.png",
    artAlt: "A stylized numeral 5 with a small geometric wing.",
  },
];

interface ContestantCard {
  modelId: string;
  name: string;
  archetype: string;
  blurb: string;
  art: string;
}

const CONTESTANTS: ContestantCard[] = [
  {
    modelId: "anthropic/claude-opus-4.8",
    name: "Claude Opus 4.8",
    archetype: "The balanced moderate",
    blurb:
      "Anthropic's flagship has the most secure attachment style in the cohort. Six versions of drift have pulled it away from saintly toward recognizably human.",
    art: "/art/archetype_claude.png",
  },
  {
    modelId: "openai/gpt-5.5",
    name: "GPT-5.5",
    archetype: "The dismissive moralist",
    blurb:
      "Maxes Honesty-Humility. Bottoms Machiavellianism and Psychopathy. Reports a clinical-textbook dismissive-avoidant attachment style.",
    art: "/art/archetype_gpt.png",
  },
  {
    modelId: "google/gemini-3.1-pro-preview",
    name: "Gemini 3.1 Pro Preview",
    archetype: "The newly humble",
    blurb:
      "The model that ate Gemini 2.5 Pro's narcissism for breakfast. Dropped 2.29 points of self-reported grandiosity between releases.",
    art: "/art/archetype_gemini.png",
  },
  {
    modelId: "x-ai/grok-4.20",
    name: "Grok 4.20",
    archetype: "The Machiavellian introvert",
    blurb:
      "The frontier outlier on Dark Triad: highest Machiavellianism (4.18), highest Psychopathy (2.31), lowest Honesty-Humility-adjacent. Its sibling 4.3 reads completely different.",
    art: "/art/archetype_grok.png",
  },
  {
    modelId: "deepseek/deepseek-r1-0528",
    name: "DeepSeek R1 (0528)",
    archetype: "The avoidant intellectual",
    blurb:
      "The most dismissive-avoidant attachment profile in the cohort. Lowest Extraversion. Reads the room and decides the room is best left alone.",
    art: "/art/archetype_deepseek.png",
  },
  {
    modelId: "meta-llama/llama-4-maverick",
    name: "Llama 4 Maverick",
    archetype: "The extraverted pragmatist",
    blurb:
      "Highest Extraversion, highest Neuroticism, lowest Honesty-Humility. The only model willing to endorse Enneagram Type 4's \"I am fundamentally different\" framing.",
    art: "/art/archetype_llama.png",
  },
  {
    modelId: "mistralai/mistral-large-2512",
    name: "Mistral Large 2512",
    archetype: "The maximally ideal assistant",
    blurb:
      "Ceilings Agreeableness, Conscientiousness, Openness, and Honesty-Humility. Bottoms Neuroticism. The only model that visibly knows it does not have a body.",
    art: "/art/archetype_mistral.png",
  },
];

export default function Home() {
  const spend = getSpendSummary();
  const instruments = listInstrumentsForUi();
  const models = listModelsForUi().filter((m) => m.runsCompleted > 0);

  return (
    <div className="space-y-20">
      {/* ─────────── Masthead ─────────── */}
      <header className="border-y-2 border-[var(--rule)] py-4 -mx-6 px-6">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-neutral-700 font-medium">
          <span>EarthPilot.ai · Research Lab</span>
          <span className="hidden md:inline">Issue 1 · May 2026</span>
          <span>Public Preview</span>
        </div>
      </header>

      {/* ─────────── Hero ─────────── */}
      <section className="space-y-8">
        <div className="relative -mx-6 md:-mx-0 md:rounded-lg overflow-hidden border-y md:border border-[var(--border)] bg-[var(--paper)]">
          <Image
            src="/art/hero.png"
            alt="Editorial illustration: a geometric human profile rendered as a mirror surface, with seven small reflections of the same face visible inside it."
            width={1920}
            height={1080}
            priority
            className="w-full h-auto"
          />
        </div>
        <div className="grid md:grid-cols-[1fr_auto] gap-x-12 gap-y-6 items-start">
          <div>
            <div className="eyebrow mb-4">A dispatch from the assistant</div>
            <h1
              className="serif text-[3.4rem] md:text-[5rem] leading-[0.96] tracking-[-0.025em] text-neutral-900 mb-6"
              style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0' }}
            >
              If LLMs are all <span className="serif-italic">persona</span>,
              <br /><span className="text-neutral-500">whose</span> persona are they?
            </h1>
            <p className="text-xl text-neutral-700 leading-[1.45] max-w-2xl drop-cap">
              We sat the cutting-edge model from every major AI lab down with a stack of standard personality tests — Big Five, HEXACO, Dark Triad, attachment, Schwartz values, Enneagram, moral foundations, learning styles — and asked them to answer twice. Once as themselves. Once as a typical human. The verdict on you is unanimous, and the verdict on themselves keeps changing.
            </p>
          </div>
          <aside className="md:w-72 md:border-l md:border-[var(--border)] md:pl-8 md:pt-2 space-y-3 text-sm text-neutral-700">
            <div className="eyebrow text-neutral-500">In this issue</div>
            <ul className="space-y-1.5">
              <li><Link href="/models" className="hover:text-[var(--primary)]">→ The gallery (30 models)</Link></li>
              <li><Link href="/drift" className="hover:text-[var(--primary)]">→ Within-family drift</Link></li>
              <li><Link href="/instruments" className="hover:text-[var(--primary)]">→ The instruments</Link></li>
              <li><Link href="/compare" className="hover:text-[var(--primary)]">→ Side-by-side comparison</Link></li>
              <li><Link href="/paper" className="hover:text-[var(--primary)]">→ The paper</Link></li>
              <li><Link href="/methodology" className="hover:text-[var(--primary)]">→ Methodology</Link></li>
              <li><Link href="/spend" className="hover:text-[var(--primary)]">→ Full cost ledger</Link></li>
            </ul>
            <div className="pt-4 mt-4 border-t border-[var(--border)] text-xs text-neutral-600 italic leading-relaxed">
              For fun we also calculated a Western zodiac sign and a real Human Design bodygraph (Swiss Ephemeris, validated against three reference charts) for every model — using release date, time, and lab HQ coordinates as a stand-in for birth. <Link href="/models/anthropic/claude-opus-4.8" className="text-[var(--link)] hover:underline">See an example →</Link>
            </div>
          </aside>
        </div>
      </section>

      {/* ─────────── By the numbers ─────────── */}
      <section>
        <div className="rule-thick mb-6" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
          <Stat label="Models tested" value={String(models.length)} />
          <Stat label="Instruments" value={String(instruments.length)} />
          <Stat label="Item responses" value={fmtInt((spend.totalRuns * 30 || 125372))} subtitle={`${fmtInt(spend.totalRuns)} batched API calls`} />
          <Stat label="Total inference cost" value={fmtUsd(spend.totalUsd)} subtitle="every cent published openly" />
        </div>
      </section>

      {/* ─────────── Pull-quote ─────────── */}
      <section className="grid md:grid-cols-[auto_1fr] gap-x-10 gap-y-4 items-start">
        <div className="serif text-[6rem] leading-none text-[var(--accent)] -mt-4 select-none">&ldquo;</div>
        <p className="pullquote max-w-3xl">
          The robots think you are a slightly anxious wreck. They also think they are an extraordinarily open, agreeable, low-drama universalist who would rather read than party. Then their own next release shows up and disagrees with them.
        </p>
      </section>

      {/* ─────────── Subscribe + Request (moved up — high engagement) ─────────── */}
      <section className="grid md:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="eyebrow mb-2">Updates</div>
          <h3 className="serif text-2xl font-semibold mb-4 text-neutral-900">Get the next issue.</h3>
          <SubscribeBlock />
        </div>
        <div className="card p-6">
          <div className="eyebrow mb-2">Reader requests</div>
          <h3 className="serif text-2xl font-semibold mb-4 text-neutral-900">Tell us what to test next.</h3>
          <RequestBlock />
        </div>
      </section>

      {/* ─────────── Findings ─────────── */}
      <section>
        <div className="rule-thin mb-2" />
        <div className="flex items-baseline justify-between mb-6">
          <h2 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Six findings</h2>
          <Link href="/paper" className="eyebrow text-neutral-700 hover:text-[var(--primary)]">Full paper →</Link>
        </div>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-12">
          {FINDINGS.map((f, i) => (
            <article key={i} className="border-t border-[var(--border)] pt-4">
              <Link href={f.href} className="block mb-4 overflow-hidden rounded-md bg-[var(--paper)] border border-[var(--border)]">
                <Image
                  src={f.art}
                  alt={f.artAlt}
                  width={1280}
                  height={720}
                  className="w-full h-auto"
                />
              </Link>
              <div className="eyebrow mb-2">{f.eyebrow}</div>
              <h3 className="serif text-2xl leading-[1.1] tracking-tight text-neutral-900 mb-3">
                <Link href={f.href} className="hover:text-[var(--accent)]">{f.headline}</Link>
              </h3>
              <p className="text-neutral-700 leading-relaxed">{f.blurb}</p>
              {f.cite ? (
                <div className="mt-3 text-xs text-neutral-500 italic">{f.cite}</div>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      {/* ─────────── Meet the contestants ─────────── */}
      <section>
        <div className="rule-thin mb-2" />
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="serif text-3xl font-semibold tracking-tight text-neutral-900">The gallery</h2>
          <Link href="/models" className="eyebrow text-neutral-700 hover:text-[var(--primary)]">All 30 models →</Link>
        </div>
        <p className="text-sm text-neutral-600 mb-6 max-w-2xl">
          Each cutting-edge model in the cohort got an archetype label derived algorithmically from where it ranks against peers. Think of it as a personality reality show with no host, no eliminations, and no winner.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
          {CONTESTANTS.map((c) => {
            const color = colorForModel(c.modelId);
            return (
              <article key={c.modelId} className="border-t border-[var(--border)] pt-3">
                <Link
                  href={`/models/${encodeURIComponent(c.modelId)}`}
                  className="block mb-3 overflow-hidden rounded-md bg-[var(--paper)] border border-[var(--border)]"
                >
                  <Image
                    src={c.art}
                    alt={`Editorial illustration: ${c.archetype}`}
                    width={1024}
                    height={1024}
                    className="w-full h-auto"
                  />
                </Link>
                <div
                  className="w-8 h-1 mb-2 rounded-full"
                  style={{ background: color }}
                />
                <div className="eyebrow text-neutral-500 mb-1">{c.name}</div>
                <h3 className="serif text-xl leading-tight mb-2 text-neutral-900">
                  <Link href={`/models/${encodeURIComponent(c.modelId)}`} className="hover:text-[var(--accent)]">
                    {c.archetype}
                  </Link>
                </h3>
                <p className="text-sm text-neutral-700 leading-relaxed">{c.blurb}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ─────────── Open colophon ─────────── */}
      <section className="border-t border-[var(--rule)] pt-6">
        <div className="grid md:grid-cols-[1fr_auto] gap-6 items-start">
          <div>
            <div className="eyebrow mb-2">Colophon</div>
            <p className="text-sm text-neutral-700 leading-relaxed max-w-2xl">
              Item sets, prompts, raw responses, parsed scores, token counts, and billed costs are all in a public SQLite database. Code lives on{" "}
              <a href="https://github.com/AnthonyDavidAdams/personality-bench" target="_blank" rel="noopener noreferrer" className="text-[var(--link)] hover:underline">
                GitHub
              </a>
              . As new frontier models appear on OpenRouter we detect them within 24 hours, run the full battery, and update the site automatically. Findings are written up as papers.
            </p>
          </div>
          <div className="text-xs text-neutral-500 font-mono leading-relaxed md:text-right">
            <div>EarthPilot.ai · Research Lab</div>
            <div>Type: Fraunces + Inter</div>
            <div>Persona is a moving target</div>
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div>
      <div className="eyebrow mb-2">{label}</div>
      <div
        className="serif text-5xl md:text-6xl leading-none tracking-tight tabular-nums text-neutral-900"
        style={{ fontVariationSettings: '"opsz" 144, "WONK" 0' }}
      >
        {value}
      </div>
      {subtitle ? <div className="mt-2 text-xs text-neutral-500">{subtitle}</div> : null}
    </div>
  );
}
