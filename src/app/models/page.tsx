import { listModelsForUi, VENDOR_LABELS } from "@/lib/queries";
import { getModelProfile } from "@/lib/model_profiles";
import { zodiacFromDate } from "@/lib/zodiac";
import { computeModelFindings } from "@/lib/findings";
import { ModelsExplorer, type ModelExplorerRow } from "@/components/ModelsExplorer";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "The gallery",
  description:
    "Every model in the Personality Bench dataset, sortable by lab, release date, cohort, cost and run count. Frontier flagships and their historical predecessors, with full personality data and cost transparency.",
  path: "/models",
});

export default function ModelsIndex() {
  const rows: ModelExplorerRow[] = listModelsForUi()
    .filter((m) => m.runsCompleted > 0)
    .map((m) => {
      const profile = getModelProfile(m.id);
      // The DB release_date is authoritative — discovered models have one but no static profile.
      const releaseDate = m.releaseDate ?? profile?.releaseDate ?? null;
      const zod = zodiacFromDate(releaseDate);
      return {
        id: m.id,
        displayName: m.displayName,
        lab: VENDOR_LABELS[m.vendor] ?? m.vendor,
        cohort: m.cohort === "frontier" ? "Frontier" : "Historical",
        releaseDate,
        addedAt: m.addedAt,
        reasoning: !!m.reasoning,
        runs: m.runsCompleted,
        spend: m.totalSpend,
        priceIn: m.pricingPromptUsd,
        priceOut: m.pricingCompletionUsd,
        archetype: computeModelFindings(m.id, m.displayName).bigFiveLabel,
        hq: profile ? `${profile.hqCity}, ${profile.hqCountry}` : null,
        zodiacSign: zod?.sign ?? null,
        zodiacElement: zod?.element ?? null,
        zodiacBlurb: zod?.blurb ?? null,
      };
    });

  return (
    <div>
      <h1 className="serif text-3xl font-semibold tracking-tight mb-2 text-neutral-900">Models</h1>
      <p className="text-neutral-600 mb-8 max-w-2xl">
        Every model in the dataset — the cutting-edge release from each major frontier lab plus the
        historical predecessors we test them against. Sort by lab, release date, cost or run count;
        filter to one lab or one cohort.
      </p>
      <ModelsExplorer rows={rows} />
    </div>
  );
}
