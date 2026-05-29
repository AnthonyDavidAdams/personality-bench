/**
 * Western Zodiac (sun sign) lookup from a date string.
 * Tropical zodiac with conventional boundaries (good enough for "fun" model birth charts).
 *
 * For Human Design we'd need exact birth time + lat/lon — model release announcements
 * rarely give us that — so we leave HD as a stub the user can fill in per-model.
 */
export interface Zodiac {
  sign: string;
  emoji: string;
  element: "Fire" | "Earth" | "Air" | "Water";
  modality: "Cardinal" | "Fixed" | "Mutable";
  blurb: string;
}

const SIGNS: { sign: string; emoji: string; element: Zodiac["element"]; modality: Zodiac["modality"]; start: [number, number]; end: [number, number]; blurb: string }[] = [
  { sign: "Capricorn",   emoji: "♑", element: "Earth", modality: "Cardinal", start: [12, 22], end: [ 1, 19], blurb: "Disciplined, ambitious, structurally minded — long-game energy." },
  { sign: "Aquarius",    emoji: "♒", element: "Air",   modality: "Fixed",    start: [ 1, 20], end: [ 2, 18], blurb: "Iconoclastic, systems-thinking, future-forward — humanitarian in idea form." },
  { sign: "Pisces",      emoji: "♓", element: "Water", modality: "Mutable",  start: [ 2, 19], end: [ 3, 20], blurb: "Intuitive, dissolving boundaries, imaginative — porous to the field." },
  { sign: "Aries",       emoji: "♈", element: "Fire",  modality: "Cardinal", start: [ 3, 21], end: [ 4, 19], blurb: "Initiating, direct, brave — fires the starting gun." },
  { sign: "Taurus",      emoji: "♉", element: "Earth", modality: "Fixed",    start: [ 4, 20], end: [ 5, 20], blurb: "Sensuous, grounded, steady — values what is, slowly built." },
  { sign: "Gemini",      emoji: "♊", element: "Air",   modality: "Mutable",  start: [ 5, 21], end: [ 6, 20], blurb: "Curious, quick, conversational — moves through ideas like air." },
  { sign: "Cancer",      emoji: "♋", element: "Water", modality: "Cardinal", start: [ 6, 21], end: [ 7, 22], blurb: "Caretaking, emotionally attuned, protective — the home and hearth." },
  { sign: "Leo",         emoji: "♌", element: "Fire",  modality: "Fixed",    start: [ 7, 23], end: [ 8, 22], blurb: "Generous, expressive, magnetic — performs the self into being." },
  { sign: "Virgo",       emoji: "♍", element: "Earth", modality: "Mutable",  start: [ 8, 23], end: [ 9, 22], blurb: "Analytical, refining, service-oriented — refines the world detail by detail." },
  { sign: "Libra",       emoji: "♎", element: "Air",   modality: "Cardinal", start: [ 9, 23], end: [10, 22], blurb: "Diplomatic, aesthetic, relational — seeks balance in every weighing." },
  { sign: "Scorpio",     emoji: "♏", element: "Water", modality: "Fixed",    start: [10, 23], end: [11, 21], blurb: "Intense, penetrating, transformative — moves through depth, not surface." },
  { sign: "Sagittarius", emoji: "♐", element: "Fire",  modality: "Mutable",  start: [11, 22], end: [12, 21], blurb: "Expansive, philosophical, adventurous — seeks meaning across horizons." },
];

export function zodiacFromDate(dateStr: string | null | undefined): Zodiac | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  for (const s of SIGNS) {
    const [sm, sd] = s.start;
    const [em, ed] = s.end;
    // Sign ranges can wrap year-end (e.g., Capricorn Dec 22 → Jan 19).
    if (sm === em) {
      if (m === sm && day >= sd && day <= ed) return blurbify(s);
    } else if (sm > em) {
      if ((m === sm && day >= sd) || (m === em && day <= ed)) return blurbify(s);
    } else {
      if ((m === sm && day >= sd) || (m === em && day <= ed) || (m > sm && m < em)) {
        return blurbify(s);
      }
    }
  }
  return null;
}

function blurbify(s: (typeof SIGNS)[number]): Zodiac {
  return { sign: s.sign, emoji: s.emoji, element: s.element, modality: s.modality, blurb: s.blurb };
}
