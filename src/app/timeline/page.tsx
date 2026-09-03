import Link from "next/link";
import { rawSqlite } from "@/lib/db";
import { getModelProfile } from "@/lib/model_profiles";
import { colorForModel, VENDOR_COLORS } from "@/components/RadarChart";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Timeline",
  description:
    "The complete release timeline for every model in the Personality Bench dataset — by lab, by date, with each entrant's spend and run count.",
  path: "/timeline",
});

interface TimelineModel {
  modelId: string;
  displayName: string;
  vendor: string;
  releaseDate: string;
  totalSpend: number;
  totalRuns: number;
  promptTokens: number;
}

function getTimelineData(): TimelineModel[] {
  const db = rawSqlite();
  const stats = db
    .prepare(
      `SELECT r.model_id as modelId, m.display_name as displayName, m.vendor,
              ROUND(SUM(r.cost_usd), 4) as totalSpend,
              COUNT(*) as totalRuns,
              COALESCE(SUM(r.prompt_tokens), 0) as promptTokens
       FROM runs r LEFT JOIN models m ON m.id = r.model_id
       WHERE r.status='completed'
       GROUP BY r.model_id`,
    )
    .all() as { modelId: string; displayName: string; vendor: string; totalSpend: number; totalRuns: number; promptTokens: number }[];

  return stats
    .map((s) => {
      const profile = getModelProfile(s.modelId);
      if (!profile) return null;
      return {
        modelId: s.modelId,
        displayName: s.displayName ?? s.modelId,
        vendor: s.vendor ?? "",
        releaseDate: profile.releaseDate,
        totalSpend: s.totalSpend ?? 0,
        totalRuns: s.totalRuns ?? 0,
        promptTokens: s.promptTokens ?? 0,
      };
    })
    .filter((x): x is TimelineModel => x !== null)
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));
}

