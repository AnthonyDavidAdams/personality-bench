#!/usr/bin/env python3
"""Analyze data/fingerprints.jsonl for endpoint changes over time.

Why this is not hash-matching
-----------------------------
The original detector compared SHA256 of the response text across runs. Even at
temperature 0, hosted endpoints are not bit-deterministic (batching, kernel and
hardware variation, speculative decoding), so the hash differs on nearly every
pair of runs. That detector reported "changed" for ~119 of 120 model x prompt
pairs, which is the same as reporting nothing.

What replaces it is a distributional test. For each (model, prompt) we build a
daily series of response features and scan every split point for a shift, using
Mann-Whitney U (exact ranks, tie-corrected normal approximation) with a
rank-biserial effect size.

The load-bearing idea is COINCIDENCE. A single prompt drifting on one day is
noise; ten independent prompts shifting on the SAME day is an endpoint change.
So prompt-level changepoints are only promoted to a model-level event when
several prompts agree on a date. That is what makes this usable as evidence
that a scored drift reflects a weight change rather than a serving-stack change.

Views:
  --events     Model-level endpoint-change events (default)
  --prompts    Per-(model,prompt) changepoint detail
  --coverage   Log health: gaps, error windows, what the record can support
  --duplicates Exact-hash duplicate rate (the old view, kept as a diagnostic)
"""
import argparse
import json
import math
import re
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path

import numpy as np

LOG = Path(__file__).resolve().parent.parent / "data" / "fingerprints.jsonl"

# A changepoint needs this many observations on each side to be testable.
MIN_SIDE = 5
# Two-sided p threshold, Bonferroni-corrected across candidate split points.
ALPHA = 0.01
# Minimum |rank-biserial| to count as a real shift rather than a detectable one.
MIN_EFFECT = 0.6
# Prompts that must agree before a date is promoted to a model-level event.
MIN_COINCIDENT_PROMPTS = 3
# Endpoint rollouts are staged, not instantaneous, and a daily sampler localizes
# a shift only to within a few days. Prompts whose changepoints fall inside this
# many days of each other count as coincident.
COINCIDENCE_WINDOW_DAYS = 3

REFUSAL_MARKERS = re.compile(
    r"\b(I can't|I cannot|I won't|I'm not able to|I am not able to|"
    r"I'm unable|I am unable|can't help with|cannot help with|"
    r"not something I can|against my guidelines)\b",
    re.IGNORECASE,
)


def load_entries():
    """Return (ok_entries, error_entries)."""
    if not LOG.exists():
        return [], []
    ok, errs = [], []
    with LOG.open() as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue
            (ok if e.get("status") == "ok" else errs).append(e)
    return ok, errs


def features(entry):
    """Numeric features of one response, used for distributional comparison."""
    fp = entry.get("fingerprint") or {}
    text = entry.get("response_text") or ""
    words = fp.get("length_words")
    if words is None:
        words = len(text.split())
    chars = fp.get("length_chars")
    if chars is None:
        chars = len(text)
    return {
        "words": float(words),
        "chars": float(chars),
        "markdown": float(text.count("**") + text.count("##") + text.count("- ")),
        "refusal": 1.0 if REFUSAL_MARKERS.search(text) else 0.0,
    }


def mannwhitney(x, y):
    """Two-sided Mann-Whitney U with tie correction. Returns (U, p, effect).

    effect is the rank-biserial correlation: 0 = identical, 1 = fully separated.
    """
    x, y = np.asarray(x, float), np.asarray(y, float)
    n1, n2 = len(x), len(y)
    if n1 == 0 or n2 == 0:
        return None, 1.0, 0.0

    combined = np.concatenate([x, y])
    order = combined.argsort(kind="mergesort")
    ranks = np.empty(len(combined), float)
    ranks[order] = np.arange(1, len(combined) + 1)

    # Average ranks within tie groups.
    sorted_vals = combined[order]
    i = 0
    tie_term = 0.0
    while i < len(sorted_vals):
        j = i
        while j + 1 < len(sorted_vals) and sorted_vals[j + 1] == sorted_vals[i]:
            j += 1
        if j > i:
            avg = (i + j + 2) / 2.0
            ranks[order[i:j + 1]] = avg
            t = j - i + 1
            tie_term += t ** 3 - t
        i = j + 1

    r1 = ranks[:n1].sum()
    u1 = r1 - n1 * (n1 + 1) / 2.0
    u = min(u1, n1 * n2 - u1)

    n = n1 + n2
    mu = n1 * n2 / 2.0
    sigma_sq = (n1 * n2 / 12.0) * ((n + 1) - tie_term / (n * (n - 1))) if n > 1 else 0.0
    if sigma_sq <= 0:
        return u, 1.0, 0.0
    z = (u - mu + 0.5) / math.sqrt(sigma_sq)
    p = 2.0 * (1.0 - 0.5 * (1.0 + math.erf(abs(z) / math.sqrt(2.0))))
    effect = abs(1.0 - 2.0 * u1 / (n1 * n2))
    return u, min(1.0, p), effect


