#!/usr/bin/env bash
# Pull the latest code and rebuild/restart only if something changed.
# Run by hand:  ./update.sh        Run automatically: see README-DEPLOY.md (cron)
set -euo pipefail
cd "$(dirname "$0")"

before=$(git rev-parse HEAD)
git pull --ff-only
after=$(git rev-parse HEAD)

if [ "$before" = "$after" ] && [ "${1:-}" != "--force" ]; then
  echo "Already up to date ($after)"
  exit 0
fi

docker compose up -d --build
docker image prune -f >/dev/null
echo "Updated $before -> $after"
