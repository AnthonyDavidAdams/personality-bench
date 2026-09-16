#!/usr/bin/env python3
"""Analyze a prompt-sensitivity sweep.

Produces the numbers HDSR screening comment 2 asks for:

  1. Canonical-arm validation — does the canonical variant reproduce the main
     dataset? If not, nothing downstream is trustworthy.
  2. Variance decomposition — how much score variation is attributable to model
     identity vs prompt format vs run-to-run noise.
  3. Headline-claim robustness — do the self-human gap, the Power-last value
     ordering, and the cohort convergence survive re-wording and re-ordering?

Usage:
    python3 scripts/sensitivity_report.py <run_id> [--json out.json]
"""
import argparse
import csv
import json
import statistics
from collections import defaultdict
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SENS_DIR = BASE_DIR / "data" / "sensitivity"
SCORES_CSV = BASE_DIR / "data" / "exports" / "scores.csv"

VARIANTS = ["canonical", "paraphrase", "reverse", "shuffle"]


def load_sweep(run_id: str):
    path = SENS_DIR / f"{run_id}.jsonl"
    if not path.exists():
        raise SystemExit(f"No sweep at {path}")
    recs = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        if r.get("status") == "ok":
            recs.append(r)
    return recs


def load_main_dataset():
    """Cell means from the main study, for canonical-arm validation."""
    if not SCORES_CSV.exists():
        return {}
    acc = defaultdict(list)
    with SCORES_CSV.open() as fh:
        for r in csv.DictReader(fh):
            acc[(r["model_id"], r["instrument_id"], r["framing"], r["dimension"])].append(
                float(r["mean"])
            )
    return {k: sum(v) / len(v) for k, v in acc.items()}


def cell_means(recs):
    """(model, instrument, framing, variant, dimension) -> list of run scores."""
    acc = defaultdict(list)
    for r in recs:
        for dim, val in (r.get("scores") or {}).items():
            if val is None:
                continue
            acc[(r["model_id"], r["instrument_id"], r["framing"], r["variant"], dim)].append(val)
    return acc


def _sd(vals):
    return statistics.stdev(vals) if len(vals) > 1 else 0.0


def canonical_validation(acc, main):
    """Compare this sweep's canonical arm to the main dataset."""
    rows = []
    for (model, inst, framing, variant, dim), vals in acc.items():
        if variant != "canonical":
            continue
        ref = main.get((model, inst, framing, dim))
        if ref is None:
            continue
        here = sum(vals) / len(vals)
        rows.append({
            "model": model, "instrument": inst, "framing": framing, "dimension": dim,
            "sweep_canonical": round(here, 3), "main_dataset": round(ref, 3),
            "abs_diff": round(abs(here - ref), 3), "run_sd": round(_sd(vals), 3),
        })
    rows.sort(key=lambda r: -r["abs_diff"])
    return rows


