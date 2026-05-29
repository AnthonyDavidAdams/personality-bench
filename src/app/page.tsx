import Link from "next/link";
import {
  getSpendSummary,
  listInstrumentsForUi,
  listModelsForUi,
} from "@/lib/queries";
import { SubscribeBlock } from "@/components/SubscribeBlock";
import { RequestBlock } from "@/components/RequestBlock";

export const dynamic = "force-dynamic";

function fmtUsd(n: number) {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}
function fmtInt(n: number) {
  return n.toLocaleString();
}

export default function Home() {
  const spend = getSpendSummary();
  const instruments = listInstrumentsForUi();
  const models = listModelsForUi();

  return (
    <div className="space-y-14">
      <section className="max-w-3xl">
        <div className="text-xs uppercase tracking-widest text-[var(--accent)] mb-3">
          EarthPilot research lab dataset
        </div>
        <h1 className="serif text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05] text-neutral-900">
          If LLMs are all persona,
          <br />
          <span className="text-neutral-500">whose</span> persona are they?
        </h1>
        <p className="mt-6 text-neutral-700 leading-relaxed text-lg">
          One view of large language models holds that they are blank slates wearing personas — there is no
          &ldquo;real&rdquo; them, only the character their training shaped them to play. We test that
          empirically, across labs and across versions.
        </p>
        <p className="mt-4 text-neutral-700 leading-relaxed">
          Every cutting-edge frontier model takes thirteen standard psychometric inventories — Big Five,
          HEXACO, Dark Triad, Schwartz Values, Moral Foundations, attachment style, learning styles, and more
          — twice. Once as itself. Once portraying a typical human. The gap between those two answers is
          the data we make public here.
        </p>
        <div className="mt-7 flex gap-3 text-sm">
          <Link href="/models" className="inline-flex items-center px-4 py-2 rounded-md bg-neutral-900 text-white hover:bg-neutral-700">
            Browse models →
          </Link>
          <Link href="/compare" className="inline-flex items-center px-4 py-2 rounded-md border border-[var(--border)] text-neutral-800 hover:border-neutral-900">
            Compare side-by-side
          </Link>
          <Link href="/methodology" className="inline-flex items-center px-4 py-2 rounded-md border border-[var(--border)] text-neutral-800 hover:border-neutral-900">
            Methodology
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Models tested" value={String(models.filter((m) => m.runsCompleted > 0).length)} />
        <StatCard label="Instruments" value={String(instruments.length)} />
        <StatCard label="Runs completed" value={fmtInt(spend.totalRuns)} />
        <StatCard label="Total spent" value={fmtUsd(spend.totalUsd)} />
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="serif text-xl font-semibold mb-3 text-neutral-900">Models</h2>
          <ul className="space-y-1 text-sm">
            {models.filter((m) => m.runsCompleted > 0).map((m) => (
              <li key={m.id} className="flex justify-between border-b border-[var(--soft)] py-2">
                <Link href={`/models/${encodeURIComponent(m.id)}`} className="text-neutral-800 hover:text-[var(--accent)]">
                  {m.displayName}
                </Link>
                <span className="text-neutral-500 text-xs">{m.runsCompleted} runs · {fmtUsd(m.totalSpend)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="serif text-xl font-semibold mb-3 text-neutral-900">Instruments</h2>
          <ul className="space-y-1 text-sm">
            {instruments.map((i) => (
              <li key={i.id} className="flex justify-between border-b border-[var(--soft)] py-2">
                <Link href={`/instruments/${i.id}`} className="text-neutral-800 hover:text-[var(--accent)]">
                  {i.shortName}
                </Link>
                <span className="text-neutral-500 text-xs">{i.itemCount} items · {i.family}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div className="card p-6">
          <h3 className="serif text-lg font-semibold mb-3 text-neutral-900">Stay in the loop</h3>
          <SubscribeBlock />
        </div>
        <div className="card p-6">
          <h3 className="serif text-lg font-semibold mb-3 text-neutral-900">Request a model or instrument</h3>
          <RequestBlock />
        </div>
      </section>

      <section className="card p-6">
        <h3 className="serif text-lg font-semibold mb-2 text-neutral-900">Open by default</h3>
        <p className="text-sm text-neutral-700 leading-relaxed max-w-2xl">
          Item sets, prompts, raw responses, parsed scores, token counts, and billed costs are all in a public
          SQLite database. Code lives on{" "}
          <a href="https://github.com/AnthonyDavidAdams" target="_blank" rel="noopener noreferrer" className="text-[var(--link)] hover:underline">
            GitHub
          </a>
          . As new frontier models appear on OpenRouter we detect them within 24 hours, run the full battery,
          and update the site automatically. Findings will be written up as papers.
        </p>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl serif font-semibold mt-1 tabular-nums text-neutral-900">{value}</div>
    </div>
  );
}
