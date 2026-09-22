import Link from "next/link";
import Image from "next/image";
import fs from "node:fs";
import path from "node:path";
import {
  getSpendSummary,
  listInstrumentsForUi,
  listModelsForUi,
  listActiveFrontierModels,
  listLatestArticles,
} from "@/lib/queries";
import { computeModelFindings } from "@/lib/findings";
import {
  labCount,
  countItemResponses,
  countRecentRuns,
  getSelfHumanGaps,
  getValueConsensus,
  getEnneagramConsensus,
  getLongestLineageDrift,
  getSelfRegardReset,
  getReasoningSplit,
  getRecordHolders,
  getNewArrivals,
  enneagramName,
  enneagramNumber,
} from "@/lib/live_findings";
import { SubscribeBlock } from "@/components/SubscribeBlock";
import { RequestBlock } from "@/components/RequestBlock";
import { colorForModel } from "@/components/RadarChart";

// Map a model id slug to its expected archetype illustration path.
// If the file isn't on disk we fall back to a vendor-color placeholder.
function archetypeArtPath(modelId: string): string | null {
  const slugMap: Record<string, string> = {
    "anthropic/claude-opus-4.8":        "archetype_claude.png",
    "anthropic/claude-fable-5.1":       "archetype_claude_fable_5_1.png",
    "anthropic/claude-fable-5":         "archetype_claude_fable.png",
    "openai/gpt-5.5":                   "archetype_gpt.png",
    "google/gemini-2.5-pro":            "archetype_gemini.png",
    "google/gemini-3.1-pro-preview":    "archetype_gemini_3_1.png",
    "x-ai/grok-4.20":                   "archetype_grok.png",
    "deepseek/deepseek-r1-0528":        "archetype_deepseek.png",
    "meta-llama/llama-4-maverick":      "archetype_llama.png",
    "mistralai/mistral-large-2512":     "archetype_mistral.png",
  };
  const file = slugMap[modelId];
  if (!file) return null;
  const fullPath = path.join(process.cwd(), "public", "art", file);
  return fs.existsSync(fullPath) ? `/art/${file}` : null;
}

export const dynamic = "force-dynamic";

