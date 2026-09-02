#!/bin/bash
# Push local shatam_care source into the running container.
#
# `bench get-app shatam_care /workspace/shatam_care` performs a git *clone*, so
# apps/shatam_care inside the bench is a snapshot — edits to the source tree do
# NOT appear there. This copies the Python package over the clone (leaving its
# .git and egg-info intact) and clears the cache.
#
# Usage:
#   ./sync-app.sh            # sync only
#   ./sync-app.sh --migrate  # sync + bench migrate (needed for doctype/fixture changes)
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

SITE="lms.localhost"
APP_SRC="/workspace/shatam_care/shatam_care"
APP_DST="/home/frappe/frappe-bench/apps/shatam_care/shatam_care"

echo "==> Copying source into container"
docker compose exec -T frappe bash -lc "
  rsync -a --delete --exclude '__pycache__' --exclude '*.pyc' '$APP_SRC/' '$APP_DST/' 2>/dev/null \
    || { find '$APP_DST' -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null; cp -R '$APP_SRC/.' '$APP_DST/'; }
  echo '    synced'
" 2>&1 | grep -v "level=warning"

if [ "${1:-}" = "--migrate" ]; then
  echo "==> bench migrate (applies doctype + fixture changes)"
  docker compose exec -T frappe bash -lc \
    "cd /home/frappe/frappe-bench && bench --site $SITE migrate" 2>&1 \
    | grep -v "level=warning" | tail -25
fi

echo "==> Clearing cache"
docker compose exec -T frappe bash -lc \
  "cd /home/frappe/frappe-bench && bench --site $SITE clear-cache" 2>&1 | grep -v "level=warning"
echo "Done."
