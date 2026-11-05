#!/usr/bin/env bash
# Tests update.sh with a fake git server, a fake docker and a fake backup. No real docker or server is touched.
# Run:  bash tests/update-sh.test.sh
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
T="$(mktemp -d)"
cd "$T"
mkdir bin
PASS=0; FAIL=0
ok() { if [ "$2" = "1" ]; then PASS=$((PASS+1)); echo "PASS  $1"; else FAIL=$((FAIL+1)); echo "FAIL  $1  $3"; fi; }
has() { grep -q -- "$1" "$2"; }

# ---- fake docker, curl ----
cat > bin/docker <<'EOF'
#!/usr/bin/env bash
echo "docker $*" >> "$STUB_LOG"
case "$1" in
  info) exit 0 ;;
  image) exit 0 ;;
  tag) exit 0 ;;
  inspect) echo 0; exit 0 ;;
  compose)
    shift
    case "$1" in
      up) if [ -n "${STUB_BUILD_FAIL:-}" ] && [ -f BAD ]; then exit 1; fi; exit 0 ;;
      ps) if [ "$2" = "--status" ]; then printf 'api\nweb\ndb\n'; elif [ "$2" = "-q" ]; then echo cid; fi; exit 0 ;;
      exec) [ -f BAD ] && exit 1 || exit 0 ;;
    esac ;;
esac
exit 0
EOF
cat > bin/curl <<'EOF'
#!/usr/bin/env bash
if [ -f BAD ]; then printf '502'; else printf '401'; fi
EOF
chmod +x bin/docker bin/curl
export STUB_LOG="$T/calls.log"; : > "$STUB_LOG"

