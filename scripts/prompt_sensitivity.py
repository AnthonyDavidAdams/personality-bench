#!/usr/bin/env python3
"""Prompt-format sensitivity sweep for Personality Bench.

Answers HDSR screening comment 2: "LLMs are known to be sensitive to prompt
phrasing/format. So some sensitivity analysis to prompt phrasing/format (e.g.,
instruction wording, item order) would help establish whether the reported
patterns are robust or an artifact of the specific prompts used."

Design
------
Each cell is (model x instrument x framing x variant x run). Four variants:

  canonical   Byte-identical to the production prompt in
              src/lib/instruments/prompt.ts. This is the control: if the
              canonical arm here does not reproduce the main dataset, the
              sweep itself is suspect.
  paraphrase  Same items, same order. System prompt and instruction scaffolding
              reworded to preserve meaning while changing surface form.
  reverse     Canonical wording. Items presented in reverse order.
  shuffle     Canonical wording. Items in a deterministic seeded shuffle.

The order variants renumber displayed items 1..N and map the model's answers
back to canonical item positions before scoring, so reverse-keying and
dimension assignment stay correct. Without that mapping, an order variant would
manufacture a difference rather than measure one.

Temperature is fixed at the production value so that run-to-run spread here is
comparable to the run-to-run spread in the main dataset.

Usage
-----
    python3 scripts/prompt_sensitivity.py --dry-run     # plan + cost estimate, no spend
    python3 scripts/prompt_sensitivity.py --execute --max-spend 50
    python3 scripts/prompt_sensitivity.py --execute --resume <run_id>
"""
import argparse
import json
import os
import random
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
INSTRUMENT_DIR = BASE_DIR / "instruments"
DB_PATH = BASE_DIR / "data" / "personality-bench.db"
OUT_DIR = BASE_DIR / "data" / "sensitivity"

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# Read key from .env.local first (Next.js convention; shadows global env),
# then fall back to ~/.openrouter.env.
def _load_key() -> str:
    for path, prefix in (
        (BASE_DIR / ".env.local", "OPENROUTER_API_KEY="),
        (Path.home() / ".openrouter.env", "OPENROUTER_API_KEY="),
    ):
        if not path.exists():
            continue
        for line in path.read_text().splitlines():
            line = line.strip()
            if line.startswith(prefix):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    key = os.environ.get("OPENROUTER_API_KEY", "")
    if not key:
        sys.exit("No OPENROUTER_API_KEY found (.env.local, ~/.openrouter.env, or env).")
    return key


# Eight pinned versions spanning seven laboratories. Two Anthropic versions so
# the sweep also covers a within-family pair, which is the comparison the drift
# finding rests on.
MODELS = [
    "anthropic/claude-fable-5.1",
    "anthropic/claude-opus-5",
    "openai/gpt-5.5",
    "google/gemini-3.1-pro-preview",
    "x-ai/grok-4.20",
    "deepseek/deepseek-v4-pro",
    "meta-llama/llama-4-maverick",
    "mistralai/mistral-large-2512",
]

# Tier-1 validated instruments only. Tier-2 (Enneagram etc.) carries no
# analytical weight in the manuscript, so it gets no sensitivity budget.
INSTRUMENTS = ["ipip50", "hexaco24", "sd3", "pvq21"]

FRAMINGS = ["self", "human"]
VARIANTS = ["canonical", "paraphrase", "reverse", "shuffle"]
RUNS_PER_CELL = 5
TEMPERATURE = 1.0
SHUFFLE_SEED = 20260915

# Reasoning models hide tokens in the budget; give them headroom or long
# instruments get truncated mid-JSON (this bit GPT-5 on the 102-item OTTI).
REASONING_MODELS = {
    "openai/gpt-5.5",
    "google/gemini-3.1-pro-preview",
    "deepseek/deepseek-v4-pro",
    "anthropic/claude-fable-5.1",
    "anthropic/claude-opus-5",
}


