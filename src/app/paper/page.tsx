import Link from "next/link";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export default function PaperPage() {
  // List available paper versions in /paper/
  const paperDir = path.join(process.cwd(), "paper");
  const versions: { name: string; size: string; href: string }[] = [];
  try {
    for (const f of fs.readdirSync(paperDir)) {
      if (f.endsWith(".pdf")) {
        const stat = fs.statSync(path.join(paperDir, f));
        versions.push({
          name: f,
          size: `${(stat.size / 1024).toFixed(0)} KB`,
          href: `/api/paper/${encodeURIComponent(f)}`,
        });
      }
    }
  } catch {
    // dir doesn't exist — fine, no versions to show
  }
  versions.sort((a, b) => b.name.localeCompare(a.name));

  return (
    <div className="space-y-10 max-w-3xl">
      <section>
        <h1 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Paper</h1>
        <p className="text-neutral-700 mt-3 leading-relaxed">
          The peer-review-ready writeup of this study. We publish version-stamped PDFs as the dataset grows.
          The current paper covers 21 models (7 frontier + 14 historical) across 14 psychometric instruments
          with full token and cost accounting.
        </p>
      </section>

      <section>
        <h2 className="serif text-xl font-semibold mb-4 text-neutral-900">Available versions</h2>
        {versions.length === 0 ? (
          <div className="card p-5 text-sm text-neutral-600">No paper PDFs available yet.</div>
        ) : (
          <div className="grid gap-3">
            {versions.map((v) => (
              <a
                key={v.name}
                href={v.href}
                target="_blank"
                rel="noopener noreferrer"
                className="card p-4 flex items-baseline justify-between hover:border-[var(--accent)] transition"
              >
                <div>
                  <div className="font-mono text-sm text-neutral-900">{v.name}</div>
                  <div className="text-xs text-neutral-500 mt-1">PDF · {v.size}</div>
                </div>
                <span className="text-xs text-[var(--link)]">open →</span>
              </a>
            ))}
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="serif text-lg font-semibold mb-3 text-neutral-900">Citation</h2>
        <pre className="text-xs bg-white border border-[var(--border)] p-3 rounded font-mono overflow-x-auto">
{`@misc{personality-bench-2026,
  title  = {Personality Bench: A Cross-Lab Inventory of Frontier-LLM
            Self-Presentation Across 14 Psychometric Instruments,
            with Cross-Version Drift Analysis},
  author = {Adams, Anthony David},
  year   = {2026},
  note   = {Published by EarthPilot.ai — Mission Support for
            Spaceship Earth}
}`}
        </pre>
      </section>

      <section>
        <h2 className="serif text-xl font-semibold mb-4 text-neutral-900">Related</h2>
        <ul className="space-y-2 text-sm">
          <li>
            <Link href="/drift" className="text-[var(--link)] hover:underline">
              Interactive drift charts →
            </Link>{" "}
            <span className="text-neutral-500">— same data as paper §4, with all family lineages overlaid</span>
          </li>
          <li>
            <Link href="/spend" className="text-[var(--link)] hover:underline">
              Full cost ledger →
            </Link>{" "}
            <span className="text-neutral-500">— every billed API call with token counts</span>
          </li>
          <li>
            <Link href="/methodology" className="text-[var(--link)] hover:underline">
              Methodology notes →
            </Link>
          </li>
          <li>
            <a
              href="https://github.com/AnthonyDavidAdams/personality-bench"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--link)] hover:underline"
            >
              Source on GitHub →
            </a>
          </li>
        </ul>
      </section>
    </div>
  );
}
