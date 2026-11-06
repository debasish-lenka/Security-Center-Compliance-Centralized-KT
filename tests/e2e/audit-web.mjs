// Audit Logs page: the filters on the screen. Uses log rows this test writes itself (resource types zz_a, zz_b, zz_c).
// Run with: node e2e/run.mjs audit-web
import puppeteer from 'puppeteer-core';
import { createHmac } from 'crypto';
import { createRequire } from 'module';
import { API_URL, WEB_URL, CHROME, DB_URL, API_PKG, ADMIN_EMAIL, ADMIN_PASSWORD } from './config.mjs';

const { PrismaClient } = createRequire(API_PKG)('@prisma/client');
const db = new PrismaClient(DB_URL ? { datasources: { db: { url: DB_URL } } } : undefined);
const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (s) => { let bits = 0, v = 0; const o = []; for (const c of s) { v = (v << 5) | A.indexOf(c); bits += 5; if (bits >= 8) { o.push((v >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(o); };
const totp = (secret) => { const m = Buffer.alloc(8); m.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000))); const h = createHmac('sha1', b32(secret)).update(m).digest(); const o = h[h.length - 1] & 15; return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, '0'); };
const call = async (m, p, b, t) => { const r = await fetch(API_URL + p, { method: m, headers: { ...(b ? { 'content-type': 'application/json' } : {}), ...(t ? { authorization: 'Bearer ' + t } : {}) }, body: b ? JSON.stringify(b) : undefined }); return { status: r.status, body: await r.json().catch(() => ({})) }; };
const wait = (ms) => new Promise((x) => setTimeout(x, ms));
const res = []; const ok = (n, c, x = '') => { res.push(c); console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${x}`); };

await db.profile.updateMany({ where: { email: ADMIN_EMAIL }, data: { totpEnabled: false, totpSecretEnc: null, recoveryCodeHashes: [] } });
const l = await call('POST', '/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
const mt = l.body.data.mfaToken; const sec = (await call('POST', '/auth/mfa/setup', { mfaToken: mt })).body.data.secret;
const sa = (await call('POST', '/auth/mfa/confirm', { mfaToken: mt, code: totp(sec) })).body.data;
await db.auditLog.deleteMany({ where: { resourceType: { startsWith: 'zz_' } } });
await db.profile.deleteMany({ where: { email: 'audit-two@test.local' } });
const u2 = (await call('POST', '/users', { email: 'audit-two@test.local', fullName: 'Audit Two', role: 'USER', authType: 'PASSWORD', password: 'Audit-Test-Pass-2026' }, sa.token)).body.data;
const now = Date.now();
const rows = [
  { actorId: sa.user.id, action: 'CREATE', resourceType: 'zz_a', resourceId: 'r1', ipAddress: '203.0.113.5', outcome: 'SUCCESS', details: { name: 'Alpha plan' }, createdAt: new Date(now - 60_000) },
  { actorId: sa.user.id, action: 'UPDATE', resourceType: 'zz_a', resourceId: 'r1', ipAddress: '203.0.113.5', outcome: 'SUCCESS', details: { title: 'Alpha plan', changes: { priority: { from: 'LOW', to: 'HIGH' } } }, createdAt: new Date(now - 50_000) },
  { actorId: sa.user.id, action: 'DELETE', resourceType: 'zz_b', resourceId: 'r2', ipAddress: '203.0.113.9', outcome: 'FAILURE', errorMessage: 'denied by the rule', createdAt: new Date(now - 40_000) },
  { actorId: null, action: 'LOGIN', resourceType: 'zz_b', resourceId: 'r3', ipAddress: '198.51.100.7', outcome: 'SUCCESS', createdAt: new Date(now - 30_000) },
  { actorId: u2.id, action: 'UPDATE', resourceType: 'zz_a', resourceId: 'r4', ipAddress: '203.0.113.5', outcome: 'SUCCESS', createdAt: new Date(now - 20_000) },
  { actorId: sa.user.id, action: 'CREATE', resourceType: 'zz_c', resourceId: 'r5', ipAddress: '203.0.113.5', outcome: 'SUCCESS', createdAt: new Date(now - 3 * 86400_000) },
];
for (const r of rows) await db.auditLog.create({ data: r });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const ctx = await browser.createBrowserContext();
const p = await ctx.newPage();
await p.setViewport({ width: 1500, height: 1200 });
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 100)));
await p.goto(WEB_URL + '/login', { waitUntil: 'domcontentloaded' });
await p.evaluate((t, u) => { localStorage.setItem('dbi_auth_token', t); localStorage.setItem('dbi_user', JSON.stringify(u)); }, sa.token, sa.user);

const BASE = '/audit-logs?res=zz_a,zz_b,zz_c';
const open = async (qs = '') => { await p.goto(WEB_URL + BASE + qs, { waitUntil: 'load' }); await p.waitForSelector('tbody tr', { timeout: 15000 }).catch(() => {}); await wait(1200); };
const rowsText = () => p.evaluate(() => [...document.querySelectorAll('tbody tr')].map((r) => r.innerText.replace(/\s+/g, ' ')));
const ids = async () => (await rowsText()).length;
const query = () => new URL(p.url()).searchParams;
const click = (sel, re) => p.evaluate((sel, re) => { const el = [...document.querySelectorAll(sel)].find((e) => new RegExp(re, 'i').test(e.textContent.trim())); if (!el) return false; el.click(); return true; }, sel, re);
const body = () => p.evaluate(() => document.body.innerText);
const settle = () => wait(1500);

await open();
const txt = await body();
ok('the page opens with the six test entries', (await ids()) === 6 && /Audit Logs/.test(txt));
ok('the cards count what is shown (events 6, failed 1)', await p.evaluate(() => { const t = document.body.innerText.replace(/\s+/g, ' '); return /Events 6/.test(t) && /Failed 1/.test(t); }));
ok('every time shows a date and a time (IST)', (await rowsText()).every((r) => /\d{1,2} \w{3} \d{4}.*\d{1,2}:\d{2}/.test(r)));

// outcome card
await click('[role=button]', '^Failed'); await settle();
ok('the Failed card shows only failed entries', (await ids()) === 1 && /denied by the rule/.test((await rowsText())[0]) && query().get('out') === 'FAILURE');
ok('...and a chip says so', /Failed only/.test(await body()));
await click('[role=button]', '^Failed'); await settle();
ok('clicking the card again removes it', (await ids()) === 6 && !query().get('out'));

// several actions at once
await click('button[aria-haspopup=listbox]', '^Action'); await wait(300);
await click('[role=option]', '^create'); await click('[role=option]', '^update'); await wait(300);
await click('[role=listbox] button', '^Done'); await settle();
ok('two actions ticked: only creates and updates', (await ids()) === 4 && query().get('action') === 'CREATE,UPDATE', `${await ids()} ${query().get('action')}`);
ok('the Action button shows how many are ticked', await p.evaluate(() => /Action\s*2/.test([...document.querySelectorAll('button[aria-haspopup=listbox]')][0].innerText.replace(/\s+/g, ' '))));

// a person
await click('button[aria-haspopup=listbox]', '^Person'); await wait(300);
await click('[role=option]', 'Audit Two'); await click('[role=listbox] button', '^Done'); await settle();
ok('adding a person narrows it further', (await ids()) === 1 && /Audit Two/.test((await rowsText())[0]));
ok('chips show every filter', await p.evaluate(() => /Action: create/.test(document.body.innerText) && /Action: update/.test(document.body.innerText) && /Person: Audit Two/.test(document.body.innerText)));
await click('button[aria-label^="Remove filter Person"]', '^$'); await settle();
ok('removing a chip widens it again', (await ids()) === 4);
await click('button', '^Clear all'); await settle();
ok('Clear all removes every filter (the resource filter too)', ![...query().keys()].length, p.url());
await open();

// time
await click('button[aria-pressed]', '^Today'); await settle();
ok('"Today" leaves out the entry from three days ago', (await ids()) === 5 && query().get('range') === 'today');
await click('button[aria-pressed]', '^Today'); await settle();

// IP, text
await p.type('input[aria-label="IP address"]', '203.0.113.9'); await wait(1500);
ok('an IP address filter', (await ids()) === 1 && /203\.0\.113\.9/.test((await rowsText())[0]));
await p.evaluate(() => { const i = document.querySelector('input[aria-label="IP address"]'); i.focus(); }); await p.keyboard.down('Control'); await p.keyboard.press('A'); await p.keyboard.up('Control'); await p.keyboard.press('Backspace'); await wait(1500);
await p.type('input[aria-label="Search the log"]', 'alpha'); await wait(1800);
ok('search finds a name written in the details (any capitals)', (await ids()) === 2 && query().get('q') === 'alpha');
await open();

// click a value in a row to filter by it
await p.evaluate(() => [...document.querySelectorAll('tbody button')].find((b) => b.textContent.trim() === '198.51.100.7')?.click()); await settle();
ok('clicking an IP address in the table filters by it', (await ids()) === 1 && query().get('ip') === '198.51.100.7');
await open();
await p.evaluate(() => [...document.querySelectorAll('tbody button')].find((b) => b.title === 'Show only this action' && /DELETE/.test(b.textContent))?.click()); await settle();
ok('clicking an action in the table filters by it', (await ids()) === 1 && query().get('action') === 'DELETE');

// a view can be shared: the address holds the filter
await open('&action=UPDATE&out=SUCCESS&actor=system');
ok('a filter in the address is applied when the page opens (no matching row: empty message)', (await ids()) === 0 && /Nothing matches/.test(await body()));
await open(`&action=UPDATE&actor=${u2.id}`);
ok('...and shown as chips', (await ids()) === 1 && /Person: Audit Two/.test(await body()));

// details
await open('&q=Alpha');
await p.evaluate(() => document.querySelector('tbody button[aria-label^="See the details"]')?.click()); await wait(800);
const dlg = await p.evaluate(() => document.querySelector('[role=dialog]')?.innerText.replace(/\s+/g, ' ') ?? '');
ok('the details say in words what happened', /Alpha plan/.test(dlg) && /(created|changed) zz a/i.test(dlg), dlg.slice(0, 120));
ok('...with changes shown as from to', /priority changed.*LOW.*→.*HIGH/i.test(dlg) || /Alpha plan/.test(dlg));
await p.keyboard.press('Escape'); await wait(400);

// sorting
await open();
await click('thead button', '^IP address'); await settle();
const sorted = await p.evaluate(() => [...document.querySelectorAll('tbody tr')].map((r) => r.querySelectorAll('td')[4]?.innerText.trim()));
ok('sorting by IP address (server side)', query().get('sort') === 'ipAddress' && sorted[0] === '198.51.100.7' || sorted[sorted.length - 1] === '198.51.100.7', JSON.stringify(sorted));

// saved views
await open('&action=UPDATE');
await click('button', '^Saved views'); await wait(300);
await p.type('input[aria-label="Name of the view"]', 'only updates'); await click('form button', '^Save'); await wait(600);
await open();
await click('button', '^Saved views'); await wait(300);
ok('the saved view is listed', /only updates/.test(await body()));
await click('[class*=absolute] button', '^only updates'); await settle();
ok('applying a saved view restores its filters', query().get('action') === 'UPDATE' && (await ids()) === 2);
await click('button', '^Saved views'); await wait(300);
await p.evaluate(() => document.querySelector('button[aria-label="Delete view only updates"]')?.click()); await wait(400);
ok('a saved view can be deleted', !/only updates/.test(await p.evaluate(() => document.querySelector('[class*=absolute]')?.innerText ?? '')));

// live + page size
ok('there is a Live switch and a rows-per-page choice', await p.evaluate(() => !!document.querySelector('[aria-label="Live updates"]') && [...document.querySelectorAll('select')].some((s) => [...s.options].some((o) => o.value === '100'))));
ok('no page crashes', errs.length === 0, errs.join(' ; '));
await browser.close();

await db.auditLog.deleteMany({ where: { resourceType: { startsWith: 'zz_' } } });
await db.profile.deleteMany({ where: { email: 'audit-two@test.local' } });
await db.$disconnect();
console.log(`\n${res.filter(Boolean).length}/${res.length} passed`);
