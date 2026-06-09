#!/bin/zsh
# One-command refresh: re-snapshots the SQLite DB into the seed, re-renders the drift
# figures, and rebuilds the paper PDF. Run after a sweep when new model data has landed.
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
echo "[refresh] 2/4  render drift PNGs"
~/.fal-venv/bin/python paper/render_drift_charts.py 2>&1 | tail -5

echo
echo "[refresh] 3/4  rebuild paper PDF"
python3 paper/build_pdf.py 2>&1 | tail -3

echo
echo "[refresh] 4/4  summary"
echo
sqlite3 data/personality-bench.db "SELECT COUNT(DISTINCT model_id) || ' models, ' || COUNT(*) || ' runs, \$' || ROUND(SUM(cost_usd),2) || ' total' FROM runs WHERE status='completed';"
echo
echo "Next steps:"
echo "  git add -A && git commit -m '...' && git push"
echo "  railway up --detach --ci"
