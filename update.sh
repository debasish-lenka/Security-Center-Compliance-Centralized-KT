#!/usr/bin/env bash
# Safe update: checks first, backs up, updates, checks that the app really works, and goes back to the
# previous version by itself if it does not.
#
#   ./update.sh                 update only if there is something new (safe to run from cron)
#   ./update.sh --force         rebuild and restart even if there is nothing new
#   ./update.sh --skip-backup   do not back up first (only if you know why)
#
# What it does, in order:
#   1. checks: docker works, .env exists, no local edits in tracked files, enough free disk
#   2. looks at what is new (git fetch); nothing new = it stops here, quietly
#   3. ./backup.sh (database, Documents, .env). If the backup fails the update is CANCELLED and nothing changes
#   4. keeps the running images as ":previous", pulls the new code, builds and starts it
#   5. waits until the API and the website answer. If they do not, it puts the old code and old images
#      back and exits with an error. The same broken version is not tried again by cron (use --force).
#
# Every run is written to logs/update.log. Exit codes: 0 fine (or nothing to do), 1 failed, 2 wrong usage.
set -uo pipefail
cd "$(dirname "$0")"

FORCE=0; SKIP_BACKUP=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --skip-backup) SKIP_BACKUP=1 ;;
    -h|--help) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $arg (use --force, --skip-backup or --help)" >&2; exit 2 ;;
  esac
done

