/**
 * Human Design chart computation using Swiss Ephemeris (sweph npm, Moshier mode).
 *
 * Pipeline:
 *   1. Local birth date/time + lat/lon → UTC Julian Day.
 *   2. Compute ecliptic longitude of Sun + 12 other "planets" at UTC birth (Personality)
 *      and at the moment when the Sun was 88° earlier in the zodiac (Design).
 *   3. Map each longitude → HD gate.line via the gate wheel.
 *   4. Derive Profile, defined channels, defined centers, Type, Authority, Incarnation Cross.
 *
 * Adapted from the proven implementation in the Celeste project (~/celeste/human-design.js)
 * but using Swiss Ephemeris for planetary positions instead of astronomy-engine.
 *
 * No data files are required — Moshier mode uses Swiss Ephemeris's built-in analytical
 * formulas. Accuracy is better than 1 arcsecond, vastly more than HD needs (HD gates are
 * 5.625° each).
 */
import sweph from "sweph";
import { DateTime } from "luxon";
import tzLookup from "tz-lookup";

// Initialize Moshier mode (no external ephemeris files needed). Passing an empty
// path tells sweph to use its built-in analytical formulas with no data files.
sweph.set_ephe_path("");

const SE = sweph.constants;
const FLAGS = SE.SEFLG_MOSEPH;     // Moshier analytical mode

// ─────────── Gate wheel ───────────
// I-Ching gate wheel starting at 2°00' Aquarius (= 302° tropical ecliptic longitude).
// Each gate spans 360/64 = 5.625°.
//
// Validation (May 2026) against three reference HD charts:
//   • Steve Jobs (1955-02-24 19:15 PST, SF) → Generator 6/3 Emotional ✓
//     (Pers Sun 55.6, Des Sun 9.3 — matches flowwithhumandesign.com)
//   • Oprah Winfrey (1954-01-29 04:30 CST, Kosciusko MS) → Generator 2/4 Emotional ✓
//     (matches thehumandesigncommunity.com / flowwithhumandesign.com)
//   • Albert Einstein (1879-03-14 11:30 LMT, Ulm) → Generator 1/4 Emotional,
//     Cross 36/6 | 11/12 ✓ (matches humandesignforsuccess.com — "36-6/11-12")
//
// Note: Some sources cite Steve Jobs as a 5/1 Manifestor, but the prevailing
// authoritative HD references (Jovian Archive lineage) compute 6/3 Generator
// Emotional from his canonical birth data, which is what this calc returns.
//
// Kinastro (github.com/kentang2017/kinastro) uses "Gate 25 starts at 0° Aries"
// which is equivalent to wheel_start = 303.75° — that variant fails Einstein
// validation (returns gate 22 instead of 36 for Personality Sun).
const GATE_WHEEL_START_LON = 302.0;
const GATE_SPAN = 360 / 64;
const LINE_SPAN = GATE_SPAN / 6;

// From HDKit constants.js (jdempcy/hdkit, MIT) — gate order around the wheel starting from 41.
const GATE_ORDER = [41,19,13,49,30,55,37,63,22,36,25,17,21,51,42,3,27,24,2,23,8,20,16,35,45,12,15,52,39,53,62,56,31,33,7,4,29,59,40,64,47,6,46,18,48,57,32,50,28,44,1,43,14,34,9,5,26,11,10,58,38,54,61,60];

