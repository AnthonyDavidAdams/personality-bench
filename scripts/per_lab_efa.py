#!/usr/bin/env python3
"""Per-lab factor analysis with hand-curated feature set.

Fixes the p > N problem from cross_lab_efa.py by reducing 57 features to
~15 high-signal dimensions before fitting EFA per lab.

Outputs:
  paper/per_lab_efa_results.json — factor loadings per lab
  paper/figures/per_lab_efa_loadings.png — side-by-side comparison
  paper/figures/per_lab_congruence.png — Tucker congruence matrix

Feature selection rationale: keep the 15 dimensions with (a) highest
between-model variance in the pool and (b) known theoretical importance.
"""
import json
import sqlite3
import sys
from pathlib import Path

VENV_PY = Path.home() / ".pb-venv" / "bin" / "python"
if not any(p.endswith("pb-venv") for p in sys.path[0:3]):
    try:
        import pandas  # noqa
    except ImportError:
        import os
        os.execvp(str(VENV_PY), [str(VENV_PY), __file__] + sys.argv[1:])

import numpy as np
import pandas as pd
from sklearn.decomposition import FactorAnalysis, PCA
import matplotlib.pyplot as plt

DB = Path(__file__).resolve().parent.parent / "data" / "personality-bench.db"
OUT_JSON = Path(__file__).resolve().parent.parent / "paper" / "per_lab_efa_results.json"
FIG_DIR = Path(__file__).resolve().parent.parent / "paper" / "figures"
FIG_DIR.mkdir(parents=True, exist_ok=True)

# Hand-curated 15 dimensions covering the main personality theoretical space,
# chosen so per-lab EFA is identifiable (N > p).
CURATED_FEATURES = [
    # Big 5
    ("Big 5 (IPIP-50)", "openness"),
    ("Big 5 (IPIP-50)", "conscientiousness"),
    ("Big 5 (IPIP-50)", "extraversion"),
    ("Big 5 (IPIP-50)", "agreeableness"),
    ("Big 5 (IPIP-50)", "neuroticism"),
    # HEXACO Honesty-Humility (unique to HEXACO)
    ("HEXACO-24", "honesty_humility"),
    # Dark Triad
    ("Dark Triad", "machiavellianism"),
    ("Dark Triad", "narcissism"),
    ("Dark Triad", "psychopathy"),
    # Schwartz — 4 highest-variance dimensions
    ("Schwartz Values", "universalism"),
    ("Schwartz Values", "power"),
    ("Schwartz Values", "achievement"),
    ("Schwartz Values", "self_direction"),
    # Moral Foundations — 2 highest-variance
    ("Moral Foundations", "care"),
    ("Moral Foundations", "authority"),
]

con = sqlite3.connect(str(DB))
df = pd.read_sql(
    """
    SELECT r.model_id, m.vendor AS lab, i.short_name AS instrument,
           s.dimension, AVG(s.mean) AS score
    FROM scores s
    JOIN runs r ON r.id = s.run_id
    JOIN instruments i ON i.id = r.instrument_id
    JOIN models m ON m.id = r.model_id
    WHERE r.status='completed' AND r.framing='self'
    GROUP BY r.model_id, m.vendor, i.short_name, s.dimension
    """, con)
con.close()

df["feature"] = df["instrument"] + "_" + df["dimension"]
mat = df.pivot_table(index=["model_id", "lab"], columns="feature", values="score", aggfunc="first")

curated_names = [f"{i}_{d}" for i, d in CURATED_FEATURES]
available = [f for f in curated_names if f in mat.columns]
missing = [f for f in curated_names if f not in mat.columns]
if missing:
    print(f"WARN: missing features (will skip): {missing}")

X = mat[available].dropna(axis=0, how="any")
print(f"Curated: {X.shape[0]} models × {X.shape[1]} features")

# Z-score
Xn = (X - X.mean()) / X.std()

labs = Xn.index.get_level_values("lab").value_counts()
print(f"\nModels per lab (using curated features):")
for lab, n in labs.items():
    marker = "✓" if n >= 8 else "(too few)"
    print(f"  {lab:<15s} {n:>3d}  {marker}")

# Number of factors: from scree of pooled
pca = PCA(n_components=X.shape[1])
pca.fit(Xn.values)
kaiser = int((pca.explained_variance_ >= 1).sum())
k = max(3, min(5, kaiser))
print(f"\nUsing k={k} factors (Kaiser={kaiser})")

# Pool EFA
fa_pool = FactorAnalysis(n_components=k, rotation="varimax", random_state=0)
fa_pool.fit(Xn.values)
pool_loadings = pd.DataFrame(fa_pool.components_.T, index=Xn.columns,
                             columns=[f"F{i+1}" for i in range(k)])

