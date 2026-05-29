"use client";
import { useState } from "react";

export interface SpendRow {
  modelId: string;
  displayName: string;
  lab: string;             // human-readable vendor name ("OpenAI", "Anthropic", etc.)
  cohort: "Frontier" | "Historical";
  runs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

type SortKey = "lab" | "displayName" | "cohort" | "runs" | "tokensIn" | "tokensOut" | "costUsd";
type SortDir = "asc" | "desc";

function fmtUsd(n: number) {
  if (!n) return "$0";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}

export function SortableSpendTable({ rows }: { rows: SpendRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("costUsd");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Numeric columns default to desc on first click; text columns default to asc
      setSortDir(["runs", "tokensIn", "tokensOut", "costUsd"].includes(key) ? "desc" : "asc");
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true });
    return sortDir === "asc" ? cmp : -cmp;
  });

  function Header({ k, label, align }: { k: SortKey; label: string; align?: "right" }) {
    const active = sortKey === k;
    return (
      <th
        onClick={() => toggleSort(k)}
        className={
          "py-2 pr-4 font-medium cursor-pointer select-none hover:text-[var(--primary)] " +
          (align === "right" ? "text-right" : "text-left") +
          (active ? " text-[var(--primary)]" : " text-neutral-500")
        }
      >
        {label}
        {active ? <span className="ml-1 text-xs">{sortDir === "asc" ? "▲" : "▼"}</span> : null}
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-[var(--border)]">
          <tr>
            <Header k="lab" label="Lab" />
            <Header k="displayName" label="Model" />
            <Header k="cohort" label="Cohort" />
            <Header k="runs" label="Runs" align="right" />
            <Header k="tokensIn" label="Tokens in" align="right" />
            <Header k="tokensOut" label="Tokens out" align="right" />
            <Header k="costUsd" label="Cost" align="right" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.modelId} className="border-b border-[var(--soft)]">
              <td className="py-2 pr-4 text-neutral-800">{r.lab}</td>
              <td className="py-2 pr-4 font-mono text-xs text-neutral-800">{r.displayName}</td>
              <td className="py-2 pr-4 text-xs">
                <span
                  className={
                    "inline-block px-2 py-0.5 rounded " +
                    (r.cohort === "Frontier"
                      ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "bg-[var(--soft)] text-neutral-600")
                  }
                >
                  {r.cohort}
                </span>
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{r.runs}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{r.tokensIn.toLocaleString()}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{r.tokensOut.toLocaleString()}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{fmtUsd(r.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
