#!/bin/zsh
# One-command refresh after a sweep:
#   1. Snapshot the SQLite DB → gzipped seed (for Railway boot restoration)
#   2. Export human-readable CSVs to data/exports/ (for GitHub browsing)
#   3. Re-render paper drift figures
#   4. Rebuild the paper PDF
#
# Usage:  paper/refresh.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[refresh] 1/4  snapshot DB → seed"
sqlite3 data/personality-bench.db ".backup seed/personality-bench-seed.db"
gzip -kf9 seed/personality-bench-seed.db
rm seed/personality-bench-seed.db
ls -lh seed/personality-bench-seed.db.gz

echo
echo "[refresh] 2/4  export CSVs"
npx tsx scripts/export_csv.ts 2>&1 | tail -12

echo
echo "[refresh] 3/4  render drift PNGs"
~/.fal-venv/bin/python paper/render_drift_charts.py 2>&1 | tail -5

echo
echo "[refresh] 4/4  rebuild paper PDF"
python3 paper/build_pdf.py 2>&1 | tail -3

echo
echo "[refresh] summary"
sqlite3 data/personality-bench.db "SELECT COUNT(DISTINCT model_id) || ' models, ' || COUNT(*) || ' runs, \$' || ROUND(SUM(cost_usd),2) || ' total' FROM runs WHERE status='completed';"
echo
echo "Next steps:"
echo "  git add -A && git commit -m '...' && git push"
echo "  railway up --detach --ci"
