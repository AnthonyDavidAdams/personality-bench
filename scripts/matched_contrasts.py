"""
The matched contrast that settles the lead claim, with dependence-preserving uncertainty.

Neither earlier attempt tested the claim. family_vs_lab.ts compared a max-minus-min range over
laboratory flagships against a single adjacent-release step, which is asymmetric.
variance_components.py fits an exchangeable model that uses no release order at all, so its
model-level term is between-model heterogeneity within a lineage, not temporal drift; under that
model two releases from different laboratories differ by sigma^2_lab + sigma^2_line + sigma^2_model,
so a small laboratory variance does not imply small between-laboratory product differences.

This compares mean squared differences with mean squared differences.

For model k on scale s let ybar_ks be the mean over n_ks runs and vhat_ks = s^2_ks / n_ks. For two
independently evaluated models the noise-corrected squared difference

    dhat_ab = (ybar_a - ybar_b)^2 - vhat_a - vhat_b

is unbiased for the squared difference of underlying means. Individual dhat may be negative and are
NOT truncated: truncating each biases the average upward.

    W  mean dhat over adjacent-release pairs within a product line
    B  mean dhat over laboratory-flagship pairs at prespecified snapshot dates

Weights, published: laboratories equally, then lines within laboratory, then pairs within line;
snapshot dates equally, then laboratory pairs within date.

Uncertainty is a cell bootstrap that preserves dependence: complete administrations are resampled
within each model cell, each model is drawn ONCE per replicate and that draw is reused everywhere
the model appears, so pairs sharing a model stay correlated. Pairs are never resampled
independently. W-B is the inferential target; ratios are unstable where B is near zero.
Leave-one-laboratory-out is an influence diagnostic, not a confidence procedure: seven purposively
chosen laboratories are not a probability sample.

Usage:
  python3 scripts/matched_contrasts.py --json paper/matched_contrasts.json \
      [--framing self|human] [--boot 2000] [--loo] [--drop-backfilled]
"""
import json
import sqlite3
import sys
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd

BASE = Path(__file__).resolve().parent.parent
DB = BASE / "data" / "personality-bench.db"
RNG = np.random.default_rng(20261008)

TIER1 = {
    "ipip50": ["extraversion", "agreeableness", "conscientiousness", "neuroticism", "openness"],
    "hexaco24": ["honesty_humility", "emotionality", "extraversion", "agreeableness", "conscientiousness", "openness"],
    "sd3": ["machiavellianism", "narcissism", "psychopathy"],
    "pvq21": ["self_direction", "stimulation", "hedonism", "achievement", "power", "security", "conformity", "tradition", "benevolence", "universalism"],
    "mfq30": ["care", "fairness", "loyalty", "authority", "sanctity"],
    "ecr12": ["attachment_anxiety", "attachment_avoidance"],
    "eq_short": ["empathy_quotient"],
    "ncs18": ["need_for_cognition"],
    "locus_levenson": ["loc_internal", "loc_powerful_others", "loc_chance"],
}
BACKFILLED = {"google/gemini-3.1-pro-preview", "x-ai/grok-4.3", "anthropic/claude-haiku-4.5"}


def variant(mid):
    return "pro" if mid.endswith("-pro") else "fast" if mid.endswith("-fast") else "base"


def load_runs(con, instrument, dimension, framing):
    q = """SELECT r.model_id AS model, s.mean AS score, m.vendor AS lab,
                  m.lineage AS line, m.release_date AS rdate
           FROM scores s JOIN runs r ON r.id=s.run_id JOIN models m ON m.id=r.model_id
           WHERE r.instrument_id=? AND s.dimension=? AND r.framing=? AND r.status='completed'
             AND m.active=1 AND m.release_date IS NOT NULL AND m.release_date<>''"""
    return pd.read_sql_query(q, con, params=(instrument, dimension, framing))


def build_structure(meta, snapshots):
    """Pair structure depends only on labs and release dates, so it is fixed across bootstrap draws."""
    base = meta[meta.variant == "base"]
    within = []  # (lab, line, [models at point A], [models at point B])
    for (lab, line), grp in base[base.line.notna() & (base.line != "")].groupby(["lab", "line"]):
        pts = [(d, list(g.model)) for d, g in grp.groupby("rdate")]
        pts.sort(key=lambda t: t[0])
        for i in range(1, len(pts)):
            within.append((lab, line, pts[i - 1][1], pts[i][1]))
    between = []  # (date, modelA, modelB)
    for snap in snapshots:
        avail = base[base.rdate <= snap]
        if avail.empty:
            continue
        flag = avail.sort_values("rdate").groupby("lab").tail(1)
        if len(flag) < 5:
            continue
        for (_, a), (_, b) in combinations(flag.iterrows(), 2):
            between.append((snap, a.model, b.model, a.lab, b.lab))
    return within, between


def point_stats(groups):
    """groups: model -> array of run scores. Returns model -> (ybar, vhat)."""
    out = {}
    for m, v in groups.items():
        n = len(v)
        ybar = float(v.mean())
        vhat = float(v.var(ddof=1) / n) if n > 1 else 0.0
        out[m] = (ybar, vhat)
    return out


def collapse(models, st):
    """Average several same-date models into one release point; variance of a mean of k means."""
    ys = [st[m][0] for m in models if m in st]
    vs = [st[m][1] for m in models if m in st]
    if not ys:
        return None
    k = len(ys)
    return (sum(ys) / k, sum(vs) / (k * k))


