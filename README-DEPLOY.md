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

## Backup
```bash
docker compose exec db pg_dump -U dbi dbi_security > backup.sql
tar czf documents-backup.tgz Documents
```