# Everything below is inside one function so bash has read the WHOLE script before it runs: git may replace this
# very file while updating, and a half-read script must not change what it does.
main() {
  HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"   # seconds to wait for the new version to answer
  HEALTH_STEP="${HEALTH_STEP:-5}"
  MIN_FREE_GB="${MIN_FREE_GB:-3}"
  IMAGES="${IMAGES:-dbi-security-api dbi-security-web}"   # the images built from this repository

  mkdir -p logs
  LOG=logs/update.log
  exec > >(tee -a "$LOG") 2>&1
  stamp() { date '+%Y-%m-%d %H:%M:%S'; }
  say() { echo "[$(stamp)] $*"; }
  fail() { say "FAILED: $*"; exit 1; }

  # ---- only one update at a time (cron and a person at the same time) ----
  LOCK=/tmp/dbi-security-update.lock
  if ! mkdir "$LOCK" 2>/dev/null; then
    other="$(cat "$LOCK/pid" 2>/dev/null || true)"
    if [ -n "$other" ] && kill -0 "$other" 2>/dev/null; then say "Another update is running (pid $other). Nothing done."; exit 0; fi
    rm -rf "$LOCK"; mkdir "$LOCK" || fail "could not take the update lock"
  fi
  echo $$ > "$LOCK/pid"
  trap 'rm -rf "$LOCK"' EXIT
  # keep the log from growing for ever
  [ "$(wc -l < "$LOG")" -gt 4000 ] && { tail -n 2000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; }

  # ---- 1. checks ----
  command -v git >/dev/null 2>&1 || fail "git is not installed"
  command -v docker >/dev/null 2>&1 || fail "docker is not installed"
  docker info >/dev/null 2>&1 || fail "docker is not running (or you may not use it: try sudo)"
  [ -f .env ] || fail ".env is missing in $(pwd)"
  # (a changed file permission, such as chmod +x, is not an edit)
  if ! git -c core.fileMode=false diff --quiet || ! git -c core.fileMode=false diff --cached --quiet; then
    fail "there are local edits in tracked files here. Commit them or run: git checkout -- . (nothing was changed)"
  fi
  free_kb="$(df -Pk . | awk 'NR==2 {print $4}')"
  [ "${free_kb:-0}" -ge $((MIN_FREE_GB * 1024 * 1024)) ] || fail "less than ${MIN_FREE_GB} GB of free disk space ($((free_kb / 1024 / 1024)) GB). Free some space first (nothing was changed)"

  # ---- 2. what is new ----
  git fetch --quiet origin || fail "could not reach the git server (nothing was changed)"
  before="$(git rev-parse HEAD)"
  upstream="$(git rev-parse '@{u}' 2>/dev/null)" || fail "this branch has no upstream to update from"
  if [ "$before" = "$upstream" ] && [ "$FORCE" -eq 0 ]; then
    say "Already up to date (${before:0:7})"
    exit 0
  fi
  if [ "$before" != "$upstream" ] && ! git merge-base --is-ancestor HEAD "$upstream"; then
    fail "the server's code and the git server have diverged (not a simple update). Nothing was changed"
  fi
  if [ "$FORCE" -eq 0 ] && [ -f logs/last-failed-commit ] && [ "$(cat logs/last-failed-commit)" = "$upstream" ]; then
    say "Version ${upstream:0:7} already failed here and was rolled back. Fix it and push, or run ./update.sh --force. Nothing done."
    exit 0
  fi
  if [ "$before" != "$upstream" ]; then
    say "New in git ($(git rev-list --count "$before..$upstream") change(s)):"
    git log --oneline "$before..$upstream" | head -15 | cut -c1-150 | sed 's/^/    /'
  else
    say "Nothing new, but --force was given: rebuilding the current version (${before:0:7})"
  fi

  # ---- 3. backup first ----
  backup_dir="(skipped)"
  if [ "$SKIP_BACKUP" -eq 1 ]; then
    say "Backup skipped (--skip-backup)"
  else
    say "Backing up first..."
    if ! ./backup.sh; then fail "the backup failed, so the update was CANCELLED. Nothing was changed"; fi
    backup_dir="$(ls -1d backups/*/ 2>/dev/null | sort | tail -n 1 | sed 's:/$::')"
    [ -f "$backup_dir/OK" ] || fail "no complete backup was found after backing up. Update CANCELLED, nothing changed"
  fi

  # ---- 4. keep what runs now, then update ----
  for img in $IMAGES; do
    if docker image inspect "$img:latest" >/dev/null 2>&1; then docker tag "$img:latest" "$img:previous" >/dev/null 2>&1; fi
  done

  healthy() {
    # the database must be up, the API must answer inside its container, and the website must answer outside
    docker compose ps --status running --services 2>/dev/null | grep -qx api || return 1
    docker compose ps --status running --services 2>/dev/null | grep -qx web || return 1
    local restarts; restarts="$(docker inspect -f '{{.RestartCount}}' "$(docker compose ps -q api 2>/dev/null)" 2>/dev/null || echo 0)"
    [ "${restarts:-0}" -le 2 ] || return 1                                   # a crash loop
    docker compose exec -T api node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" >/dev/null 2>&1 || return 1
    if command -v curl >/dev/null 2>&1; then
      local port code; port="$(grep -E '^WEB_PORT=' .env | tail -n 1 | cut -d= -f2 | tr -d '"' | tr -d "'")"; port="${port:-8443}"
      code="$(curl -ks -o /dev/null -m 10 -w '%{http_code}' "https://127.0.0.1:$port/api/v1/upload-policy" 2>/dev/null || echo 000)"
      [ "$code" = "401" ] || [ "$code" = "200" ] || return 1                 # 401 = reached the API through the website, it wants a login
    fi
    return 0
  }
  wait_healthy() {
    local waited=0
    while [ "$waited" -lt "$1" ]; do
      healthy && return 0
      sleep "$HEALTH_STEP"; waited=$((waited + HEALTH_STEP))
    done
    healthy
  }

  if [ "$before" != "$upstream" ]; then
    git merge --ff-only --quiet "$upstream" || fail "could not take the new code (nothing was built)"
  fi
  after="$(git rev-parse HEAD)"

  say "Building and starting ${after:0:7}..."
  build_ok=1
  docker compose up -d --build || build_ok=0
  if [ "$build_ok" -eq 1 ]; then
    say "Waiting for the app to answer (up to ${HEALTH_TIMEOUT}s)..."
    wait_healthy "$HEALTH_TIMEOUT" && { say "The app answers."; ok=1; } || ok=0
  else
    say "The build or the start failed."; ok=0
  fi

  # ---- 5. it works, or we go back ----
  if [ "${ok:-0}" -eq 1 ]; then
    docker image prune -f >/dev/null 2>&1
    say "UPDATED ${before:0:7} -> ${after:0:7}. Backup: $backup_dir"
    rm -f logs/last-failed-commit
    exit 0
  fi

  say "The new version does not work. Going back to ${before:0:7}..."
  echo "$after" > logs/last-failed-commit
  if [ "$before" != "$after" ]; then git reset --hard --quiet "$before" || say "WARNING: could not put the old code back"; fi
  restored=0
  for img in $IMAGES; do
    if docker image inspect "$img:previous" >/dev/null 2>&1; then docker tag "$img:previous" "$img:latest" >/dev/null 2>&1 && restored=1; fi
  done
  if [ "$restored" -eq 1 ]; then docker compose up -d --no-build; else docker compose up -d --build; fi
  if wait_healthy 90; then
    say "ROLLED BACK: the old version (${before:0:7}) is running again. The new version (${after:0:7}) is NOT installed."
  else
    say "WARNING: the old version did not come back cleanly either. Look at: docker compose ps && docker compose logs --tail=50 api"
    say "If the data looks wrong, the backup is $backup_dir (restore with: ./restore.sh $backup_dir)"
  fi
  say "Details are in $LOG. This version will not be tried again automatically; ./update.sh --force tries it again."
  exit 1
}

main "$@"
exit $?