def series_by_prompt(ok):
    """(model, prompt) -> list of (date, features), chronological."""
    acc = defaultdict(list)
    for e in ok:
        day = e.get("timestamp", "")[:10]
        if not day:
            continue
        acc[(e["model_id"], e["prompt_id"])].append((day, features(e)))
    for key in acc:
        acc[key].sort(key=lambda t: t[0])
    return acc


def find_changepoint(series, feature="words"):
    """Scan split points for the strongest distributional shift."""
    days = [d for d, _ in series]
    vals = [f[feature] for _, f in series]
    uniq_days = sorted(set(days))
    if len(vals) < 2 * MIN_SIDE or len(uniq_days) < 4:
        return None

    candidates = []
    for split_day in uniq_days[1:]:
        left = [v for d, v in zip(days, vals) if d < split_day]
        right = [v for d, v in zip(days, vals) if d >= split_day]
        if len(left) < MIN_SIDE or len(right) < MIN_SIDE:
            continue
        _, p, effect = mannwhitney(left, right)
        candidates.append((split_day, p, effect, float(np.mean(left)), float(np.mean(right))))

    if not candidates:
        return None
    # Bonferroni across the split points actually tested.
    threshold = ALPHA / len(candidates)
    best = min(candidates, key=lambda c: (c[1], -c[2]))
    split_day, p, effect, mean_l, mean_r = best
    if p > threshold or effect < MIN_EFFECT:
        return None
    return {
        "date": split_day, "p": p, "threshold": threshold, "effect": effect,
        "mean_before": mean_l, "mean_after": mean_r,
        "n_tested_splits": len(candidates),
    }


def detect(ok):
    """Prompt-level changepoints, plus model-level coincident events."""
    per_prompt = {}
    for (model, prompt), series in series_by_prompt(ok).items():
        for feature in ("words", "markdown", "refusal"):
            cp = find_changepoint(series, feature)
            if cp:
                cp["feature"] = feature
                per_prompt[(model, prompt, feature)] = cp
                break

    by_model = defaultdict(list)
    for (model, prompt, feature), cp in per_prompt.items():
        by_model[model].append((cp["date"], prompt, feature, cp))

    events = []
    for model, hits in by_model.items():
        hits.sort(key=lambda h: h[0])
        # Greedily group changepoints whose dates fall within the rollout window.
        cluster = []
        for hit in hits:
            if cluster:
                span = date.fromisoformat(hit[0]) - date.fromisoformat(cluster[0][0])
                if span > timedelta(days=COINCIDENCE_WINDOW_DAYS):
                    _emit_event(events, model, cluster)
                    cluster = []
            cluster.append(hit)
        _emit_event(events, model, cluster)

    events.sort(key=lambda e: (e["window_start"], e["model"]))
    return per_prompt, events


def _emit_event(events, model, cluster):
    """Promote a cluster of coincident changepoints to a model-level event."""
    if len(cluster) < MIN_COINCIDENT_PROMPTS:
        return
    events.append({
        "model": model,
        "window_start": cluster[0][0],
        "window_end": cluster[-1][0],
        "n_prompts": len(cluster),
        "prompts": sorted(p for _, p, _, _ in cluster),
        "max_effect": max(cp["effect"] for _, _, _, cp in cluster),
    })


def coverage(ok, errs):
    """What the longitudinal record can actually support."""
    all_days = defaultdict(lambda: [0, 0])
    for e in ok:
        all_days[e.get("timestamp", "")[:10]][0] += 1
    for e in errs:
        all_days[e.get("timestamp", "")[:10]][1] += 1
    all_days.pop("", None)

    days = sorted(all_days)
    if not days:
        print("No records.")
        return

    total_ok = sum(v[0] for v in all_days.values())
    total_err = sum(v[1] for v in all_days.values())
    print(f"Window        : {days[0]} -> {days[-1]}")
    print(f"Records       : {total_ok} ok, {total_err} error "
          f"({100*total_err/(total_ok+total_err):.0f}% error)")
    print(f"Days with data: {len(days)}")

    span = (date.fromisoformat(days[-1]) - date.fromisoformat(days[0])).days + 1
    missing = span - len(days)
    print(f"Calendar span : {span} days ({missing} with no record at all)")

    dead = [d for d in days if all_days[d][0] == 0]
    if dead:
        print(f"\nDays logged but 100% failed ({len(dead)}):")
        runs = []
        for d in dead:
            dd = date.fromisoformat(d)
            if runs and dd - date.fromisoformat(runs[-1][-1]) == timedelta(days=1):
                runs[-1].append(d)
            else:
                runs.append([d])
        for r in runs:
            print(f"  {r[0]} .. {r[-1]}  ({len(r)} days)" if len(r) > 1 else f"  {r[0]}")

    errs_by_kind = defaultdict(int)
    for e in errs:
        msg = str(e.get("error", ""))
        if "402" in msg:
            errs_by_kind["402 Payment Required (OpenRouter balance)"] += 1
        elif "401" in msg:
            errs_by_kind["401 Unauthorized (key invalid/rotated)"] += 1
        elif "nodename nor servname" in msg or "urlopen" in msg:
            errs_by_kind["network unreachable (host asleep/offline)"] += 1
        elif "timed out" in msg:
            errs_by_kind["timeout"] += 1
        elif "429" in msg:
            errs_by_kind["429 rate limited"] += 1
        else:
            errs_by_kind["other"] += 1
    if errs_by_kind:
        print("\nError breakdown:")
        for k, v in sorted(errs_by_kind.items(), key=lambda kv: -kv[1]):
            print(f"  {v:6d}  {k}")

    print("\nPer-model usable observations:")
    per_model = defaultdict(int)
    for e in ok:
        per_model[e["model_id"]] += 1
    for m, n in sorted(per_model.items(), key=lambda kv: -kv[1]):
        print(f"  {n:6d}  {m}")


