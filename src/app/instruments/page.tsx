import Link from "next/link";
import { listInstrumentsForUi } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default function InstrumentsIndex() {
  const instruments = listInstrumentsForUi();
  // Group by family
  const byFamily = new Map<string, typeof instruments>();
  for (const i of instruments) {
    if (!byFamily.has(i.family)) byFamily.set(i.family, []);
    byFamily.get(i.family)!.push(i);
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Instruments</h1>
        <p className="text-neutral-600 mt-2 max-w-2xl">
          Thirteen standard psychometric inventories — Big 5, HEXACO, Dark Triad, attachment, values, morals,
          cognition, empathy, locus of control, Enneagram, and three learning-style frameworks.
        </p>
      </div>
      {Array.from(byFamily.entries()).map(([family, list]) => (
        <section key={family}>
          <h2 className="serif text-lg font-semibold text-neutral-900 mb-3 uppercase tracking-wide text-xs">
            {family.replace(/_/g, " ")}
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {list.map((i) => (
              <Link
                key={i.id}
                href={`/instruments/${i.id}`}
                className="card block p-5 hover:border-[var(--accent)] transition"
              >
                <div className="flex items-baseline justify-between">
                  <span className="serif font-semibold text-neutral-900">{i.shortName}</span>
                  <span className="text-xs text-neutral-500">{i.itemCount} items</span>
                </div>
                <p className="text-sm text-neutral-700 mt-2 leading-relaxed">{i.description}</p>
                <div className="text-xs text-neutral-500 mt-3 italic">{i.citation}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