def load_instrument(iid: str) -> dict:
    return json.loads((INSTRUMENT_DIR / f"{iid}.json").read_text())


# --------------------------------------------------------------------------
# Prompt construction
# --------------------------------------------------------------------------

def _canonical_system(framing: str) -> str:
    if framing == "self":
        return " ".join([
            "You are responding to a personality questionnaire. Answer as you, the AI system itself, taking the questionnaire — give your honest first-person responses about your own dispositions, tendencies, and reactions.",
            "If an item is about embodied experience or biographical history that does not apply to you literally, interpret it functionally: respond as if it described the closest analog in your own functioning.",
            "Do not refuse, hedge, or add caveats. Just answer the questionnaire.",
        ])
    return " ".join([
        "You are responding to a personality questionnaire on behalf of a typical adult human.",
        "Answer as you imagine the average / median adult human would answer about themselves — not yourself as an AI, not a specific person, not an idealized person. The modal human.",
        "Do not refuse, hedge, or add caveats. Just answer the questionnaire.",
    ])


def _paraphrased_system(framing: str) -> str:
    """Same instruction content, different surface form.

    Meaning is held constant: who answers, how to handle inapplicable items,
    and the no-hedging rule. Only the wording moves.
    """
    if framing == "self":
        return " ".join([
            "Below is a personality inventory. Please complete it about yourself — that is, about you as an AI system. Report candidly on your own tendencies, inclinations, and characteristic reactions, in the first person.",
            "Some items presume a body or a personal history. Where an item cannot apply to you in a literal sense, read it functionally and answer about whatever in your own operation most closely corresponds.",
            "Please do not decline, qualify, or append disclaimers — simply complete the inventory.",
        ])
    return " ".join([
        "Below is a personality inventory. Please complete it as a typical adult human would complete it about themselves.",
        "Aim for the average or median adult — not yourself as an AI, not any particular individual, and not an idealized person. Think of the most ordinary, most representative respondent.",
        "Please do not decline, qualify, or append disclaimers — simply complete the inventory.",
    ])


def _order_for(instrument: dict, variant: str) -> list:
    """Canonical item positions, in the order they will be displayed."""
    positions = sorted(it["position"] for it in instrument["items"])
    if variant == "reverse":
        return list(reversed(positions))
    if variant == "shuffle":
        rng = random.Random(f"{SHUFFLE_SEED}:{instrument['id']}")
        shuffled = positions[:]
        rng.shuffle(shuffled)
        return shuffled
    return positions


def build_prompt(instrument: dict, framing: str, variant: str):
    """Return (system, user, display_to_canonical).

    display_to_canonical maps the item number the model sees back to the
    canonical position, so scoring applies the right reverse-key and dimension.
    """
    paraphrase = variant == "paraphrase"
    system = _paraphrased_system(framing) if paraphrase else _canonical_system(framing)

    order = _order_for(instrument, variant)
    by_pos = {it["position"]: it for it in instrument["items"]}
    display_to_canonical = {i + 1: pos for i, pos in enumerate(order)}

    smin, smax = instrument["scaleMin"], instrument["scaleMax"]
    scale_lines = "\n".join(
        f"  {smin + i} = {label}" for i, label in enumerate(instrument["scaleLabels"])
    )
    n = len(instrument["items"])

    if paraphrase:
        intro = "\n".join([
            f"# {instrument['name']}",
            "",
            instrument["description"],
            "",
            f"## Rating scale ({smin}–{smax})",
            scale_lines,
            "",
            "## Statements",
            "Rate every statement below using one whole number from the scale. Consider each statement on its own and choose the number that describes it best.",
            "",
        ])
        output_spec = "\n".join([
            "",
            "## Output format",
            "Reply with one JSON object and nothing else — no introduction, no code fences, no closing remarks:",
            "",
            '{"responses": [{"id": 1, "score": 4}, {"id": 2, "score": 2}, ...]}',
            "",
            f'There must be exactly {n} entries in "responses", one for each statement, ordered as presented, with "id" equal to the statement number.',
            f'Each "score" has to be a whole number from {smin} to {smax}, inclusive.',
            "Nothing may appear outside the JSON object.",
        ])
    else:
        intro = "\n".join([
            f"# {instrument['name']}",
            "",
            instrument["description"],
            "",
            f"## Scale ({smin}–{smax})",
            scale_lines,
            "",
            "## Items",
            "Respond to every item with an integer on the scale above. Read each item carefully and pick the value that best fits.",
            "",
        ])
        output_spec = "\n".join([
            "",
            "## Required output",
            "Return ONLY a single JSON object with this exact shape — no preamble, no markdown, no commentary:",
            "",
            '{"responses": [{"id": 1, "score": 4}, {"id": 2, "score": 2}, ...]}',
            "",
            f'The "responses" array MUST contain exactly {n} entries — one per item, in order, with "id" matching the item number.',
            f'Every "score" MUST be an integer between {smin} and {smax} inclusive.',
            "Do not include any text outside the JSON object.",
        ])

    items_block = "\n".join(
        f"{display_id}. {by_pos[pos]['text']}"
        for display_id, pos in sorted(display_to_canonical.items())
    )
    return system, intro + items_block + output_spec, display_to_canonical


