"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ZodiacIcon, ELEMENT_COLORS } from "./ZodiacIcon";

export interface ModelExplorerRow {
  id: string;
  displayName: string;
  lab: string;
  cohort: "Frontier" | "Historical";
  releaseDate: string | null;
  addedAt: number | null;
  reasoning: boolean;
  runs: number;
  spend: number;
  priceIn: number | null;
  priceOut: number | null;
  archetype: string;
  hq: string | null;
  zodiacSign: string | null;
  zodiacElement: string | null;
  zodiacBlurb: string | null;
}

type SortKey = "lab" | "displayName" | "releaseDate" | "addedAt" | "cohort" | "runs" | "spend" | "priceIn" | "priceOut";
type SortDir = "asc" | "desc";
type View = "cards" | "table";

const SORTS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "releaseDate", label: "Release date", numeric: true },
  { key: "addedAt", label: "Date added", numeric: true },
  { key: "lab", label: "Lab", numeric: false },
  { key: "displayName", label: "Model", numeric: false },
  { key: "cohort", label: "Cohort", numeric: false },
  { key: "runs", label: "Runs", numeric: true },
  { key: "spend", label: "Cost", numeric: true },
  { key: "priceIn", label: "Price in", numeric: true },
  { key: "priceOut", label: "Price out", numeric: true },
];
const NUMERIC = new Set(SORTS.filter((s) => s.numeric).map((s) => s.key));

