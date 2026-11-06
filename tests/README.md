# Tests

Two kinds, both outside the app (nothing here goes into the Docker images):

| What | Where | Needs |
|---|---|---|
| **End-to-end tests** (API and real browser) | `tests/e2e/` | the local API, web app and database running |
| **`update.sh` test** (fake git, docker and backup) | `tests/update-sh.test.sh` | only `bash` and `git` |

## Run the end-to-end tests
They talk to a **local development** setup, so start it first (three terminals, or in the background):

```bash
# 1. PostgreSQL on port 5433 (the DATABASE_URL in apps/api/.env points to it)
# 2. API
cd apps/api && npx tsx watch src/index.ts          # http://localhost:3001
# 3. Web app
cd apps/web && npx vite --port 5173 --host 127.0.0.1
```

Then, once:

```bash
cd tests && npm install
```

and:

```bash
npm run list                    # what there is, and what each test covers
npm run test:api                # only the tests that need no browser (fast)
npm test                        # everything (several minutes)
node e2e/run.mjs sv-api sv-web  # only some
```

Each test starts from a clean state (`e2e/reset.mjs` removes the test people and projects the tests make) and prints
`PASS`/`FAIL` for every check and a count such as `53/53 passed`. `run.mjs` prints one line per test and a summary, and
exits with an error if anything failed.

The browser tests need **Chrome or Edge**. They are found automatically (also a Chrome that puppeteer downloaded);
otherwise set `CHROME_PATH`.

### Settings (environment variables)
| Variable | Default |
|---|---|
| `TEST_API_ORIGIN` | `http://localhost:3001` |
| `TEST_WEB_URL` | `http://localhost:5173` |
| `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` | `admin@dbi.example.com` / `Admin@123` (the local seed admin) |
| `DATABASE_URL` | read from `apps/api/.env` |
| `CHROME_PATH` | found automatically |

### Safety
These tests **create and delete users and projects** (the users end in `@test.local`) and **reset the admin's 2FA**.
They refuse to run unless the database and the API are on this computer. Never set `TEST_ALLOW_REMOTE=1` for a system
with real data.

## Run the flow against a real server
`e2e/e2e-server.mjs` plays three people (member, lead, newbie) through the whole task flow in a real browser, signing in
on the real login page. It uses three throw-away accounts that a script on the server creates and removes:

```bash
# on the server
docker compose exec -T api node dist/scripts/e2e-world.js seed      # prints one password for the three test users
# on any computer with Chrome
cd tests && E2E_BASE=https://<server>:8443 E2E_PASSWORD=<that password> node e2e/e2e-server.mjs
# on the server, afterwards
docker compose exec -T api node dist/scripts/e2e-world.js clean
```
It is not part of `npm test`.

### Virus scan and the real ClamAV

`virus-scan` uses a stand-in scanner (same protocol) and a second API on :3101, so it needs no ClamAV. The real one is checked on the server with the EICAR file, see "Virus scan of uploads" in README-DEPLOY.md.

## The `update.sh` test
```bash
bash tests/update-sh.test.sh
```
It builds a fake git server and a fake docker, then checks: nothing new, a good update, a broken version rolled back,
a failed backup cancelling the update, local edits, low disk space, `--force`, `--skip-backup`, two updates at once.

## What the end-to-end tests cover
Run `npm run list` for the current list. In short: work sessions and screen evidence, the screenshot (OCR) check,
reminders, submit and verify, needs attention / reassign / hand over, upload rules, open vs download, project progress and
the start flow, Create KT, the document timeline, and that every time is shown as date and time in IST.
