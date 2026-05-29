/**
 * Pure-SVG line chart for cross-version drift visualization.
 * Matches the editorial style of RadarChart — single stroke weight, no fills,
 * color inherits from per-series spec.
 */

export interface LineSeries {
  name: string;
  color: string;
  points: { x: string; y: number }[];   // x = version label, y = score
  /** Pretty-formatter for tooltip-style labels in the chart. */
  unit?: string;
}

interface LineChartProps {
  series: LineSeries[];
  xLabels: string[];          // ordered version labels for the x-axis
  yMin: number;
  yMax: number;
  yLabel?: string;
  width?: number;
  height?: number;
  showDots?: boolean;
}

export function LineChart({
  series,
  xLabels,
  yMin,
  yMax,
  yLabel,
  width = 560,
  height = 280,
  showDots = true,
}: LineChartProps) {
  const PADL = 50;
  const PADR = 18;
  const PADT = 16;
  const PADB = 50;
  const plotW = width - PADL - PADR;
  const plotH = height - PADT - PADB;
  const n = xLabels.length;

  function xPos(i: number): number {
    if (n === 1) return PADL + plotW / 2;
    return PADL + (i / (n - 1)) * plotW;
  }
  function yPos(v: number): number {
    return PADT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;
  }

  // Y-axis ticks at min, max, and 3 midpoints
  const yTicks = 5;
  const tickValues = Array.from({ length: yTicks }, (_, i) => yMin + ((yMax - yMin) * i) / (yTicks - 1));

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" role="img" aria-label="Cross-version drift line chart">
      {/* y-axis grid + ticks */}
      {tickValues.map((v) => (
        <g key={v}>
          <line x1={PADL} y1={yPos(v)} x2={width - PADR} y2={yPos(v)} stroke="var(--border)" strokeWidth={0.5} />
          <text x={PADL - 6} y={yPos(v) + 3} textAnchor="end" fontSize={9.5} fill="var(--muted)">
            {v.toFixed(1)}
          </text>
        </g>
      ))}
      {/* x-axis labels */}
      {xLabels.map((label, i) => (
        <text
          key={i}
          x={xPos(i)}
          y={height - PADB + 16}
          textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"}
          fontSize={10}
          fill="var(--foreground)"
        >
          {label}
        </text>
      ))}
      {/* y-axis label */}
      {yLabel ? (
        <text
          x={14}
          y={PADT + plotH / 2}
          textAnchor="middle"
          fontSize={10}
          fill="var(--muted)"
          transform={`rotate(-90 14 ${PADT + plotH / 2})`}
        >
          {yLabel}
        </text>
      ) : null}
      {/* series */}
      {series.map((s, sIdx) => {
        const path = s.points
          .map((p, i) => {
            const xi = xLabels.indexOf(p.x);
            if (xi === -1) return null;
            return `${i === 0 ? "M" : "L"}${xPos(xi).toFixed(1)} ${yPos(p.y).toFixed(1)}`;
          })
          .filter(Boolean)
          .join(" ");
        return (
          <g key={sIdx}>
            <path d={path} stroke={s.color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
            {showDots
              ? s.points.map((p, i) => {
                  const xi = xLabels.indexOf(p.x);
                  if (xi === -1) return null;
                  return <circle key={i} cx={xPos(xi)} cy={yPos(p.y)} r={3} fill={s.color} />;
                })
              : null}
          </g>
        );
      })}
    </svg>
  );
}

export function LineChartLegend({ series }: { series: LineSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {series.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-4 rounded-sm flex-shrink-0"
            style={{ background: s.color }}
          />
          <span className="text-neutral-800">{s.name}</span>
        </div>
      ))}
    </div>
  );
}