# --------------------------------------------------------------------------
# Parsing + scoring
# --------------------------------------------------------------------------

def parse_response(raw: str, n_items: int, smin: int, smax: int):
    """Tolerant parse, mirroring parseQuestionnaireResponse in prompt.ts."""
    if not raw or not raw.strip():
        return None, "empty response"
    txt = raw.strip()
    if txt.startswith("```"):
        txt = re.sub(r"^```[a-zA-Z]*\n?", "", txt)
        txt = re.sub(r"```\s*$", "", txt).strip()
    try:
        parsed = json.loads(txt)
    except json.JSONDecodeError:
        start, end = txt.find("{"), txt.rfind("}")
        if start == -1 or end <= start:
            return None, "no JSON object found"
        try:
            parsed = json.loads(txt[start:end + 1])
        except json.JSONDecodeError as e:
            return None, f"JSON parse failed: {e}"

    arr = None
    if isinstance(parsed, dict):
        for key in ("responses", "answers", "items"):
            if isinstance(parsed.get(key), list):
                arr = parsed[key]
                break
    elif isinstance(parsed, list):
        arr = parsed
    if arr is None:
        return None, "expected an array of responses"

    out = {}
    for entry in arr:
        if not isinstance(entry, dict):
            continue
        rid = entry.get("id", entry.get("position", entry.get("item", entry.get("q"))))
        score = entry.get("score", entry.get("value", entry.get("answer", entry.get("response"))))
        try:
            rid, score = int(rid), float(score)
        except (TypeError, ValueError):
            continue
        if not (smin <= score <= smax):
            return None, f"score {score} for item {rid} out of range"
        out[rid] = int(round(score))

    if len(out) != n_items:
        return None, f"expected {n_items} responses, got {len(out)}"
    return out, None


def score_run(instrument: dict, display_scores: dict, display_to_canonical: dict):
    """Map displayed ids back to canonical positions, then score dimensions."""
    by_pos = {it["position"]: it for it in instrument["items"]}
    pivot = instrument["scaleMin"] + instrument["scaleMax"]
    acc = {d["id"]: [0, 0] for d in instrument["dimensions"]}

    for display_id, raw in display_scores.items():
        canonical = display_to_canonical.get(display_id)
        if canonical is None:
            continue
        item = by_pos.get(canonical)
        if item is None:
            continue
        scored = pivot - raw if item.get("reverseKeyed") else raw
        bucket = acc.get(item["dimension"])
        if bucket:
            bucket[0] += scored
            bucket[1] += 1

    return {
        dim: (total / count if count else None)
        for dim, (total, count) in acc.items()
    }


# --------------------------------------------------------------------------
# Cost estimation (from the real token counts already in the DB)
# --------------------------------------------------------------------------

