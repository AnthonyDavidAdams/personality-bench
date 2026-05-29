/**
 * Pure-SVG 2D scatter chart with optional quadrant labels.
 * Designed for two-dimensional instruments like ECR attachment (Anxiety × Avoidance).
 */

export interface ScatterPoint {
  x: number;
  y: number;
  label: string;     // model display name
  color: string;
  /** Optional secondary label below the point (e.g. "Secure"). */
  sub?: string;
}

interface ScatterChartProps {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  /** Four quadrant labels, in order: top-left, top-right, bottom-left, bottom-right. */
  quadrantLabels?: [string, string, string, string];
  width?: number;
  height?: number;
}

export function ScatterChart({
  points,
  xLabel,
  yLabel,
  xMin,
  xMax,
  yMin,
  yMax,
  quadrantLabels,
  width = 460,
  height = 380,
}: ScatterChartProps) {
  const PADL = 60;
  const PADR = 30;
  const PADT = 36;
  const PADB = 50;
  const plotW = width - PADL - PADR;
  const plotH = height - PADT - PADB;

  const xMid = (xMin + xMax) / 2;
  const yMid = (yMin + yMax) / 2;
  const xPos = (v: number) => PADL + ((v - xMin) / (xMax - xMin)) * plotW;
  const yPos = (v: number) => PADT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  // Tick positions
  const xTicks = [xMin, xMid, xMax];
  const yTicks = [yMin, yMid, yMax];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="auto" role="img" aria-label="Scatter chart">
      {/* Axes */}
      <line x1={PADL} y1={PADT + plotH} x2={PADL + plotW} y2={PADT + plotH} stroke="var(--border)" strokeWidth={1} />
      <line x1={PADL} y1={PADT} x2={PADL} y2={PADT + plotH} stroke="var(--border)" strokeWidth={1} />

      {/* Quadrant dividing lines */}
      <line x1={xPos(xMid)} y1={PADT} x2={xPos(xMid)} y2={PADT + plotH} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3 3" />
      <line x1={PADL} y1={yPos(yMid)} x2={PADL + plotW} y2={yPos(yMid)} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3 3" />

      {/* Quadrant labels */}
      {quadrantLabels ? (
        <>
          <text x={PADL + plotW * 0.25} y={PADT + 14} textAnchor="middle" fontSize={9.5} fill="var(--muted-2)" fontStyle="italic">{quadrantLabels[0]}</text>
          <text x={PADL + plotW * 0.75} y={PADT + 14} textAnchor="middle" fontSize={9.5} fill="var(--muted-2)" fontStyle="italic">{quadrantLabels[1]}</text>
          <text x={PADL + plotW * 0.25} y={PADT + plotH - 6} textAnchor="middle" fontSize={9.5} fill="var(--muted-2)" fontStyle="italic">{quadrantLabels[2]}</text>
          <text x={PADL + plotW * 0.75} y={PADT + plotH - 6} textAnchor="middle" fontSize={9.5} fill="var(--muted-2)" fontStyle="italic">{quadrantLabels[3]}</text>
        </>
      ) : null}

      {/* X-axis ticks + labels */}
      {xTicks.map((t) => (
        <g key={`x${t}`}>
          <line x1={xPos(t)} y1={PADT + plotH} x2={xPos(t)} y2={PADT + plotH + 4} stroke="var(--muted)" strokeWidth={1} />
          <text x={xPos(t)} y={PADT + plotH + 16} textAnchor="middle" fontSize={9.5} fill="var(--muted)">{t.toFixed(1)}</text>
        </g>
      ))}
      <text x={PADL + plotW / 2} y={height - 14} textAnchor="middle" fontSize={10.5} fill="var(--foreground)" fontWeight={500}>{xLabel}</text>

      {/* Y-axis ticks + labels */}
      {yTicks.map((t) => (
        <g key={`y${t}`}>
          <line x1={PADL - 4} y1={yPos(t)} x2={PADL} y2={yPos(t)} stroke="var(--muted)" strokeWidth={1} />
          <text x={PADL - 7} y={yPos(t) + 3} textAnchor="end" fontSize={9.5} fill="var(--muted)">{t.toFixed(1)}</text>
        </g>
      ))}
      <text
        x={16}
        y={PADT + plotH / 2}
        textAnchor="middle"
        fontSize={10.5}
        fill="var(--foreground)"
        fontWeight={500}
        transform={`rotate(-90 16 ${PADT + plotH / 2})`}
      >
        {yLabel}
      </text>

      {/* Points */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={xPos(p.x)} cy={yPos(p.y)} r={5.5} fill={p.color} stroke="white" strokeWidth={1.5} />
          <text
            x={xPos(p.x) + 9}
            y={yPos(p.y) + 4}
            fontSize={10}
            fill="var(--foreground)"
            fontWeight={500}
          >
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