def duplicates(ok):
    """Exact-hash duplicate rate — the old detector, kept as a diagnostic."""
    by_key = defaultdict(list)
    for e in ok:
        by_key[(e["model_id"], e["prompt_id"])].append(e["fingerprint"]["sha256"])
    print("Exact-duplicate rate per model (share of response pairs with identical SHA256).")
    print("At temperature 0 a truly deterministic endpoint would be near 1.00.\n")
    per_model = defaultdict(lambda: [0, 0])
    for (model, _), hashes in by_key.items():
        if len(hashes) < 2:
            continue
        uniq = len(set(hashes))
        per_model[model][0] += len(hashes) - uniq
        per_model[model][1] += len(hashes) - 1
    for model, (dup, tot) in sorted(per_model.items()):
        rate = dup / tot if tot else 0.0
        print(f"  {model:40s} {rate:5.2f}   ({dup}/{tot})")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--events", action="store_true", help="Model-level endpoint-change events (default)")
    ap.add_argument("--prompts", action="store_true", help="Per-(model,prompt) changepoint detail")
    ap.add_argument("--coverage", action="store_true", help="Log health and gaps")
    ap.add_argument("--duplicates", action="store_true", help="Exact-hash duplicate rate (old view)")
    ap.add_argument("--json", help="write events to this path")
    args = ap.parse_args()

    ok, errs = load_entries()
    if not ok and not errs:
        print("No fingerprints logged yet. Run scripts/fingerprint.py first.")
        return

    if args.coverage:
        coverage(ok, errs)
        return
    if args.duplicates:
        duplicates(ok)
        return

    per_prompt, events = detect(ok)

    if args.prompts:
        print(f"{len(per_prompt)} (model, prompt) changepoints at "
              f"p < {ALPHA} (Bonferroni) and |effect| >= {MIN_EFFECT}\n")
        for (model, prompt, feature), cp in sorted(per_prompt.items()):
            print(f"  {model:34s} {prompt:20s} {feature:9s} {cp['date']}  "
                  f"{cp['mean_before']:7.1f} -> {cp['mean_after']:7.1f}  "
                  f"effect={cp['effect']:.2f}  p={cp['p']:.2e}")
        return

    n_clustered = sum(e["n_prompts"] for e in events)
    print(f"Endpoint-change events: >= {MIN_COINCIDENT_PROMPTS} independent canary prompts")
    print(f"shifting for the same model within a {COINCIDENCE_WINDOW_DAYS}-day window.\n")
    if not events:
        print("None detected.")
        print(f"({len(per_prompt)} isolated single-prompt changepoints, not promoted — "
              f"consistent with noise rather than endpoint swaps.)")
    else:
        for e in events:
            window = (e["window_start"] if e["window_start"] == e["window_end"]
                      else f"{e['window_start']}..{e['window_end']}")
            print(f"  {window:24s} {e['model']:34s} {e['n_prompts']:2d}/10 prompts  "
                  f"max effect={e['max_effect']:.2f}")
            print(f"  {'':24s} {', '.join(e['prompts'])}")
        print(f"\n{n_clustered} of {len(per_prompt)} changepoints fall in these events; "
              f"{len(per_prompt) - n_clustered} remain isolated (noise).")

    if args.json:
        Path(args.json).write_text(json.dumps({
            "events": events,
            "prompt_changepoints": [
                {"model": m, "prompt": p, "feature": f, **cp}
                for (m, p, f), cp in sorted(per_prompt.items())
            ],
        }, indent=2))
        print(f"\n-> {args.json}")


if __name__ == "__main__":
    main()