// ─────────── Channels (canonical 36) ───────────
// Verified against the standard Ra Uru Hu / Jovian Archive bodygraph.
// Each entry: gate A — gate B — center A — center B.
const CANONICAL_CHANNELS: { gates: [number, number]; centers: [string, string]; name: string }[] = [
  // Head ↔ Ajna
  { gates: [64, 47], centers: ["Head", "Ajna"],     name: "Abstract" },
  { gates: [61, 24], centers: ["Head", "Ajna"],     name: "Awareness" },
  { gates: [63, 4],  centers: ["Head", "Ajna"],     name: "Logic" },
  // Ajna ↔ Throat
  { gates: [17, 62], centers: ["Ajna", "Throat"],   name: "Acceptance" },
  { gates: [43, 23], centers: ["Ajna", "Throat"],   name: "Structuring" },
  { gates: [11, 56], centers: ["Ajna", "Throat"],   name: "Curiosity" },
  // Throat ↔ G
  { gates: [20, 10], centers: ["Throat", "G"],      name: "Awakening" },
  { gates: [31, 7],  centers: ["Throat", "G"],      name: "The Alpha" },
  { gates: [8, 1],   centers: ["Throat", "G"],      name: "Inspiration" },
  { gates: [33, 13], centers: ["Throat", "G"],      name: "The Prodigal" },
  // Throat ↔ Sacral
  { gates: [20, 34], centers: ["Throat", "Sacral"], name: "Charisma" },
  // Throat ↔ Spleen
  { gates: [20, 57], centers: ["Throat", "Spleen"], name: "Brainwave" },
  { gates: [16, 48], centers: ["Throat", "Spleen"], name: "Wavelength" },
  // Throat ↔ Solar Plexus
  { gates: [35, 36], centers: ["Throat", "Solar Plexus"], name: "Transitoriness" },
  { gates: [12, 22], centers: ["Throat", "Solar Plexus"], name: "Openness" },
  // Throat ↔ Heart
  { gates: [45, 21], centers: ["Throat", "Heart"],  name: "The Money Line" },
  // G ↔ Heart
  { gates: [25, 51], centers: ["G", "Heart"],       name: "Initiation" },
  // G ↔ Sacral
  { gates: [10, 34], centers: ["G", "Sacral"],      name: "Exploration" },
  { gates: [15, 5],  centers: ["G", "Sacral"],      name: "Rhythm" },
  { gates: [2, 14],  centers: ["G", "Sacral"],      name: "Beat" },
  { gates: [46, 29], centers: ["G", "Sacral"],      name: "Discovery" },
  // G ↔ Spleen
  { gates: [57, 10], centers: ["Spleen", "G"],      name: "Perfected Form" },
  // Heart ↔ Spleen
  { gates: [26, 44], centers: ["Heart", "Spleen"],  name: "Surrender" },
  // Heart ↔ Solar Plexus
  { gates: [40, 37], centers: ["Heart", "Solar Plexus"], name: "Community" },
  // Spleen ↔ Sacral
  { gates: [27, 50], centers: ["Spleen", "Sacral"], name: "Preservation" },
  { gates: [57, 34], centers: ["Spleen", "Sacral"], name: "Power" },
  // Spleen ↔ Root
  { gates: [32, 54], centers: ["Spleen", "Root"],   name: "Transformation" },
  { gates: [28, 38], centers: ["Spleen", "Root"],   name: "Struggle" },
  { gates: [18, 58], centers: ["Spleen", "Root"],   name: "Judgment" },
  // Sacral ↔ Solar Plexus
  { gates: [6, 59],  centers: ["Sacral", "Solar Plexus"], name: "Mating" },
  // Sacral ↔ Root
  { gates: [9, 52],  centers: ["Sacral", "Root"],   name: "Concentration" },
  { gates: [3, 60],  centers: ["Sacral", "Root"],   name: "Mutation" },
  { gates: [42, 53], centers: ["Sacral", "Root"],   name: "Maturation" },
  // Solar Plexus ↔ Root
  { gates: [30, 41], centers: ["Solar Plexus", "Root"], name: "Recognition" },
  { gates: [49, 19], centers: ["Solar Plexus", "Root"], name: "Synthesis" },
  { gates: [55, 39], centers: ["Solar Plexus", "Root"], name: "Emoting" },
];

const ALL_CENTERS = ["Head", "Ajna", "Throat", "G", "Heart", "Sacral", "Spleen", "Solar Plexus", "Root"];
const MOTOR_CENTERS = new Set(["Sacral", "Heart", "Root", "Solar Plexus"]);

