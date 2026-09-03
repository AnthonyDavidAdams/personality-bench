#!/bin/zsh
# Nightly autopilot: discover new frontier models → sweep → write + publish the dispatch →
# refresh seed/exports/figures/paper → commit named files → push → deploy → email.
# Runs from launchd on the always-on Mac (see scripts/launchd/*.plist). Safe to re-run.
set -uo pipefail
cd /Users/anthony/personality-bench
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG=data/autopilot.log
log() { echo "[autopilot $(date '+%F %T')] $*" | tee -a $LOG; }

log "start"
npx tsx scripts/discover_and_run.ts --execute --max-spend "${MAX_SPEND:-15}" >> $LOG 2>&1 || { log "discover failed (exit $?)"; exit 1; }
MODELS=$(python3 -c "import json;print(' '.join(m['id'] for m in json.load(open('data/discover-last.json'))['models'] if m['ok']>0))")
if [ -z "$MODELS" ]; then log "nothing new — done"; exit 0; fi
log "new models: $MODELS"

for M in ${(z)MODELS}; do
  npx tsx scripts/generate_article.ts --publish "$M" >> $LOG 2>&1 || log "article failed for $M"
done

zsh paper/refresh.sh >> $LOG 2>&1 || log "refresh had errors (continuing)"

git add seed/personality-bench-seed.db.gz data/exports/*.csv paper/personality-bench.pdf paper/personality-bench.html paper/figures/*.png 2>/dev/null
git commit -q -m "Autopilot: add $MODELS

Nightly discovery swept the model(s) above at N=5 across all instruments,
published the dispatch article, and refreshed the seed snapshot, exports,
drift figures, and paper PDF.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" >> $LOG 2>&1 && git push -q origin HEAD >> $LOG 2>&1 && log "pushed" || log "git commit/push failed"
railway up --detach --ci >> $LOG 2>&1 && log "deploy triggered" || log "railway up failed"

SUMMARY=$(python3 -c "
import json; d=json.load(open('data/discover-last.json'))
print('\n'.join(f\"{m['id']}: {m['ok']} ok / {m['fail']} fail, \${m['spent']:.2f} — https://persona.earthpilot.ai/models/{m['id']}\" for m in d['models']))")
npx tsx -e "import { notify } from './scripts/discover_and_run'; notify(process.argv[1].split('\n'), 'new model(s) live: ' + process.argv[2]);" "$SUMMARY" "$MODELS" >> $LOG 2>&1
log "done"
