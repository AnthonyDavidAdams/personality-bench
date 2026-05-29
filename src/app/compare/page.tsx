import Link from "next/link";
import { rawSqlite } from "@/lib/db";
import { RadarChart, colorForModel } from "@/components/RadarChart";
import { DIMENSION_GUIDES } from "@/lib/interpretations";

export const dynamic = "force-dynamic";

interface SearchParams {
  models?: string | string[];
  instrument?: string;
  framing?: "self" | "human";
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const db = rawSqlite();

  // Load all available models + instruments for the picker.
  // Order: by vendor, then chronologically (older → newer) within each vendor.
  // Group label is the vendor name so the dropdown is organized.
  const allModelsRaw = db
    .prepare(
      `SELECT m.id, m.display_name as displayName, m.vendor,
              COALESCE(
                (SELECT MIN(r.completed_at) FROM runs r WHERE r.model_id = m.id AND r.status='completed'),
                0
              ) as firstRun
       FROM models m WHERE m.active=1`,
    )
    .all() as { id: string; displayName: string; vendor: string; firstRun: number }[];

  // Stable vendor order keyed by current frontier prominence.
  const VENDOR_ORDER: Record<string, number> = {
    anthropic: 1, openai: 2, google: 3, xai: 4, "x-ai": 4, deepseek: 5,
    meta: 6, "meta-llama": 6, mistralai: 7, mistral: 7,
  };
  const allModels = [...allModelsRaw].sort((a, b) => {
    const va = VENDOR_ORDER[a.vendor] ?? 99;
    const vb = VENDOR_ORDER[b.vendor] ?? 99;
    if (va !== vb) return va - vb;
    // Within vendor, sort by display name (which tends to follow version order, e.g. 4 < 4.7 < 4.8)
    return a.displayName.localeCompare(b.displayName, undefined, { numeric: true });
  });

  const allInstruments = db.prepare(`SELECT id, short_name as shortName, family, item_count as itemCount, scale_min as scaleMin, scale_max as scaleMax, dimensions FROM instruments ORDER BY family, short_name`).all() as any[];

  // Sensible default selection: the 7 current frontier models (one per major lab).
  const FRONTIER_DEFAULTS = [
    "anthropic/claude-opus-4.8",
    "openai/gpt-5.5",
    "google/gemini-2.5-pro",
    "x-ai/grok-4.20",
    "deepseek/deepseek-r1-0528",
    "meta-llama/llama-4-maverick",
    "mistralai/mistral-large-2512",
  ];

  const instrumentId = sp.instrument ?? "ipip50";
  const framing = sp.framing ?? "self";
  // `models` may arrive as a comma-separated string OR as a repeated query param (string[]).
  let selectedModelIds: string[];
  if (Array.isArray(sp.models)) {
    selectedModelIds = sp.models.flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
  } else if (typeof sp.models === "string" && sp.models.length > 0) {
    selectedModelIds = sp.models.split(",").map((s) => s.trim()).filter(Boolean);
  } else {
    selectedModelIds = FRONTIER_DEFAULTS.filter((id) => allModels.some((m) => m.id === id));
  }

  const instrument = allInstruments.find((i) => i.id === instrumentId);
  if (!instrument) {
    return <div className="text-neutral-600">Unknown instrument.</div>;
  }
  const dims: string[] = JSON.parse(instrument.dimensions);

  // Fetch dimension means for the selected models × instrument × framing
  const placeholders = selectedModelIds.map(() => "?").join(",");
  const rows = selectedModelIds.length
    ? (db
        .prepare(
          `SELECT r.model_id as modelId, m.display_name as displayName, s.dimension, AVG(s.mean) as meanScore
           FROM scores s
           JOIN runs r ON r.id = s.run_id
           JOIN models m ON m.id = r.model_id
           WHERE r.instrument_id = ? AND r.framing = ? AND r.status='completed' AND r.model_id IN (${placeholders})
           GROUP BY r.model_id, s.dimension`,
        )
        .all(instrumentId, framing, ...selectedModelIds) as any[])
    : [];

  // Pull dimension labels
  const dimLabelRows = db
    .prepare(
      `SELECT id, label FROM dimensions WHERE instrument_family = (SELECT family FROM instruments WHERE id=?)`,
    )
    .all(instrumentId) as { id: string; label: string }[];
  const dimLabels = Object.fromEntries(dimLabelRows.map((r) => [r.id, r.label]));

  // Build series
  const byModel = new Map<string, { displayName: string; scores: Record<string, number> }>();
  for (const r of rows) {
    if (!byModel.has(r.modelId)) byModel.set(r.modelId, { displayName: r.displayName, scores: {} });
    byModel.get(r.modelId)!.scores[r.dimension] = r.meanScore;
  }
  const series = Array.from(byModel.entries()).map(([id, m]) => ({
    modelId: id,
    name: m.displayName,
    values: dims.map((d) => m.scores[d] ?? 0),
    color: colorForModel(id),
  }));

