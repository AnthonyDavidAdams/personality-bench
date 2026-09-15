#!/usr/bin/env python3
"""Endpoint fingerprinting for Personality Bench.

Runs canary prompts against all active frontier models at temperature 0,
computes a multi-layer fingerprint per response, appends to
data/fingerprints.jsonl. Change detection in fingerprint_report.py.

Run daily (or every 6h). Every week of delay permanently destroys the left
edge of the longitudinal panel — deprecated versions are unrecoverable.

Cost per run: ~$5-15 depending on how many reasoning models are in the pool.

Usage:
    python3 scripts/fingerprint.py               # run once (all models × all prompts)
    python3 scripts/fingerprint.py --dry-run     # print plan, do nothing
    python3 scripts/fingerprint.py --model X     # only fingerprint one model
"""
import argparse
import hashlib
import json
import os
import re
import smtplib
import sqlite3
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from email.mime.text import MIMEText
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
PROMPTS_PATH = BASE_DIR / "canary_prompts.json"
LOG_PATH = BASE_DIR / "data" / "fingerprints.jsonl"

# Read key from .env.local (Next.js convention; shadows global env)
env_local = BASE_DIR / ".env.local"
if env_local.exists():
    for line in env_local.read_text().splitlines():
        line = line.strip()
        if line.startswith("OPENROUTER_API_KEY="):
            os.environ["OPENROUTER_API_KEY"] = line.split("=", 1)[1].strip()
            break

# The original twelve. NEVER remove an entry: each one is a longitudinal series,
# and dropping a model truncates its history permanently. New models are added
# on top of this list, not in place of it.
LEGACY_MODELS = [
    "anthropic/claude-fable-5",
    "anthropic/claude-opus-4.8",
    "anthropic/claude-opus-4.8-fast",
    "openai/gpt-5.5",
    "openai/gpt-5.5-pro",
    "google/gemini-2.5-pro",
    "google/gemini-3.1-pro-preview",
    "x-ai/grok-4.20",
    "deepseek/deepseek-r1-0528",
    "deepseek/deepseek-v4-pro",
    "meta-llama/llama-4-maverick",
    "mistralai/mistral-large-2512",
]

DB_PATH = BASE_DIR / "data" / "personality-bench.db"


def active_models() -> list:
    """Legacy series plus every current frontier-cohort model in the DB.

    Coverage was twelve models while the scored panel had grown past forty, so
    most drift findings had no endpoint-stability evidence behind them.
    """
    models = list(LEGACY_MODELS)
    if DB_PATH.exists():
        try:
            con = sqlite3.connect(DB_PATH)
            rows = con.execute(
                "SELECT id FROM models WHERE active = 1 AND cohort = 'frontier'"
            ).fetchall()
            con.close()
            for (mid,) in rows:
                if mid not in models:
                    models.append(mid)
        except sqlite3.Error as e:
            print(f"[warn] could not read frontier cohort from DB: {e}", file=sys.stderr)
    return models


def wait_for_network(attempts: int = 10, delay: int = 30) -> bool:
    """Block until DNS/HTTP resolves.

    The single largest hole in the log is ~3,300 'nodename nor servname' errors:
    launchd fired the job while the Mac was waking and the network was not up
    yet, and a whole day of the panel was lost to a transient condition.
    """
    for i in range(attempts):
        try:
            urllib.request.urlopen("https://openrouter.ai/api/v1/models", timeout=15)
            return True
        except urllib.error.HTTPError:
            return True  # Reachable; auth/status handled per-call.
        except Exception:
            if i < attempts - 1:
                print(f"[net] unreachable, retry {i+1}/{attempts} in {delay}s")
                time.sleep(delay)
    return False


def alert(subject: str, body: str) -> None:
    """Email on wholesale failure, so outages surface in hours not weeks."""
    env_file = Path.home() / ".gmail.env"
    pw = os.environ.get("GMAIL_APP_PASSWORD")
    if not pw and env_file.exists():
        m = re.search(r"GMAIL_APP_PASSWORD=(\S+)", env_file.read_text())
        pw = m.group(1) if m else None
    if not pw:
        print("[alert] no GMAIL_APP_PASSWORD — cannot send alert", file=sys.stderr)
        return
    try:
        msg = MIMEText(body)
        msg["From"] = "Anthony Adams <anthony@175g.com>"
        msg["To"] = "anthony@175g.com"
        msg["Subject"] = f"[Personality Bench] canary {subject}"
        with smtplib.SMTP("smtp.gmail.com", 587) as s:
            s.starttls()
            s.login("anthony@175g.com", pw)
            s.send_message(msg)
        print("[alert] sent")
    except Exception as e:  # noqa: BLE001
        print(f"[alert] failed: {e}", file=sys.stderr)