export default function TimelinePage() {
  const models = getTimelineData();
  if (models.length === 0) {
    return (
      <div className="card p-5 text-sm text-neutral-600">
        No models with release-date metadata yet. Add entries to src/lib/model_profiles.ts.
      </div>
    );
  }

  // Compute date range
  const dates = models.map((m) => new Date(m.releaseDate).getTime());
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);
  const rangeMs = Math.max(maxDate - minDate, 86400000);

  // Cumulative-model-count series
  const cumulativeData: { x: number; y: number }[] = [];
  let count = 0;
  for (const m of models) {
    count++;
    cumulativeData.push({ x: new Date(m.releaseDate).getTime(), y: count });
  }

  // Render dimensions for the SVG
  const W = 1100;
  const H = 480;
  const PADL = 60;
  const PADR = 40;
  const PADT = 40;
  const PADB = 90;
  const plotW = W - PADL - PADR;
  const plotH = H - PADT - PADB;

  function xPos(t: number): number {
    return PADL + ((t - minDate) / rangeMs) * plotW;
  }

  // Use a log-scale for spend (since one model dwarfs the others)
  const spends = models.map((m) => m.totalSpend).filter((s) => s > 0);
  const minSpend = Math.min(...spends, 0.01);
  const maxSpend = Math.max(...spends);
  function radius(spend: number): number {
    const minR = 4;
    const maxR = 22;
    if (spend <= 0) return minR;
    const lo = Math.log10(minSpend);
    const hi = Math.log10(maxSpend);
    const v = (Math.log10(spend) - lo) / Math.max(0.001, hi - lo);
    return minR + v * (maxR - minR);
  }

  // Vendor lane positions (vertical jitter to separate dots from the same lab in close dates)
  const VENDORS_LIST = ["anthropic", "openai", "google", "x-ai", "deepseek", "meta-llama", "mistralai"];
  function vendorLane(vendor: string): number {
    const i = VENDORS_LIST.indexOf(vendor);
    if (i < 0) return plotH * 0.5;
    return PADT + (i + 0.5) * (plotH / VENDORS_LIST.length);
  }

  // Format date for x-axis
  function dateLabel(t: number): string {
    const d = new Date(t);
    return `${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}`;
  }
  // Pick ~6 evenly-spaced tick dates
  const ticks: { t: number; label: string }[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = minDate + (rangeMs * i) / 6;
    ticks.push({ t, label: dateLabel(t) });
  }

  return (
    <div className="space-y-10">
      <section>
        <div className="eyebrow mb-2">Chronology</div>
        <h1 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Timeline of frontier model releases</h1>
        <p className="mt-3 text-neutral-700 max-w-3xl leading-relaxed">
          Every model in the dataset, plotted by its release date. Each dot is one model release; its size
          encodes the total inference spend that model has accumulated in this dataset (log scale), and its
          color encodes the lab. Vendor lanes are stacked vertically so multiple releases close in time are
          visually separated.
        </p>
      </section>

      <section className="card p-5">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          {/* X-axis (horizontal rule at bottom of plot area) */}
          <line x1={PADL} y1={PADT + plotH} x2={W - PADR} y2={PADT + plotH} stroke="var(--rule)" strokeWidth={1} />

          {/* Vendor lanes */}
          {VENDORS_LIST.map((v) => {
            const y = vendorLane(v);
            const color = VENDOR_COLORS[v] ?? "#888";
            const label = v === "x-ai" ? "xAI" : v === "meta-llama" ? "Meta" : v === "mistralai" ? "Mistral" : v.charAt(0).toUpperCase() + v.slice(1);
            return (
              <g key={v}>
                <line x1={PADL} y1={y} x2={W - PADR} y2={y} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2 4" />
                <text x={PADL - 10} y={y + 4} textAnchor="end" fontSize={11} fill={color} fontWeight={500}>{label}</text>
              </g>
            );
          })}

          {/* X-axis ticks */}
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={xPos(t.t)} y1={PADT + plotH} x2={xPos(t.t)} y2={PADT + plotH + 4} stroke="var(--muted)" strokeWidth={1} />
              <text x={xPos(t.t)} y={PADT + plotH + 18} textAnchor="middle" fontSize={10.5} fill="var(--muted)">{t.label}</text>
            </g>
          ))}

          {/* Cumulative count line (background) */}
          <path
            d={cumulativeData
              .map((p, i) => `${i === 0 ? "M" : "L"}${xPos(p.x).toFixed(1)} ${(PADT + plotH - (p.y / models.length) * plotH).toFixed(1)}`)
              .join(" ")}
            stroke="var(--accent)"
            strokeWidth={1.2}
            fill="none"
            strokeDasharray="4 3"
            opacity={0.4}
          />
          <text x={xPos(cumulativeData[cumulativeData.length - 1].x) + 6} y={PADT + plotH - (cumulativeData[cumulativeData.length - 1].y / models.length) * plotH + 4} fontSize={10} fill="var(--accent)" fontStyle="italic">
            cumulative count
          </text>

          {/* Model dots */}
          {models.map((m) => {
            const t = new Date(m.releaseDate).getTime();
            const cx = xPos(t);
            const cy = vendorLane(m.vendor);
            const r = radius(m.totalSpend);
            return (
              <g key={m.modelId}>
                <circle cx={cx} cy={cy} r={r} fill={colorForModel(m.modelId)} fillOpacity={0.8} stroke="white" strokeWidth={1.5}>
                  <title>{`${m.displayName}\n${m.releaseDate}\n${m.totalRuns} runs · $${m.totalSpend.toFixed(2)} spent`}</title>
                </circle>
              </g>
            );
          })}

          {/* Plot title */}
          <text x={PADL} y={PADT - 15} fontSize={11} fill="var(--muted)" fontStyle="italic">
            Dot size = log(total spend on this model in the dataset)
          </text>
        </svg>
      </section>

      <section className="card p-5">
        <h2 className="serif text-lg font-semibold mb-3 text-neutral-900">Model release log</h2>
        <p className="text-xs text-neutral-600 mb-3">Hover any dot above to see the model's name and stats. Full list, chronological:</p>
        <table className="w-full text-sm">
          <thead className="text-neutral-500 border-b border-[var(--border)]">
            <tr>
              <th className="text-left py-2 pr-4 font-medium">Date</th>
              <th className="text-left py-2 pr-4 font-medium">Lab</th>
              <th className="text-left py-2 pr-4 font-medium">Model</th>
              <th className="text-right py-2 pr-4 font-medium">Runs</th>
              <th className="text-right py-2 font-medium">Spend</th>
            </tr>
          </thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.modelId} className="border-b border-[var(--soft)]">
                <td className="py-1.5 pr-4 font-mono text-xs text-neutral-700">{m.releaseDate}</td>
                <td className="py-1.5 pr-4 text-xs" style={{ color: colorForModel(m.modelId) }}>{m.vendor}</td>
                <td className="py-1.5 pr-4">
                  <Link href={`/models/${encodeURIComponent(m.modelId)}`} className="text-neutral-900 hover:text-[var(--accent)]">
                    {m.displayName}
                  </Link>
                </td>
                <td className="py-1.5 pr-4 text-right tabular-nums">{m.totalRuns}</td>
                <td className="py-1.5 text-right tabular-nums">${m.totalSpend.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