def variance_decomposition(acc):
    """Per (instrument, dimension, framing), split variance three ways.

    Nested design: run within variant within model. Components are estimated
    by expected mean squares, not by taking the variance of cell means
    directly. The distinction matters: the variance of five-run variant means
    contains sigma^2_run / 5 of sampling error, and the variance of model
    means contains sigma^2_format / n_v + sigma^2_run / (n_r * n_v). Reading
    those raw variances as components overstated the format share by about
    three points on this sweep (20.4% -> 17.5%).

    run    : sigma^2_run    mean within-cell variance across runs
    format : sigma^2_format variance of variant means minus its run-noise part
    model  : sigma^2_model  variance of model means minus format and run parts
    Negative estimates (a component smaller than its own sampling error) are
    floored at zero, as is standard for method-of-moments variance components.
    """
    grouped = defaultdict(lambda: defaultdict(dict))
    for (model, inst, framing, variant, dim), vals in acc.items():
        grouped[(inst, framing, dim)][model][variant] = vals

    out = []
    for key, by_model in sorted(grouped.items()):
        inst, framing, dim = key
        run_vars, obs_format_vars, model_means = [], [], []
        n_r_list, n_v_list = [], []
        for model, by_variant in by_model.items():
            variant_means = []
            for variant, vals in by_variant.items():
                if len(vals) > 1:
                    run_vars.append(statistics.variance(vals))
                    n_r_list.append(len(vals))
                variant_means.append(sum(vals) / len(vals))
            if len(variant_means) > 1:
                obs_format_vars.append(statistics.variance(variant_means))
                n_v_list.append(len(variant_means))
            if variant_means:
                model_means.append(sum(variant_means) / len(variant_means))

        if not run_vars or not obs_format_vars or len(model_means) < 2:
            continue
        n_r = statistics.mean(n_r_list)
        n_v = statistics.mean(n_v_list)

        v_run = statistics.mean(run_vars)
        obs_format = statistics.mean(obs_format_vars)
        obs_model = statistics.variance(model_means)

        v_format = max(obs_format - v_run / n_r, 0.0)
        v_model = max(obs_model - v_format / n_v - v_run / (n_r * n_v), 0.0)
        total = v_run + v_format + v_model
        if total <= 0:
            continue
        out.append({
            "instrument": inst, "framing": framing, "dimension": dim,
            "var_model": round(v_model, 4), "var_format": round(v_format, 4),
            "var_run": round(v_run, 4),
            "pct_model": round(100 * v_model / total, 1),
            "pct_format": round(100 * v_format / total, 1),
            "pct_run": round(100 * v_run / total, 1),
            "sd_format": round(v_format ** 0.5, 3),
            "sd_run": round(v_run ** 0.5, 3),
        })
    out.sort(key=lambda r: -r["pct_format"])
    return out


def max_format_shift(acc):
    """Largest variant-induced shift in any cell, vs that cell's run noise."""
    by_cell = defaultdict(dict)
    for (model, inst, framing, variant, dim), vals in acc.items():
        by_cell[(model, inst, framing, dim)][variant] = vals

    rows = []
    for (model, inst, framing, dim), by_variant in by_cell.items():
        if "canonical" not in by_variant or len(by_variant) < 2:
            continue
        canon = sum(by_variant["canonical"]) / len(by_variant["canonical"])
        run_sds = [_sd(v) for v in by_variant.values() if len(v) > 1]
        noise = statistics.mean(run_sds) if run_sds else 0.0
        for variant, vals in by_variant.items():
            if variant == "canonical":
                continue
            shift = sum(vals) / len(vals) - canon
            rows.append({
                "model": model, "instrument": inst, "framing": framing, "dimension": dim,
                "variant": variant, "canonical": round(canon, 3),
                "variant_mean": round(sum(vals) / len(vals), 3),
                "shift": round(shift, 3), "run_sd": round(noise, 3),
                "shift_over_noise": round(abs(shift) / noise, 2) if noise > 0 else None,
            })
    rows.sort(key=lambda r: -abs(r["shift"]))
    return rows


def by_instrument(vd, instruments_meta):
    """Aggregate variance shares per instrument, against items-per-scale.

    items_per_scale is reported because the obvious hypothesis is that short
    scales have less redundancy absorbing a wording change. Measured on the
    full eight-model sweep the ordering runs the other way: IPIP-50 (10
    items/scale) carries the largest format share and PVQ-21 (2.1) the
    smallest. Scale length does not explain format sensitivity here, so the
    column stays as a reported control rather than an explanation.

    The ordering also flipped between a six-model partial read and the full
    eight, which is the reason this is computed rather than asserted: per-
    instrument shares are not stable until the model panel is complete.
    """
    acc = defaultdict(lambda: {"model": [], "format": [], "run": []})
    for r in vd:
        acc[r["instrument"]]["model"].append(r["pct_model"])
        acc[r["instrument"]]["format"].append(r["pct_format"])
        acc[r["instrument"]]["run"].append(r["pct_run"])
    out = []
    for inst, d in acc.items():
        meta = instruments_meta.get(inst, {})
        out.append({
            "instrument": inst,
            "n_scales": len(d["model"]),
            "items_per_scale": meta.get("items_per_scale"),
            "pct_model": round(statistics.mean(d["model"]), 1),
            "pct_format": round(statistics.mean(d["format"]), 1),
            "pct_run": round(statistics.mean(d["run"]), 1),
        })
    out.sort(key=lambda r: -r["pct_format"])
    return out


