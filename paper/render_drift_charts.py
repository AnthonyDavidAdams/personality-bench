#!/usr/bin/env python3
"""
Render the cross-version drift line charts as static PNGs for paper embedding.

Reads directly from the SQLite DB; no Node/React server dependency.
Outputs to paper/figures/drift_<family>_<group>.png at 200 DPI.
"""
import sqlite3
import json
import os
from pathlib import Path

try:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
except ImportError:
    print("Install matplotlib: pip install matplotlib")
    raise

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DB_PATH = PROJECT_ROOT / "data" / "personality-bench.db"
OUT_DIR = PROJECT_ROOT / "paper" / "figures"
OUT_DIR.mkdir(exist_ok=True)

# Match the dashboard's family lineage
FAMILIES = [
    ("claude_opus", "Anthropic Claude Opus", [
        ("anthropic/claude-opus-4",   "Opus 4"),
        ("anthropic/claude-opus-4.1", "Opus 4.1"),
        ("anthropic/claude-opus-4.5", "Opus 4.5"),
        ("anthropic/claude-opus-4.6", "Opus 4.6"),
        ("anthropic/claude-opus-4.7", "Opus 4.7"),
        ("anthropic/claude-opus-4.8", "Opus 4.8"),
    ]),
    ("claude_sonnet", "Anthropic Claude Sonnet", [
        ("anthropic/claude-sonnet-4",   "Sonnet 4"),
        ("anthropic/claude-sonnet-4.5", "Sonnet 4.5"),
        ("anthropic/claude-sonnet-4.6", "Sonnet 4.6"),
    ]),
    ("gpt", "OpenAI GPT (base)", [
        ("openai/gpt-4-turbo", "GPT-4 Turbo"),
        ("openai/gpt-4o",      "GPT-4o"),
        ("openai/gpt-5",       "GPT-5"),
        ("openai/gpt-5.1",     "GPT-5.1"),
        ("openai/gpt-5.2",     "GPT-5.2"),
        ("openai/gpt-5.4",     "GPT-5.4"),
        ("openai/gpt-5.5",     "GPT-5.5"),
    ]),
    ("oseries", "OpenAI o-series (reasoning)", [
        ("openai/o1", "o1"),
        ("openai/o3", "o3"),
    ]),
    ("gemini", "Google Gemini", [
        ("google/gemini-2.5-pro",         "2.5 Pro"),
        ("google/gemini-3.1-pro-preview", "3.1 Pro Pre"),
    ]),
    ("grok", "xAI Grok", [
        ("x-ai/grok-4.20", "4.20"),
        ("x-ai/grok-4.3",  "4.3"),
    ]),
    ("deepseek", "DeepSeek", [
        ("deepseek/deepseek-chat",     "Chat V3"),
        ("deepseek/deepseek-r1",       "R1"),
        ("deepseek/deepseek-r1-0528",  "R1 (0528)"),
    ]),
    ("llama", "Meta Llama", [
        ("meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B"),
        ("meta-llama/llama-4-maverick",       "Llama 4 Maverick"),
    ]),
    ("mistral", "Mistral Large", [
        ("mistralai/mistral-large-2411", "Large 2411"),
        ("mistralai/mistral-large-2512", "Large 2512"),
    ]),
]

GROUPS = [
    ("Big 5", "ipip50",
     [("openness", "Openness", "#1f3a93"),
      ("agreeableness", "Agreeableness", "#15803d"),
      ("conscientiousness", "Conscientiousness", "#b45309"),
      ("neuroticism", "Neuroticism", "#be185d"),
      ("extraversion", "Extraversion", "#7c2d12")],
     1, 5),
    ("Dark Triad", "sd3",
     [("machiavellianism", "Machiavellianism", "#7c2d12"),
      ("narcissism", "Narcissism", "#b45309"),
      ("psychopathy", "Psychopathy", "#be185d")],
     1, 5),
    ("HEXACO H-H + Emotionality", "hexaco24",
     [("honesty_humility", "Honesty-Humility", "#1f3a93"),
      ("emotionality", "Emotionality", "#be185d")],
     1, 5),
    ("Attachment", "ecr12",
     [("attachment_anxiety", "Anxiety", "#be185d"),
      ("attachment_avoidance", "Avoidance", "#7c2d12")],
     1, 7),
]


def fetch_means(con, instrument_id, framing="self"):
    """Return dict[(model_id, dimension)] -> mean."""
    cur = con.execute(
        """
        SELECT r.model_id, s.dimension, AVG(s.mean) as mean
        FROM scores s JOIN runs r ON r.id = s.run_id
        WHERE r.instrument_id = ? AND r.framing = ? AND r.status = 'completed'
        GROUP BY r.model_id, s.dimension
        """,
        (instrument_id, framing),
    )
    return {(row[0], row[1]): row[2] for row in cur.fetchall()}


def render(family_id, family_label, versions, group_label, instrument_id, dims, y_min, y_max, means, out_path):
    fig, ax = plt.subplots(figsize=(7.2, 4.3), dpi=200)
    x_labels = [v[1] for v in versions]
    x_idx = list(range(len(x_labels)))
    rendered_any = False
    for dim_id, dim_label, color in dims:
        ys = []
        xs = []
        for i, (model_id, _) in enumerate(versions):
            y = means.get((model_id, dim_id))
            if y is not None:
                xs.append(i)
                ys.append(y)
        if len(ys) >= 2:
            ax.plot(xs, ys, color=color, marker="o", markersize=5, linewidth=2.0, label=dim_label)
            rendered_any = True
    if not rendered_any:
        plt.close(fig)
        return False
    ax.set_xticks(x_idx)
    ax.set_xticklabels(x_labels, fontsize=9.5, rotation=10 if len(x_labels) > 4 else 0)
    ax.set_ylim(y_min, y_max)
    ax.set_ylabel("Score", fontsize=10)
    ax.set_title(f"{family_label} — {group_label}", fontsize=11.5, weight="bold", loc="left", pad=8)
    ax.grid(True, axis="y", linestyle="--", alpha=0.35, linewidth=0.5)
    ax.set_axisbelow(True)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.tick_params(axis="both", labelsize=9.5, length=3)
    ax.legend(loc="best", fontsize=9, frameon=False, ncol=min(len(dims), 5))
    fig.tight_layout()
    fig.savefig(out_path, dpi=200, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return True


def main():
    con = sqlite3.connect(DB_PATH)
    rendered = 0
    for family_id, family_label, versions in FAMILIES:
        if len(versions) < 2:
            continue
        for group_label, inst_id, dims, y_min, y_max in GROUPS:
            means = fetch_means(con, inst_id)
            out = OUT_DIR / f"drift_{family_id}_{inst_id}.png"
            ok = render(family_id, family_label, versions, group_label, inst_id, dims, y_min, y_max, means, out)
            if ok:
                rendered += 1
                print(f"  ✓ {out.name}")
    print(f"\nRendered {rendered} drift charts to {OUT_DIR}")


if __name__ == "__main__":
    main()
