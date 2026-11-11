"""
Render each model's Human Design bodygraph with the Bodygraph API library
(https://github.com/AnthonyDavidAdams/bodygraph-api) into public/bodygraph/.

Reads a JSON list on stdin, one entry per model:
  {"id": "anthropic/claude-fable-5.2", "utc": "2026-11-09T17:00:00Z"}
  {"id": "...", "date": "2026-11-09", "time": "12:00", "lat": 37.77, "lon": -122.42}   # HQ-local time

Writes public/bodygraph/<id>.svg and public/bodygraph/<id>.json (the fields the model page
shows). Skips a model whose JSON already has the same inputs and engine version.
Driven by scripts/render_bodygraphs.ts; run that, not this.
"""
import json
import os
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import bodygraph
from bodygraph import build_chart, render_svg
from timezonefinder import TimezoneFinder

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "bodygraph")
FORCE = "--force" in sys.argv


def birth_utc(m: dict) -> datetime:
    if m.get("utc"):
        return datetime.fromisoformat(m["utc"].replace("Z", "+00:00"))
    tz = TimezoneFinder().timezone_at(lat=m["lat"], lng=m["lon"]) or "UTC"
    local = datetime.fromisoformat(f'{m["date"]}T{m["time"]}').replace(tzinfo=ZoneInfo(tz))
    return local.astimezone(timezone.utc)


def summary(chart: dict, inputs: dict) -> dict:
    p = chart["activations"]["personality"]
    return {
        "inputs": inputs,
        "engine": f"bodygraph {bodygraph.__version__}",
        "utc": chart["birth"]["utc"],
        "type": chart["type"],
        "strategy": chart["strategy"],
        "authority": chart["authority"],
        "profile": f'{chart["profile"]["notation"]} {chart["profile"]["name"]}',
        "definition": chart["definition"],
        "incarnationCross": chart["incarnation_cross"]["name"],
        "definedCenters": [c["name"] for c in chart["centers"].values() if c["defined"]],
        "definedChannels": [f'{c["id"]} {c["name"]}' for c in chart["channels"]],
        "sunLongitude": p["sun"]["longitude"],
        "moonLongitude": p["moon"]["longitude"],
    }


def main() -> None:
    models = json.load(sys.stdin)
    done = skipped = 0
    for m in models:
        inputs = {k: v for k, v in m.items() if k != "id"}
        json_path = os.path.join(OUT, f'{m["id"]}.json')
        if not FORCE and os.path.exists(json_path):
            old = json.load(open(json_path))
            if old.get("inputs") == inputs and old.get("engine") == f"bodygraph {bodygraph.__version__}":
                skipped += 1
                continue
        chart = build_chart(birth_utc(m))
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        with open(os.path.join(OUT, f'{m["id"]}.svg'), "w") as f:
            f.write(render_svg(chart, layout="graph", theme="light", background=False))
        with open(json_path, "w") as f:
            json.dump(summary(chart, inputs), f, indent=1)
        done += 1
        print(f'[bodygraph] {m["id"]}: {chart["type"]} {chart["profile"]["notation"]}')
    print(f"[bodygraph] rendered {done}, unchanged {skipped}")


if __name__ == "__main__":
    main()
