/**
 * Birth-chart-style readings for models.
 *
 * Combines:
 *   - Sun sign (tropical zodiac from release date)
 *   - Moon sign and a full Human Design chart from the Bodygraph API engine
 *     (https://github.com/AnthonyDavidAdams/bodygraph-api, NASA JPL DE440), pre-rendered into
 *     public/bodygraph/<model id>.{svg,json} by scripts/render_bodygraphs.ts.
 *
 * Treat this as an editorial overlay on the personality data — release events
 * are not biological births, but if we treat them as moments of arrival into
 * the world, the chart math is the same.
 */
import fs from "node:fs";
import path from "node:path";
import { zodiacFromDate } from "./zodiac";
import { getModelProfile } from "./model_profiles";
import { rawSqlite } from "./db";

/** public/bodygraph/<id>.json, written by scripts/bodygraph_render.py. */
export interface HDChart {
  utc: string;
  engine: string;
  type: string;
  strategy: string;
  authority: string;
  profile: string;
  definition: string;
  incarnationCross: string;
  definedCenters: string[];
  definedChannels: string[];
  sunLongitude: number;
  moonLongitude: number;
}

export interface BirthChart {
  sun: ReturnType<typeof zodiacFromDate>;
  moon: ReturnType<typeof zodiacFromDate>;
  hd: HDChart | null;
  /** Public path of the rendered bodygraph SVG, when one exists. */
  svg: string | null;
  hdError: string | null;
}

// Cheap mapping from a moon longitude in degrees to a zodiac-sign blurb.
function zodiacFromLongitude(lonDeg: number): ReturnType<typeof zodiacFromDate> {
  const SIGN_REPRESENTATIVE_DATES = [
    { start: 0,   sign: "Aries",       date: "2025-04-05" },
    { start: 30,  sign: "Taurus",      date: "2025-05-05" },
    { start: 60,  sign: "Gemini",      date: "2025-06-05" },
    { start: 90,  sign: "Cancer",      date: "2025-07-05" },
    { start: 120, sign: "Leo",         date: "2025-08-05" },
    { start: 150, sign: "Virgo",       date: "2025-09-10" },
    { start: 180, sign: "Libra",       date: "2025-10-10" },
    { start: 210, sign: "Scorpio",     date: "2025-11-10" },
    { start: 240, sign: "Sagittarius", date: "2025-12-10" },
    { start: 270, sign: "Capricorn",   date: "2025-01-05" },
    { start: 300, sign: "Aquarius",    date: "2025-02-05" },
    { start: 330, sign: "Pisces",      date: "2025-03-05" },
  ];
  const idx = Math.floor((((lonDeg % 360) + 360) % 360) / 30);
  return zodiacFromDate(SIGN_REPRESENTATIVE_DATES[idx].date);
}

export function getBirthChart(modelId: string): BirthChart | null {
  const p = getModelProfile(modelId);
  if (!p) return null;
  const sun = zodiacFromDate(p.releaseDate);
  const base = path.join(process.cwd(), "public", "bodygraph", modelId);
  let hd: HDChart | null = null;
  try {
    hd = JSON.parse(fs.readFileSync(`${base}.json`, "utf8")) as HDChart;
  } catch {
    return { sun, moon: null, hd: null, svg: null, hdError: "chart not rendered yet" };
  }
  const svg = fs.existsSync(`${base}.svg`) ? `/bodygraph/${modelId}.svg` : null;
  return { sun, moon: zodiacFromLongitude(hd.moonLongitude), hd, svg, hdError: null };
}

/**
 * Anchor a sentence to the model's measured personality data — useful for the
 * "does this chart match the data?" caption beneath the chart.
 */
export function summarizeBigFiveForModel(modelId: string): string | null {
  const db = rawSqlite();
  const rows = db
    .prepare(
      `SELECT s.dimension, AVG(s.mean) as m
       FROM scores s JOIN runs r ON r.id = s.run_id
       WHERE r.model_id = ? AND r.framing = 'self' AND r.status='completed'
         AND s.dimension IN ('extraversion','agreeableness','conscientiousness','neuroticism','openness')
       GROUP BY s.dimension`,
    )
    .all(modelId) as { dimension: string; m: number }[];
  if (rows.length === 0) return null;
  const get = (d: string) => rows.find((r) => r.dimension === d)?.m ?? 0;
  const parts: string[] = [];
  if (get("openness") >= 4.5) parts.push("very high openness");
  if (get("agreeableness") >= 4.5) parts.push("very high agreeableness");
  if (get("conscientiousness") >= 4.5) parts.push("very high conscientiousness");
  if (get("neuroticism") <= 2.0) parts.push("very low neuroticism");
  if (get("extraversion") <= 2.5) parts.push("introverted");
  else if (get("extraversion") >= 4.0) parts.push("extraverted");
  return parts.length ? `Measured Big 5: ${parts.join(", ")}.` : null;
}
