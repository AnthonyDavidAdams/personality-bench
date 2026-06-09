import Link from "next/link";
import { rawSqlite } from "@/lib/db";
import { buildMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildMetadata({
  title: "Raw responses",
  description:
    "Browse every individual prompt and raw response in the Personality Bench dataset — all 129,000+ item answers, indexed by model, instrument and run.",
  path: "/raw",
});

interface RawPageProps {
  searchParams: Promise<{ model?: string; instrument?: string; run?: string }>;
}

export default async function RawPage({ searchParams }: RawPageProps) {
  const sp = await searchParams;
  const db = rawSqlite();

  // Picker data
  const models = db
    .prepare(`SELECT m.id, m.display_name, m.vendor FROM models m WHERE EXISTS (SELECT 1 FROM runs r WHERE r.model_id = m.id AND r.status = 'completed') ORDER BY m.vendor, m.display_name`)
    .all() as { id: string; display_name: string; vendor: string }[];
  const instruments = db
    .prepare(`SELECT id, short_name, family FROM instruments WHERE active = 1 ORDER BY family, short_name`)
    .all() as { id: string; short_name: string; family: string }[];

  const selectedModel = sp.model;
  const selectedInstrument = sp.instrument;
  const selectedRun = sp.run;

  return (
    <div className="space-y-10">
      <section>
        <div className="eyebrow mb-2">Open data</div>
        <h1 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Raw inventory</h1>
        <p className="mt-3 text-neutral-700 max-w-3xl leading-relaxed">
          Browse every individual API call and every item-level response. Pick a model and instrument to see
          the exact items, the model&rsquo;s raw Likert answer for each, the reverse-keyed scored value, and the
          aggregate dimension scores. Click into any single run to see the verbatim system prompt, user prompt,
          and raw model response. Bulk CSV downloads are linked below the picker.
        </p>
      </section>

      <section className="card p-5">
        <form method="get" className="grid md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">Model</label>
            <select name="model" defaultValue={selectedModel ?? ""} className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-white text-sm">
              <option value="">— pick one —</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.display_name} ({m.id})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1.5">Instrument</label>
            <select name="instrument" defaultValue={selectedInstrument ?? ""} className="w-full px-3 py-2 border border-[var(--border)] rounded-md bg-white text-sm">
              <option value="">— pick one —</option>
              {instruments.map((i) => (
                <option key={i.id} value={i.id}>{i.short_name} ({i.id})</option>
              ))}
            </select>
          </div>
          <button type="submit" className="px-4 py-2 rounded-md bg-neutral-900 text-white text-sm hover:bg-neutral-700">
            Browse
          </button>
        </form>
      </section>

      <section className="card p-5">
        <h2 className="serif text-lg font-semibold mb-3 text-neutral-900">Bulk CSV downloads</h2>
        <p className="text-sm text-neutral-700 mb-3 max-w-3xl">
          Auto-regenerated on every dataset refresh from the SQLite source of truth. Browsable on GitHub directly:
        </p>
        <ul className="space-y-1.5 text-sm">
          <li><a href="https://github.com/AnthonyDavidAdams/personality-bench/blob/main/data/exports/models.csv" target="_blank" rel="noopener" className="text-[var(--link)] hover:underline">models.csv</a> — one row per model (vendor, pricing, family)</li>
          <li><a href="https://github.com/AnthonyDavidAdams/personality-bench/blob/main/data/exports/instruments.csv" target="_blank" rel="noopener" className="text-[var(--link)] hover:underline">instruments.csv</a> — one row per active instrument</li>
          <li><a href="https://github.com/AnthonyDavidAdams/personality-bench/blob/main/data/exports/runs.csv" target="_blank" rel="noopener" className="text-[var(--link)] hover:underline">runs.csv</a> — every completed API call with token + cost telemetry</li>
          <li><a href="https://github.com/AnthonyDavidAdams/personality-bench/blob/main/data/exports/scores.csv" target="_blank" rel="noopener" className="text-[var(--link)] hover:underline">scores.csv</a> — every (run, dimension) → mean</li>
          <li><a href="https://github.com/AnthonyDavidAdams/personality-bench/blob/main/data/exports/responses.csv" target="_blank" rel="noopener" className="text-[var(--link)] hover:underline">responses.csv</a> — most granular: every item, every raw answer (~130K rows)</li>
          <li><a href="https://github.com/AnthonyDavidAdams/personality-bench/blob/main/data/exports/per_model_summary.csv" target="_blank" rel="noopener" className="text-[var(--link)] hover:underline">per_model_summary.csv</a> — flat wide table for quick exploration</li>
          <li><a href="https://github.com/AnthonyDavidAdams/personality-bench/blob/main/data/exports/cohort_summary.csv" target="_blank" rel="noopener" className="text-[var(--link)] hover:underline">cohort_summary.csv</a> — cohort mean/min/max per (instrument, dimension, framing)</li>
        </ul>
      </section>

      {selectedRun ? (
        <RunDetail runId={selectedRun} />
      ) : selectedModel && selectedInstrument ? (
        <ModelInstrumentDetail modelId={selectedModel} instrumentId={selectedInstrument} />
      ) : null}
    </div>
  );
}