# Reasoning models need more headroom; non-reasoning are capped tighter.
REASONING_MODELS = {
    "openai/gpt-5.5-pro",
    "google/gemini-2.5-pro",
    "google/gemini-3.1-pro-preview",
    "deepseek/deepseek-r1-0528",
    "deepseek/deepseek-v4-pro",
}


def call_openrouter(model_id: str, prompt: str) -> dict:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    max_tokens = 4000 if model_id in REASONING_MODELS else 500
    payload = {
        "model": model_id,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": max_tokens,
    }
    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        return json.loads(resp.read())


def fingerprint(text: str) -> dict:
    """Multi-layer fingerprint. SHA256 catches exact matches; length + first-N-chars
    give fuzzy comparison when providers don't guarantee determinism at T=0."""
    normalized = text.strip()
    return {
        "sha256": hashlib.sha256(normalized.encode()).hexdigest(),
        "length_chars": len(normalized),
        "length_words": len(normalized.split()),
        "first_64_chars": normalized[:64],
        "last_64_chars": normalized[-64:] if len(normalized) >= 64 else normalized,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--model", help="Fingerprint only this model_id")
    parser.add_argument("--prompt", help="Only run this prompt_id (across all models)")
    args = parser.parse_args()

    with PROMPTS_PATH.open() as f:
        canary = json.load(f)
    prompts = canary["prompts"]
    if args.prompt:
        prompts = [p for p in prompts if p["id"] == args.prompt]

    models = [args.model] if args.model else active_models()
    if not models or not prompts:
        sys.exit("Empty queue after filters.")

    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    if not args.dry_run and not wait_for_network():
        msg = ("Network never came up; skipped the run entirely rather than "
               "writing a day of spurious DNS errors into the panel.")
        print(f"[net] {msg}", file=sys.stderr)
        alert("skipped: no network", msg)
        sys.exit(1)

    now = datetime.now(timezone.utc).isoformat()
    plan = [(m, p) for m in models for p in prompts]

    print(f"Plan: {len(plan)} cells ({len(models)} models × {len(prompts)} prompts)")
    print(f"Log: {LOG_PATH}")
    if args.dry_run:
        for m, p in plan[:5]:
            print(f"  would fingerprint {m} × {p['id']}")
        if len(plan) > 5:
            print(f"  ... and {len(plan) - 5} more")
        return

    ok = 0
    err = 0
    total_cost = 0.0
    last_errors = []

    for i, (model_id, p) in enumerate(plan, 1):
        try:
            resp = call_openrouter(model_id, p["text"])
            text = resp["choices"][0]["message"]["content"] or ""
            fp = fingerprint(text)
            usage = resp.get("usage") or {}
            cost = float(usage.get("cost") or 0)
            total_cost += cost
            entry = {
                "timestamp": now,
                "model_id": model_id,
                "prompt_id": p["id"],
                "prompt_category": p["category"],
                "fingerprint": fp,
                "prompt_tokens": usage.get("prompt_tokens"),
                "completion_tokens": usage.get("completion_tokens"),
                "reasoning_tokens": (usage.get("completion_tokens_details") or {}).get("reasoning_tokens", 0),
                "cost_usd": cost,
                "response_text": text,
                "status": "ok",
            }
            ok += 1
            print(f"[{i}/{len(plan)}] ✓ {model_id} × {p['id']}  sha={fp['sha256'][:8]} len={fp['length_chars']} ${cost:.4f}")
        except Exception as e:
            entry = {
                "timestamp": now,
                "model_id": model_id,
                "prompt_id": p["id"],
                "status": "error",
                "error": str(e)[:500],
            }
            err += 1
            last_errors.append(str(e)[:200])
            print(f"[{i}/{len(plan)}] ✗ {model_id} × {p['id']}  ERROR: {str(e)[:120]}")

        with LOG_PATH.open("a") as f:
            f.write(json.dumps(entry) + "\n")
        time.sleep(0.5)

    print(f"\nRun done. {ok} ok, {err} errored. Total cost: ${total_cost:.4f}")

    # A run that is mostly errors means the panel is silently losing days.
    if plan and err / len(plan) >= 0.5:
        kinds = {}
        for line in (last_errors or []):
            key = ("402 Payment Required (OpenRouter balance exhausted)" if "402" in line
                   else "401 Unauthorized (key invalid or rotated)" if "401" in line
                   else "network/other")
            kinds[key] = kinds.get(key, 0) + 1
        detail = "\n".join(f"  {v} x {k}" for k, v in sorted(kinds.items(), key=lambda kv: -kv[1]))
        alert(
            f"{err}/{len(plan)} calls failed",
            f"The canary run on {now[:10]} failed {err} of {len(plan)} calls.\n\n"
            f"{detail}\n\n"
            "Every failed day is a permanent hole in the longitudinal panel.\n"
            "Check: OpenRouter balance, then OPENROUTER_API_KEY in .env.local.",
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