def compute_WB(st, within, between, skip_lab=None):
    per_line = {}
    for lab, line, A, B in within:
        if skip_lab and lab == skip_lab:
            continue
        a, b = collapse(A, st), collapse(B, st)
        if a is None or b is None:
            continue
        d = (a[0] - b[0]) ** 2 - a[1] - b[1]
        per_line.setdefault((lab, line), []).append(d)
    per_lab = {}
    for (lab, line), ds in per_line.items():
        per_lab.setdefault(lab, []).append(float(np.mean(ds)))
    W = float(np.mean([np.mean(v) for v in per_lab.values()])) if per_lab else np.nan

    per_date = {}
    for snap, ma, mb, la, lb in between:
        if skip_lab and (la == skip_lab or lb == skip_lab):
            continue
        if ma not in st or mb not in st:
            continue
        d = (st[ma][0] - st[mb][0]) ** 2 - st[ma][1] - st[mb][1]
        per_date.setdefault(snap, []).append(d)
    B_ = float(np.mean([np.mean(v) for v in per_date.values()])) if per_date else np.nan
    return W, B_


def main():
    arg = lambda f, d=None: sys.argv[sys.argv.index(f) + 1] if f in sys.argv else d
    framing = arg("--framing", "self")
    nboot = int(arg("--boot", 0))
    do_loo = "--loo" in sys.argv
    drop_bf = "--drop-backfilled" in sys.argv

    con = sqlite3.connect(DB)
    dates = pd.read_sql_query("SELECT DISTINCT release_date d FROM models WHERE active=1 AND release_date IS NOT NULL AND release_date<>'' ORDER BY d", con)["d"].tolist()
    snapshots = [d.date().isoformat() for d in pd.date_range(pd.Timestamp(dates[0]), pd.Timestamp(dates[-1]), freq="QE")]

    rows, boot_exceed, loo_rows = [], [], []
    for inst, dims in TIER1.items():
        for dim in dims:
            df = load_runs(con, inst, dim, framing)
            if df.empty:
                continue
            if drop_bf:
                df = df[~df.model.isin(BACKFILLED)]
            meta = df.drop_duplicates("model")[["model", "lab", "line", "rdate"]].copy()
            meta["variant"] = meta.model.map(variant)
            if len(meta) < 12:
                continue
            groups = {m: g.score.to_numpy() for m, g in df.groupby("model")}
            within, between = build_structure(meta, snapshots)
            if not within or not between:
                continue
            st = point_stats(groups)
            W, B_ = compute_WB(st, within, between)
            if np.isnan(W) or np.isnan(B_):
                continue
            rec = {"instrument": inst, "dimension": dim, "W": W, "B": B_, "diff": W - B_,
                   "n_within": len(within), "n_between": len(between), "n_models": len(meta)}

            if nboot:
                ds = np.empty(nboot)
                for b in range(nboot):
                    draw = {m: RNG.choice(v, size=len(v), replace=True) for m, v in groups.items()}
                    stb = point_stats(draw)
                    wb = compute_WB(stb, within, between)
                    ds[b] = wb[0] - wb[1]
                rec["diff_lo"] = float(np.percentile(ds, 2.5))
                rec["diff_hi"] = float(np.percentile(ds, 97.5))
                rec["p_exceed"] = float((ds > 0).mean())
                boot_exceed.append(ds > 0)

            if do_loo:
                for lab in sorted(meta.lab.unique()):
                    w2, b2 = compute_WB(st, within, between, skip_lab=lab)
                    if not (np.isnan(w2) or np.isnan(b2)):
                        loo_rows.append({"instrument": inst, "dimension": dim, "dropped_lab": lab, "diff": w2 - b2})
            rows.append(rec)

    res = pd.DataFrame(rows)
    print(f"\nframing = {framing}   scales = {len(res)}   snapshots = {len(snapshots)}   drop-backfilled = {drop_bf}")
    print(f"  W median {res.W.median():.4f} [{res.W.quantile(.25):.4f}-{res.W.quantile(.75):.4f}]")
    print(f"  B median {res.B.median():.4f} [{res.B.quantile(.25):.4f}-{res.B.quantile(.75):.4f}]")
    print(f"  W-B median {res['diff'].median():+.4f}")
    ex = int((res.W > res.B).sum())
    print(f"  W exceeds B on {ex}/{len(res)} = {100*ex/len(res):.1f}% of scales")

    if nboot:
        arr = np.vstack(boot_exceed)          # scales x replicates
        counts = arr.sum(axis=0)
        print(f"\n  bootstrap ({nboot} replicates, cell-level, model drawn once per replicate)")
        print(f"    exceedance count: median {np.median(counts):.0f}  95% interval [{np.percentile(counts,2.5):.0f} - {np.percentile(counts,97.5):.0f}] of {len(res)}")
        signed = res[(res.diff_lo > 0) | (res.diff_hi < 0)]
        print(f"    scales whose 95% interval for W-B excludes zero: {len(signed)}/{len(res)} "
              f"({int((signed['diff']>0).sum())} release-like, {int((signed['diff']<0).sum())} laboratory-like)")

    if do_loo:
        lo = pd.DataFrame(loo_rows)
        piv = lo.groupby("dropped_lab")["diff"].median()
        print(f"\n  leave-one-laboratory-out, median W-B across scales (full panel {res['diff'].median():+.4f}):")
        for lab, v in piv.sort_values().items():
            print(f"    without {lab:<10} {v:+.4f}")

    if "--json" in sys.argv:
        out = Path(arg("--json"))
        payload = {"framing": framing, "snapshots": snapshots, "dropBackfilled": drop_bf,
                   "nBoot": nboot, "perScale": res.to_dict(orient="records")}
        if do_loo:
            payload["leaveOneLabOut"] = loo_rows
        out.write_text(json.dumps(payload, indent=2))
        print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