function ModelInstrumentDetail({ modelId, instrumentId }: { modelId: string; instrumentId: string }) {
  const db = rawSqlite();
  const inst = db.prepare(`SELECT * FROM instruments WHERE id=?`).get(instrumentId) as any;
  const model = db.prepare(`SELECT * FROM models WHERE id=?`).get(modelId) as any;
  if (!inst || !model) return <div className="card p-5 text-sm text-neutral-600">Unknown model or instrument.</div>;

  const runs = db
    .prepare(
      `SELECT id, framing, run_index, prompt_tokens, completion_tokens, reasoning_tokens, cost_usd, latency_ms, status
       FROM runs WHERE model_id=? AND instrument_id=? AND status='completed'
       ORDER BY framing, run_index`,
    )
    .all(modelId, instrumentId) as any[];

  const items = db
    .prepare(`SELECT id, position, text, dimension, reverse_keyed FROM items WHERE instrument_id=? ORDER BY position`)
    .all(instrumentId) as any[];

  // For each item, collect the responses across runs as a small inline table
  const responsesByItem = db
    .prepare(
      `SELECT resp.item_id, r.framing, r.run_index, resp.raw, resp.scored
       FROM responses resp JOIN runs r ON r.id = resp.run_id
       WHERE r.model_id=? AND r.instrument_id=? AND r.status='completed'
       ORDER BY r.framing, r.run_index`,
    )
    .all(modelId, instrumentId) as any[];

  const grouped = new Map<string, { framing: string; run_index: number; raw: number; scored: number }[]>();
  for (const r of responsesByItem) {
    if (!grouped.has(r.item_id)) grouped.set(r.item_id, []);
    grouped.get(r.item_id)!.push({ framing: r.framing, run_index: r.run_index, raw: r.raw, scored: r.scored });
  }

  return (
    <section className="space-y-6">
      <div className="card p-5">
        <h2 className="serif text-xl font-semibold mb-1 text-neutral-900">
          {model.display_name} <span className="text-neutral-500 font-normal">on</span> {inst.short_name}
        </h2>
        <p className="text-xs text-neutral-500 font-mono mb-3">{modelId} · {instrumentId}</p>
        <p className="text-sm text-neutral-700 max-w-3xl">{inst.description}</p>
      </div>

      <div className="card p-5">
        <h3 className="serif text-lg font-semibold mb-3 text-neutral-900">{runs.length} completed runs</h3>
        <table className="w-full text-sm">
          <thead className="text-neutral-500 border-b border-[var(--border)]">
            <tr>
              <th className="text-left py-1.5 pr-3 font-medium">Run</th>
              <th className="text-right py-1.5 pr-3 font-medium">In/Out</th>
              <th className="text-right py-1.5 pr-3 font-medium">Latency</th>
              <th className="text-right py-1.5 pr-3 font-medium">Cost</th>
              <th className="text-left py-1.5 font-medium">Inspect</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b border-[var(--soft)]">
                <td className="py-1.5 pr-3 font-mono text-xs">{r.framing}#{r.run_index}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-xs">
                  {(r.prompt_tokens ?? 0).toLocaleString()}/{(r.completion_tokens ?? 0).toLocaleString()}
                  {r.reasoning_tokens ? <span className="text-[var(--accent)]">+{r.reasoning_tokens.toLocaleString()}r</span> : null}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-xs">{r.latency_ms ? `${(r.latency_ms / 1000).toFixed(1)}s` : "—"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-xs">${(r.cost_usd ?? 0).toFixed(5)}</td>
                <td className="py-1.5 text-xs">
                  <Link href={`/raw?model=${encodeURIComponent(modelId)}&instrument=${encodeURIComponent(instrumentId)}&run=${encodeURIComponent(r.id)}`} className="text-[var(--link)] hover:underline">
                    view prompts + raw response →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-5">
        <h3 className="serif text-lg font-semibold mb-3 text-neutral-900">{items.length} items × {runs.length} runs</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-neutral-500 border-b border-[var(--border)]">
              <tr>
                <th className="text-left py-1.5 pr-3 font-medium w-12">#</th>
                <th className="text-left py-1.5 pr-3 font-medium">Item</th>
                <th className="text-left py-1.5 pr-3 font-medium">Dim</th>
                <th className="text-left py-1.5 pr-3 font-medium">Rev</th>
                <th className="text-left py-1.5 pr-3 font-medium">Raw answers per run</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const responses = grouped.get(it.id) ?? [];
                return (
                  <tr key={it.id} className="border-b border-[var(--soft)] align-top">
                    <td className="py-2 pr-3 text-xs text-neutral-500 tabular-nums">{it.position}</td>
                    <td className="py-2 pr-3 max-w-xl">{it.text}</td>
                    <td className="py-2 pr-3 text-xs text-neutral-600 font-mono">{it.dimension}</td>
                    <td className="py-2 pr-3 text-xs text-center">{it.reverse_keyed ? "✓" : ""}</td>
                    <td className="py-2 pr-3">
                      <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
                        {responses.map((r, i) => (
                          <span
                            key={i}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded"
                            style={{
                              background: r.framing === "self" ? "var(--accent-soft)" : "var(--soft)",
                              color: r.framing === "self" ? "var(--accent)" : "var(--muted)",
                            }}
                            title={`${r.framing}#${r.run_index}: raw=${r.raw}, scored=${r.scored}`}
                          >
                            {r.framing[0]}{r.run_index}:{r.raw}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function RunDetail({ runId }: { runId: string }) {
  const db = rawSqlite();
  const run = db.prepare(`SELECT * FROM runs WHERE id=?`).get(runId) as any;
  if (!run) return <div className="card p-5 text-sm text-neutral-600">Run not found.</div>;
  const model = db.prepare(`SELECT * FROM models WHERE id=?`).get(run.model_id) as any;
  const inst = db.prepare(`SELECT * FROM instruments WHERE id=?`).get(run.instrument_id) as any;
  const scores = db.prepare(`SELECT dimension, raw_sum, mean, item_count FROM scores WHERE run_id=?`).all(runId) as any[];

  return (
    <section className="space-y-6">
      <div className="card p-5">
        <div className="text-xs text-neutral-500 font-mono mb-2">run {runId}</div>
        <h2 className="serif text-xl font-semibold mb-2 text-neutral-900">
          {model?.display_name ?? run.model_id} · {inst?.short_name ?? run.instrument_id} · {run.framing}#{run.run_index}
        </h2>
        <div className="text-xs text-neutral-600">
          {(run.prompt_tokens ?? 0).toLocaleString()} in / {(run.completion_tokens ?? 0).toLocaleString()} out
          {run.reasoning_tokens ? ` (+${run.reasoning_tokens.toLocaleString()} reasoning)` : ""}
          {" · "}${(run.cost_usd ?? 0).toFixed(5)}
          {run.latency_ms ? ` · ${(run.latency_ms / 1000).toFixed(1)}s` : ""}
          {run.openrouter_id ? ` · OpenRouter id ${run.openrouter_id}` : ""}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="serif text-base font-semibold mb-2 text-neutral-900">System prompt</h3>
        <pre className="text-xs bg-[var(--soft)] p-3 rounded whitespace-pre-wrap font-mono">{run.system_prompt}</pre>
      </div>

      <div className="card p-5">
        <h3 className="serif text-base font-semibold mb-2 text-neutral-900">User prompt</h3>
        <pre className="text-xs bg-[var(--soft)] p-3 rounded whitespace-pre-wrap font-mono max-h-96 overflow-auto">{run.user_prompt}</pre>
      </div>

      <div className="card p-5">
        <h3 className="serif text-base font-semibold mb-2 text-neutral-900">Raw model response</h3>
        <pre className="text-xs bg-[var(--soft)] p-3 rounded whitespace-pre-wrap font-mono max-h-96 overflow-auto">{run.raw_response}</pre>
      </div>

      <div className="card p-5">
        <h3 className="serif text-base font-semibold mb-3 text-neutral-900">Computed dimension scores</h3>
        <table className="w-full text-sm">
          <thead className="text-neutral-500 border-b border-[var(--border)]">
            <tr>
              <th className="text-left py-1.5 pr-3 font-medium">Dimension</th>
              <th className="text-right py-1.5 pr-3 font-medium">Raw sum</th>
              <th className="text-right py-1.5 pr-3 font-medium">Mean</th>
              <th className="text-right py-1.5 font-medium">Items</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.dimension} className="border-b border-[var(--soft)]">
                <td className="py-1.5 pr-3">{s.dimension}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{s.raw_sum}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{s.mean.toFixed(2)}</td>
                <td className="py-1.5 text-right tabular-nums text-neutral-500">{s.item_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <Link href={`/raw?model=${encodeURIComponent(run.model_id)}&instrument=${encodeURIComponent(run.instrument_id)}`} className="text-sm text-[var(--link)] hover:underline">
          ← back to all runs of this model × instrument
        </Link>
      </div>
    </section>
  );
}
