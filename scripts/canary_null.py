#!/usr/bin/env python3
"""A no-changepoint null for the endpoint canary that preserves serial dependence.

The null in fingerprint_report.permutation_null shuffles timestamps within each series. That
destroys exactly the structure capable of manufacturing an apparent changepoint -- short-range
serial dependence -- so it answers "could independent noise do this", which was never the live
objection. Twenty draws also cannot support a tail statement.

This replaces it with a circular block bootstrap over DAYS, run at the model level:

  * Blocks of L consecutive days are drawn with replacement until the original number of days is
    covered, so within-block serial dependence survives while any systematic temporal change is
    destroyed. That is the no-changepoint null.
  * Whole days move together across every probe of a model, so cross-probe dependence at a shared
    timestamp -- the coincidence the detector keys on -- is preserved rather than broken.
  * Resampled values are written back onto the ORIGINAL day grid, slot for slot, so the scheduled
    observation times and the missingness pattern are exactly those of the real log.
  * The entire pipeline is re-run on each null dataset: per-prompt changepoint detection on all
    three features, then the coincidence grouping into model-level events. Not just the three
    observed windows.

Prespecified study-wide statistics, fixed before the run:
    T1  total grouped events across all models
    T2  maximum event strength (max rank-biserial effect over all events)

Block length is a nuisance parameter, so the whole thing is repeated over several L and reported.

Usage: python3 scripts/canary_null.py [--reps 999] [--blocks 1,3,7,14] [--json paper/canary_null.json]
"""
import argparse
import json
import sys
from collections import defaultdict
from concurrent.futures import ProcessPoolExecutor
from datetime import date, timedelta
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fingerprint_report import (  # noqa: E402
    COINCIDENCE_WINDOW_DAYS, MIN_COINCIDENT_PROMPTS, features, find_changepoint, load_entries,
)

FEATURES = ("words", "markdown", "refusal")


def build_panel(ok):
    """model -> (ordered days, {(prompt, day): [feature dicts]})."""
    per_model = defaultdict(lambda: defaultdict(list))
    for e in ok:
        day = (e.get("timestamp") or "")[:10]
        if not day:
            continue
        per_model[e["model_id"]][(e["prompt_id"], day)].append(features(e))
    panel = {}
    for model, slots in per_model.items():
        days = sorted({d for _, d in slots})
        panel[model] = (days, dict(slots))
    return panel


def detect_model(days_slots):
    """Per-prompt changepoints then coincidence grouping, for one model. Mirrors detect()."""
    days, slots = days_slots
    by_prompt = defaultdict(list)
    for (prompt, day), feats in slots.items():
        for f in feats:
            by_prompt[prompt].append((day, f))
    hits = []
    for prompt, series in by_prompt.items():
        series.sort(key=lambda t: t[0])
        for feature in FEATURES:
            cp = find_changepoint(series, feature)
            if cp:
                hits.append((cp["date"], prompt, feature, cp))
                break
    hits.sort(key=lambda h: h[0])
    events, cluster = [], []
    for hit in hits:
        if cluster and date.fromisoformat(hit[0]) - date.fromisoformat(cluster[0][0]) > timedelta(days=COINCIDENCE_WINDOW_DAYS):
            if len(cluster) >= MIN_COINCIDENT_PROMPTS:
                events.append(max(cp["effect"] for _, _, _, cp in cluster))
            cluster = []
        cluster.append(hit)
    if len(cluster) >= MIN_COINCIDENT_PROMPTS:
        events.append(max(cp["effect"] for _, _, _, cp in cluster))
    return events


def resample_model(days, slots, L, rng):
    """Circular block bootstrap over days; whole days move together; original grid preserved."""
    nd = len(days)
    if nd < 2:
        return slots
    n_blocks = -(-nd // L)
    starts = rng.integers(0, nd, size=n_blocks)
    src_days = []
    for s in starts:
        src_days.extend(days[(s + j) % nd] for j in range(L))
    src_days = src_days[:nd]

    pool = defaultdict(list)          # prompt -> {day: [feats]}
    for (prompt, day), feats in slots.items():
        pool[prompt].append(day)
    by_prompt_day = defaultdict(dict)
    for (prompt, day), feats in slots.items():
        by_prompt_day[prompt][day] = feats

    out = {}
    for (prompt, day), feats in slots.items():
        src = src_days[days.index(day)] if day in days else day
        donor = by_prompt_day[prompt].get(src)
        if not donor:                  # that probe has no observation on the donor day
            alt = by_prompt_day[prompt]
            if not alt:
                continue
            donor = alt[rng.choice(list(alt.keys()))]
        k = len(feats)
        idx = rng.integers(0, len(donor), size=k)
        out[(prompt, day)] = [donor[i] for i in idx]
    return out


def one_rep(args):
    panel, L, seed = args
    rng = np.random.default_rng(seed)
    total, strengths = 0, []
    for model, (days, slots) in panel.items():
        r = resample_model(days, slots, L, rng)
        ev = detect_model((days, r))
        total += len(ev)
        strengths.extend(ev)
    return total, (max(strengths) if strengths else 0.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=999)
    ap.add_argument("--blocks", default="1,3,7,14")
    ap.add_argument("--json")
    ap.add_argument("--workers", type=int, default=0)
    a = ap.parse_args()

    ok, _ = load_entries()
    panel = build_panel(ok)
    print(f"models: {len(panel)}   usable observations: {len(ok)}")

    obs_total, obs_strengths = 0, []
    for model, ds in panel.items():
        ev = detect_model(ds)
        obs_total += len(ev)
        obs_strengths.extend(ev)
    T1_obs = obs_total
    T2_obs = max(obs_strengths) if obs_strengths else 0.0
    print(f"OBSERVED   T1 total grouped events = {T1_obs}   T2 max event strength = {T2_obs:.3f}\n")

    results = {}
    workers = a.workers or None
    for L in [int(x) for x in a.blocks.split(",")]:
        jobs = [(panel, L, 20261008 + 1000 * L + i) for i in range(a.reps)]
        with ProcessPoolExecutor(max_workers=workers) as ex:
            out = list(ex.map(one_rep, jobs, chunksize=8))
        t1 = np.array([o[0] for o in out])
        t2 = np.array([o[1] for o in out])
        # +1 corrections: the observed data counts as one draw from the null.
        p1 = (1 + int((t1 >= T1_obs).sum())) / (a.reps + 1)
        p2 = (1 + int((t2 >= T2_obs).sum())) / (a.reps + 1)
        results[L] = {"block_days": L, "reps": a.reps,
                      "T1_null_mean": float(t1.mean()), "T1_null_p95": float(np.percentile(t1, 95)),
                      "T1_null_max": int(t1.max()), "p_T1": p1,
                      "T2_null_mean": float(t2.mean()), "T2_null_p95": float(np.percentile(t2, 95)),
                      "p_T2": p2}
        print(f"block L={L:>2}d  T1 null mean {t1.mean():.2f}  p95 {np.percentile(t1,95):.0f}  max {t1.max()}  "
              f"p(T1>={T1_obs}) = {p1:.4f}   |   T2 null mean {t2.mean():.3f}  p(T2>={T2_obs:.2f}) = {p2:.4f}")

    if a.json:
        Path(a.json).write_text(json.dumps(
            {"observed": {"T1": T1_obs, "T2": T2_obs}, "reps": a.reps,
             "byBlockLength": list(results.values())}, indent=2))
        print(f"\nWrote {a.json}")


if __name__ == "__main__":
    main()
