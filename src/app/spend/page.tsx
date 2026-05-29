import { getSpendSummary, getRecentRuns, getSpendTableRows } from "@/lib/queries";
import { SortableSpendTable } from "@/components/SortableSpendTable";

export const dynamic = "force-dynamic";

function fmtUsd(n: number) {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}

export default function SpendPage() {
  const spend = getSpendSummary();
  const recent = getRecentRuns(150);
  const spendRows = getSpendTableRows();

  return (
    <div className="space-y-10">
      <section>
        <h1 className="serif text-3xl font-semibold tracking-tight text-neutral-900">Spend transparency</h1>
        <p className="text-neutral-700 mt-3 max-w-3xl leading-relaxed">
          Every API call is logged with its prompt tokens, completion tokens, reasoning tokens (where the
          provider reports them), latency, and authoritative cost from OpenRouter&rsquo;s{" "}
          <code className="text-[var(--accent)]">/generation</code> endpoint. No black boxes — every row below
          is a real billed call.
        </p>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Stat label="Total spent" value={fmtUsd(spend.totalUsd)} />
        <Stat label="Runs completed" value={spend.totalRuns.toLocaleString()} />
        <Stat label="Tokens in" value={spend.totalTokensIn.toLocaleString()} />
        <Stat label="Tokens out" value={spend.totalTokensOut.toLocaleString()} />
        <Stat label="Reasoning tok" value={spend.totalTokensReasoning.toLocaleString()} />
      </section>

      <section className="card p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="serif text-lg font-semibold text-neutral-900">By model</h2>
          <span className="text-xs text-neutral-500">Click any column header to sort</span>
        </div>
        <p className="text-xs text-neutral-600 mb-3 max-w-3xl">
          Run counts are uneven by design. <strong className="text-[var(--accent)]">Frontier</strong> models
          (the cutting-edge release from each lab) are sampled at N=5 per cell across 14 instruments × 2
          framings (max 140 runs). <strong>Historical</strong> models from earlier product generations are
          sampled at N=3 per cell (max 84 runs) for the cross-version drift analysis. Lower counts than the
          max reflect occasional content-filter rejections or empty responses.
        </p>
        <SortableSpendTable rows={spendRows} />
      </section>

      <section className="card p-5">
        <h2 className="serif text-lg font-semibold mb-3 text-neutral-900">Recent runs</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-neutral-500 border-b border-[var(--border)]">
              <tr>
                <th className="text-left py-2 pr-4 font-medium">Model</th>
                <th className="text-left py-2 pr-4 font-medium">Instrument</th>
                <th className="text-left py-2 pr-4 font-medium">Framing</th>
                <th className="text-right py-2 pr-4 font-medium">In/Out</th>
                <th className="text-right py-2 pr-4 font-medium">Latency</th>
                <th className="text-right py-2 pr-4 font-medium">Cost</th>
                <th className="text-left py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => (
                <tr key={r.id} className="border-b border-[var(--soft)]">
                  <td className="py-1.5 pr-4 font-mono text-xs text-neutral-800">{r.modelId.split("/").pop()}</td>
                  <td className="py-1.5 pr-4 font-mono text-xs">{r.instrumentId}</td>
                  <td className="py-1.5 pr-4 text-xs">{r.framing}#{r.runIndex}</td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-xs">
                    {(r.promptTokens ?? 0).toLocaleString()}/{(r.completionTokens ?? 0).toLocaleString()}
                    {r.reasoningTokens ? <span className="text-[var(--accent)]">+{r.reasoningTokens.toLocaleString()}r</span> : null}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-xs text-neutral-500">
                    {r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : "—"}
                  </td>
                  <td className="py-1.5 pr-4 text-right tabular-nums text-xs">{fmtUsd(r.costUsd ?? 0)}</td>
                  <td className="py-1.5 text-xs">
                    <span
                      className={
                        r.status === "completed"
                          ? "text-[var(--positive)]"
                          : r.status === "invalid"
                          ? "text-[var(--warning)]"
                          : "text-neutral-500"
                      }
                    >
                      {r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl serif font-semibold mt-1 tabular-nums text-neutral-900">{value}</div>
    </div>
  );
}
