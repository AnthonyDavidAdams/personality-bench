/**
 * Shown wherever the site displays a zodiac sign or Human Design chart. One wording, every page.
 */
export const ASTROLOGY_DISCLAIMER =
  "Astrology and Human Design have no demonstrated predictive validity. Controlled tests consistently find that " +
  "date, time and place of birth predict nothing about personality or behavior, and Human Design has never been " +
  "validated in a peer-reviewed study. Shown as a novelty only; none of it feeds any score on this site.";

export function AstrologyDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[11px] leading-relaxed text-neutral-600 border-l-2 border-[var(--accent)] pl-3 ${className}`}>
      <strong className="text-neutral-800">No predictive validity.</strong>{" "}
      Astrology and Human Design have no demonstrated predictive validity. Controlled tests consistently find that
      date, time and place of birth predict nothing about personality or behavior (e.g. Carlson, <em>Nature</em>,
      1985; Dean &amp; Kelly, <em>Journal of Consciousness Studies</em>, 2003), and Human Design has never been
      validated in a peer-reviewed study. Shown as a novelty only; none of it feeds any score on this site.
    </p>
  );
}
