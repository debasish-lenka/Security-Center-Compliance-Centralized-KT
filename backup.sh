#!/usr/bin/env bash
# Backs up the database, the uploaded Documents and the .env (it holds the keys that
# decrypt the 2FA secrets and mail passwords, so a restore without it is incomplete).
# Run by hand:  ./backup.sh          Keep the newest N backups:  KEEP=30 ./backup.sh
# Daily at 02:00 (see README-DEPLOY.md):  0 2 * * * cd /opt/dbi-security && ./backup.sh
set -euo pipefail
cd "$(dirname "$0")"

KEEP="${KEEP:-14}"
stamp="$(date -u +%Y-%m-%d_%H%M%S)"   # UTC, same as the dashboard backups
dest="backups/$stamp"
umask 077
mkdir -p "$dest"

# a failed or empty backup must never look like a good one
cleanup() { [ -f "$dest/OK" ] || { echo "Backup FAILED, removing $dest" >&2; rm -rf "$dest"; }; }
trap cleanup EXIT

docker compose exec -T db pg_dump -U dbi --no-owner dbi_security | gzip > "$dest/db.sql.gz"
gzip -t "$dest/db.sql.gz"
[ "$(gzip -dc "$dest/db.sql.gz" | wc -c)" -gt 1000 ] || { echo "Database dump looks empty" >&2; exit 1; }

if [ -d Documents ]; then
  tar czf "$dest/documents.tgz" Documents
  tar tzf "$dest/documents.tgz" >/dev/null
fi
[ -f .env ] && cp .env "$dest/env.backup"

touch "$dest/OK"
echo "Backup written to $dest ($(du -sh "$dest" | cut -f1))"

# keep only the newest $KEEP complete backups
ls -1d backups/*/ 2>/dev/null | sort | head -n -"$KEEP" | while read -r old; do
  [ -f "${old}OK" ] && rm -rf "$old" && echo "Removed old backup $old"
done || true
