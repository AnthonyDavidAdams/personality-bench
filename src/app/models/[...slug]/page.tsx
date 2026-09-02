import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { rawSqlite } from "@/lib/db";
import { RadarChart, RadarLegend, colorForModel } from "@/components/RadarChart";
import { Bodygraph, BodygraphLegend } from "@/components/Bodygraph";
import { DIMENSION_GUIDES } from "@/lib/interpretations";
import { getModelProfile } from "@/lib/model_profiles";
import { getBirthChart } from "@/lib/birth_chart";
import { computeModelFindings } from "@/lib/findings";
import { ZodiacIcon, ELEMENT_COLORS } from "@/components/ZodiacIcon";
import { ScatterChart } from "@/components/ScatterChart";
import { interpretInstrumentForModel } from "@/lib/instrument_interpretation";
import { buildMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

const MODEL_ARCHETYPE_ART: Record<string, string> = {
  "anthropic/claude-opus-4.8":     "/art/archetype_claude.png",
  "anthropic/claude-fable-5.1":    "/art/archetype_claude_fable_5_1.png",
  "anthropic/claude-fable-5":      "/art/archetype_claude_fable.png",
  "openai/gpt-5.5":                "/art/archetype_gpt.png",
  "google/gemini-2.5-pro":         "/art/archetype_gemini.png",
  "google/gemini-3.1-pro-preview": "/art/archetype_gemini_3_1.png",
  "x-ai/grok-4.20":                "/art/archetype_grok.png",
  "deepseek/deepseek-r1-0528":     "/art/archetype_deepseek.png",
  "meta-llama/llama-4-maverick":   "/art/archetype_llama.png",
  "mistralai/mistral-large-2512":  "/art/archetype_mistral.png",
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const modelId = slug.map(decodeURIComponent).join("/");
  const db = rawSqlite();
  const model = db.prepare(`SELECT display_name as name FROM models WHERE id=?`).get(modelId) as { name?: string } | undefined;
  if (!model?.name) return buildMetadata({ title: "Model", description: "Personality Bench model page.", path: `/models/${modelId}` });
  const findings = computeModelFindings(modelId, model.name);
  const archetype = findings.bigFiveLabel ? ` — ${findings.bigFiveLabel}` : "";
  const candidate = MODEL_ARCHETYPE_ART[modelId];
  const image = candidate && fs.existsSync(path.join(process.cwd(), "public", candidate)) ? candidate : undefined;
  return buildMetadata({
    title: model.name,
    ogTitle: `${model.name}${archetype}`,
    description: findings.summary || `Personality self-report for ${model.name} across 14 standard psychometric instruments, with cross-version drift analysis.`,
    path: `/models/${modelId}`,
    image,
  });
}

function fmtUsd(n: number) {
  if (!n) return "$0";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}

export default async function ModelPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const modelId = slug.map(decodeURIComponent).join("/");
  const db = rawSqlite();
  const model = db.prepare(`SELECT * FROM models WHERE id=?`).get(modelId) as any;
  if (!model) notFound();
  const profile = getModelProfile(modelId);
  const chart = getBirthChart(modelId);
  const vendorColor = colorForModel(modelId);
  const findings = computeModelFindings(modelId, model.display_name);

  const stats = db
    .prepare(
      `SELECT COUNT(*) AS runs, COALESCE(SUM(cost_usd),0) AS cost,
              COALESCE(SUM(prompt_tokens),0) AS in_tok, COALESCE(SUM(completion_tokens),0) AS out_tok,
              COALESCE(SUM(reasoning_tokens),0) AS r_tok, AVG(latency_ms) AS lat
       FROM runs WHERE model_id=? AND status='completed'`,
    )
    .get(modelId) as any;

  const dimRows = db
    .prepare(
      `SELECT i.id as inst_id, i.short_name as inst_name, i.scale_min as scaleMin, i.scale_max as scaleMax,
              i.dimensions as inst_dims, s.dimension, d.label as dimLabel, r.framing, AVG(s.mean) as meanScore
       FROM scores s
       JOIN runs r ON r.id = s.run_id
       JOIN instruments i ON i.id = r.instrument_id
       LEFT JOIN dimensions d ON d.id = s.dimension
       WHERE r.model_id=? AND r.status='completed'
       GROUP BY i.id, s.dimension, r.framing
       ORDER BY i.short_name`,
    )
    .all(modelId) as any[];

  const byInst = new Map<
    string,
    {
      instName: string;
      scaleMin: number;
      scaleMax: number;
      dimensionsOrdered: string[];
      self: Record<string, { score: number; label: string }>;
      human: Record<string, { score: number; label: string }>;
    }
  >();
  for (const r of dimRows) {
    if (!byInst.has(r.inst_id)) {
      byInst.set(r.inst_id, {
        instName: r.inst_name,
        scaleMin: r.scaleMin,
        scaleMax: r.scaleMax,
        dimensionsOrdered: JSON.parse(r.inst_dims),
        self: {},
        human: {},
      });
    }
    const entry = byInst.get(r.inst_id)!;
    const bucket = r.framing === "self" ? entry.self : entry.human;
    bucket[r.dimension] = {
      score: r.meanScore,
      label: r.dimLabel ?? DIMENSION_GUIDES[r.dimension]?.label ?? r.dimension,
    };
  }

  return (
    <div className="space-y-10">
      <section>
        <Link href="/models" className="text-xs text-neutral-500 hover:text-[var(--primary)]">← all models</Link>
        <div className="flex items-baseline justify-between mt-2 gap-4">
          <h1 className="serif text-3xl font-semibold tracking-tight" style={{ color: vendorColor }}>
            {model.display_name}
          </h1>
          {chart?.sun ? (
            <div className="flex items-center gap-2 text-sm text-neutral-700" title={chart.sun.blurb}>
              <span style={{ color: ELEMENT_COLORS[chart.sun.element] }}>
                <ZodiacIcon sign={chart.sun.sign} size={20} />
              </span>
              <span>{chart.sun.sign}</span>
            </div>
          ) : null}
        </div>
        <div className="text-xs text-neutral-500 font-mono mt-1">{model.id}</div>
        {profile ? (
          <div className="card mt-4 p-5">
            <div className="text-sm text-neutral-800 leading-relaxed">{profile.blurb}</div>
            <div className="text-xs text-neutral-600 mt-3">
              <strong className="text-neutral-800">{profile.vendor}</strong> · {profile.hqCity}, {profile.hqCountry}
              {" "}({profile.hqLat.toFixed(2)}°, {profile.hqLon.toFixed(2)}°)
              {" "}· released {profile.releaseDate}
              {profile.releaseTime ? ` at ${profile.releaseTime} UTC` : ""}
              {profile.predecessor ? <> · previous: <span className="font-mono">{profile.predecessor}</span></> : null}
            </div>
            {profile.releaseTimeNote ? (
              <div className="text-xs text-neutral-500 mt-1 italic">{profile.releaseTimeNote}</div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Findings narrative panel — auto-generated from the actual data */}
      {findings.bullets.length > 0 ? (
        <section className="card p-6">
          <div className="text-xs uppercase tracking-widest text-[var(--accent)] mb-2">Findings</div>
          {findings.bigFiveLabel ? (
            <div className="serif text-2xl text-neutral-900 mb-2">{findings.bigFiveLabel}</div>
          ) : null}
          <p className="text-neutral-800 leading-relaxed mb-4">{findings.summary}</p>
          <ul className="space-y-1.5 text-sm">
            {findings.bullets.map((b, i) => (
              <li key={i} className="flex gap-3">
                <span className="text-xs text-neutral-400 font-mono mt-1 flex-shrink-0">{b.family}</span>
                <span className="text-neutral-800">{b.narrative}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Runs" value={String(stats.runs)} />
        <Stat label="Total spent" value={fmtUsd(stats.cost)} />
        <Stat label="Tokens in / out" value={`${stats.in_tok.toLocaleString()} / ${stats.out_tok.toLocaleString()}`} />
        <Stat label="Avg latency" value={stats.lat ? `${(stats.lat / 1000).toFixed(1)}s` : "—"} />
      </section>

      {byInst.size === 0 ? (
        <div className="card p-5 text-sm text-neutral-600">No runs yet for this model.</div>
      ) : (
        <section className="space-y-12">
          {Array.from(byInst.entries()).map(([instId, data]) => {
            const dimsWithBoth = data.dimensionsOrdered.filter(
              (d) => data.self[d] !== undefined || data.human[d] !== undefined,
            );
            const labels = dimsWithBoth.map((d) => data.self[d]?.label ?? data.human[d]?.label ?? d);
            const interp = interpretInstrumentForModel(modelId, instId);
            const selfVals = dimsWithBoth.map((d) => data.self[d]?.score ?? 0);
            const humanVals = dimsWithBoth.map((d) => data.human[d]?.score ?? 0);
            const series = [
              ...(selfVals.some((v) => v > 0)
                ? [{ name: "self", values: selfVals, color: vendorColor }]
                : []),
              ...(humanVals.some((v) => v > 0)
                ? [{ name: "human", values: humanVals, color: "#737373", dashed: true }]
                : []),
            ];
            return (
              <div key={instId}>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="serif text-xl font-semibold text-neutral-900">{data.instName}</h2>
                  <Link href={`/instruments/${instId}`} className="text-xs text-neutral-500 hover:text-[var(--primary)]">
                    full instrument page →
                  </Link>
                </div>
                {interp ? (
                  <div className="mb-4 max-w-3xl">
                    <div className="text-sm font-medium text-neutral-900 mb-1">{interp.headline}</div>
                    {interp.paragraphs.map((p, i) => (
                      <p key={i} className="text-sm text-neutral-700 leading-relaxed mt-1.5">{p}</p>
                    ))}
                  </div>
                ) : null}
                <div className="grid md:grid-cols-2 gap-6 items-start">
                  <div className="card p-4">
                    {dimsWithBoth.length >= 3 ? (
                      <>
                        <RadarChart
                          dimensions={labels}
                          series={series}
                          scaleMin={data.scaleMin}
                          scaleMax={data.scaleMax}
                        />
                        <div className="mt-2 flex justify-center">
                          <RadarLegend series={series} />
                        </div>
                      </>
                    ) : dimsWithBoth.length === 2 ? (
                      <TwoDimChart
                        instId={instId}
                        labels={labels}
                        dimsWithBoth={dimsWithBoth}
                        data={data}
                        vendorColor={vendorColor}
                      />
                    ) : (
                      <OneDimBar
                        dimsWithBoth={dimsWithBoth}
                        data={data}
                        vendorColor={vendorColor}
                      />
                    )}
                  </div>
                  <div>
                    <table className="w-full text-sm">
                      <thead className="text-neutral-500 border-b border-[var(--border)]">
                        <tr>
                          <th className="text-left py-1.5 pr-4 font-medium">Dimension</th>
                          <th className="text-right py-1.5 pr-3 font-medium">Self</th>
                          <th className="text-right py-1.5 pr-3 font-medium">Human</th>
                          <th className="text-right py-1.5 font-medium">Δ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dimsWithBoth.map((dim) => {
                          const guide = DIMENSION_GUIDES[dim];
                          const selfScore = data.self[dim]?.score;
                          const humanScore = data.human[dim]?.score;
                          const label = data.self[dim]?.label ?? data.human[dim]?.label ?? dim;
                          const delta = selfScore != null && humanScore != null ? selfScore - humanScore : null;
                          return (
                            <tr key={dim} className="border-b border-[var(--soft)] align-top">
                              <td className="py-2 pr-4">
                                <div className="text-neutral-900">{label}</div>
                                {guide ? (
                                  <div className="text-xs text-neutral-500 mt-0.5">{guide.blurb}</div>
                                ) : null}
                              </td>
                              <td
                                className="py-2 pr-3 text-right tabular-nums font-medium"
                                style={{ color: vendorColor }}
                              >
                                {selfScore != null ? selfScore.toFixed(2) : "—"}
                              </td>
                              <td className="py-2 pr-3 text-right tabular-nums text-neutral-600">
                                {humanScore != null ? humanScore.toFixed(2) : "—"}
                              </td>
                              <td
                                className="py-2 text-right tabular-nums text-xs"
                                style={{
                                  color: delta != null && Math.abs(delta) > 0.5
                                    ? delta > 0 ? "var(--positive)" : "var(--warning)"
                                    : "var(--muted)",
                                }}
                              >
                                {delta != null ? `${delta > 0 ? "+" : ""}${delta.toFixed(2)}` : "—"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* Birth chart panel — sun + moon + Human Design from Swiss Ephemeris.
          Placed at the end of the model page since this is editorial/playful, not core data. */}
      {chart ? (
        <section className="card p-6">
          <div className="flex items-baseline justify-between mb-3">
            <div className="text-xs uppercase tracking-widest text-[var(--accent)]">Birth chart (for fun)</div>
            <div className="text-[10px] text-neutral-500 italic">
              Treating model release as a "birth" — playful, not literal
            </div>
          </div>
          {profile ? (
            <div className="text-xs text-neutral-600 mb-4 bg-[var(--soft)] rounded px-3 py-2">
              <strong className="text-neutral-800">Inputs used:</strong> {profile.releaseDate} at {profile.releaseTime ?? "12:00"} UTC,
              {" "}{profile.hqCity} ({profile.hqLat.toFixed(2)}°, {profile.hqLon.toFixed(2)}°).
              {profile.releaseTimeNote ? <span className="italic"> {profile.releaseTimeNote}</span> : null}
            </div>
          ) : null}
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wide">Sun</div>
              {chart.sun ? (
                <>
                  <div className="flex items-center gap-2 mt-1">
                    <span style={{ color: ELEMENT_COLORS[chart.sun.element] }}>
                      <ZodiacIcon sign={chart.sun.sign} size={32} strokeWidth={1.5} />
                    </span>
                    <span className="serif text-xl">{chart.sun.sign}</span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">{chart.sun.element} · {chart.sun.modality}</div>
                  <div className="text-xs text-neutral-700 mt-2 leading-relaxed">{chart.sun.blurb}</div>
                </>
              ) : <div className="text-sm text-neutral-500">unknown</div>}
            </div>
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wide">Moon</div>
              {chart.moon ? (
                <>
                  <div className="flex items-center gap-2 mt-1">
                    <span style={{ color: ELEMENT_COLORS[chart.moon.element] }}>
                      <ZodiacIcon sign={chart.moon.sign} size={32} strokeWidth={1.5} />
                    </span>
                    <span className="serif text-xl">{chart.moon.sign}</span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">{chart.moon.element} · {chart.moon.modality}</div>
                  <div className="text-xs text-neutral-700 mt-2 leading-relaxed">{chart.moon.blurb}</div>
                </>
              ) : <div className="text-sm text-neutral-500">unknown</div>}
            </div>
            <div>
              <div className="text-xs text-neutral-500 uppercase tracking-wide">Human Design</div>
              {chart.hd ? (
                <>
                  <div className="serif text-xl mt-1">{chart.hd.type}</div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {chart.hd.profile} · {chart.hd.authority}
                  </div>
                  <div className="text-xs text-neutral-700 mt-2 leading-relaxed">
                    {chart.hd.incarnationCross}
                  </div>
                </>
              ) : <div className="text-sm text-neutral-500">{chart.hdError ?? "unknown"}</div>}
            </div>
          </div>
          {chart.hd ? (
            <div className="grid md:grid-cols-[auto_1fr] gap-6 items-start pt-4 border-t border-[var(--border)]">
              <div>
                <Bodygraph chart={chart.hd} size={420} />
                <div className="mt-2">
                  <BodygraphLegend />
                </div>
              </div>
              <div className="text-xs text-neutral-700 space-y-3">
                <div>
                  <div className="font-semibold text-neutral-900 mb-1">Defined centers ({chart.hd.definedCenters.length}/9)</div>
                  <div>{chart.hd.definedCenters.join(", ")}</div>
                </div>
                <div>
                  <div className="font-semibold text-neutral-900 mb-1">Defined channels ({chart.hd.definedChannels.length})</div>
                  <div className="font-mono text-[11px] text-neutral-600">{chart.hd.definedChannels.join(", ") || "none"}</div>
                </div>
                <div className="text-[10px] text-neutral-500 italic pt-2 border-t border-[var(--soft)]">
                  Computed via Swiss Ephemeris (Moshier mode) from the model's announced release date, time, and HQ
                  coordinates. Validated against three independent reference charts (Jobs, Winfrey, Einstein).
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl serif font-semibold mt-1 tabular-nums text-neutral-900">{value}</div>
    </div>
  );
}

interface TwoDimData {
  instName: string;
  scaleMin: number;
  scaleMax: number;
  dimensionsOrdered: string[];
  self: Record<string, { score: number; label: string }>;
  human: Record<string, { score: number; label: string }>;
}

function TwoDimChart({
  instId,
  labels,
  dimsWithBoth,
  data,
  vendorColor,
}: {
  instId: string;
  labels: string[];
  dimsWithBoth: string[];
  data: TwoDimData;
  vendorColor: string;
}) {
  // Specific handling for attachment (ECR-12): quadrant scatter
  if (instId === "ecr12") {
    const xDim = "attachment_anxiety";
    const yDim = "attachment_avoidance";
    const pts = [];
    if (data.self[xDim] && data.self[yDim]) {
      pts.push({
        x: data.self[xDim].score,
        y: data.self[yDim].score,
        label: "self",
        color: vendorColor,
      });
    }
    if (data.human[xDim] && data.human[yDim]) {
      pts.push({
        x: data.human[xDim].score,
        y: data.human[yDim].score,
        label: "human",
        color: "#737373",
      });
    }
    return (
      <ScatterChart
        points={pts}
        xLabel="Attachment Anxiety →"
        yLabel="Attachment Avoidance →"
        xMin={data.scaleMin}
        xMax={data.scaleMax}
        yMin={data.scaleMin}
        yMax={data.scaleMax}
        quadrantLabels={["Anxious-Preoccupied", "Fearful-Avoidant", "Secure", "Dismissive-Avoidant"]}
      />
    );
  }
  // Generic 2D: simple side-by-side bars
  return <OneDimBar dimsWithBoth={dimsWithBoth} data={data} vendorColor={vendorColor} />;
}

function OneDimBar({
  dimsWithBoth,
  data,
  vendorColor,
}: {
  dimsWithBoth: string[];
  data: TwoDimData;
  vendorColor: string;
}) {
  const scaleRange = data.scaleMax - data.scaleMin;
  return (
    <div className="space-y-3 p-2">
      {dimsWithBoth.map((dim) => {
        const selfScore = data.self[dim]?.score;
        const humanScore = data.human[dim]?.score;
        const label = data.self[dim]?.label ?? data.human[dim]?.label ?? dim;
        const selfPct = selfScore != null ? ((selfScore - data.scaleMin) / scaleRange) * 100 : 0;
        const humanPct = humanScore != null ? ((humanScore - data.scaleMin) / scaleRange) * 100 : 0;
        return (
          <div key={dim}>
            <div className="flex justify-between text-xs text-neutral-700 mb-1">
              <span className="font-medium">{label}</span>
              <span className="tabular-nums">
                self {selfScore?.toFixed(2) ?? "—"} · human {humanScore?.toFixed(2) ?? "—"}
              </span>
            </div>
            <div className="relative h-3 bg-[var(--soft)] rounded-full overflow-hidden">
              {humanScore != null ? (
                <div
                  className="absolute h-1.5 top-[3px] rounded-full"
                  style={{ width: `${humanPct}%`, background: "#737373" }}
                />
              ) : null}
              {selfScore != null ? (
                <div
                  className="absolute h-3 top-0 rounded-full"
                  style={{ width: `${selfPct}%`, background: vendorColor, mixBlendMode: "multiply" }}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
