/**
 * Pure-SVG radar chart for personality profiles. No charting library dependency.
 *
 * Renders one or more "series" (model × framing) overlaid on the same axis system.
 * Designed for instruments with 2-10 dimensions on a 1-5 (or generic) Likert scale.
 */

export interface RadarSeries {
  name: string;
  /** Mean score per dimension, in the same order as `dimensions`. */
  values: number[];
  color: string;
  /** Optional dashed stroke for "human" framing. */
  dashed?: boolean;
}

interface RadarChartProps {
  dimensions: string[];          // axis labels
  series: RadarSeries[];
  scaleMin: number;
  scaleMax: number;
  size?: number;                 // square pixel size of viewBox
  rings?: number;                // number of concentric reference rings
}

export function RadarChart({
  dimensions,
  series,
  scaleMin,
  scaleMax,
  size = 360,
  rings = 4,
}: RadarChartProps) {
  // Dynamic padding so long labels (e.g. "Type 1 — The Reformer") never crop.
  // 6px per character is a generous over-approximation at our 11pt font.
  const longestLabel = dimensions.reduce((m, d) => Math.max(m, d.length), 0);
  const labelPadEstimate = Math.min(140, 24 + longestLabel * 6);
  const padding = Math.max(60, labelPadEstimate);

  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - padding * 2) / 2;
  const n = dimensions.length;
  if (n < 3) return null;

  // Polar → cartesian. Start at top (-π/2) and go clockwise.
  function point(value: number, axisIndex: number) {
    const t = -Math.PI / 2 + (axisIndex / n) * 2 * Math.PI;
    const r = ((value - scaleMin) / (scaleMax - scaleMin)) * radius;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as const;
  }
  function axisEnd(axisIndex: number) {
    const t = -Math.PI / 2 + (axisIndex / n) * 2 * Math.PI;
    return [cx + radius * Math.cos(t), cy + radius * Math.sin(t)] as const;
  }
  function labelPos(axisIndex: number) {
    const t = -Math.PI / 2 + (axisIndex / n) * 2 * Math.PI;
    const r = radius + 18;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)] as const;
  }

  const ringValues = Array.from({ length: rings }, (_, i) => scaleMin + ((scaleMax - scaleMin) * (i + 1)) / rings);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-auto" role="img" aria-label="Personality radar chart">
      {/* Reference rings */}
      {ringValues.map((v) => {
        const pts = Array.from({ length: n }, (_, i) => point(v, i));
        const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + " Z";
        return (
          <path
            key={v}
            d={d}
            fill="none"
            stroke="var(--border)"
            strokeWidth={0.7}
            strokeDasharray={v === scaleMax ? "" : "2 2"}
          />
        );
      })}
      {/* Axes */}
      {dimensions.map((_, i) => {
        const [x, y] = axisEnd(i);
        return (
          <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--border)" strokeWidth={0.5} />
        );
      })}
      {/* Series polygons */}
      {series.map((s, sIdx) => {
        const pts = s.values.map((v, i) => point(v, i));
        const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") + " Z";
        return (
          <g key={sIdx}>
            <path
              d={d}
              fill={s.color}
              fillOpacity={0.12}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "4 3" : ""}
            />
            {pts.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={2.4} fill={s.color} />
            ))}
          </g>
        );
      })}
      {/* Labels */}
      {dimensions.map((label, i) => {
        const [x, y] = labelPos(i);
        const t = -Math.PI / 2 + (i / n) * 2 * Math.PI;
        const anchor =
          Math.abs(Math.cos(t)) < 0.1 ? "middle" : Math.cos(t) > 0 ? "start" : "end";
        // Wrap long labels onto two lines on "Type N — Name" patterns.
        const parts = label.includes(" — ") ? label.split(" — ") : [label];
        return (
          <text
            key={i}
            x={x}
            y={y - (parts.length > 1 ? 6 : 0)}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={11}
            fill="var(--foreground)"
            fontWeight={500}
          >
            {parts.map((part, j) => (
              <tspan key={j} x={x} dy={j === 0 ? 0 : 13}>
                {part}
              </tspan>
            ))}
          </text>
        );
      })}
      {/* Scale numbers on top axis (12 o'clock position) */}
      {ringValues.map((v) => {
        const [, y] = point(v, 0);
        return (
          <text key={v} x={cx + 3} y={y - 2} fontSize={9} fill="var(--muted)">
            {v}
          </text>
        );
      })}
    </svg>
  );
}

export function RadarLegend({ series }: { series: RadarSeries[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {series.map((s, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-0.5"
            style={{
              background: s.color,
              borderTop: s.dashed ? `2px dashed ${s.color}` : `2px solid ${s.color}`,
              height: 0,
            }}
          />
          <span style={{ color: s.color }}>{s.name}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Vendor-keyed palette so each lab is always rendered in the same color across pages.
 * Hues are spread across the wheel but matched in saturation/value for visual harmony.
 */
export const VENDOR_COLORS: Record<string, string> = {
  anthropic: "#c2410c", // rust
  openai:    "#15803d", // forest
  google:    "#1f3a93", // EarthPilot blue
  xai:       "#18181b", // near-black
  "x-ai":    "#18181b",
  deepseek:  "#be185d", // rose
  meta:      "#4338ca", // indigo
  "meta-llama": "#4338ca",
  mistral:   "#6d28d9", // violet
  mistralai: "#6d28d9",
};

export const SERIES_COLORS = Object.values(VENDOR_COLORS);

/** Pick a color for a model id (slug starts with `<vendor>/...`). */
export function colorForModel(modelId: string): string {
  const vendor = modelId.split("/")[0];
  return VENDOR_COLORS[vendor] ?? "#525252";
}
