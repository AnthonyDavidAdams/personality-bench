/**
 * Tiny in-process TTL memo for the read-only dashboard aggregates.
 *
 * The cohort roll-ups (one GROUP BY over scores ⋈ runs per instrument/dimension/framing)
 * are recomputed for every model on the gallery and home pages — 46 models × ~17 dimensions
 * is 780 queries per request for maybe 50 distinct results. The underlying data only changes
 * when the nightly sweep writes new runs, so a short TTL is free correctness.
 */
const store = new Map<string, { at: number; value: unknown }>();

export function memo<T>(key: string, ttlMs: number, compute: () => T): T {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.value as T;
  const value = compute();
  store.set(key, { at: now, value });
  return value;
}

/** Drop everything — used by scripts that mutate the DB inside one process. */
export function clearMemo(): void {
  store.clear();
}
