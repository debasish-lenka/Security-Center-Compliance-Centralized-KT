// Where the tests find things. Everything can be changed with environment variables (see tests/README.md).
// The defaults are for the local development setup: API on :3001, web on :5173, Postgres from apps/api/.env.
import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, '..', '..');
export const API_PKG = join(ROOT, 'apps', 'api', 'package.json');     // lets the tests use the API's own @prisma/client
export const API_ORIGIN = process.env.TEST_API_ORIGIN ?? 'http://localhost:3001';
export const API_URL = `${API_ORIGIN}/api/v1`;
export const WEB_URL = process.env.TEST_WEB_URL ?? 'http://localhost:5173';
export const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL ?? 'admin@dbi.example.com';
export const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD ?? 'Admin@123';
export const TMP = tmpdir();

function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envFile = join(ROOT, 'apps', 'api', '.env');
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, 'utf8').match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1];
  }
  return '';
}
export const DB_URL = databaseUrl();

// These tests create and DELETE users and projects, and reset the admin's 2FA. They must never touch a real system.
const host = (() => { try { return new URL(DB_URL).hostname; } catch { return ''; } })();
const local = (h) => ['localhost', '127.0.0.1', '::1', '[::1]'].includes(h);
if (!process.env.TEST_ALLOW_REMOTE) {
  if (DB_URL && !local(host)) {
    console.error(`Refusing to run: the database host is "${host}", not this computer. These tests delete test users and reset the admin's 2FA.\nSet TEST_ALLOW_REMOTE=1 only if this is a throw-away database.`);
    process.exit(3);
  }
  if (!local(new URL(API_ORIGIN).hostname)) {
    console.error(`Refusing to run: the API is at "${API_ORIGIN}", not this computer. Set TEST_ALLOW_REMOTE=1 only for a throw-away server.`);
    process.exit(3);
  }
}

function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const fixed = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/snap/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const p of fixed) if (existsSync(p)) return p;
  // a Chrome that puppeteer downloaded earlier
  const cache = join(homedir(), '.cache', 'puppeteer', 'chrome');
  if (existsSync(cache)) {
    for (const v of readdirSync(cache).sort().reverse()) {
      for (const sub of ['chrome-win64/chrome.exe', 'chrome-linux64/chrome', 'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing']) {
        const p = join(cache, v, sub);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}
export const CHROME = findChrome();
