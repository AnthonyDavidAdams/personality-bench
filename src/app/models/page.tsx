import Link from "next/link";
import { listModelsForUi } from "@/lib/queries";
import { getModelProfile } from "@/lib/model_profiles";
import { zodiacFromDate } from "@/lib/zodiac";
import { ZodiacIcon, ELEMENT_COLORS } from "@/components/ZodiacIcon";

export const dynamic = "force-dynamic";

function fmtUsd(n: number) {
  if (!n) return "$0";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}
function fmtPerM(n?: number | null) {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

export default function ModelsIndex() {
  const models = listModelsForUi().filter((m) => m.runsCompleted > 0);
  return (
    <div>
      <h1 className="serif text-3xl font-semibold tracking-tight mb-2 text-neutral-900">Models</h1>
      <p className="text-neutral-600 mb-8 max-w-2xl">
        The cutting-edge model from every major frontier lab, with full personality data and cost transparency.
      </p>
      <div className="grid md:grid-cols-2 gap-4">
        {models.map((m) => {
          const profile = getModelProfile(m.id);
          const zod = zodiacFromDate(profile?.releaseDate);
          return (
            <Link
              key={m.id}
              href={`/models/${encodeURIComponent(m.id)}`}
              className="card block p-5 hover:border-[var(--accent)] transition"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="serif font-semibold text-lg text-neutral-900">{m.displayName}</span>
                {zod ? (
                  <span className="flex items-center gap-1.5 text-xs text-neutral-600" title={zod.blurb}>
                    <span style={{ color: ELEMENT_COLORS[zod.element] }}>
                      <ZodiacIcon sign={zod.sign} size={16} />
                    </span>
                    {zod.sign}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-neutral-500 font-mono mt-1">{m.id}</div>
              {profile ? (
                <div className="text-xs text-neutral-600 mt-2">
                  {profile.hqCity}, {profile.hqCountry} · released {profile.releaseDate}
                </div>
              ) : null}
              <div className="text-xs text-neutral-600 mt-3">
                {fmtPerM(m.pricingPromptUsd)}/M in · {fmtPerM(m.pricingCompletionUsd)}/M out
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                {m.runsCompleted} runs · {fmtUsd(m.totalSpend)} spent
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