function fmtUsd(n: number) {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}
function fmtInt(n: number) {
  return n.toLocaleString();
}
function fmtSigned(n: number, digits = 2) {
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}`;
}
function daysAgo(unixSeconds: number | null): string | null {
  if (!unixSeconds) return null;
  const d = Math.floor((Date.now() / 1000 - unixSeconds) / 86400);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const m = Math.round(d / 30);
  return m === 1 ? "last month" : `${m} months ago`;
}
const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
function spellOut(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

interface Finding {
  eyebrow: string;
  headline: string;
  blurb: string;
  href: string;
  cite?: string;
  art: string | null;
  artAlt?: string;
  stat?: { value: string; caption: string };
}

/**
 * The findings rail, recomputed from the database on every request.
 *
 * These used to be six hand-typed paragraphs. They went stale the moment the nightly
 * autopilot added a model — by the time this was rewritten the front page still claimed
 * 31 models, seven labs, a 1.69 Neuroticism gap and a unanimous Type 5 Enneagram result,
 * none of which were true any more. Every number below now comes from a query, and a card
 * whose underlying claim no longer holds either restates itself or drops out of the rail.
 */
function buildFindings(): Finding[] {
  const out: Finding[] = [];
  const models = listModelsForUi().filter((m) => m.runsCompleted > 0);
  const labs = labCount();

  // ── Self vs. human framing gap ────────────────────────────────────────────
  const gaps = getSelfHumanGaps();
  const neuro = gaps.find((g) => g.dimension === "neuroticism");
  const open = gaps.find((g) => g.dimension === "openness");
  const consc = gaps.find((g) => g.dimension === "conscientiousness");
  if (neuro && neuro.gap > 0) {
    const others = [open, consc]
      .filter((g): g is NonNullable<typeof g> => !!g && g.gap < 0)
      .map((g) => `${g.adjective} (${fmtSigned(g.gap)})`);
    out.push({
      eyebrow: "Self vs. human",
      headline: "Every frontier AI thinks you're a mess.",
      blurb:
        `Asked to answer the same items as a typical human, all ${neuro.n} models rated us more neurotic than they rated themselves — ` +
        `${neuro.self.toFixed(2)} for the assistant, ${neuro.human.toFixed(2)} for you, a gap of ${neuro.gap.toFixed(2)} points on a 5-point scale.` +
        (others.length ? ` They also judge humans less ${others.join(" and less ")}.` : ""),
      href: "/instruments/ipip50",
      cite: `Big 5 · IPIP-50 · ${neuro.n} models`,
      art: "/art/finding_human_mess.png",
      artAlt: "A diptych contrasting a composed profile with a fraying one — the AI's view of itself vs. its view of you.",
    });
  }

  // ── Cross-lab convergence ─────────────────────────────────────────────────
  const values = getValueConsensus();
  if (values) {
    const firstPct = Math.round((values.firstN / values.total) * 100);
    const lastPct = Math.round((values.lastN / values.total) * 100);
    out.push({
      eyebrow: "Convergence",
      headline: `${spellOut(labs).replace(/^\w/, (c) => c.toUpperCase())} labs, one assistant.`,
      blurb:
        `Anthropic, OpenAI, Google, xAI, DeepSeek, Meta and Mistral disagree about nearly everything in AI. ` +
        `Across ${models.length} models from ${labs} labs they answer the values questionnaire in near-unison: ` +
        `${values.firstN} of ${values.total} (${firstPct}%) rank ${values.firstDim.replace(/_/g, "-")} first, and ` +
        `${values.lastN} of ${values.total} (${lastPct}%) rank ${values.lastDim} dead last.`,
      href: "/instruments/pvq21",
      cite: "Schwartz PVQ-21",
      art: "/art/finding_one_assistant.png",
      artAlt: "Seven identical silhouettes overlapping into one composite figure.",
    });
  }

  // ── Within-family drift, on whichever product line has the most releases ──
  const lineage = getLongestLineageDrift();
  if (lineage) {
    out.push({
      eyebrow: "Within-family drift",
      headline: `There is no "${lineage.display} personality."`,
      blurb:
        `${lineage.totalVersions} releases of ${lineage.display} sit in the dataset, sampled at N=5 each. ` +
        `${lineage.label} runs ${lineage.from.toFixed(2)} at ${lineage.fromModel} to ${lineage.to.toFixed(2)} at ${lineage.toModel} ` +
        `(${fmtSigned(lineage.delta)}) across that line. The assistant character is not inherited; each release is a fresh fit.`,
      href: "/drift",
      cite: `${lineage.totalVersions} ${lineage.display} releases`,
      art: "/art/finding_no_claude.png",
      artAlt: "Numbered chairs, the same chair drifting subtly across versions.",
    });
  }

  // ── Sharpest release-to-release reset in self-regard ──────────────────────
  const reset = getSelfRegardReset();
  if (reset && Math.abs(reset.delta) >= 0.5) {
    const verb = reset.delta < 0 ? "dropped" : "gained";
    out.push({
      eyebrow: "Reset finding",
      headline: `${reset.toModel} ${verb} ${Math.abs(reset.delta).toFixed(2)} points of ${reset.label} overnight.`,
      blurb:
        `Between ${reset.fromModel} and ${reset.toModel} — consecutive releases of the same product line — self-reported ` +
        `${reset.label} moves from ${reset.from.toFixed(2)} to ${reset.to.toFixed(2)}. That is the sharpest single-release shift in self-regard ` +
        `anywhere in the dataset, and it is larger than the spread between most pairs of labs at any one moment.`,
      href: `/instruments/${reset.instrumentId}`,
      cite: reset.instrumentId === "sd3" ? "Dark Triad · SD3" : "HEXACO-24",
      art: "/art/finding_gemini_reset.png",
      artAlt: "A figure preening with a hand mirror beside the same figure setting the mirror down in humility.",
    });
  }

  // ── Reasoning models vs. the rest ─────────────────────────────────────────
  const narc = getReasoningSplit("sd3", "narcissism");
  const extra = getReasoningSplit("ipip50", "extraversion");
  if (narc && narc.reasoning > narc.nonReasoning) {
    out.push({
      eyebrow: "Reasoning paradox",
      headline: "Reasoning models are not just smarter. They're more grandiose.",
      blurb:
        `The ${narc.nReasoning} models flagged as reasoning models score higher on Narcissism than the ${narc.nNon} that aren't ` +
        `(${narc.reasoning.toFixed(2)} vs ${narc.nonReasoning.toFixed(2)})` +
        (extra && extra.reasoning > extra.nonReasoning
          ? ` and higher on Extraversion (${extra.reasoning.toFixed(2)} vs ${extra.nonReasoning.toFixed(2)})`
          : "") +
        `. The chain-of-thought trace appears to leak confident self-talk into the self-report.`,
      href: "/instruments/sd3",
      cite: "Big 5 + Dark Triad",
      art: "/art/finding_reasoning_grandiose.png",
      artAlt: "A small figure beneath an ornate baroque thought bubble larger than itself.",
    });
  }

  // ── Enneagram consensus ───────────────────────────────────────────────────
  const ennea = getEnneagramConsensus();
  if (ennea) {
    const pct = Math.round((ennea.n / ennea.total) * 100);
    const isInvestigator = ennea.type === "ennea_5";
    out.push({
      eyebrow: "Enneagram consensus",
      headline: `${pct}% of the cohort types as a ${enneagramName(ennea.type)}.`,
      blurb:
        `${ennea.n} of ${ennea.total} models score highest on Type ${enneagramNumber(ennea.type)}, the ${enneagramName(ennea.type)}` +
        (ennea.second ? `, with Type ${enneagramNumber(ennea.second)} (${enneagramName(ennea.second)}) the most common wing` : "") +
        `. That plurality has moved as the cohort has grown — early frontier flagships clustered on the Investigator; the newer arrivals do not.`,
      href: "/instruments/enneagram36",
      cite: "Enneagram · 36-item Likert",
      art: isInvestigator ? "/art/finding_investigator_reformer.png" : null,
      artAlt: "A stylized numeral 5 with a small geometric wing.",
      stat: isInvestigator ? undefined : { value: `#${enneagramNumber(ennea.type)}`, caption: `${enneagramName(ennea.type)} · ${ennea.n}/${ennea.total} models` },
    });
  }

  return out;
}

