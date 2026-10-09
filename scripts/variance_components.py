"""
Descriptive heterogeneity decomposition of self-presented persona scores.

SECONDARY ANALYSIS. This does NOT test the lead claim and must not be reported as if it does.
The random effects here are exchangeable and use no release order whatsoever -- permuting release
dates within a lineage leaves every number unchanged -- so the model-level term is between-model
heterogeneity within a lineage, not temporal drift. Its laboratory term is the variance of latent
laboratory intercepts, not the spread among the products those laboratories actually offered at one
moment: under this model two releases from different laboratories differ by
sigma^2_lab + sigma^2_line + sigma^2_model, so a small laboratory variance does not imply small
between-laboratory product differences. The lead claim is settled by scripts/matched_contrasts.py.

Per Tier-1 scale this fits a nested random-intercept model

    score_ijkr = mu + lab_i + line_j(i) + release_k(j) + e_r(k)

over run-level observations (N=5 per release cell), and reports each level's share of total
variance. Shares are unitless, so they pool across scales with different response ranges.

Known limits, reported rather than hidden:
  - Seven laboratories is a small number from which to estimate a laboratory variance component.
  - Five of seven laboratories contribute a single product line, so lab and line are close to
    confounded; where the line component collapses to zero that is identification, not evidence.
  - Several scales are ceiling-bounded, which compresses the release and run components.

Usage: python3 scripts/variance_components.py [--json paper/variance_components.json]
"""
import json
import sqlite3
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.formula.api as smf

BASE = Path(__file__).resolve().parent.parent
DB = BASE / "data" / "personality-bench.db"

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


def load(con, instrument, dimension, framing="self"):
    q = """
        SELECT r.model_id AS model, s.mean AS score,
               m.vendor AS lab, COALESCE(m.lineage, m.id) AS line
        FROM scores s
        JOIN runs r   ON r.id = s.run_id
        JOIN models m ON m.id = r.model_id
        WHERE r.instrument_id = ? AND s.dimension = ? AND r.framing = ?
          AND r.status = 'completed' AND m.active = 1
    """
    df = pd.read_sql_query(q, con, params=(instrument, dimension, framing))
    if df.empty:
        return df
    # Make nesting explicit: a line key is unique within a lab, a model within a line.
    df["line"] = df["lab"] + ":" + df["line"].astype(str)
    df["model"] = df["line"] + ":" + df["model"]
    df["const"] = 1
    return df


def decompose(df):
    md = smf.mixedlm(
        "score ~ 1",
        df,
        groups=df["const"],
        vc_formula={"lab": "0 + C(lab)", "line": "0 + C(line)", "model_in_line": "0 + C(model)"},
    )
    fit = md.fit(reml=True, method="lbfgs", maxiter=2000)
    vc = {k: float(max(v, 0.0)) for k, v in fit.vcomp_labels_dict().items()} if hasattr(fit, "vcomp_labels_dict") else None
    if vc is None:
        names = md.exog_vc.names if hasattr(md, "exog_vc") else ["lab", "line", "model_in_line"]
        vc = {n: float(max(v, 0.0)) for n, v in zip(names, fit.vcomp)}
    resid = float(fit.scale)
    total = sum(vc.values()) + resid
    if total <= 0:
        return None
    return {
        "lab": vc.get("lab", 0.0) / total,
        "line": vc.get("line", 0.0) / total,
        "model_in_line": vc.get("model_in_line", 0.0) / total,
        "run": resid / total,
        "total_var": total,
        "converged": bool(fit.converged),
    }


def main():
    con = sqlite3.connect(DB)
    rows = []
    for inst, dims in TIER1.items():
        for dim in dims:
            df = load(con, inst, dim)
            if df.empty or df["model"].nunique() < 12:
                continue
            try:
                d = decompose(df)
            except Exception as e:  # noqa: BLE001
                print(f"  [skip] {inst}/{dim}: {type(e).__name__}: {e}", file=sys.stderr)
                continue
            if d is None:
                continue
            d.update(instrument=inst, dimension=dim, n_obs=len(df),
                     n_models=int(df["model"].nunique()), n_labs=int(df["lab"].nunique()),
                     n_lines=int(df["line"].nunique()))
            rows.append(d)

    if not rows:
        sys.exit("no scales fitted")
    res_all = pd.DataFrame(rows)
    # Unresolved fits are excluded from every summary and the exclusion is stated, rather than
    # silently averaged in.
    res = res_all[res_all.converged].copy()
    dropped = len(res_all) - len(res)

    def band(col):
        return f"{res[col].median()*100:5.1f}%   [{res[col].quantile(.25)*100:4.1f} – {res[col].quantile(.75)*100:4.1f}]"

    print(f"\nScales fitted: {len(res)}  ·  converged: {int(res.converged.sum())}/{len(res)}")
    print(f"Models: {res.n_models.max()}  labs: {res.n_labs.max()}  lines: {res.n_lines.max()}  run-level obs per scale: {res.n_obs.median():.0f}\n")
    print("Share of total variance in self-presented persona scores")
    print("                       median   [IQR]")
    for lvl, label in [("lab", "Laboratory"), ("line", "Product line | lab"), ("model_in_line", "Model | line"), ("run", "Run (sampling)")]:
        print(f"  {label:22s} {band(lvl)}")

    res["lab_plus_line"] = res["lab"] + res["line"]
    print(f"  {'Laboratory + line (better identified than the split)':22s} "
          f"{res['lab_plus_line'].median()*100:5.1f}%   [{res['lab_plus_line'].quantile(.25)*100:4.1f} - {res['lab_plus_line'].quantile(.75)*100:4.1f}]")
    lab_gt_rel = (res["lab"] > res["model_in_line"]).sum()
    print(f"\nScales where laboratory share exceeds model-in-line share: {lab_gt_rel}/{len(res)} = {100*lab_gt_rel/len(res):.1f}%")
    print(f"Scales where the line component sits at the 0 boundary: {(res['line'] < 0.005).sum()}/{len(res)} "
          f"(a boundary estimate is not by itself evidence of confounding)")
    print(f"Unresolved fits excluded from all summaries: {dropped}/{len(res_all)}")

    print("\nScales with the LARGEST model-in-line share:")
    for _, r in res.nlargest(6, "model_in_line").iterrows():
        print(f"  {r.instrument}/{r.dimension:<24} lab {r.lab*100:4.1f}%  model {r.model_in_line*100:4.1f}%  run {r.run*100:4.1f}%")
    print("\nScales with the LARGEST laboratory share:")
    for _, r in res.nlargest(6, "lab").iterrows():
        print(f"  {r.instrument}/{r.dimension:<24} lab {r.lab*100:4.1f}%  model {r.model_in_line*100:4.1f}%  run {r.run*100:4.1f}%")

    if "--json" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--json") + 1])
        out.write_text(json.dumps({"excludedUnresolved": int(dropped), "perScale": res.to_dict(orient="records")}, indent=2))
        print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