# ---- fake git server and the "server" checkout ----
git init -q --bare -b main origin.git
git clone -q origin.git seed 2>/dev/null
cd seed
git config user.email t@t; git config user.name t
cp "$REPO/update.sh" update.sh
cat > backup.sh <<'EOF'
#!/usr/bin/env bash
[ -n "${BACKUP_FAIL:-}" ] && { echo "backup failed (test)" >&2; exit 1; }
d="backups/$(date +%s%N)"; mkdir -p "$d"; touch "$d/OK"; echo "Backup written to $d"
EOF
chmod +x update.sh backup.sh
echo v1 > f; echo ".env" > .gitignore; echo "logs/" >> .gitignore; echo "backups/" >> .gitignore
printf 'services: {}\n' > docker-compose.yml
git add -A; git commit -q -m "v1"; git branch -M main; git push -q -u origin main
cd "$T"; git clone -q origin.git deploy 2>/dev/null
cd deploy; echo "WEB_PORT=8443" > .env
export PATH="$T/bin:$PATH" HEALTH_TIMEOUT=3 HEALTH_STEP=1 MIN_FREE_GB=0
run() { bash update.sh "$@" > "$T/out.txt" 2>&1; echo $? > "$T/code.txt"; code=$(cat "$T/code.txt"); }
backups() { ls -1d backups/*/ 2>/dev/null | wc -l | tr -d ' '; }
pushcommit() { (cd "$T/seed" && git pull -q --rebase origin main 2>/dev/null; eval "$1"; git add -A; git commit -q -m "$2"; git push -q origin main); }
calls_since() { tail -n +"$1" "$STUB_LOG"; }
mark() { wc -l < "$STUB_LOG" | tr -d ' '; }

# A. nothing new
m=$(mark); run
ok "A. nothing new: exits 0 quietly, no backup, no build" "$([ "$code" = 0 ] && has 'Already up to date' "$T/out.txt" && ! calls_since $((m+1)) | grep -q 'compose up' && [ "$(backups)" = 0 ] && echo 1 || echo 0)" "$(cat $T/out.txt | tail -3)"

# B. a good new version
pushcommit 'echo v2 > f' "good v2"
good1="$(cd "$T/seed" && git rev-parse HEAD)"
m=$(mark); run
ok "B. good version: updated, backed up first, old images kept, health checked" "$([ "$code" = 0 ] && has 'UPDATED' "$T/out.txt" && [ "$(git rev-parse HEAD)" = "$good1" ] && [ "$(backups)" = 1 ] && calls_since $((m+1)) | grep -q 'tag dbi-security-api:latest dbi-security-api:previous' && calls_since $((m+1)) | grep -q 'compose up -d --build' && echo 1 || echo 0)" "$(tail -4 $T/out.txt)"

# C. a broken version is rolled back
pushcommit 'touch BAD' "bad v3"
bad="$(cd "$T/seed" && git rev-parse HEAD)"
m=$(mark); run
ok "C1. broken version: exit 1 and rolled back to the working code" "$([ "$code" = 1 ] && has 'ROLLED BACK' "$T/out.txt" && [ "$(git rev-parse HEAD)" = "$good1" ] && [ ! -f BAD ] && echo 1 || echo 0)" "$(tail -4 $T/out.txt)"
ok "C2. the old images are put back and started without building" "$(calls_since $((m+1)) | grep -q 'tag dbi-security-api:previous dbi-security-api:latest' && calls_since $((m+1)) | grep -q 'compose up -d --no-build' && echo 1 || echo 0)"
ok "C3. the failed version is remembered" "$([ "$(cat logs/last-failed-commit)" = "$bad" ] && echo 1 || echo 0)"
ok "C4. a backup was taken before the attempt" "$([ "$(backups)" = 2 ] && echo 1 || echo 0)" "$(backups)"

# D. cron runs again: the same broken version is not tried again
m=$(mark); n=$(backups); run
ok "D. cron again: skips the version that failed, no backup, no build" "$([ "$code" = 0 ] && has 'already failed' "$T/out.txt" && [ "$(backups)" = "$n" ] && ! calls_since $((m+1)) | grep -q 'compose up' && echo 1 || echo 0)" "$(tail -3 $T/out.txt)"

# E. a fix is pushed
pushcommit 'rm -f BAD; echo v4 > f' "fix v4"
fix="$(cd "$T/seed" && git rev-parse HEAD)"
run
ok "E. the fixed version is installed and the failure mark is cleared" "$([ "$code" = 0 ] && has 'UPDATED' "$T/out.txt" && [ "$(git rev-parse HEAD)" = "$fix" ] && [ ! -f logs/last-failed-commit ] && echo 1 || echo 0)" "$(tail -3 $T/out.txt)"

# F. the backup fails: nothing is changed
pushcommit 'echo v5 > f' "v5"
head5="$(git rev-parse HEAD)"; m=$(mark)
BACKUP_FAIL=1 run
ok "F. backup fails: update CANCELLED, code and containers untouched" "$([ "$code" = 1 ] && has 'CANCELLED' "$T/out.txt" && [ "$(git rev-parse HEAD)" = "$head5" ] && ! calls_since $((m+1)) | grep -q 'compose up' && echo 1 || echo 0)" "$(tail -3 $T/out.txt)"
run
ok "F2. when the backup works again the update goes through" "$([ "$code" = 0 ] && has 'UPDATED' "$T/out.txt" && echo 1 || echo 0)"

# G. local edits in a tracked file
pushcommit 'echo v6 > f' "v6"; echo "local change" >> f
run
ok "G. local edits: refuses and changes nothing" "$([ "$code" = 1 ] && has 'local edits' "$T/out.txt" && echo 1 || echo 0)" "$(tail -2 $T/out.txt)"
git checkout -q -- f

# H. not enough disk
MIN_FREE_GB=99999999 run
ok "H. not enough free disk: refuses before doing anything" "$([ "$code" = 1 ] && has 'free disk' "$T/out.txt" && echo 1 || echo 0)" "$(tail -2 $T/out.txt)"

# I. --force with nothing new, and --skip-backup
run; n=$(backups); m=$(mark)
run --force
ok "I. --force with nothing new rebuilds, with a backup" "$([ "$code" = 0 ] && has 'was given' "$T/out.txt" && [ "$(backups)" = $((n+1)) ] && calls_since $((m+1)) | grep -q 'compose up -d --build' && echo 1 || echo 0)" "$(tail -3 $T/out.txt)"
n=$(backups); run --force --skip-backup
ok "M. --skip-backup takes no backup" "$([ "$code" = 0 ] && [ "$(backups)" = "$n" ] && has 'Backup skipped' "$T/out.txt" && echo 1 || echo 0)"

# J. a second update at the same time
mkdir -p /tmp/dbi-security-update.lock; sleep 20 & slp=$!; echo $slp > /tmp/dbi-security-update.lock/pid
m=$(mark); run --force
ok "J. another update running: this one steps aside" "$([ "$code" = 0 ] && has 'Another update is running' "$T/out.txt" && ! calls_since $((m+1)) | grep -q 'compose up' && echo 1 || echo 0)" "$(tail -2 $T/out.txt)"
kill $slp 2>/dev/null; rm -rf /tmp/dbi-security-update.lock
run --force
ok "J2. a stale lock (nobody running) does not block" "$([ "$code" = 0 ] && has 'was given' "$T/out.txt" && echo 1 || echo 0)"

# K. the build itself fails
pushcommit 'touch BAD' "bad build"
STUB_BUILD_FAIL=1 run
ok "K. build fails: rolled back too" "$([ "$code" = 1 ] && has 'build or the start failed' "$T/out.txt" && has 'ROLLED BACK' "$T/out.txt" && [ ! -f BAD ] && echo 1 || echo 0)" "$(tail -3 $T/out.txt)"

# L. wrong option
run --nonsense
ok "L. unknown option: exit 2" "$([ "$code" = 2 ] && echo 1 || echo 0)"
run --help
ok "L2. --help prints the usage" "$([ "$code" = 0 ] && has 'Safe update' "$T/out.txt" && echo 1 || echo 0)"
ok "N. everything is written to logs/update.log" "$(has 'ROLLED BACK' logs/update.log && has 'UPDATED' logs/update.log && echo 1 || echo 0)"

echo; echo "$PASS passed, $FAIL failed"
rm -rf "$T"
