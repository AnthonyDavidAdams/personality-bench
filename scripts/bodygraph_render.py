"""
Render each model's Human Design bodygraph with the Bodygraph API library
(https://github.com/AnthonyDavidAdams/bodygraph-api) into public/bodygraph/.

Reads a JSON list on stdin, one entry per model:
  {"id": "anthropic/claude-fable-5.2", "name": "Claude Fable 5.2", "utc": "2026-11-09T17:00:00Z"}
  {"id": "...", "name": "...", "date": "2026-11-09", "time": "12:00", "lat": 37.77, "lon": -122.42}   # HQ-local time

Each image carries a footer: model name, where it is from, the model page URL and a QR code to it.

Writes public/bodygraph/<id>.svg and public/bodygraph/<id>.json (the fields the model page
shows). Skips a model whose JSON already has the same inputs and engine version.
Driven by scripts/render_bodygraphs.ts; run that, not this.
"""
import json
import re
import os
import sys
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import bodygraph
import qrcode
from bodygraph import build_chart, render_svg
from bodygraph import typeset as ts
from timezonefinder import TimezoneFinder

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "bodygraph")
FORCE = "--force" in sys.argv
SITE = "https://persona.earthpilot.ai"
# Bump when the footer changes so every image is redrawn.
RENDER = f"bodygraph {bodygraph.__version__} / footer 2"

INK, GREY, RED = "#1f2328", "#6e7781", "#d1361f"
W, FOOT_H, MARGIN = 1000, 215, 57


def qr_path(url: str, x: float, y: float, size: float) -> str:
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_M, border=0)
    qr.add_data(url)
    qr.make(fit=True)
    m = qr.get_matrix()
    d = "".join(f"M{c} {r}h1v1h-1z" for r, row in enumerate(m) for c, on in enumerate(row) if on)
    k = size / len(m)
    return (f'<rect x="{x - 8}" y="{y - 8}" width="{size + 16}" height="{size + 16}" fill="#fff"/>'
            f'<path transform="translate({x} {y}) scale({k:.4f})" fill="{INK}" d="{d}"/>')


def with_footer(graph_svg: str, model_id: str, name: str) -> str:
    """Stack the bodygraph on top of a footer that says where the image came from."""
    url = f"{SITE}/models/{model_id}"
    # The footer starts wherever the graph ends, whatever height the renderer gives it.
    GRAPH_H = float(re.search(r'viewBox="0 0 [\d.]+ ([\d.]+)"', graph_svg).group(1))
    q = 150
    qx, qy = W - MARGIN - q, GRAPH_H + 22
    with ts.Session() as session:
        parts = [
            f'<line x1="{MARGIN}" x2="{W - MARGIN}" y1="{GRAPH_H + 4}" y2="{GRAPH_H + 4}" stroke="#d0d7de" stroke-width="1.5"/>',
            ts.text(MARGIN, GRAPH_H + 66, name, 34, font="semibold", fill=INK),
            ts.text(MARGIN, GRAPH_H + 104, "Personality Bench, the open personality dataset of AI models", 20, fill=GREY),
            ts.text(MARGIN, GRAPH_H + 132, "by EarthPilot.ai Research Lab", 20, fill=GREY),
            ts.text(MARGIN, GRAPH_H + 168, url.removeprefix("https://"), 20, font="medium", fill=RED),
            ts.text(qx + q / 2, GRAPH_H + 22 + q + 18, "Scan for the full profile", 13, fill=GREY, anchor="middle"),
            qr_path(url, qx, qy, q),
        ]
        # Glyph ids in the footer would collide with the graph's own t0, t1, ... ids.
        foot = (session.defs() + "".join(parts)).replace('id="t', 'id="ft').replace('href="#t', 'href="#ft')
    inner = graph_svg.replace("<svg ", f'<svg x="0" y="0" ', 1)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {GRAPH_H + FOOT_H}" '
            f'width="{W}" height="{GRAPH_H + FOOT_H}" role="img" '
            f'aria-label="Human Design bodygraph for {name}, from Personality Bench ({url})">'
            f"{inner}{foot}</svg>")


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
        "engine": RENDER,
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
            if old.get("inputs") == inputs and old.get("engine") == RENDER:
                skipped += 1
                continue
        chart = build_chart(birth_utc(m))
        os.makedirs(os.path.dirname(json_path), exist_ok=True)
        with open(os.path.join(OUT, f'{m["id"]}.svg'), "w") as f:
            graph = render_svg(chart, layout="graph", theme="light", background=False)
            f.write(with_footer(graph, m["id"], m.get("name") or m["id"]))
        with open(json_path, "w") as f:
            json.dump(summary(chart, inputs), f, indent=1)
        done += 1
        print(f'[bodygraph] {m["id"]}: {chart["type"]} {chart["profile"]["notation"]}')
    print(f"[bodygraph] rendered {done}, unchanged {skipped}")


if __name__ == "__main__":
    main()