# Per-lab EFA (labs with ≥ 8 models)
results = {"pool": {"n_models": int(Xn.shape[0]), "loadings": pool_loadings.round(3).to_dict()}}
lab_loadings = {"pool": pool_loadings}
for lab, n in labs.items():
    if n < 8:
        continue
    X_lab = Xn.xs(lab, level="lab")
    fa = FactorAnalysis(n_components=k, rotation="varimax", random_state=0)
    fa.fit(X_lab.values)
    loadings = pd.DataFrame(fa.components_.T, index=X_lab.columns,
                            columns=[f"F{i+1}" for i in range(k)])
    results[lab] = {"n_models": int(n), "loadings": loadings.round(3).to_dict()}
    lab_loadings[lab] = loadings
    print(f"  Fit EFA for lab={lab}: k={k}")

# Tucker congruence — align factors optimally between each lab pair
def tucker_phi(a, b):
    """Cosine similarity between two loading vectors."""
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-12))

def best_congruence(L1, L2):
    """Return the best-match congruence and the mapping (assignment problem)."""
    from scipy.optimize import linear_sum_assignment
    m = np.zeros((L1.shape[1], L2.shape[1]))
    for i in range(L1.shape[1]):
        for j in range(L2.shape[1]):
            m[i, j] = abs(tucker_phi(L1.iloc[:, i].values, L2.iloc[:, j].values))
    r, c = linear_sum_assignment(-m)
    return m[r, c].mean(), dict(zip(r.tolist(), c.tolist())), m

lab_names = list(lab_loadings.keys())
print("\n=== Tucker congruence φ (mean across best-matched factors) ===")
congruence_mat = np.zeros((len(lab_names), len(lab_names)))
for i, l1 in enumerate(lab_names):
    for j, l2 in enumerate(lab_names):
        if i == j:
            congruence_mat[i, j] = 1.0
        else:
            phi, _, _ = best_congruence(lab_loadings[l1], lab_loadings[l2])
            congruence_mat[i, j] = phi

print(f"{'':>10s}", *[f"{n:>10s}" for n in lab_names])
for i, l1 in enumerate(lab_names):
    row_str = "  ".join(f"{congruence_mat[i,j]:.3f}" for j in range(len(lab_names)))
    print(f"{l1:>10s}  {row_str}")

# Save results
OUT_JSON.write_text(json.dumps({
    "n_factors": k,
    "features": available,
    "per_lab": results,
    "congruence": {
        "labs": lab_names,
        "matrix": congruence_mat.tolist(),
    }
}, indent=2))
print(f"\nSaved to {OUT_JSON}")

# --- Figure: side-by-side loadings heatmap ---
fig, axes = plt.subplots(1, len(lab_names), figsize=(3 * len(lab_names), 6), sharey=True)
if len(lab_names) == 1:
    axes = [axes]
for ax, name in zip(axes, lab_names):
    L = lab_loadings[name]
    im = ax.imshow(L.abs().values, cmap="Blues", vmin=0, vmax=1, aspect="auto")
    ax.set_xticks(range(L.shape[1]))
    ax.set_xticklabels(L.columns)
    if ax is axes[0]:
        ax.set_yticks(range(L.shape[0]))
        ax.set_yticklabels([f.replace("_", "\n", 1) for f in L.index], fontsize=7)
    n = results[name]["n_models"]
    ax.set_title(f"{name}\n(n={n})")
fig.suptitle(f"Per-Lab EFA Loadings — {k} factors, {X.shape[1]} features", y=1.02)
plt.colorbar(im, ax=axes, fraction=0.02)
plt.tight_layout()
fig.savefig(FIG_DIR / "per_lab_efa_loadings.png", dpi=150, bbox_inches="tight")
plt.close(fig)
print(f"Saved heatmap to {FIG_DIR / 'per_lab_efa_loadings.png'}")

# --- Figure: Tucker congruence matrix ---
fig, ax = plt.subplots(figsize=(6, 5))
im = ax.imshow(congruence_mat, cmap="RdYlGn", vmin=0.5, vmax=1.0)
ax.set_xticks(range(len(lab_names)))
ax.set_yticks(range(len(lab_names)))
ax.set_xticklabels(lab_names, rotation=45, ha="right")
ax.set_yticklabels(lab_names)
for i in range(len(lab_names)):
    for j in range(len(lab_names)):
        ax.text(j, i, f"{congruence_mat[i,j]:.2f}", ha="center", va="center",
                color="white" if congruence_mat[i, j] < 0.75 else "black", fontsize=9)
ax.set_title(f"Factor-structure congruence across labs\n(Tucker's φ, higher = more similar structure)")
plt.colorbar(im, ax=ax, fraction=0.04)
plt.tight_layout()
fig.savefig(FIG_DIR / "per_lab_congruence.png", dpi=150)
plt.close(fig)
print(f"Saved congruence matrix to {FIG_DIR / 'per_lab_congruence.png'}")