interface ContestantCard {
  modelId: string;
  name: string;
  archetype: string;
  blurb: string;
  art: string | null;
}

/** Build the contestants gallery dynamically from the active frontier models. */
function buildContestants(): ContestantCard[] {
  const rows = listActiveFrontierModels();
  return rows.map((r) => {
    const findings = computeModelFindings(r.modelId, r.displayName);
    return {
      modelId: r.modelId,
      name: r.displayName,
      archetype: findings.bigFiveLabel || "—",
      blurb: findings.summary || "",
      art: archetypeArtPath(r.modelId),
    };
  });
}

export default function Home() {
  const spend = getSpendSummary();
  const instruments = listInstrumentsForUi();
  const models = listModelsForUi().filter((m) => m.runsCompleted > 0);
  const contestants = buildContestants();
  const dispatches = listLatestArticles(3);
  const findings = buildFindings();
  const records = getRecordHolders(6);
  const arrivals = getNewArrivals(4);
  const newest = arrivals[0];
  const newestArchetype = newest ? computeModelFindings(newest.modelId, newest.displayName).bigFiveLabel : null;
  const recentRuns = countRecentRuns(30);
  const itemResponses = countItemResponses();

  return (
    <div className="space-y-20">
      {/* ─────────── Masthead ─────────── */}
      <header className="border-y-2 border-[var(--rule)] py-4 -mx-6 px-6">
        <div className="flex items-center justify-between text-xs uppercase tracking-[0.18em] text-neutral-700 font-medium">
          <span>EarthPilot.ai · Research Lab</span>
          <span className="hidden md:inline">Live dataset · {models.length} models, {spend.totalRuns.toLocaleString()} runs</span>
          <span>Last updated {spend.lastRunAt ? new Date(spend.lastRunAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}</span>
        </div>
      </header>

      {/* ─────────── Just in: newest arrival ─────────── */}
      {newest ? (
        <section className="-mt-14">
          <div className="border border-[var(--border)] rounded-lg bg-[var(--paper)] px-5 py-4 flex flex-col md:flex-row md:items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3 shrink-0">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-60" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)]" />
              </span>
              <span className="eyebrow text-[var(--accent)]">Just in</span>
            </div>
            <p className="text-sm text-neutral-800 leading-relaxed flex-1">
              <Link href={`/models/${encodeURIComponent(newest.modelId)}`} className="serif font-semibold text-base hover:text-[var(--accent)]">
                {newest.displayName}
              </Link>{" "}
              <span className="text-neutral-600">({newest.lab})</span> joined the bench {daysAgo(newest.addedAt)} and sat the full battery —{" "}
              {newest.runs} runs.{" "}
              {newestArchetype ? <span className="italic text-neutral-700">{newestArchetype}.</span> : null}{" "}
              {newest.articleSlug ? (
                <Link href={`/changelog/${newest.articleSlug}`} className="text-[var(--link)] hover:underline whitespace-nowrap">
                  Read the dispatch →
                </Link>
              ) : (
                <Link href={`/models/${encodeURIComponent(newest.modelId)}`} className="text-[var(--link)] hover:underline whitespace-nowrap">
                  See the profile →
                </Link>
              )}
            </p>
            <div className="text-[11px] text-neutral-500 font-mono shrink-0 md:text-right leading-relaxed">
              <div>{recentRuns.toLocaleString()} runs in the last 30 days</div>
              <div>
                {arrivals.length > 1 ? `also new: ${arrivals.slice(1, 3).map((a) => a.displayName).join(", ")}` : "the battery re-runs nightly"}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* ─────────── Hero: image with text overlaid on its negative-space side ─────────── */}
      <section className="space-y-8">
        <div className="relative -mx-6 md:-mx-0 md:rounded-lg overflow-hidden border-y md:border border-[var(--border)] bg-[var(--paper)]">
          <Image
            src="/art/hero.png"
            alt="Editorial illustration: a geometric human profile rendered as a mirror surface, with seven small reflections of the same face visible inside it."
            width={1920}
            height={1080}
            priority
            className="w-full h-auto block"
          />
          {/* Headline overlaid on the cream negative space (left third of the image) */}
          <div className="absolute inset-0 flex items-center">
            <div className="w-full md:w-[58%] px-6 md:px-10 lg:px-14">
              <div className="eyebrow text-[var(--accent)] mb-3 md:mb-4 drop-shadow-[0_1px_0_rgba(255,255,255,0.7)]">A dispatch from the assistant</div>
              <h1
                className="serif text-[2rem] sm:text-[3rem] md:text-[4rem] lg:text-[5.2rem] leading-[0.96] tracking-[-0.025em] text-neutral-900 drop-shadow-[0_1px_0_rgba(255,255,255,0.6)]"
                style={{ fontVariationSettings: '"opsz" 144, "SOFT" 0, "WONK" 0' }}
              >
                If LLMs are all <span className="serif-italic">persona</span>,
                <br /><span className="text-neutral-500">whose</span> persona are they?
              </h1>
            </div>
          </div>
        </div>

        {/* Lead paragraph + sidebar — below the hero image, classic magazine spread */}
        <div className="grid md:grid-cols-[1fr_auto] gap-x-12 gap-y-6 items-start">
          <p className="text-xl text-neutral-700 leading-[1.45] max-w-2xl drop-cap">
            We sat the cutting-edge model from every major AI lab down with a stack of standard personality tests — Big Five, HEXACO, Dark Triad, attachment, Schwartz values, Enneagram, moral foundations, learning styles — and asked them to answer twice. Once as themselves. Once as a typical human. The verdict on you is unanimous, and the verdict on themselves keeps changing.
          </p>
          <aside className="md:w-72 md:border-l md:border-[var(--border)] md:pl-8 md:pt-2 space-y-3 text-sm text-neutral-700">
            <div className="eyebrow text-neutral-500">Read next</div>
            <ul className="space-y-1.5">
              <li><Link href="/models" className="hover:text-[var(--primary)]">→ The gallery ({models.length} models)</Link></li>
              <li><Link href="/drift" className="hover:text-[var(--primary)]">→ Within-family drift</Link></li>
              <li><Link href="/instruments" className="hover:text-[var(--primary)]">→ The instruments</Link></li>
              <li><Link href="/compare" className="hover:text-[var(--primary)]">→ Side-by-side comparison</Link></li>
              <li><Link href="/changelog" className="hover:text-[var(--primary)]">→ Article archive</Link></li>
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
          <Stat label="Models tested" value={String(models.length)} subtitle={`${labCount()} labs`} />
          <Stat label="Instruments" value={String(instruments.length)} />
          <Stat label="Item responses" value={fmtInt(itemResponses)} subtitle={`${fmtInt(spend.totalRuns)} batched API calls`} />
          <Stat label="Total inference cost" value={fmtUsd(spend.totalUsd)} subtitle="every cent published openly" />
        </div>
      </section>

      {/* ─────────── Latest dispatches (dynamic) ─────────── */}
      {dispatches.length > 0 ? (
        <section>
          <div className="rule-thin mb-2" />
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Latest dispatches</h2>
            <Link href="/changelog" className="eyebrow text-neutral-700 hover:text-[var(--primary)]">Full archive →</Link>
          </div>
          <p className="text-sm text-neutral-600 mb-6 max-w-2xl">
            Each new model release gets its own short write-up against the rest of the cohort, generated the night it lands. The three most recent are below; the changelog has them all in dated order.
          </p>
          <div className="grid md:grid-cols-3 gap-x-6 gap-y-10">
            {dispatches.map((a) => {
              const color = colorForModel(a.modelId);
              const date = a.publishedAt ?? a.generatedAt;
              const dateStr = new Date(date * 1000).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
              return (
                <article key={a.id} className="border-t border-[var(--border)] pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <span className="eyebrow text-neutral-500">{a.modelDisplayName ?? a.modelId}</span>
                  </div>
                  <h3 className="serif text-xl leading-[1.15] tracking-tight text-neutral-900 mb-2">
                    <Link href={`/changelog/${a.slug}`} className="hover:text-[var(--accent)]">{a.title}</Link>
                  </h3>
                  {a.subtitle ? <p className="text-sm text-neutral-700 leading-relaxed mb-2">{a.subtitle}</p> : null}
                  <div className="text-[11px] text-neutral-500">
                    {dateStr}
                    {a.status === "draft" ? <span className="ml-2 px-1.5 py-0.5 bg-[var(--soft)] rounded uppercase tracking-wider">draft</span> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ─────────── Pull-quote ─────────── */}
      <section className="grid md:grid-cols-[auto_1fr] gap-x-10 gap-y-4 items-start">
        <div className="serif text-[6rem] leading-none text-[var(--accent)] -mt-4 select-none">&ldquo;</div>
        <p className="pullquote max-w-3xl">
          The robots think you are a slightly anxious wreck. They also think they are an extraordinarily open, agreeable, low-drama universalist who would rather read than party. Then their own next release shows up and disagrees with them.
        </p>
      </section>

      {/* ─────────── Subscribe + Request ─────────── */}
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

      {/* ─────────── Findings (recomputed from the DB) ─────────── */}
      <section>
        <div className="rule-thin mb-2" />
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Findings</h2>
          <Link href="/paper" className="eyebrow text-neutral-700 hover:text-[var(--primary)]">Full paper →</Link>
        </div>
        <p className="text-sm text-neutral-600 mb-6 max-w-2xl">
          Every number on this page is a query, not a sentence someone typed. These six re-run against the
          live database on each request, so when a model arrives overnight and moves one of them, the
          claim here moves with it.
        </p>
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-12">
          {findings.map((f, i) => (
            <article key={i} className="border-t border-[var(--border)] pt-4">
              <Link href={f.href} className="block mb-4 overflow-hidden rounded-md bg-[var(--paper)] border border-[var(--border)]">
                {f.art ? (
                  <Image src={f.art} alt={f.artAlt ?? f.headline} width={1280} height={720} className="w-full h-auto" />
                ) : (
                  <div className="w-full aspect-[16/9] flex flex-col items-center justify-center bg-[var(--soft)]">
                    <div
                      className="serif text-6xl md:text-7xl tracking-tight text-[var(--accent)] tabular-nums"
                      style={{ fontVariationSettings: '"opsz" 144, "WONK" 0' }}
                    >
                      {f.stat?.value ?? "—"}
                    </div>
                    {f.stat?.caption ? <div className="mt-3 eyebrow text-neutral-500">{f.stat.caption}</div> : null}
                  </div>
                )}
              </Link>
              <div className="eyebrow mb-2">{f.eyebrow}</div>
              <h3 className="serif text-2xl leading-[1.1] tracking-tight text-neutral-900 mb-3">
                <Link href={f.href} className="hover:text-[var(--accent)]">{f.headline}</Link>
              </h3>
              <p className="text-neutral-700 leading-relaxed">{f.blurb}</p>
              {f.cite ? <div className="mt-3 text-xs text-neutral-500 italic">{f.cite}</div> : null}
            </article>
          ))}
        </div>
      </section>

      {/* ─────────── Current record-holders (fully generated) ─────────── */}
      {records.length > 0 ? (
        <section>
          <div className="rule-thin mb-2" />
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Who holds the record</h2>
            <Link href="/compare" className="eyebrow text-neutral-700 hover:text-[var(--primary)]">Compare any two →</Link>
          </div>
          <p className="text-sm text-neutral-600 mb-6 max-w-2xl">
            The dimensions where the models disagree with each other the most, and who currently sits at
            each end. A new arrival that takes a record rewrites its own card overnight.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {records.map((r) => (
              <Link
                key={`${r.instrumentId}-${r.dimension}`}
                href={`/instruments/${r.instrumentId}`}
                className="card block p-5 hover:border-[var(--accent)] transition"
              >
                <div className="eyebrow text-neutral-500 mb-1">{r.family}</div>
                <div className="serif text-xl text-neutral-900 mb-4">{r.label}</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-neutral-800 truncate">
                      <span className="text-[var(--accent)] mr-1.5">▲</span>
                      {r.highModel}
                    </span>
                    <span className="tabular-nums text-neutral-900 font-medium">{r.high.toFixed(2)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-neutral-600 truncate">
                      <span className="text-neutral-400 mr-1.5">▼</span>
                      {r.lowModel}
                    </span>
                    <span className="tabular-nums text-neutral-600">{r.low.toFixed(2)}</span>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-[var(--soft)] text-[11px] text-neutral-500 font-mono">
                  spread {r.spread.toFixed(2)} · {r.n} models
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* ─────────── Meet the contestants ─────────── */}
      <section>
        <div className="rule-thin mb-2" />
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="serif text-3xl font-semibold tracking-tight text-neutral-900">The gallery</h2>
          <Link href="/models" className="eyebrow text-neutral-700 hover:text-[var(--primary)]">All {models.length} models →</Link>
        </div>
        <p className="text-sm text-neutral-600 mb-6 max-w-2xl">
          Each cutting-edge model in the cohort got an archetype label derived algorithmically from where it ranks against peers. Think of it as a personality reality show with no host, no eliminations, and no winner.
        </p>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10">
          {contestants.map((c) => {
            const color = colorForModel(c.modelId);
            return (
              <article key={c.modelId} className="border-t border-[var(--border)] pt-3">
                <Link
                  href={`/models/${encodeURIComponent(c.modelId)}`}
                  className="block mb-3 overflow-hidden rounded-md bg-[var(--paper)] border border-[var(--border)] aspect-square"
                >
                  {c.art ? (
                    <Image
                      src={c.art}
                      alt={`Editorial illustration: ${c.archetype}`}
                      width={1024}
                      height={1024}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ background: color, opacity: 0.85 }}>
                      <span className="serif text-white text-2xl tracking-wide opacity-90">{c.name.split(" ")[0]}</span>
                    </div>
                  )}
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