// ─────────── Swiss Ephemeris body IDs ───────────
const PLANETS_TO_COMPUTE: [string, number][] = [
  ["Sun",     SE.SE_SUN],
  ["Moon",    SE.SE_MOON],
  ["Mercury", SE.SE_MERCURY],
  ["Venus",   SE.SE_VENUS],
  ["Mars",    SE.SE_MARS],
  ["Jupiter", SE.SE_JUPITER],
  ["Saturn",  SE.SE_SATURN],
  ["Uranus",  SE.SE_URANUS],
  ["Neptune", SE.SE_NEPTUNE],
  ["Pluto",   SE.SE_PLUTO],
];

// ─────────── Types ───────────
export interface HDInputs {
  birthday: string;       // ISO YYYY-MM-DD
  birthTime: string;      // HH:MM (24h local time at lat/lon)
  lat: number;
  lon: number;
}

export interface HDActivation {
  gate: number;
  line: number;
  longitude: number;
}

export interface HDChart {
  inputs: HDInputs & { timezone: string; utcBirthIso: string; utcDesignIso: string };
  personality: Record<string, HDActivation>;
  design: Record<string, HDActivation>;
  type: "Manifestor" | "Generator" | "Manifesting Generator" | "Projector" | "Reflector";
  authority: string;
  profile: string;
  definedCenters: string[];
  undefinedCenters: string[];
  definedChannels: string[];
  incarnationCross: string;
}

// ─────────── Position calculation ───────────
function dateToJulianDay(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const d = date.getUTCDate();
  const h = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  return sweph.julday(y, m, d, h, SE.SE_GREG_CAL);
}

function eclipticLongitude(planetId: number, date: Date): number {
  const jd = dateToJulianDay(date);
  const result = sweph.calc_ut(jd, planetId, FLAGS);
  // sweph returns { data: [lon, lat, dist, lonSpd, latSpd, distSpd], ... } in spherical mode by default
  return ((result.data[0] % 360) + 360) % 360;
}

function computeAllPositions(date: Date): Record<string, number> {
  const positions: Record<string, number> = {};
  for (const [name, body] of PLANETS_TO_COMPUTE) {
    positions[name] = eclipticLongitude(body, date);
  }
  positions["Earth"] = (positions["Sun"] + 180) % 360;

  // Mean lunar node (true node would require SE_TRUE_NODE; mean is canonical for HD).
  const meanNode = eclipticLongitude(SE.SE_MEAN_NODE, date);
  positions["North Node"] = meanNode;
  positions["South Node"] = (meanNode + 180) % 360;

  return positions;
}

function longitudeToGate(lon: number): { gate: number; line: number } {
  const shifted = (((lon - GATE_WHEEL_START_LON) % 360) + 360) % 360;
  const gateIdx = Math.floor(shifted / GATE_SPAN);
  const withinGate = shifted - gateIdx * GATE_SPAN;
  const line = Math.floor(withinGate / LINE_SPAN) + 1;
  return { gate: GATE_ORDER[gateIdx], line };
}

function signedAngleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** Find UTC datetime when the Sun's ecliptic longitude was 88° earlier than at birth. */
function computeDesignDate(birthDate: Date): Date {
  const birthSunLon = eclipticLongitude(SE.SE_SUN, birthDate);
  const targetLon = (((birthSunLon - 88) % 360) + 360) % 360;
  let lo = new Date(birthDate.getTime() - 90 * 86400000);
  let hi = new Date(birthDate.getTime() - 86 * 86400000);
  for (let i = 0; i < 50; i++) {
    const mid = new Date((lo.getTime() + hi.getTime()) / 2);
    const lon = eclipticLongitude(SE.SE_SUN, mid);
    const diff = signedAngleDiff(lon, targetLon);
    if (Math.abs(diff) < 0.00001) return mid;
    if (diff > 0) hi = mid;
    else lo = mid;
  }
  return new Date((lo.getTime() + hi.getTime()) / 2);
}

