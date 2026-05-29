/**
 * Hand-drawn SVG zodiac glyphs.
 *
 * Each sign is rendered as a minimalist line drawing in a 24x24 viewBox.
 * Designed to match an editorial / research-publication feel — single
 * stroke weight, no fills, color inherits from `currentColor`.
 */

interface IconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

function Svg({
  size = 22,
  strokeWidth = 1.6,
  className,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function ZodiacAries(p: IconProps) {
  // Ram horns: two curls meeting at center
  return (
    <Svg {...p}>
      <path d="M5 14c0-3 1.5-5 3.5-5S12 11 12 14v6" />
      <path d="M19 14c0-3-1.5-5-3.5-5S12 11 12 14" />
    </Svg>
  );
}

export function ZodiacTaurus(p: IconProps) {
  // Bull head: circle with crescent horns above
  return (
    <Svg {...p}>
      <circle cx="12" cy="15" r="4.5" />
      <path d="M4 7c0 2 2 5 8 5s8-3 8-5" />
    </Svg>
  );
}

export function ZodiacGemini(p: IconProps) {
  // Twins: two parallel verticals capped with arcs
  return (
    <Svg {...p}>
      <path d="M7 6h10" />
      <path d="M7 18h10" />
      <path d="M9 6v12" />
      <path d="M15 6v12" />
    </Svg>
  );
}

export function ZodiacCancer(p: IconProps) {
  // Crab/69 — two spirals
  return (
    <Svg {...p}>
      <circle cx="8" cy="9" r="1.6" fill="currentColor" stroke="none" />
      <path d="M9.6 9c0 2.6-2.1 4.7-4.7 4.7" />
      <circle cx="16" cy="15" r="1.6" fill="currentColor" stroke="none" />
      <path d="M14.4 15c0-2.6 2.1-4.7 4.7-4.7" />
    </Svg>
  );
}

export function ZodiacLeo(p: IconProps) {
  // Lion's mane curl with tail
  return (
    <Svg {...p}>
      <circle cx="10" cy="9" r="3.5" />
      <path d="M13.4 9.6c1 2 3 4 5 5" />
      <path d="M18.4 14.6c-1 1 -1.5 2 -1 3.4" />
    </Svg>
  );
}

export function ZodiacVirgo(p: IconProps) {
  // M with crossed loop tail
  return (
    <Svg {...p}>
      <path d="M5 18V8" />
      <path d="M5 8l4 6 4-6" />
      <path d="M13 8v10" />
      <path d="M13 18c2 0 4-1 4-3.5S15 11 13 11" />
      <path d="M17 14.5l3 3" />
    </Svg>
  );
}

export function ZodiacLibra(p: IconProps) {
  // Scales / balance: horizontal bar with humped top
  return (
    <Svg {...p}>
      <path d="M4 18h16" />
      <path d="M5 14h14" />
      <path d="M8 14a4 4 0 0 1 8 0" />
    </Svg>
  );
}

export function ZodiacScorpio(p: IconProps) {
  // M shape with tail arrow
  return (
    <Svg {...p}>
      <path d="M4 17V8" />
      <path d="M4 8l3 5 3-5v9" />
      <path d="M10 8l3 5 3-5v9" />
      <path d="M16 17l3 2" />
      <path d="M19 19l-2-0.5M19 19l-0.5-2" />
    </Svg>
  );
}

export function ZodiacSagittarius(p: IconProps) {
  // Arrow up-right with crossbar
  return (
    <Svg {...p}>
      <path d="M5 19l14-14" />
      <path d="M19 5h-5M19 5v5" />
      <path d="M9 13l3 3" />
    </Svg>
  );
}

export function ZodiacCapricorn(p: IconProps) {
  // Sea-goat: V with curled tail
  return (
    <Svg {...p}>
      <path d="M5 7l4 10 3-7 3 6" />
      <circle cx="17" cy="15" r="2.5" />
      <path d="M19.5 15c0 2-2 3-3.5 2.5" />
    </Svg>
  );
}

export function ZodiacAquarius(p: IconProps) {
  // Two parallel water waves
  return (
    <Svg {...p}>
      <path d="M4 10c2-2 4-2 6 0s4 2 6 0 4-2 4 0" />
      <path d="M4 16c2-2 4-2 6 0s4 2 6 0 4-2 4 0" />
    </Svg>
  );
}

export function ZodiacPisces(p: IconProps) {
  // Two arcs facing in, connected by horizontal bar
  return (
    <Svg {...p}>
      <path d="M5 5c4 3 4 11 0 14" />
      <path d="M19 5c-4 3-4 11 0 14" />
      <path d="M6 12h12" />
    </Svg>
  );
}

const ICONS: Record<string, (p: IconProps) => React.ReactElement> = {
  Aries: ZodiacAries,
  Taurus: ZodiacTaurus,
  Gemini: ZodiacGemini,
  Cancer: ZodiacCancer,
  Leo: ZodiacLeo,
  Virgo: ZodiacVirgo,
  Libra: ZodiacLibra,
  Scorpio: ZodiacScorpio,
  Sagittarius: ZodiacSagittarius,
  Capricorn: ZodiacCapricorn,
  Aquarius: ZodiacAquarius,
  Pisces: ZodiacPisces,
};

export function ZodiacIcon({ sign, ...props }: { sign: string } & IconProps) {
  const Comp = ICONS[sign];
  if (!Comp) return null;
  return <Comp {...props} />;
}

/** Element-keyed accent color so visual tone matches the sign's classical element. */
export const ELEMENT_COLORS: Record<string, string> = {
  Fire:  "#c2410c", // rust
  Earth: "#7c5f3a", // soil
  Air:   "#475569", // slate
  Water: "#0e7490", // teal
};
