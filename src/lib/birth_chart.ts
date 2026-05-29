/**
 * Birth-chart-style readings for models.
 *
 * Combines:
 *   - Sun sign (tropical zodiac from release date) — accurate
 *   - Moon sign (computed from real ephemeris) — accurate
 *   - Full Human Design chart computed via Swiss Ephemeris (sweph in Moshier mode)
 *     using release date, time, and HQ coordinates as the "birth chart" inputs.
 *
 * Treat this as an editorial overlay on the personality data — release events
 * are not biological births, but if we treat them as moments of arrival into
 * the world, the chart math is the same.
 */
import { zodiacFromDate } from "./zodiac";
import { getModelProfile } from "./model_profiles";
import { computeHumanDesign, type HDChart } from "./hd/human_design";
import { rawSqlite } from "./db";

export interface BirthChart {
  sun: ReturnType<typeof zodiacFromDate>;
  moon: ReturnType<typeof zodiacFromDate>;
  hd: HDChart | null;
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
  const hdResult = computeHumanDesign({
    birthday: p.releaseDate,
    birthTime: p.releaseTime ?? "12:00",
    lat: p.hqLat,
    lon: p.hqLon,
  });
  if ("error" in hdResult) {
    return { sun, moon: null, hd: null, hdError: hdResult.error };
  }
  // Use the Moon's ecliptic longitude from the personality chart for the moon sign.
  const moonLon = hdResult.personality.Moon?.longitude;
  const moon = moonLon != null ? zodiacFromLongitude(moonLon) : null;
  return { sun, moon, hd: hdResult, hdError: null };
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
