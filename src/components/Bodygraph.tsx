/**
 * Canonical Human Design bodygraph renderer (React + SVG).
 *
 * Ported from the proven Celeste implementation, with field names adapted to the
 * camelCase HDChart shape from src/lib/hd/human_design.ts.
 *
 * Layout follows the standard Jovian Archive proportions:
 *   Head → Ajna → Throat → G with Heart on right + tall Spleen/Solar-Plexus triangles
 *   bracketing Sacral → Root.
 *
 * Gate fills:
 *   black  = Personality only
 *   red    = Design only
 *   purple = both
 *   white  = inactive
 */
import type { HDChart } from "@/lib/hd/human_design";

const BG = "#fbf8f1";
const STROKE_DEFINED = "#1f1f1f";
const STROKE_UNDEFINED = "#bdb8ab";

const CENTER_COLORS: Record<string, string> = {
  Head: "#fcd116",
  Ajna: "#56b87a",
  Throat: "#7c5d3a",
  G: "#fcd116",
  Heart: "#dd3a3a",
  Spleen: "#8a6a45",
  Sacral: "#dd3a3a",
  "Solar Plexus": "#8a6a45",
  Root: "#8a6a45",
};

interface CenterDef {
  shape: "polygon" | "rect";
  points?: [number, number][];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

const CENTERS: Record<string, CenterDef> = {
  Head:           { shape: "polygon", points: [[230, 30], [370, 30], [300, 140]] },
  Ajna:           { shape: "polygon", points: [[230, 270], [370, 270], [300, 150]] },
  Throat:         { shape: "rect", x: 220, y: 280, w: 160, h: 130 },
  G:              { shape: "polygon", points: [[300, 420], [380, 500], [300, 580], [220, 500]] },
  Heart:          { shape: "polygon", points: [[395, 470], [445, 470], [395, 530]] },
  Spleen:         { shape: "polygon", points: [[55, 420], [55, 640], [220, 530]] },
  Sacral:         { shape: "rect", x: 220, y: 590, w: 160, h: 130 },
  "Solar Plexus": { shape: "polygon", points: [[545, 420], [545, 640], [380, 530]] },
  Root:           { shape: "rect", x: 220, y: 730, w: 160, h: 60 },
};

const GATES: Record<number, { x: number; y: number; center: string }> = {
  64: { x: 255, y: 60,  center: "Head" }, 61: { x: 300, y: 50,  center: "Head" }, 63: { x: 345, y: 60,  center: "Head" },
  47: { x: 245, y: 230, center: "Ajna" }, 24: { x: 270, y: 250, center: "Ajna" }, 4:  { x: 330, y: 250, center: "Ajna" },
  17: { x: 355, y: 230, center: "Ajna" }, 43: { x: 270, y: 180, center: "Ajna" }, 11: { x: 330, y: 180, center: "Ajna" },
  62: { x: 235, y: 290, center: "Throat" }, 23: { x: 275, y: 290, center: "Throat" }, 56: { x: 300, y: 290, center: "Throat" },
  16: { x: 325, y: 290, center: "Throat" }, 20: { x: 365, y: 290, center: "Throat" }, 35: { x: 380, y: 320, center: "Throat" },
  12: { x: 380, y: 360, center: "Throat" }, 45: { x: 380, y: 400, center: "Throat" }, 33: { x: 230, y: 400, center: "Throat" },
  8:  { x: 270, y: 400, center: "Throat" }, 31: { x: 320, y: 400, center: "Throat" },
  1:  { x: 300, y: 425, center: "G" }, 13: { x: 360, y: 470, center: "G" }, 25: { x: 360, y: 530, center: "G" },
  46: { x: 300, y: 575, center: "G" }, 2:  { x: 240, y: 530, center: "G" }, 15: { x: 240, y: 470, center: "G" },
  10: { x: 268, y: 442, center: "G" }, 7:  { x: 332, y: 442, center: "G" },
  21: { x: 400, y: 480, center: "Heart" }, 51: { x: 438, y: 482, center: "Heart" }, 26: { x: 432, y: 518, center: "Heart" },
  40: { x: 402, y: 525, center: "Heart" },
  48: { x: 70,  y: 440, center: "Spleen" }, 57: { x: 70,  y: 620, center: "Spleen" }, 44: { x: 110, y: 470, center: "Spleen" },
  50: { x: 110, y: 580, center: "Spleen" }, 32: { x: 145, y: 500, center: "Spleen" }, 28: { x: 145, y: 560, center: "Spleen" },
  18: { x: 200, y: 530, center: "Spleen" },
  34: { x: 240, y: 600, center: "Sacral" }, 5:  { x: 275, y: 600, center: "Sacral" }, 14: { x: 310, y: 600, center: "Sacral" },
  29: { x: 345, y: 600, center: "Sacral" }, 59: { x: 240, y: 720, center: "Sacral" }, 9:  { x: 275, y: 720, center: "Sacral" },
  3:  { x: 310, y: 720, center: "Sacral" }, 42: { x: 345, y: 720, center: "Sacral" }, 27: { x: 230, y: 660, center: "Sacral" },
  36: { x: 530, y: 440, center: "Solar Plexus" }, 22: { x: 530, y: 620, center: "Solar Plexus" }, 37: { x: 490, y: 470, center: "Solar Plexus" },
  6:  { x: 490, y: 580, center: "Solar Plexus" }, 49: { x: 455, y: 500, center: "Solar Plexus" }, 55: { x: 455, y: 560, center: "Solar Plexus" },
  30: { x: 400, y: 530, center: "Solar Plexus" },
  58: { x: 235, y: 730, center: "Root" }, 38: { x: 270, y: 730, center: "Root" }, 54: { x: 305, y: 730, center: "Root" },
  53: { x: 340, y: 730, center: "Root" }, 60: { x: 245, y: 790, center: "Root" }, 52: { x: 280, y: 790, center: "Root" },
  19: { x: 320, y: 790, center: "Root" }, 39: { x: 355, y: 790, center: "Root" }, 41: { x: 220, y: 760, center: "Root" },
};

// Canonical 36 channels — exact set, no duplicates. Each pair is unordered;
// the renderer normalizes via `[a,b].sort()` when building the React key.
const CHANNELS: [number, number][] = [
  [64,47],[61,24],[63,4],
  [17,62],[43,23],[11,56],
  [16,48],[20,57],[20,10],[20,34],
  [35,36],[12,22],[45,21],
  [33,13],[8,1],[31,7],
  [25,51],
  [10,34],[15,5],[2,14],[46,29],
  [57,10],
  [26,44],[40,37],
  [27,50],[57,34],
  [32,54],[28,38],[18,58],
  [59,6],
  [9,52],[3,60],[42,53],
  [49,19],[55,39],[30,41],
];

export function Bodygraph({ chart, size = 520 }: { chart: HDChart; size?: number }) {
  const defined = new Set(chart.definedCenters);
  const pGates = new Set(Object.values(chart.personality).map((p) => p.gate));
  const dGates = new Set(Object.values(chart.design).map((p) => p.gate));
  const channelDefined = new Set(
    chart.definedChannels.map((c) => c.split("-").map(Number).sort((a, b) => a - b).join("-")),
  );

  const gateState = (g: number): "both" | "personality" | "design" | "inactive" => {
    const inP = pGates.has(g);
    const inD = dGates.has(g);
    if (inP && inD) return "both";
    if (inP) return "personality";
    if (inD) return "design";
    return "inactive";
  };
  const gateColor = (state: ReturnType<typeof gateState>) =>
    ({ both: "#8a3acc", personality: "#1f1f1f", design: "#dd3a3a" }[state as "both"] ?? "#ffffff");

  return (
    <svg viewBox="0 0 600 820" width={size} height={(size * 820) / 600} xmlns="http://www.w3.org/2000/svg" aria-label="Human Design bodygraph">
      <rect width="600" height="820" fill={BG} />
      {/* Channels first (lowest z) */}
      {CHANNELS.map(([a, b]) => {
        const pa = GATES[a];
        const pb = GATES[b];
        if (!pa || !pb) return null;
        const key = [a, b].sort((x, y) => x - y).join("-");
        const isDefined = channelDefined.has(key);
        const stateA = gateState(a);
        const stateB = gateState(b);
        if (isDefined) {
          if (stateA !== stateB) {
            const mx = (pa.x + pb.x) / 2;
            const my = (pa.y + pb.y) / 2;
            return (
              <g key={key}>
                <line x1={pa.x} y1={pa.y} x2={mx} y2={my} stroke={gateColor(stateA)} strokeWidth={6} strokeLinecap="round" />
                <line x1={mx} y1={my} x2={pb.x} y2={pb.y} stroke={gateColor(stateB)} strokeWidth={6} strokeLinecap="round" />
              </g>
            );
          }
          return <line key={key} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={gateColor(stateA)} strokeWidth={6} strokeLinecap="round" />;
        }
        return (
          <line
            key={key}
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
            stroke={STROKE_UNDEFINED}
            strokeWidth={1.5}
            strokeDasharray="4,3"
            opacity={0.6}
          />
        );
      })}
      {/* Centers */}
      {Object.entries(CENTERS).map(([name, c]) => {
        const isDef = defined.has(name);
        const fill = isDef ? CENTER_COLORS[name] : "#ffffff";
        const stroke = isDef ? STROKE_DEFINED : STROKE_UNDEFINED;
        const sw = isDef ? 3 : 1.5;
        if (c.shape === "polygon" && c.points) {
          return <polygon key={name} points={c.points.map((p) => p.join(",")).join(" ")} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />;
        }
        return <rect key={name} x={c.x} y={c.y} width={c.w} height={c.h} fill={fill} stroke={stroke} strokeWidth={sw} rx={3} />;
      })}
      {/* Gates */}
      {Object.entries(GATES).map(([gateStr, pos]) => {
        const g = Number(gateStr);
        const state = gateState(g);
        const isActive = state !== "inactive";
        const r = isActive ? 13 : 10;
        const fill = gateColor(state);
        const strokeCol = isActive ? "#1f1f1f" : "#9a9486";
        return (
          <g key={g}>
            <circle cx={pos.x} cy={pos.y} r={r} fill={fill} stroke={strokeCol} strokeWidth={isActive ? 2 : 1} />
            <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={isActive ? "#ffffff" : "#5a5246"}>
              {g}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function BodygraphLegend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-neutral-600">
      <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#1f1f1f" }} /> Personality</span>
      <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#dd3a3a" }} /> Design</span>
      <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full" style={{ background: "#8a3acc" }} /> Both</span>
      <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-full border border-neutral-400" /> Inactive</span>
    </div>
  );
}