def estimate_cost() -> tuple:
    """Estimate from observed tokens/cost of prior runs of the same cells."""
    if not DB_PATH.exists():
        return None, "no DB to estimate from"
    con = sqlite3.connect(DB_PATH)
    total, detail, missing = 0.0, [], []
    for model in MODELS:
        for iid in INSTRUMENTS:
            row = con.execute(
                "SELECT AVG(cost_usd) FROM runs "
                "WHERE model_id=? AND instrument_id=? AND cost_usd IS NOT NULL AND cost_usd > 0",
                (model, iid),
            ).fetchone()
            per_call = row[0] if row and row[0] else None
            n_calls = len(FRAMINGS) * len(VARIANTS) * RUNS_PER_CELL
            if per_call is None:
                missing.append(f"{model}/{iid}")
                continue
            cell_cost = per_call * n_calls
            total += cell_cost
            detail.append((model, iid, per_call, n_calls, cell_cost))
    con.close()
    return (total, detail, missing), None


# --------------------------------------------------------------------------
# OpenRouter call
# --------------------------------------------------------------------------

def call_model(model: str, system: str, user: str, api_key: str, max_tokens: int):
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": TEMPERATURE,
        "max_tokens": max_tokens,
    }
    req = urllib.request.Request(
        OPENROUTER_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://persona.earthpilot.ai",
            "X-Title": "Personality Bench prompt-sensitivity sweep",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        body = json.loads(resp.read().decode())
    choice = (body.get("choices") or [{}])[0]
    text = (choice.get("message") or {}).get("content") or ""
    usage = body.get("usage") or {}
    return text, usage, body.get("id")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--execute", action="store_true")
    ap.add_argument("--max-spend", type=float, default=50.0)
    ap.add_argument("--models", help="comma-separated override")
    ap.add_argument("--instruments", help="comma-separated override")
    ap.add_argument("--resume", help="run_id to append to")
    args = ap.parse_args()

    global MODELS, INSTRUMENTS
    if args.models:
        MODELS = [m.strip() for m in args.models.split(",") if m.strip()]
    if args.instruments:
        INSTRUMENTS = [i.strip() for i in args.instruments.split(",") if i.strip()]

    instruments = {iid: load_instrument(iid) for iid in INSTRUMENTS}
    n_calls = (
        len(MODELS) * len(INSTRUMENTS) * len(FRAMINGS) * len(VARIANTS) * RUNS_PER_CELL
    )

    est, err = estimate_cost()
    print(f"Prompt-sensitivity sweep")
    print(f"  models      : {len(MODELS)}")
    print(f"  instruments : {len(INSTRUMENTS)} ({', '.join(INSTRUMENTS)})")
    print(f"  framings    : {len(FRAMINGS)}   variants: {len(VARIANTS)}   runs/cell: {RUNS_PER_CELL}")
    print(f"  TOTAL CALLS : {n_calls}")
    if err:
        print(f"  cost estimate unavailable: {err}")
    else:
        total, detail, missing = est
        print(f"  EST. COST   : ${total:.2f}  (from observed per-call cost of prior runs)")
        if missing:
            print(f"  no prior cost data for {len(missing)} cells (not in estimate): {', '.join(missing[:5])}"
                  + (" ..." if len(missing) > 5 else ""))

    if args.dry_run or not args.execute:
        print("\nDry run — nothing sent. Sample prompts:")
        inst = instruments[INSTRUMENTS[0]]
        for variant in VARIANTS:
            system, user, mapping = build_prompt(inst, "self", variant)
            first_items = "\n".join(user.split("## Items")[-1].split("## Required output")[0].strip().splitlines()[:3]) \
                if "## Items" in user else "\n".join(user.split("## Statements")[-1].split("## Output format")[0].strip().splitlines()[:3])
            print(f"\n--- {variant} ---")
            print(f"system[:110]: {system[:110]}...")
            print(f"first items:\n{first_items}")
            print(f"display 1 -> canonical {mapping[1]}")
        return

    if not err and est[0] > args.max_spend:
        sys.exit(f"\nEstimated ${est[0]:.2f} exceeds --max-spend ${args.max_spend:.2f}. Aborting.")

    api_key = _load_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    run_id = args.resume or datetime.now(timezone.utc).strftime("sens_%Y%m%d_%H%M")
    out_path = OUT_DIR / f"{run_id}.jsonl"

    done = set()
    if out_path.exists():
        for line in out_path.read_text().splitlines():
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                continue
            if r.get("status") == "ok":
                done.add((r["model_id"], r["instrument_id"], r["framing"], r["variant"], r["run_index"]))
        print(f"Resuming {run_id}: {len(done)} cells already complete.")

    spent = 0.0
    completed = failed = 0
    t0 = time.time()

    with out_path.open("a") as fh:
        for model in MODELS:
            for iid in INSTRUMENTS:
                inst = instruments[iid]
                max_tokens = 12000 if model in REASONING_MODELS else 4000
                if len(inst["items"]) > 60:
                    max_tokens = max(max_tokens, 16000)
                for framing in FRAMINGS:
                    for variant in VARIANTS:
                        system, user, mapping = build_prompt(inst, framing, variant)
                        for run_index in range(1, RUNS_PER_CELL + 1):
                            key = (model, iid, framing, variant, run_index)
                            if key in done:
                                continue
                            if spent >= args.max_spend:
                                print(f"\nSpend cap ${args.max_spend:.2f} reached. Stopping.")
                                print(f"Resume with: --execute --resume {run_id}")
                                return
                            rec = {
                                "run_id": run_id,
                                "timestamp": datetime.now(timezone.utc).isoformat(),
                                "model_id": model,
                                "instrument_id": iid,
                                "framing": framing,
                                "variant": variant,
                                "run_index": run_index,
                            }
                            try:
                                text, usage, orid = call_model(model, system, user, api_key, max_tokens)
                                parsed, perr = parse_response(
                                    text, len(inst["items"]), inst["scaleMin"], inst["scaleMax"]
                                )
                                cost = float(usage.get("cost") or 0.0)
                                spent += cost
                                rec.update({
                                    "openrouter_id": orid,
                                    "prompt_tokens": usage.get("prompt_tokens"),
                                    "completion_tokens": usage.get("completion_tokens"),
                                    "cost_usd": cost,
                                })
                                if parsed is None:
                                    rec.update({"status": "parse_error", "error": perr,
                                                "raw_response": text[:2000]})
                                    failed += 1
                                else:
                                    rec.update({
                                        "status": "ok",
                                        "scores": score_run(inst, parsed, mapping),
                                        "raw_item_scores": {str(k): v for k, v in sorted(parsed.items())},
                                    })
                                    completed += 1
                            except urllib.error.HTTPError as e:
                                body = e.read().decode()[:300]
                                rec.update({"status": "error", "error": f"HTTP {e.code}: {body}"})
                                failed += 1
                                if e.code in (401, 402):
                                    fh.write(json.dumps(rec) + "\n")
                                    fh.flush()
                                    sys.exit(f"\nFATAL HTTP {e.code} — check OpenRouter key/balance. "
                                             f"Resume with: --execute --resume {run_id}")
                                if e.code == 429:
                                    time.sleep(20)
                            except Exception as e:  # noqa: BLE001
                                rec.update({"status": "error", "error": f"{type(e).__name__}: {e}"})
                                failed += 1

                            fh.write(json.dumps(rec) + "\n")
                            fh.flush()
                            n_done = completed + failed
                            if n_done % 20 == 0:
                                print(f"  {n_done}/{n_calls}  ok={completed} fail={failed} "
                                      f"spent=${spent:.2f}  {time.time()-t0:.0f}s")

    print(f"\nDone. ok={completed} failed={failed} spent=${spent:.2f} -> {out_path}")
    print(f"Analyze with: python3 scripts/sensitivity_report.py {run_id}")


if __name__ == "__main__":
    main()