// ─────────── Bodygraph derivation ───────────
function deriveBodygraph(personality: Record<string, HDActivation>, design: Record<string, HDActivation>) {
  const allGates = new Set<number>();
  for (const chart of [personality, design]) {
    for (const k of Object.keys(chart)) allGates.add(chart[k].gate);
  }

  const definedChannels: { gates: [number, number]; centers: [string, string] }[] = [];
  for (const c of CANONICAL_CHANNELS) {
    if (allGates.has(c.gates[0]) && allGates.has(c.gates[1])) {
      definedChannels.push(c);
    }
  }

  const definedCenters = new Set<string>();
  for (const ch of definedChannels) {
    for (const c of ch.centers) definedCenters.add(c);
  }

  const has = (c: string) => definedCenters.has(c);
  const sacral = has("Sacral");
  const throat = has("Throat");
  const heart = has("Heart");
  const solarPlexus = has("Solar Plexus");
  const spleen = has("Spleen");
  const g = has("G");

  // Type
  let type: HDChart["type"] = "Projector";
  if (definedCenters.size === 0) type = "Reflector";
  else if (sacral) {
    type = motorsConnectToThroat(definedChannels) ? "Manifesting Generator" : "Generator";
  } else if (motorsConnectToThroat(definedChannels)) {
    type = "Manifestor";
  }

  // Authority hierarchy
  let authority = "Lunar";
  if (solarPlexus) authority = "Emotional (Solar Plexus)";
  else if (sacral) authority = "Sacral";
  else if (spleen) authority = "Splenic";
  else if (heart && (throat || g)) authority = "Ego";
  else if (g && throat) authority = "Self-Projected";
  else if (definedCenters.size > 0) authority = "Mental (no inner authority)";

  // Profile = Personality Sun line . Design Sun line
  const profile = `${personality.Sun.line}/${design.Sun.line}`;

  return {
    type,
    authority,
    profile,
    definedCenters: [...definedCenters],
    undefinedCenters: ALL_CENTERS.filter((c) => !definedCenters.has(c)),
    definedChannels: definedChannels.map((c) => `${c.gates[0]}-${c.gates[1]}`),
    incarnationCross: incarnationCross(personality, design),
  };
}

function motorsConnectToThroat(channels: { centers: [string, string] }[]): boolean {
  return channels.some(
    (c) => c.centers.includes("Throat") && c.centers.some((x) => MOTOR_CENTERS.has(x)),
  );
}

function incarnationCross(personality: Record<string, HDActivation>, design: Record<string, HDActivation>): string {
  const pS = personality.Sun.gate;
  const pE = personality.Earth.gate;
  const dS = design.Sun.gate;
  const dE = design.Earth.gate;
  const angle =
    personality.Sun.line <= 3 ? "Right Angle Cross" :
    personality.Sun.line === 6 ? "Juxtaposition Cross" :
    "Left Angle Cross";
  return `${angle} of (${pS}/${pE} | ${dS}/${dE})`;
}

function round(n: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}

// ─────────── Public API ───────────
export function computeHumanDesign({ birthday, birthTime, lat, lon }: HDInputs): HDChart | { error: string } {
  let tz: string;
  try {
    tz = tzLookup(lat, lon);
  } catch {
    tz = "UTC";
  }

  const localStr = `${birthday}T${birthTime}`;
  const localDt = DateTime.fromISO(localStr, { zone: tz });
  if (!localDt.isValid) return { error: `bad date/time: ${localStr}` };
  const utcDate = localDt.toUTC().toJSDate();

  const personalityLons = computeAllPositions(utcDate);
  const personality: Record<string, HDActivation> = {};
  for (const [name, lon] of Object.entries(personalityLons)) {
    personality[name] = { ...longitudeToGate(lon), longitude: round(lon, 3) };
  }

  const designDate = computeDesignDate(utcDate);
  const designLons = computeAllPositions(designDate);
  const design: Record<string, HDActivation> = {};
  for (const [name, lon] of Object.entries(designLons)) {
    design[name] = { ...longitudeToGate(lon), longitude: round(lon, 3) };
  }

  const bodygraph = deriveBodygraph(personality, design);

  return {
    inputs: {
      birthday,
      birthTime,
      lat,
      lon,
      timezone: tz,
      utcBirthIso: utcDate.toISOString(),
      utcDesignIso: designDate.toISOString(),
    },
    personality,
    design,
    ...bodygraph,
  };
}

export const ALL_CENTERS_LIST = ALL_CENTERS;
