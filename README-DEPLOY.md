# Deploy on Ubuntu with Docker

Needs: Docker + Docker Compose plugin, git. Opens one host port (WEB_PORT); nothing else on the machine is touched.

## First time
```bash
sudo ss -tlnp                      # pick a free port for WEB_PORT
git clone <REPO_URL> /opt/dbi-security && cd /opt/dbi-security
cp .env.example .env && nano .env  # fill in passwords, secrets, UBUNTU_IP, WEB_PORT
docker compose up -d --build
docker compose exec -e NODE_ENV=development api node dist/db/seed.js   # creates admin@dbi.example.com
```
Open `https://<UBUNTU_IP>:<WEB_PORT>` (default 8443). The certificate is self-signed, so the browser shows a warning once: choose Advanced, then Continue.
Log in with `admin@dbi.example.com` and `SEED_ADMIN_PASSWORD`. Admin accounts must set up an authenticator app (Microsoft/Google Authenticator) at first login, and save the recovery codes.

## Inviting users
1. Super admin: **Mail Settings** (sidebar, Administration) → choose SMTP (Office 365) or Enterprise app (Microsoft Graph) → Save → send a test email.
2. **Team & Users → Add User** (name, email, role; no password). The user gets an email with a one-time link valid 24 hours; they set their password (admins also enroll the authenticator).
3. If email fails, a super admin sees the link on screen to pass on. **Resend invite** is available for pending users; **Reset 2FA** (super admin) for a lost phone.

## Getting new changes
On your laptop: `git push`. On Ubuntu: `./update.sh`. It is a **safe update**:

1. checks that docker works, `.env` exists, there are no local edits in tracked files, and at least 3 GB of disk is free;
2. looks at what is new; if nothing is new it stops quietly;
3. runs `./backup.sh` first. **If the backup fails the update is cancelled and nothing changes;**
4. keeps the running images as `:previous`, takes the new code, builds and starts it;
5. waits (up to 3 minutes) until the API and the website really answer. **If they do not, it puts the old code and the old images back by itself** and exits with an error. That broken version is not tried again by cron; fix it and push, or run `./update.sh --force`.

```bash
./update.sh                 # update only if something is new
./update.sh --force         # rebuild and restart even if nothing is new
./update.sh --skip-backup   # no backup first (only if you know why)
```
Everything it does is written to `logs/update.log`. The backup it took is named in the last line (`UPDATED ... Backup: backups/<date>`); if you ever need to go back to the data of that moment: `./restore.sh backups/<date>`.
Run long updates inside `tmux` so a dropped SSH connection cannot interrupt them.

Automatic (checks every 5 minutes; safe, it only does something when there is something new, and never two at once):
```bash
crontab -e
*/5 * * * * cd /opt/dbi-security && ./update.sh >> /var/log/dbi-update.log 2>&1
```
Database and uploaded files survive updates (`dbi_pgdata` volume and `./Documents`). Database changes made by a new version are only additions, so an automatic rollback of the code does not need the data to be restored.

## Virus scan of uploads (ClamAV)

Every uploaded file is sent to a `clamav` container (offline antivirus, part of docker-compose) before it is saved. An infected file is refused, the person sees which virus was found, and the refusal is written to the audit log (action UPLOAD, outcome FAILURE). If the scanner is not ready or is stopped, uploads are **refused** ("try again in a minute"), never let through unscanned. After a restart the scanner needs one to two minutes to load.

- Needs about 1 GB of extra memory.
- **Check that it works** (on the server, after an update): save the standard harmless test string as a file and upload it in the Document Vault, it must be refused with "Eicar-Test-Signature":
  `printf '%s' 'X5O!P%@AP[4\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*' > eicar.txt`
- **Virus definitions** are fetched from the internet every few hours (`freshclam`). On a server with no internet set `CLAMAV_NO_FRESHCLAMD=true` in `.env`, and update the definitions by pulling a newer image on a computer with internet (`docker compose pull clamav`, then `./update.sh --force`).
- **Look at it:** `docker compose logs clamav --tail 30` and `docker compose ps` (clamav should be "healthy").
- **Switch off** (not recommended): `VIRUS_SCAN=off` in `.env`.

## Login length

A login lasts 8 hours without activity (`JWT_EXPIRES_IN`, default `8h`). Someone who keeps working is renewed automatically, so only people who stop are signed out. Set `JWT_EXPIRES_IN=30m` for stricter, `12h` for looser.

## Useful commands
```bash
docker compose ps
docker compose logs -f api
docker compose restart api
docker compose down            # stop (data kept); add -v to ALSO delete the database
```

## Backups from the dashboard (Super Admin > Backups)
The Super Admin can press **Back up now**, switch on a daily/weekly **schedule**, choose how many backups to keep, download a backup, or delete one. Files go to `backups/` next to `docker-compose.yml` (same layout as `./backup.sh`, so `./restore.sh` restores them). The schedule time is shown in your clock and stored in UTC.

- Create the folder as yourself before the first start: `mkdir -p backups` (otherwise Docker creates it owned by root). Files made by the dashboard are owned by root, so use `sudo ./restore.sh backups/<date>` and `sudo rm -rf` to delete one by hand.
- The dashboard backup holds the database and Documents but **not `.env`**; `./backup.sh` also copies `.env`. Keep a copy of `.env` somewhere safe.
- Restoring is deliberately not on the page (it replaces all current data): run `./restore.sh` on the server.

## Backup and restore
`./backup.sh` saves the database, the `Documents` folder and `.env` (it holds the keys that decrypt 2FA secrets) into `backups/<date>/`, checks the files, and keeps the newest 14 (`KEEP=30 ./backup.sh` to change). A failed backup is deleted, never left looking good.

Daily at 02:00:
```bash
crontab -e
0 2 * * * cd /opt/dbi-security && ./backup.sh >> /var/log/dbi-backup.log 2>&1
```
Restore (replaces the current data, asks first): `./restore.sh backups/<date>`

The backups sit on the same machine, so they do not protect against a dead disk. Copy `backups/` to another computer or an external drive now and then. The folder contains `.env` (secrets), so keep it private.