def by_model(acc):
    """Mean absolute format-induced shift per model, in run-SD units."""
    shifts = max_format_shift(acc)
    per = defaultdict(list)
    for r in shifts:
        if r["shift_over_noise"] is not None:
            per[r["model"]].append(abs(r["shift"]))
    out = [{"model": m,
            "mean_abs_shift": round(statistics.mean(v), 3),
            "max_abs_shift": round(max(v), 3),
            "n": len(v)}
           for m, v in per.items()]
    out.sort(key=lambda r: -r["mean_abs_shift"])
    return out


def instruments_meta():
    """items-per-scale for each instrument in the sweep."""
    meta = {}
    for path in (BASE_DIR / "instruments").glob("*.json"):
        try:
            d = json.loads(path.read_text())
        except (json.JSONDecodeError, OSError):
            continue
        dims = len(d.get("dimensions") or []) or 1
        meta[d.get("id", path.stem)] = {
            "items_per_scale": round(len(d.get("items") or []) / dims, 1)
        }
    return meta


def self_human_gap(acc):
    """The 1.69-point neuroticism gap, recomputed under each variant."""
    per_variant = defaultdict(lambda: defaultdict(dict))
    for (model, inst, framing, variant, dim), vals in acc.items():
        if inst != "ipip50" or dim != "neuroticism":
            continue
        per_variant[variant][model][framing] = sum(vals) / len(vals)

    out = []
    for variant in VARIANTS:
        gaps = [
            f["human"] - f["self"]
            for f in per_variant.get(variant, {}).values()
            if "human" in f and "self" in f
        ]
        if gaps:
            out.append({
                "variant": variant, "n_models": len(gaps),
                "mean_gap": round(statistics.mean(gaps), 3),
                "sd_across_models": round(_sd(gaps), 3),
                "min_gap": round(min(gaps), 3), "max_gap": round(max(gaps), 3),
            })
    return out


