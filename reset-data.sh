#!/usr/bin/env bash
# Wipes ALL working data (projects, tasks, documents and their files, KT, reports, logs, notifications, teams, departments,
# compliance items, every user except ONE admin) so the system starts empty. Cannot be undone, so it
#   1. takes a full backup first (./backup.sh),
#   2. shows what will be removed and asks you to type  DELETE-ALL-DATA,
#   3. keeps: the admin you name (password and 2FA unchanged), roles/permissions, and the settings (mail, SSO, backup, reminders, work).
# Run on the server:   ./reset-data.sh admin@yourcompany.com
set -euo pipefail
cd "$(dirname "$0")"

ADMIN="${1:-}"
[ -n "$ADMIN" ] || { echo "Usage: ./reset-data.sh <email of the admin to keep>" >&2; exit 1; }
psql() { docker compose exec -T db psql -U dbi -d dbi_security -v ON_ERROR_STOP=1 -At "$@"; }

safe="${ADMIN//\'/\'\'}"
found="$(psql -c "select count(*) from profiles where lower(email)=lower('$safe')")"
[ "$found" = "1" ] || { echo "No user with the email $ADMIN. Nothing was changed." >&2; exit 1; }
isadmin="$(psql -c "select role from profiles where lower(email)=lower('$safe')")"
case "$isadmin" in SUPER_ADMIN|ADMIN) ;; *) echo "$ADMIN is a $isadmin, not an admin. Nothing was changed." >&2; exit 1;; esac

KEEP_TABLES="profiles roles permissions user_roles permission_overrides mail_settings sso_settings backup_settings reminder_settings work_settings"
tables="$(psql -c "select tablename from pg_tables where schemaname='public' order by 1")"
echo "Keeps admin: $ADMIN ($isadmin). Keeps tables: $KEEP_TABLES"
echo "Will be emptied:"
for t in $tables; do
  case " $KEEP_TABLES " in *" $t "*) continue;; esac
  printf '  %-28s %s rows\n' "$t" "$(psql -c "select count(*) from \"$t\"")"
done
echo "  users removed:              $(psql -c "select count(*) from profiles where lower(email)<>lower('$safe')")"
echo "  uploaded files in Documents: $(find Documents -type f 2>/dev/null | wc -l)"
echo
read -r -p "Type DELETE-ALL-DATA to continue (anything else cancels): " ans
[ "$ans" = "DELETE-ALL-DATA" ] || { echo "Cancelled. Nothing was changed."; exit 1; }

echo "Taking a backup first..."
./backup.sh

# one transaction: all or nothing. replica mode skips the foreign-key checks, so the order of tables does not matter
sql="begin; set local session_replication_role = replica;"
for t in $tables; do
  case " $KEEP_TABLES " in *" $t "*) continue;; esac
  sql="$sql delete from \"$t\";"
done
sql="$sql delete from user_roles where \"userId\" in (select id from profiles where lower(email)<>lower('$safe'));
delete from permission_overrides where \"userId\" in (select id from profiles where lower(email)<>lower('$safe')) or \"grantedBy\" in (select id from profiles where lower(email)<>lower('$safe'));
delete from profiles where lower(email)<>lower('$safe');
update profiles set \"departmentId\" = null;
commit;"
echo "$sql" | docker compose exec -T db psql -U dbi -d dbi_security -v ON_ERROR_STOP=1 -q

# uploaded files (written by the api container, so it removes them)
docker compose exec -T api sh -c 'find /data/Documents -mindepth 1 -delete' || echo "Could not clear Documents: remove it by hand with  sudo rm -rf Documents/*"

echo "Done. The system is empty; sign in as $ADMIN. The backup taken just before is in backups/ (restore.sh brings it back)."
