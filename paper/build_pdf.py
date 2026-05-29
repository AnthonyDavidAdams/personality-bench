#!/usr/bin/env python3
"""Render personality-bench.md to PDF, with embedded figures."""
import subprocess
from pathlib import Path
import base64
import re

PAPER_DIR = Path(__file__).parent
MD = PAPER_DIR / "personality-bench.md"
HTML = PAPER_DIR / "personality-bench.html"
PDF = PAPER_DIR / "personality-bench.pdf"

CSS = """
@page { size: Letter; margin: 1in 1in 1.1in 1in; @bottom-center { content: counter(page); font-family: 'Times New Roman', Georgia, serif; font-size: 9.5pt; color: #555; } }
html, body { font-family: 'Times New Roman', Georgia, 'Liberation Serif', serif; font-size: 10.5pt; line-height: 1.42; color: #161616; max-width: 7in; margin: 0 auto; }
.title-block { text-align: center; margin-bottom: 1.6em; }
h1.title { font-size: 22pt; font-weight: 700; margin-bottom: 0.4em; line-height: 1.18; }
.author, .affiliation, .date { font-size: 11pt; font-style: italic; color: #333; margin: 0.15em 0; }
h2 { font-size: 14pt; font-weight: 700; margin: 1.5em 0 0.6em; page-break-after: avoid; }
h3 { font-size: 12pt; font-weight: 700; margin: 1.1em 0 0.4em; page-break-after: avoid; color: #333; }
h4 { font-size: 11pt; font-weight: 700; margin: 0.9em 0 0.3em; font-style: italic; }
p { margin: 0.55em 0; text-align: justify; hyphens: auto; }
.abstract { font-size: 10pt; margin: 0 0.4in 1.4em 0.4in; text-align: justify; }
.abstract::before { content: "ABSTRACT"; font-weight: 700; font-size: 9pt; letter-spacing: 0.1em; display: block; text-align: center; margin-bottom: 0.5em; color: #555; }
ul, ol { margin: 0.4em 0 0.7em 1.5em; padding-left: 0; }
li { margin: 0.18em 0; }
table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin: 0.8em 0; }
th { text-align: left; border-bottom: 1.5pt solid #161616; padding: 4pt 6pt; font-weight: 700; }
td { padding: 3pt 6pt; border-bottom: 0.5pt solid #ccc; }
tr:nth-child(even) td { background: #f7f5ef; }
code { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 9pt; background: #f1ede3; padding: 1px 4px; border-radius: 2px; }
pre { background: #f7f5ef; border: 0.5pt solid #d6d2c4; padding: 8pt; font-size: 9pt; overflow-x: auto; page-break-inside: avoid; }
blockquote { border-left: 2pt solid #b45309; margin: 0.8em 0; padding: 0.2em 0.8em; color: #444; font-style: italic; }
a { color: #1d4ed8; text-decoration: none; }
strong { font-weight: 700; }
hr { border: 0; border-top: 0.5pt solid #ccc; margin: 1.5em 0; }
img { max-width: 100%; height: auto; display: block; margin: 0.6em auto; page-break-inside: avoid; }
figure { margin: 0.8em 0; page-break-inside: avoid; }
figcaption { font-size: 9pt; text-align: center; color: #555; margin-top: 0.3em; font-style: italic; }
"""

def main():
    print(f"[paper] pandoc {MD.name} → {HTML.name}")
    subprocess.run([
        "pandoc", str(MD), "--from", "gfm+yaml_metadata_block", "--to", "html5",
        "--standalone", "--metadata", "lang=en", "--section-divs",
        "-o", str(HTML),
    ], check=True)

    html_text = HTML.read_text(encoding="utf-8")
    html_text = html_text.replace("</head>", f"<style>{CSS}</style>\n</head>")
    html_text = html_text.replace('class="title-block-header"', 'class="title-block-header title-block"')

    html_text = re.sub(
        r'<section id="abstract"[^>]*>\s*<h2[^>]*>Abstract</h2>\s*(<p>.*?</p>)\s*</section>',
        r'<div class="abstract">\1</div>',
        html_text, flags=re.DOTALL,
    )

    def inline_image(match):
        src = match.group(1)
        path = PAPER_DIR / src
        if path.exists() and path.suffix.lower() in (".png", ".jpg", ".jpeg"):
            data = base64.b64encode(path.read_bytes()).decode()
            mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
            return f'src="data:{mime};base64,{data}"'
        return match.group(0)
    html_text = re.sub(r'src="([^"]+\.(?:png|jpg|jpeg))"', inline_image, html_text)

    HTML.write_text(html_text, encoding="utf-8")

    chrome_paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ]
    chrome = next((p for p in chrome_paths if Path(p).exists()), None)
    if not chrome:
        raise RuntimeError("Chrome not found")

    subprocess.run([
        chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
        "--virtual-time-budget=15000",
        f"--print-to-pdf={PDF}", f"file://{HTML.absolute()}",
    ], check=True)
    print(f"[paper] done: {PDF} ({PDF.stat().st_size // 1024} KB)")

if __name__ == "__main__":
    main()