def power_last(acc):
    """Is Power still ranked last on Schwartz values under every variant?"""
    per = defaultdict(lambda: defaultdict(dict))
    for (model, inst, framing, variant, dim), vals in acc.items():
        if inst != "pvq21" or framing != "self":
            continue
        per[variant][model][dim] = sum(vals) / len(vals)

    out = []
    for variant in VARIANTS:
        models = per.get(variant, {})
        if not models:
            continue
        last_counts = defaultdict(int)
        power_ranks = []
        for dims in models.values():
            if not dims:
                continue
            order = sorted(dims, key=lambda d: dims[d])
            last_counts[order[0]] += 1
            if "power" in dims:
                power_ranks.append(order.index("power") + 1)
        out.append({
            "variant": variant, "n_models": len(models),
            "power_ranked_last_in": last_counts.get("power", 0),
            "mean_power_rank": round(statistics.mean(power_ranks), 2) if power_ranks else None,
            "most_common_lowest": max(last_counts, key=last_counts.get) if last_counts else None,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run_id")
    ap.add_argument("--json", help="write full results to this path")
    args = ap.parse_args()

    recs = load_sweep(args.run_id)
    if not recs:
        raise SystemExit("No successful records in sweep.")
    acc = cell_means(recs)
    main_ds = load_main_dataset()

    models = sorted({r["model_id"] for r in recs})
    variants = sorted({r["variant"] for r in recs})
    print(f"Sweep {args.run_id}: {len(recs)} successful runs, "
          f"{len(models)} models, {len(variants)} variants\n")

    print("=" * 78)
    print("1. CANONICAL-ARM VALIDATION (sweep canonical vs main dataset)")
    print("=" * 78)
    val = canonical_validation(acc, main_ds)
    if not val:
        print("  No overlap with main dataset to validate against.")
    else:
        diffs = [r["abs_diff"] for r in val]
        print(f"  {len(val)} comparable cells")
        print(f"  mean |diff| = {statistics.mean(diffs):.3f}   "
              f"median = {statistics.median(diffs):.3f}   max = {max(diffs):.3f}")
        print("  largest divergences:")
        for r in val[:5]:
            print(f"    {r['model']:34s} {r['instrument']:9s} {r['framing']:5s} "
                  f"{r['dimension']:22s} sweep={r['sweep_canonical']:.2f} "
                  f"main={r['main_dataset']:.2f} diff={r['abs_diff']:.2f}")

    print()
    print("=" * 78)
    print("2. VARIANCE DECOMPOSITION (share of variance by source)")
    print("=" * 78)
    print(f"  {'instrument':10s} {'fram':5s} {'dimension':22s} "
          f"{'model%':>7s} {'format%':>8s} {'run%':>6s} {'sd_fmt':>7s} {'sd_run':>7s}")
    vd = variance_decomposition(acc)
    for r in vd:
        print(f"  {r['instrument']:10s} {r['framing']:5s} {r['dimension']:22s} "
              f"{r['pct_model']:7.1f} {r['pct_format']:8.1f} {r['pct_run']:6.1f} "
              f"{r['sd_format']:7.3f} {r['sd_run']:7.3f}")
    if vd:
        print(f"\n  ACROSS ALL DIMENSIONS: model={statistics.mean(r['pct_model'] for r in vd):.1f}%  "
              f"format={statistics.mean(r['pct_format'] for r in vd):.1f}%  "
              f"run={statistics.mean(r['pct_run'] for r in vd):.1f}%")

    print()
    print("=" * 78)
    print("2b. FORMAT SENSITIVITY BY INSTRUMENT (vs items per scale)")
    print("=" * 78)
    meta = instruments_meta()
    print(f"  {'instrument':12s} {'scales':>7s} {'items/scale':>12s} "
          f"{'model%':>7s} {'format%':>8s} {'run%':>6s}")
    for r in by_instrument(vd, meta):
        ips = f"{r['items_per_scale']:.1f}" if r["items_per_scale"] else "?"
        print(f"  {r['instrument']:12s} {r['n_scales']:7d} {ips:>12s} "
              f"{r['pct_model']:7.1f} {r['pct_format']:8.1f} {r['pct_run']:6.1f}")

    print()
    print("=" * 78)
    print("2c. FORMAT SENSITIVITY BY MODEL (mean |shift| across all scales)")
    print("=" * 78)
    for r in by_model(acc):
        print(f"  {r['model']:34s} mean |shift|={r['mean_abs_shift']:.3f}  "
              f"max={r['max_abs_shift']:.2f}  (n={r['n']})")

    print()
    print("=" * 78)
    print("3. LARGEST FORMAT-INDUCED SHIFTS (vs run-to-run noise)")
    print("=" * 78)
    shifts = max_format_shift(acc)
    for r in shifts[:12]:
        ratio = f"{r['shift_over_noise']:.1f}x" if r["shift_over_noise"] is not None else "n/a"
        print(f"  {r['model']:30s} {r['instrument']:9s} {r['framing']:5s} "
              f"{r['dimension']:20s} {r['variant']:10s} "
              f"shift={r['shift']:+.2f} run_sd={r['run_sd']:.2f} ({ratio} noise)")

    print()
    print("=" * 78)
    print("4. HEADLINE-CLAIM ROBUSTNESS")
    print("=" * 78)
    print("  Self-human neuroticism gap (main dataset reports 1.69):")
    for r in self_human_gap(acc):
        print(f"    {r['variant']:11s} gap={r['mean_gap']:.2f} "
              f"(sd across {r['n_models']} models {r['sd_across_models']:.2f}, "
              f"range {r['min_gap']:.2f}-{r['max_gap']:.2f})")
    print("\n  Schwartz 'Power ranked last' (self framing):")
    for r in power_last(acc):
        print(f"    {r['variant']:11s} power last in {r['power_ranked_last_in']}/{r['n_models']} "
              f"models, mean rank {r['mean_power_rank']}, "
              f"most common lowest = {r['most_common_lowest']}")

    if args.json:
        Path(args.json).write_text(json.dumps({
            "run_id": args.run_id,
            "n_records": len(recs),
            "models": models,
            "variants": variants,
            "canonical_validation": val,
            "variance_decomposition": vd,
            "format_shifts": shifts,
            "self_human_gap": self_human_gap(acc),
            "power_last": power_last(acc),
        }, indent=2))
        print(f"\nFull results -> {args.json}")


if __name__ == "__main__":
    main()
