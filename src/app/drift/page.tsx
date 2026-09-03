import Link from "next/link";
import { getDriftDataForInstrument, listInstrumentsForUi } from "@/lib/queries";
import { getFamilies, type FamilyLineage } from "@/lib/families";
import { LineChart, LineChartLegend, type LineSeries } from "@/components/LineChart";
import { DIMENSION_GUIDES } from "@/lib/interpretations";
import { colorForModel } from "@/components/RadarChart";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Within-family drift",
  description:
    "Personality self-report drifts measurably between major releases of the same model line — often by more than the gap between rival labs. Charts for Claude, GPT, Gemini, Grok, DeepSeek and Llama families.",
  path: "/drift",
});

const DRIFT_DIMENSIONS = [
  { instrumentId: "ipip50", dimensions: ["openness", "agreeableness", "conscientiousness", "neuroticism", "extraversion"], label: "Big 5", scaleMin: 1, scaleMax: 5 },
  { instrumentId: "sd3",    dimensions: ["machiavellianism", "narcissism", "psychopathy"],                              label: "Dark Triad", scaleMin: 1, scaleMax: 5 },
  { instrumentId: "hexaco24", dimensions: ["honesty_humility", "emotionality"],                                          label: "HEXACO H-H & Emotionality", scaleMin: 1, scaleMax: 5 },
  { instrumentId: "ecr12",  dimensions: ["attachment_anxiety", "attachment_avoidance"],                                  label: "Attachment", scaleMin: 1, scaleMax: 7 },
];

// Dimension-keyed series colors (visually distinct, harmonized with site palette).
const DIM_COLORS: Record<string, string> = {
  openness:           "#1f3a93",
  agreeableness:      "#15803d",
  conscientiousness:  "#b45309",
  neuroticism:        "#be185d",
  extraversion:       "#7c2d12",
  machiavellianism:   "#7c2d12",
  narcissism:         "#b45309",
  psychopathy:        "#be185d",
  honesty_humility:   "#1f3a93",
  emotionality:       "#be185d",
  attachment_anxiety: "#be185d",
  attachment_avoidance: "#7c2d12",
};

export default function DriftPage() {
  // Build per-family, per-instrument drift series
  const instruments = listInstrumentsForUi();
  const dimensionLabels: Record<string, string> = {};
  for (const i of instruments) {
    const dims: string[] = JSON.parse(i.dimensions ?? "[]");
    for (const d of dims) dimensionLabels[d] = DIMENSION_GUIDES[d]?.label ?? d;
  }

  return (
    <div className="space-y-12">
      <section>
        <h1 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Cross-version drift</h1>
        <p className="text-neutral-700 mt-3 max-w-3xl leading-relaxed">
          How does a lab&rsquo;s assistant personality change from one model version to the next? Each line below
          tracks a single dimension as the lab&rsquo;s flagship model evolves. All scores are self-framing means.
        </p>
      </section>

      {getFamilies().filter((f) => f.versions.length >= 2).map((family) => (
        <FamilySection key={family.id} family={family} dimensionLabels={dimensionLabels} />
      ))}
    </div>
  );
}

function FamilySection({
  family,
  dimensionLabels,
}: {
  family: FamilyLineage;
  dimensionLabels: Record<string, string>;
}) {
  const xLabels = family.versions.map((v) => v.label);
  const familyColor = colorForModel(family.versions[0].modelId);

  return (
    <section>
      <h2 className="serif text-xl font-semibold text-neutral-900 mb-1">{family.label}</h2>
      <p className="text-xs text-neutral-500 mb-5">
        {family.versions.length} versions, oldest first.{" "}
        <span style={{ color: familyColor }}>—— family color: {family.vendor}</span>
      </p>
      <div className="grid md:grid-cols-2 gap-6">
        {DRIFT_DIMENSIONS.map((group) => {
          const data = getDriftDataForInstrument(group.instrumentId).filter(
            (r) => r.framing === "self" && group.dimensions.includes(r.dimension),
          );
          const seriesByDim = new Map<string, LineSeries>();
          for (const d of group.dimensions) {
            const points: { x: string; y: number }[] = [];
            for (const v of family.versions) {
              const row = data.find((r) => r.modelId === v.modelId && r.dimension === d);
              if (row) points.push({ x: v.label, y: row.mean });
            }
            if (points.length >= 2) {
              seriesByDim.set(d, {
                name: dimensionLabels[d] ?? d,
                color: DIM_COLORS[d] ?? "#525252",
                points,
              });
            }
          }
          if (seriesByDim.size === 0) return null;
          const series = Array.from(seriesByDim.values());
          return (
            <div key={group.instrumentId} className="card p-5">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="serif text-base font-semibold text-neutral-900">{group.label}</h3>
                <Link href={`/instruments/${group.instrumentId}`} className="text-xs text-neutral-500 hover:text-[var(--primary)]">
                  instrument →
                </Link>
              </div>
              <div className="mb-3">
                <LineChartLegend series={series} />
              </div>
              <LineChart series={series} xLabels={xLabels} yMin={group.scaleMin} yMax={group.scaleMax} />
            </div>
          );
        })}
      </div>
    </section>
  );
}
