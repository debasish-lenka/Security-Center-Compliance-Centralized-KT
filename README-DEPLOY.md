# Deploy on Ubuntu with Docker

Needs: Docker + Docker Compose plugin, git. Opens one host port (WEB_PORT); nothing else on the machine is touched.

## First time
```bash
sudo ss -tlnp                      # pick a free port for WEB_PORT
git clone <REPO_URL> /opt/dbi-security && cd /opt/dbi-security
cp .env.example .env && nano .env  # fill in passwords, secrets, UBUNTU_IP, WEB_PORT
chmod +x update.sh
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
On your laptop: `git push`. On Ubuntu: `./update.sh` (pulls, rebuilds, restarts only if changed).

Automatic (checks every 5 minutes):
```bash
crontab -e
*/5 * * * * cd /opt/dbi-security && ./update.sh >> /var/log/dbi-update.log 2>&1
```
Database and uploaded files survive updates (`dbi_pgdata` volume and `./Documents`).

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