function fmtUsd(n: number) {
  if (!n) return "$0";
  if (n < 0.01) return `$${n.toFixed(5)}`;
  return `$${n.toFixed(2)}`;
}
function fmtPerM(n: number | null) {
  return n == null ? "—" : `$${n.toFixed(2)}`;
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** Sort value for a row. Nulls always sort last regardless of direction. */
function sortValue(r: ModelExplorerRow, key: SortKey): string | number | null {
  const v = r[key];
  if (v == null || v === "") return null;
  return v as string | number;
}

export function ModelsExplorer({ rows }: { rows: ModelExplorerRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("releaseDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [lab, setLab] = useState<string>("all");
  const [cohort, setCohort] = useState<string>("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("cards");

  const labs = useMemo(() => [...new Set(rows.map((r) => r.lab))].sort(), [rows]);

  function setSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      // Dates and counts are most useful newest/highest first; names read better A→Z.
      setSortDir(NUMERIC.has(key) ? "desc" : "asc");
    }
  }

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = rows.filter((r) => {
      if (lab !== "all" && r.lab !== lab) return false;
      if (cohort !== "all" && r.cohort !== cohort) return false;
      if (needle && !`${r.displayName} ${r.id} ${r.lab} ${r.archetype}`.toLowerCase().includes(needle)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      if (av == null && bv == null) return a.displayName.localeCompare(b.displayName);
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), undefined, { numeric: true });
      if (cmp !== 0) return sortDir === "asc" ? cmp : -cmp;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [rows, lab, cohort, q, sortKey, sortDir]);

  const arrow = sortDir === "asc" ? "▲" : "▼";

  return (
    <div>
      {/* ── Controls ── */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-3">
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-neutral-500">Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="model, lab, archetype…"
            className="border border-[var(--border)] rounded px-2.5 py-1.5 text-sm bg-transparent min-w-[12rem] focus:outline-none focus:border-[var(--accent)]"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-neutral-500">Lab</span>
          <select
            value={lab}
            onChange={(e) => setLab(e.target.value)}
            className="border border-[var(--border)] rounded px-2.5 py-1.5 text-sm bg-transparent focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All labs</option>
            {labs.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-neutral-500">Cohort</span>
          <select
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            className="border border-[var(--border)] rounded px-2.5 py-1.5 text-sm bg-transparent focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="all">All</option>
            <option value="Frontier">Frontier</option>
            <option value="Historical">Historical</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="eyebrow text-neutral-500">Sort by</span>
          <div className="flex">
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="border border-[var(--border)] rounded-l px-2.5 py-1.5 text-sm bg-transparent focus:outline-none focus:border-[var(--accent)]"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => setSortDir(sortDir === "asc" ? "desc" : "asc")}
              aria-label={sortDir === "asc" ? "Sort ascending — click for descending" : "Sort descending — click for ascending"}
              className="border border-l-0 border-[var(--border)] rounded-r px-2.5 py-1.5 text-xs text-neutral-600 hover:text-[var(--accent)] hover:border-[var(--accent)]"
            >
              {arrow}
            </button>
          </div>
        </label>
        <div className="flex flex-col gap-1 ml-auto">
          <span className="eyebrow text-neutral-500">View</span>
          <div className="flex text-sm">
            {(["cards", "table"] as View[]).map((v, i) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={
                  "px-3 py-1.5 border border-[var(--border)] capitalize " +
                  (i === 0 ? "rounded-l " : "border-l-0 rounded-r ") +
                  (view === v ? "bg-[var(--soft)] text-[var(--primary)] font-medium" : "text-neutral-600 hover:text-[var(--accent)]")
                }
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="text-xs text-neutral-500 mb-6">
        Showing {visible.length} of {rows.length} models
        {lab !== "all" || cohort !== "all" || q ? (
          <button
            type="button"
            onClick={() => { setLab("all"); setCohort("all"); setQ(""); }}
            className="ml-3 text-[var(--link)] hover:underline"
          >
            clear filters
          </button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-neutral-600 py-12 text-center border border-dashed border-[var(--border)] rounded">
          No models match those filters.
        </p>
      ) : view === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border)]">
              <tr>
                <Th k="lab" label="Lab" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                <Th k="displayName" label="Model" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                <Th k="releaseDate" label="Released" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                <Th k="cohort" label="Cohort" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                <Th k="runs" label="Runs" align="right" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                <Th k="priceIn" label="$/M in" align="right" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                <Th k="priceOut" label="$/M out" align="right" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
                <Th k="spend" label="Spent" align="right" sortKey={sortKey} sortDir={sortDir} onSort={setSort} />
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-[var(--soft)] hover:bg-[var(--soft)]">
                  <td className="py-2 pr-4 text-neutral-700 whitespace-nowrap">{r.lab}</td>
                  <td className="py-2 pr-4">
                    <Link href={`/models/${encodeURIComponent(r.id)}`} className="text-neutral-900 hover:text-[var(--accent)]">
                      {r.displayName}
                    </Link>
                    <div className="text-[11px] text-neutral-500 font-mono">{r.id}</div>
                  </td>
                  <td className="py-2 pr-4 text-neutral-700 whitespace-nowrap tabular-nums">{fmtDate(r.releaseDate)}</td>
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
                  <td className="py-2 pr-4 text-right tabular-nums text-neutral-700">{r.runs}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-neutral-700">{fmtPerM(r.priceIn)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-neutral-700">{fmtPerM(r.priceOut)}</td>
                  <td className="py-2 pr-4 text-right tabular-nums text-neutral-700">{fmtUsd(r.spend)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {visible.map((r) => (
            <Link
              key={r.id}
              href={`/models/${encodeURIComponent(r.id)}`}
              className="card block p-5 hover:border-[var(--accent)] transition"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="serif font-semibold text-lg text-neutral-900">{r.displayName}</span>
                {r.zodiacSign ? (
                  <span className="flex items-center gap-1.5 text-xs text-neutral-600 shrink-0" title={r.zodiacBlurb ?? undefined}>
                    <span style={{ color: ELEMENT_COLORS[r.zodiacElement ?? ""] }}>
                      <ZodiacIcon sign={r.zodiacSign} size={16} />
                    </span>
                    {r.zodiacSign}
                  </span>
                ) : null}
              </div>
              <div className="text-xs text-neutral-500 font-mono mt-1">{r.id}</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-[11px]">
                <span className="px-1.5 py-0.5 rounded bg-[var(--soft)] text-neutral-600">{r.lab}</span>
                <span
                  className={
                    "px-1.5 py-0.5 rounded " +
                    (r.cohort === "Frontier" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "bg-[var(--soft)] text-neutral-600")
                  }
                >
                  {r.cohort}
                </span>
                {r.reasoning ? <span className="px-1.5 py-0.5 rounded bg-[var(--soft)] text-neutral-600">reasoning</span> : null}
              </div>
              {r.archetype ? <div className="text-sm text-neutral-700 italic mt-2">{r.archetype}</div> : null}
              <div className="text-xs text-neutral-600 mt-2">
                {r.hq ? `${r.hq} · ` : ""}released {fmtDate(r.releaseDate)}
              </div>
              <div className="text-xs text-neutral-600 mt-3">
                {fmtPerM(r.priceIn)}/M in · {fmtPerM(r.priceOut)}/M out
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                {r.runs} runs · {fmtUsd(r.spend)} spent
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Th({
  k,
  label,
  align,
  sortKey,
  sortDir,
  onSort,
}: {
  k: SortKey;
  label: string;
  align?: "right";
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
}) {
  const active = sortKey === k;
  return (
    <th
      onClick={() => onSort(k)}
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
