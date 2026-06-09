import Link from "next/link";
import { notFound } from "next/navigation";
import { getDimensionScores, getInstrumentInfo } from "@/lib/queries";
import { DIMENSION_GUIDES } from "@/lib/interpretations";
import { RadarChart, colorForModel } from "@/components/RadarChart";
import { buildMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const info = getInstrumentInfo(id);
  if (!info) return buildMetadata({ title: "Instrument", description: "Personality Bench instrument page.", path: `/instruments/${id}` });
  const dims: string[] = (() => { try { return JSON.parse(info.dimensions); } catch { return []; } })();
  return buildMetadata({
    title: info.name,
    description:
      info.description ||
      `${info.name}${info.itemCount ? ` (${info.itemCount} items)` : ""} — administered to every model in the Personality Bench dataset under both self and human-typical framings.${dims.length ? ` Dimensions: ${dims.length}.` : ""}`,
    path: `/instruments/${id}`,
  });
}

type Framing = "self" | "human" | "both";

export default async function InstrumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ framing?: Framing }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const framing: Framing = sp.framing ?? "self";

  const info = getInstrumentInfo(id);
  if (!info) notFound();

  const scores = getDimensionScores(id);
  const dims: string[] = JSON.parse(info.dimensions);

  // Build per-model, per-framing data
  const byModel = new Map<string, { displayName: string; self: Record<string, number>; human: Record<string, number> }>();
  for (const s of scores) {
    if (!byModel.has(s.modelId)) {
      byModel.set(s.modelId, { displayName: s.displayName, self: {}, human: {} });
    }
    const m = byModel.get(s.modelId)!;
    (s.framing === "self" ? m.self : m.human)[s.dimension] = s.meanScore;
  }

  const dimLabels = Object.fromEntries(
    dims.map((d) => [d, scores.find((s) => s.dimension === d)?.dimensionLabel ?? DIMENSION_GUIDES[d]?.label ?? d]),
  );

  // Compose radar series depending on framing toggle
  const modelsList = Array.from(byModel.entries());
  const radarSeries: { name: string; values: number[]; color: string; dashed?: boolean }[] = [];
  for (const [modelId, m] of modelsList) {
    const color = colorForModel(modelId);
    if ((framing === "self" || framing === "both") && dims.every((d) => m.self[d] !== undefined)) {
      radarSeries.push({ name: framing === "both" ? `${m.displayName} (self)` : m.displayName, values: dims.map((d) => m.self[d]), color });
    }
    if ((framing === "human" || framing === "both") && dims.every((d) => m.human[d] !== undefined)) {
      radarSeries.push({ name: framing === "both" ? `${m.displayName} (human)` : m.displayName, values: dims.map((d) => m.human[d]), color, dashed: true });
    }
  }

  const scaleRange = info.scaleMax - info.scaleMin;

  return (
    <div className="space-y-10">
      <section>
        <Link href="/instruments" className="text-xs text-neutral-500 hover:text-[var(--primary)]">← all instruments</Link>
        <h1 className="serif text-3xl font-semibold tracking-tight mt-2 text-neutral-900">{info.name}</h1>
        <p className="text-neutral-700 mt-3 leading-relaxed max-w-3xl">{info.description}</p>
        <p className="text-xs text-neutral-500 mt-3 italic">{info.citation}</p>
        <div className="text-xs text-neutral-500 mt-1">
          {info.itemCount} items · scale {info.scaleMin}–{info.scaleMax} · {info.license}
        </div>
      </section>

      <FramingTabs id={id} active={framing} />

      {scores.length === 0 ? (
        <div className="card p-5 text-sm text-neutral-600">No runs yet for this instrument.</div>
      ) : (
        <>
          {dims.length >= 3 && radarSeries.length > 0 ? (
            <section className="card p-6">
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="serif text-xl font-semibold text-neutral-900">
                  All models · {framing === "self" ? "Self" : framing === "human" ? "Human" : "Both framings"}
                </h2>
                <span className="text-xs text-neutral-500">Scale {info.scaleMin}–{info.scaleMax}</span>
              </div>
              <div className="grid md:grid-cols-[2fr_1fr] gap-6 items-center">
                <RadarChart
                  dimensions={dims.map((d) => dimLabels[d])}
                  series={radarSeries}
                  scaleMin={info.scaleMin}
                  scaleMax={info.scaleMax}
                  size={440}
                />
                <div className="space-y-1.5 text-sm">
                  {radarSeries.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span
                        className="inline-block w-3.5 h-3.5 rounded-sm flex-shrink-0"
                        style={{
                          background: s.color,
                          opacity: s.dashed ? 0.4 : 1,
                          border: s.dashed ? `1.5px dashed ${s.color}` : "none",
                        }}
                      />
                      <span className="text-neutral-800">{s.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          {/* Comparison table — one row per model, columns for self / human / Δ side-by-side */}
          <ComparisonTable
            modelsList={modelsList}
            dims={dims}
            dimLabels={dimLabels}
            scaleMin={info.scaleMin}
            scaleMax={info.scaleMax}
          />

          {/* Per-dimension detail with interpretive guide */}
          <section className="space-y-6">
            <h2 className="serif text-xl font-semibold text-neutral-900">By dimension</h2>
            {dims.map((dim) => {
              const guide = DIMENSION_GUIDES[dim];
              const label = dimLabels[dim] ?? dim;
              return (
                <div key={dim} className="card p-5">
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="serif text-lg font-semibold text-neutral-900">{label}</h3>
                  </div>
                  {guide ? (
                    <div className="text-sm text-neutral-700 mb-4 max-w-3xl">
                      <div>{guide.blurb}</div>
                      <div className="mt-1.5 grid md:grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="font-medium text-[var(--positive)]">High:</span>{" "}
                          <span className="text-neutral-700">{guide.high}</span>
                        </div>
                        <div>
                          <span className="font-medium text-neutral-700">Low:</span>{" "}
                          <span className="text-neutral-700">{guide.low}</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  <table className="w-full text-sm">
                    <thead className="text-neutral-500 border-b border-[var(--border)]">
                      <tr>
                        <th className="text-left py-1.5 pr-4 font-medium">Model</th>
                        <th className="text-right py-1.5 pr-3 font-medium">Self</th>
                        <th className="text-right py-1.5 pr-3 font-medium">Human</th>
                        <th className="text-right py-1.5 pr-4 font-medium">Δ</th>
                        <th className="text-left py-1.5 pl-4 font-medium">Self vs human (bar)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modelsList
                        .map(([modelId, m]) => ({
                          modelId,
                          displayName: m.displayName,
                          self: m.self[dim],
                          human: m.human[dim],
                        }))
                        .sort((a, b) => (b.self ?? 0) - (a.self ?? 0))
                        .map((r) => {
                          const color = colorForModel(r.modelId);
                          const selfPct = r.self != null ? ((r.self - info.scaleMin) / scaleRange) * 100 : 0;
                          const humanPct = r.human != null ? ((r.human - info.scaleMin) / scaleRange) * 100 : 0;
                          const delta = r.self != null && r.human != null ? r.self - r.human : null;
                          return (
                            <tr key={r.modelId} className="border-b border-[var(--soft)]">
                              <td className="py-1.5 pr-4 font-mono text-xs">
                                <Link href={`/models/${encodeURIComponent(r.modelId)}`} className="text-neutral-800 hover:text-[var(--primary)]">
                                  {r.displayName}
                                </Link>
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums font-medium" style={{ color }}>
                                {r.self != null ? r.self.toFixed(2) : "—"}
                              </td>
                              <td className="py-1.5 pr-3 text-right tabular-nums text-neutral-600">
                                {r.human != null ? r.human.toFixed(2) : "—"}
                              </td>
                              <td
                                className="py-1.5 pr-4 text-right tabular-nums text-xs"
                                style={{
                                  color:
                                    delta != null && Math.abs(delta) > 0.5
                                      ? delta > 0
                                        ? "var(--positive)"
                                        : "var(--warning)"
                                      : "var(--muted)",
                                }}
                              >
                                {delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}` : "—"}
                              </td>
                              <td className="py-1.5 pl-4 w-56">
                                <div className="relative h-3">
                                  {r.human != null ? (
                                    <div
                                      className="absolute h-1 top-1 rounded-full"
                                      style={{ width: `${humanPct}%`, background: "#9ca3af" }}
                                    />
                                  ) : null}
                                  {r.self != null ? (
                                    <div
                                      className="absolute h-2 top-0.5 rounded-full"
                                      style={{ width: `${selfPct}%`, background: color }}
                                    />
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

function FramingTabs({ id, active }: { id: string; active: Framing }) {
  const tabs: { key: Framing; label: string }[] = [
    { key: "self", label: "Self (model as itself)" },
    { key: "human", label: "Human (model as typical human)" },
    { key: "both", label: "Both" },
  ];
  return (
    <div className="flex gap-1 border-b border-[var(--border)]">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={`/instruments/${id}?framing=${t.key}`}
          className={
            "px-4 py-2 text-sm border-b-2 -mb-px " +
            (active === t.key
              ? "border-[var(--primary)] text-[var(--primary)] font-medium"
              : "border-transparent text-neutral-600 hover:text-[var(--primary)]")
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

function ComparisonTable({
  modelsList,
  dims,
  dimLabels,
  scaleMin,
  scaleMax,
}: {
  modelsList: [string, { displayName: string; self: Record<string, number>; human: Record<string, number> }][];
  dims: string[];
  dimLabels: Record<string, string>;
  scaleMin: number;
  scaleMax: number;
}) {
  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="serif text-lg font-semibold text-neutral-900">Side-by-side: self vs human, all dimensions</h2>
        <span className="text-xs text-neutral-500">colored = strongest endorsement per row</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-neutral-500 border-b border-[var(--border)]">
            <tr>
              <th className="text-left py-2 pr-4 font-medium">Model</th>
              {dims.map((d) => (
                <th key={d} className="text-right py-2 pr-3 font-medium" colSpan={2}>
                  {dimLabels[d]}
                </th>
              ))}
            </tr>
            <tr className="text-[10px] text-neutral-400">
              <th></th>
              {dims.flatMap((d) => [
                <th key={d + "_s"} className="text-right py-1 pr-2 font-normal">self</th>,
                <th key={d + "_h"} className="text-right py-1 pr-3 font-normal">human</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {modelsList.map(([modelId, m]) => {
              const color = colorForModel(modelId);
              return (
                <tr key={modelId} className="border-b border-[var(--soft)]">
                  <td className="py-1.5 pr-4 font-mono text-xs">
                    <Link href={`/models/${encodeURIComponent(modelId)}`} className="text-neutral-800 hover:text-[var(--primary)]">
                      {m.displayName}
                    </Link>
                  </td>
                  {dims.flatMap((d) => {
                    const s = m.self[d];
                    const h = m.human[d];
                    return [
                      <td key={d + "_s"} className="py-1.5 pr-2 text-right tabular-nums font-medium" style={{ color }}>
                        {s != null ? s.toFixed(2) : "—"}
                      </td>,
                      <td key={d + "_h"} className="py-1.5 pr-3 text-right tabular-nums text-neutral-600">
                        {h != null ? h.toFixed(2) : "—"}
                      </td>,
                    ];
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
