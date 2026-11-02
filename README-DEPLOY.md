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
Open `http://<UBUNTU_IP>:<WEB_PORT>`, log in with `admin@dbi.example.com` and the `SEED_ADMIN_PASSWORD` you set, then change the password.

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
