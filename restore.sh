#!/usr/bin/env bash
# Restores a backup made by backup.sh. This REPLACES the current database and Documents.
# Usage:  ./restore.sh backups/2026-11-03_020000        (add --yes to skip the question)
set -euo pipefail
cd "$(dirname "$0")"

src="${1:-}"
[ -n "$src" ] && [ -f "$src/OK" ] && [ -f "$src/db.sql.gz" ] || { echo "Give a complete backup folder, e.g. ./restore.sh backups/<date>" >&2; ls -1d backups/*/ 2>/dev/null || true; exit 1; }

if [ "${2:-}" != "--yes" ]; then
  read -r -p "This overwrites the current database and Documents with $src. Type yes to continue: " answer
  [ "$answer" = "yes" ] || { echo "Cancelled"; exit 1; }
fi

echo "Stopping the app (database stays up)..."
docker compose stop api web >/dev/null

echo "Restoring the database..."
docker compose exec -T db psql -U dbi -d dbi_security -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
gzip -dc "$src/db.sql.gz" | docker compose exec -T db psql -U dbi -d dbi_security -v ON_ERROR_STOP=1 -q

if [ -f "$src/documents.tgz" ]; then
  echo "Restoring Documents..."
  rm -rf Documents
  tar xzf "$src/documents.tgz"
fi

if [ -f "$src/env.backup" ] && ! cmp -s "$src/env.backup" .env 2>/dev/null; then
  echo "NOTE: the .env in this backup differs from the current one ($src/env.backup)."
  echo "      If 2FA codes or mail passwords stop working, copy it over .env and run: docker compose up -d"
fi

docker compose up -d
echo "Restore finished."