  return (
    <div className="space-y-8">
      <section>
        <h1 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Compare models</h1>
        <p className="text-neutral-600 mt-2 max-w-2xl">
          Pick an instrument, a framing, and the models you want to overlay. Use the query params{" "}
          <code className="text-xs text-[var(--accent)]">?models=a,b&amp;instrument=ipip50&amp;framing=self</code>{" "}
          to share or bookmark a comparison.
        </p>
      </section>

      <section className="card p-5">
        <form className="space-y-4" method="get" action="/compare">
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-2">Instrument</label>
            <select
              name="instrument"
              defaultValue={instrumentId}
              className="border border-[var(--border)] rounded-md px-3 py-1.5 text-sm bg-white"
            >
              {allInstruments.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.shortName} — {i.family}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-2">Framing</label>
            <select
              name="framing"
              defaultValue={framing}
              className="border border-[var(--border)] rounded-md px-3 py-1.5 text-sm bg-white"
            >
              <option value="self">Self (model as itself)</option>
              <option value="human">Human (model as typical human)</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-800 mb-2">Models — grouped by vendor, older → newer</label>
            <div className="space-y-3">
              {Object.entries(
                allModels.reduce<Record<string, typeof allModels>>((acc, m) => {
                  const v = m.vendor === "x-ai" ? "xai" : m.vendor === "meta-llama" ? "meta" : m.vendor === "mistralai" ? "mistral" : m.vendor;
                  (acc[v] ??= []).push(m);
                  return acc;
                }, {}),
              )
                .sort(([a], [b]) => (VENDOR_ORDER[a] ?? 99) - (VENDOR_ORDER[b] ?? 99))
                .map(([vendor, models]) => (
                  <div key={vendor}>
                    <div className="text-xs uppercase tracking-wide text-neutral-500 mb-1">{vendor}</div>
                    <div className="grid md:grid-cols-2 gap-x-6 gap-y-0.5 pl-2">
                      {models.map((m) => (
                        <label key={m.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            name="models"
                            value={m.id}
                            defaultChecked={selectedModelIds.includes(m.id)}
                          />
                          <span className="text-neutral-800">{m.displayName}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
          <div className="pt-2">
            <button
              type="submit"
              className="px-4 py-2 rounded-md bg-neutral-900 text-white text-sm hover:bg-neutral-700"
            >
              Update comparison
            </button>
          </div>
        </form>
        <p className="text-xs text-neutral-500 mt-3">
          Tip: form submits as <code>?models=a&models=b</code>; the page also accepts{" "}
          <code>?models=a,b</code>.
        </p>
      </section>

      {series.length === 0 ? (
        <div className="card p-5 text-sm text-neutral-600">Select at least one model to see the comparison.</div>
      ) : dims.length < 3 ? (
        <ComparisonTable series={series} dims={dims} dimLabels={dimLabels} />
      ) : (
        <>
          <section className="card p-6">
            <h2 className="serif text-xl font-semibold mb-1 text-neutral-900">
              {instrument.shortName} — {framing === "self" ? "Self framing" : "Human framing"}
            </h2>
            <p className="text-xs text-neutral-500 mb-5">Scale {instrument.scaleMin}–{instrument.scaleMax}. Higher = stronger endorsement.</p>
            <div className="grid md:grid-cols-[2fr_1fr] gap-6 items-center">
              <RadarChart
                dimensions={dims.map((d) => dimLabels[d] ?? d)}
                series={series.map((s) => ({ name: s.name, values: s.values, color: s.color }))}
                scaleMin={instrument.scaleMin}
                scaleMax={instrument.scaleMax}
                size={460}
              />
              <div className="space-y-1.5">
                {series.map((s) => (
                  <div key={s.modelId} className="flex items-center gap-2 text-sm">
                    <span className="inline-block w-3 h-3 rounded-sm" style={{ background: s.color }} />
                    <Link href={`/models/${encodeURIComponent(s.modelId)}`} className="text-neutral-800 hover:text-[var(--accent)]">
                      {s.name}
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <ComparisonTable series={series} dims={dims} dimLabels={dimLabels} />
        </>
      )}
    </div>
  );
}

function ComparisonTable({
  series,
  dims,
  dimLabels,
}: {
  series: { modelId: string; name: string; values: number[]; color: string }[];
  dims: string[];
  dimLabels: Record<string, string>;
}) {
  return (
    <section className="card p-5">
      <h2 className="serif text-lg font-semibold mb-3 text-neutral-900">Scores table</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-neutral-500 border-b border-[var(--border)]">
            <tr>
              <th className="text-left py-1.5 pr-4 font-medium">Dimension</th>
              {series.map((s) => (
                <th key={s.modelId} className="text-right py-1.5 pr-3 font-medium" style={{ color: s.color }}>
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dims.map((dim, dIdx) => {
              const guide = DIMENSION_GUIDES[dim];
              const label = dimLabels[dim] ?? dim;
              const scores = series.map((s) => s.values[dIdx]);
              const max = Math.max(...scores);
              return (
                <tr key={dim} className="border-b border-[var(--soft)] align-top">
                  <td className="py-2 pr-4">
                    <div className="text-neutral-900">{label}</div>
                    {guide ? <div className="text-xs text-neutral-500 mt-0.5">{guide.blurb}</div> : null}
                  </td>
                  {series.map((s, sIdx) => {
                    const v = s.values[dIdx];
                    const isMax = v === max && series.length > 1;
                    return (
                      <td
                        key={s.modelId}
                        className="py-2 pr-3 text-right tabular-nums"
                        style={{ color: isMax ? s.color : undefined, fontWeight: isMax ? 600 : 400 }}
                      >
                        {v.toFixed(2)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
