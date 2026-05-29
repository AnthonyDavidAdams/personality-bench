#!/bin/zsh
# Set up personality-bench.earthpilot.ai → <railway domain> CNAME on Namecheap.
#
# Usage:
#   scripts/setup_subdomain.sh personality-bench-production-1234.up.railway.app
#
# After this runs, wait 5-30 min for DNS propagation and verify with:
#   dig personality-bench.earthpilot.ai
#   curl -I https://personality-bench.earthpilot.ai
set -euo pipefail
target="${1:-}"
if [[ -z "$target" ]]; then
  echo "Usage: $0 <railway-domain>"
  echo "Example: $0 personality-bench-production-1234.up.railway.app"
  exit 1
fi

echo "Adding CNAME: personality-bench.earthpilot.ai → $target"
~/.local/bin/namecheap setcname earthpilot.ai personality-bench "$target"
echo
echo "Verification (may take 5-30 min for DNS propagation):"
echo "  dig +short personality-bench.earthpilot.ai"
echo "  curl -I https://personality-bench.earthpilot.ai"
